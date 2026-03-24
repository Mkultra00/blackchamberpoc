import { useState, useCallback, useRef, useEffect } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";

type Message = { role: "user" | "assistant"; content: string };
type SeraphState = "idle" | "listening" | "thinking" | "speaking";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function useSeraphVoice() {
  const [state, setState] = useState<SeraphState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState("");
  const [lastResponse, setLastResponse] = useState("");
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const processingRef = useRef(false);

  // Keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data) => {
      setTranscript(data.text || "");
    },
    onCommittedTranscript: (data) => {
      const text = (data.text || "").trim();
      if (!text || processingRef.current) return;

      processingRef.current = true;
      setTranscript(text);
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setState("thinking");

      // Disconnect mic while processing
      scribe.disconnect();

      handleUserMessage(text);
    },
  });

  const handleUserMessage = useCallback(async (text: string) => {
    try {
      // Call seraph-chat for LLM response
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

      // Call elevenlabs-tts for speech
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

      const audioBlob = await ttsRes.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        processingRef.current = false;
        setState("idle");
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        processingRef.current = false;
        setError("Audio playback failed");
        setState("idle");
      };

      await audio.play();
    } catch (e: any) {
      console.error("Seraph pipeline error:", e);
      setError(e.message || "Something went wrong");
      processingRef.current = false;
      setState("idle");
    }
  }, []);

  const startListening = useCallback(async () => {
    if (scribe.isConnected) return;
    setError(null);
    setState("thinking");

    try {
      // Get scribe token
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
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      setState("listening");
    } catch (e: any) {
      console.error("Start listening error:", e);
      setError(e.message || "Failed to start listening");
      setState("idle");
    }
  }, [scribe]);

  const stopListening = useCallback(() => {
    scribe.disconnect();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    processingRef.current = false;
    setState("idle");
  }, [scribe]);

  const interrupt = useCallback(() => {
    scribe.disconnect();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    processingRef.current = false;
    setState("idle");
  }, [scribe]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      scribe.disconnect();
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

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
