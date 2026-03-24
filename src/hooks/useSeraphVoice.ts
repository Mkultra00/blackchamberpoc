import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type Message = { role: "user" | "assistant"; content: string };
type SeraphState = "idle" | "listening" | "thinking" | "speaking";

const SILENCE_TIMEOUT_MS = 2000;
const SILENCE_THRESHOLD = 0.01;

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return typeof data?.error === "string" ? data.error : fallback;
  } catch {
    return fallback;
  }
}

export function useSeraphVoice() {
  const [state, setState] = useState<SeraphState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState("");
  const [lastResponse, setLastResponse] = useState("");
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isListeningRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceCheckRef = useRef<number | null>(null);
  const autoListenRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);

  // Keep messagesRef in sync
  const updateMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    setMessages((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      messagesRef.current = next;
      return next;
    });
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const clearSilenceDetection = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (silenceCheckRef.current) {
      cancelAnimationFrame(silenceCheckRef.current);
      silenceCheckRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const stopListeningInternal = useCallback(() => {
    clearSilenceDetection();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, [clearSilenceDetection]);

  const speak = useCallback(async (text: string, shouldAutoListen: boolean) => {
    setState("speaking");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Speech playback failed"));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      return new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          if (shouldAutoListen) {
            autoListenRef.current = true;
          }
          setState("idle");
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setState("idle");
          resolve();
        };
        audio.play();
      });
    } catch (e) {
      console.error("TTS error:", e);
      setState("idle");
    }
  }, []);

  const think = useCallback(async (userText: string) => {
    setState("thinking");
    setError(null);

    const userMsg: Message = { role: "user", content: userText };
    const updatedMessages = [...messagesRef.current, userMsg];
    updateMessages(updatedMessages);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("seraph-chat", {
        body: { messages: updatedMessages },
      });

      if (fnError) throw fnError;
      if (data?.error) {
        setError(data.error);
        setState("idle");
        return;
      }

      const reply = data?.content || "I am here.";
      const assistantMsg: Message = { role: "assistant", content: reply };
      updateMessages((prev) => [...prev, assistantMsg]);
      setLastResponse(reply);

      await speak(reply, true);
    } catch (e: any) {
      console.error("Chat error:", e);
      setError(e.message || "Connection lost");
      setState("idle");
    }
  }, [speak, updateMessages]);

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setState("thinking");
    setTranscript("");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-transcribe`,
        {
          method: "POST",
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Transcription failed"));
      }

      const data = await response.json();
      const text = data?.text?.trim();

      if (text) {
        setTranscript(text);
        await think(text);
      } else {
        setError("No speech detected");
        setState("idle");
      }
    } catch (e: any) {
      console.error("Transcription error:", e);
      setError(e.message || "Transcription failed");
      setState("idle");
    }
  }, [think]);

  const startSilenceDetection = useCallback((stream: MediaStream) => {
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Float32Array(analyser.fftSize);
    let lastSoundTime = Date.now();

    const checkSilence = () => {
      if (!isListeningRef.current) return;

      analyser.getFloatTimeDomainData(dataArray);
      let rms = 0;
      for (let i = 0; i < dataArray.length; i++) {
        rms += dataArray[i] * dataArray[i];
      }
      rms = Math.sqrt(rms / dataArray.length);

      if (rms > SILENCE_THRESHOLD) {
        lastSoundTime = Date.now();
      }

      if (Date.now() - lastSoundTime > SILENCE_TIMEOUT_MS) {
        // 2 seconds of silence detected — auto-stop
        stopListeningInternal();
        return;
      }

      silenceCheckRef.current = requestAnimationFrame(checkSilence);
    };

    silenceCheckRef.current = requestAnimationFrame(checkSilence);
  }, [stopListeningInternal]);

  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;
    setError(null);
    stopAudio();
    autoListenRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        clearSilenceDetection();
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        isListeningRef.current = false;

        if (blob.size > 0) {
          transcribeAudio(blob);
        } else {
          setState("idle");
        }
      };

      recorder.start();
      isListeningRef.current = true;
      setState("listening");
      setTranscript("");

      // Start silence detection for auto-send
      startSilenceDetection(stream);
    } catch (e: any) {
      console.error("Microphone error:", e);
      setError("Microphone access denied");
      setState("idle");
    }
  }, [stopAudio, transcribeAudio, startSilenceDetection, clearSilenceDetection]);

  // Auto-listen after speaking: watch for state transitions
  const prevStateRef = useRef<SeraphState>("idle");
  if (state === "idle" && prevStateRef.current === "speaking" && autoListenRef.current) {
    autoListenRef.current = false;
    prevStateRef.current = state;
    // Use setTimeout to avoid calling startListening during render
    setTimeout(() => startListening(), 300);
  } else {
    prevStateRef.current = state;
  }

  const stopListening = useCallback(() => {
    stopListeningInternal();
  }, [stopListeningInternal]);

  const interrupt = useCallback(() => {
    autoListenRef.current = false;
    stopAudio();
    clearSilenceDetection();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    isListeningRef.current = false;
    setState("idle");
  }, [stopAudio, clearSilenceDetection]);

  return {
    state,
    transcript,
    lastResponse,
    messages,
    error,
    startListening,
    stopListening,
    interrupt,
  };
}
