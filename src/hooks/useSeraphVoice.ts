import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type Message = { role: "user" | "assistant"; content: string };
type SeraphState = "idle" | "listening" | "thinking" | "speaking";

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

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const speak = useCallback(async (text: string) => {
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
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

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
      setMessages((prev) => [...prev, assistantMsg]);
      setLastResponse(reply);

      await speak(reply);
    } catch (e: any) {
      console.error("Chat error:", e);
      setError(e.message || "Connection lost");
      setState("idle");
    }
  }, [messages, speak]);

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

  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;
    setError(null);
    stopAudio();

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
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Clean up stream
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
    } catch (e: any) {
      console.error("Microphone error:", e);
      setError("Microphone access denied");
      setState("idle");
    }
  }, [stopAudio, transcribeAudio]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const interrupt = useCallback(() => {
    stopAudio();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    isListeningRef.current = false;
    setState("idle");
  }, [stopAudio]);

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
