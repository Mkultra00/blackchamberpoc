import { useState, useCallback, useRef, useEffect } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { type SeraphState, type Message, type SeraphVoiceReturn } from "./useSeraphVoice";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function useElevenLabsVoice(): SeraphVoiceReturn {
  const [state, setState] = useState<SeraphState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState("");
  const [lastResponse, setLastResponse] = useState("");
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioPrimedRef = useRef(false);
  const htmlAudioPrimedRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const processingRef = useRef(false);
  const activeRef = useRef(false);

  // Unlock AudioContext on first user gesture (needed for mobile browsers)
  const ensureAudioContext = useCallback(async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const ctx = audioCtxRef.current;
    if (ctx.state !== "running") {
      await ctx.resume();
    }

    // iOS Safari often needs one scheduled frame on user gesture to truly unlock output
    if (!audioPrimedRef.current) {
      const silentBuffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const silentSource = ctx.createBufferSource();
      silentSource.buffer = silentBuffer;
      silentSource.connect(ctx.destination);
      silentSource.start(0);
      audioPrimedRef.current = true;
    }
  }, []);

  const ensureHtmlAudioUnlocked = useCallback(async () => {
    if (htmlAudioPrimedRef.current) return;

    const unlockAudio = new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA="
    );
    unlockAudio.setAttribute("playsinline", "true");
    unlockAudio.setAttribute("webkit-playsinline", "true");
    unlockAudio.muted = true;
    unlockAudio.volume = 0;

    try {
      await unlockAudio.play();
      unlockAudio.pause();
      unlockAudio.currentTime = 0;
      htmlAudioPrimedRef.current = true;
    } catch (e) {
      console.warn("HTMLAudio unlock failed", e);
    }
  }, []);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data) => {
      setTranscript(data.text || "");
    },
    onCommittedTranscript: (data) => {
      const text = (data.text || "").trim();
      // Ignore very short transcripts (likely echo/noise) and guard against double-processing
      if (!text || text.split(/\s+/).length < 2 || processingRef.current) return;

      processingRef.current = true;
      setTranscript(text);
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setState("thinking");
      scribe.disconnect();
      handleUserMessage(text);
    },
  });

  const handleUserMessage = useCallback(async (text: string) => {
    try {
      const chatMessages = [...messagesRef.current, { role: "user", content: text }];
      const chatRes = await fetch(`${SUPABASE_URL}/functions/v1/seraph-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ messages: chatMessages }),
      });

      if (!chatRes.ok) {
        const err = await chatRes.json().catch(() => ({}));
        throw new Error(err.error || `Chat failed: ${chatRes.status}`);
      }

      const { content } = await chatRes.json();
      if (!content) throw new Error("Empty response from Seraph");

      setLastResponse(content);
      setMessages((prev) => [...prev, { role: "assistant", content }]);
      setState("speaking");

      const ttsRes = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ text: content }),
      });

      if (!ttsRes.ok) {
        const err = await ttsRes.json().catch(() => ({}));
        throw new Error(err.error || `TTS failed: ${ttsRes.status}`);
      }

      const arrayBuffer = await ttsRes.arrayBuffer();

      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

      const playWithHtmlAudio = async () => {
        const audioBlob = new Blob([arrayBuffer], { type: "audio/mpeg" });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.setAttribute("playsinline", "true");
        audio.setAttribute("webkit-playsinline", "true");
        audio.preload = "auto";
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          if (activeRef.current) {
            // Keep processingRef locked during the delay to block any stale callbacks
            setTimeout(() => {
              processingRef.current = false;
              if (activeRef.current) {
                resumeListening();
              } else {
                setState("idle");
              }
            }, 1500);
          } else {
            processingRef.current = false;
            setState("idle");
          }
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          processingRef.current = false;
          setError("Audio playback failed");
          if (activeRef.current) {
            resumeListening();
          } else {
            setState("idle");
          }
        };

        await audio.play();
      };

      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

      // On iOS, media element playback is usually more reliable than decodeAudioData output.
      if (isIOS) {
        try {
          await playWithHtmlAudio();
          return;
        } catch (iosPlayErr) {
          console.warn("iOS HTMLAudio playback failed, trying AudioContext", iosPlayErr);
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
          }
        }
      }

      // Use AudioContext for mobile compatibility (gesture unlocked on activation)
      const ctx = audioCtxRef.current;
      if (ctx) {
        try {
          // Re-resume in case iOS suspended/interrupted audio during async fetches
          if (ctx.state !== "running") {
            await ctx.resume();
          }
          if (ctx.state !== "running") {
            throw new Error(`AudioContext unavailable: ${ctx.state}`);
          }

          const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          let sourceStopped = false;
          const safeStop = () => {
            if (sourceStopped) return;
            sourceStopped = true;
            try {
              source.stop();
            } catch {
              // no-op: source may already be ended
            }
          };

          source.onended = () => {
            sourceStopped = true;
            audioRef.current = null;
            if (activeRef.current) {
              setTimeout(() => {
                processingRef.current = false;
                if (activeRef.current) {
                  resumeListening();
                } else {
                  setState("idle");
                }
              }, 1500);
            } else {
              processingRef.current = false;
              setState("idle");
            }
          };

          source.start(0);
          // Store a stub so stopListening can halt playback
          audioRef.current = { pause: safeStop } as any;
          return; // skip the HTMLAudio fallback
        } catch (decodeErr) {
          console.warn("AudioContext decode failed, falling back to HTMLAudio", decodeErr);
        }
      }

      // Fallback for desktop / when AudioContext unavailable
      await playWithHtmlAudio();
    } catch (e: any) {
      console.error("ElevenLabs pipeline error:", e);
      setError(e.message || "Something went wrong");
      processingRef.current = false;
      setState("idle");
    }
  }, []);

  const resumeListening = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-scribe-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });
      if (!res.ok) throw new Error("Failed to get transcription token");
      const { token } = await res.json();
      await scribe.connect({ token, microphone: { echoCancellation: true, noiseSuppression: true } });
      setState("listening");
    } catch (e: any) {
      console.error("Resume listening error:", e);
      if (activeRef.current) {
        setError(e.message || "Failed to resume listening");
        setState("idle");
        activeRef.current = false;
      }
    }
  }, [scribe]);

  const startListening = useCallback(async () => {
    if (activeRef.current) return;
    setError(null);

    const audioInitResults = await Promise.allSettled([
      ensureAudioContext(), // Unlock + prime AudioContext on user gesture
      ensureHtmlAudioUnlocked(), // Unlock media element playback for iOS autoplay rules
    ]);
    for (const result of audioInitResults) {
      if (result.status === "rejected") {
        console.warn("Audio unlock step failed", result.reason);
      }
    }

    activeRef.current = true;
    setState("thinking");

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-scribe-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });

      if (!res.ok) throw new Error("Failed to get transcription token");
      const { token } = await res.json();

      await scribe.connect({
        token,
        microphone: { echoCancellation: true, noiseSuppression: true },
      });

      setState("listening");
    } catch (e: any) {
      console.error("ElevenLabs start error:", e);
      setError(e.message || "Failed to start listening");
      setState("idle");
      activeRef.current = false;
    }
  }, [scribe, ensureAudioContext, ensureHtmlAudioUnlocked]);

  const stopListening = useCallback(() => {
    activeRef.current = false;
    scribe.disconnect();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    processingRef.current = false;
    setState("idle");
  }, [scribe]);

  const interrupt = useCallback(() => {
    activeRef.current = false;
    scribe.disconnect();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    processingRef.current = false;
    setState("idle");
  }, [scribe]);

  useEffect(() => {
    return () => {
      scribe.disconnect();
      if (audioRef.current) audioRef.current.pause();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close();
      }
    };
  }, []);

  return { state, transcript, lastResponse, messages, error, startListening, stopListening, interrupt };
}
