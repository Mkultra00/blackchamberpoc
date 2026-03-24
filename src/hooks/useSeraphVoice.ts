import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type Message = { role: "user" | "assistant"; content: string };

type SeraphState = "idle" | "listening" | "thinking" | "speaking";

export function useSeraphVoice() {
  const [state, setState] = useState<SeraphState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState("");
  const [lastResponse, setLastResponse] = useState("");
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
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

      if (!response.ok) throw new Error("TTS failed");

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

  const startListening = useCallback(() => {
    if (isListeningRef.current) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    stopAudio();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      isListeningRef.current = true;
      setState("listening");
      setTranscript("");
    };

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        } else {
          interimText += event.results[i][0].transcript;
        }
      }
      setTranscript(finalText || interimText);
    };

    recognition.onend = () => {
      isListeningRef.current = false;
      recognitionRef.current = null;
      // Process the final transcript
      setTranscript((current) => {
        if (current.trim()) {
          think(current.trim());
        } else {
          setState("idle");
        }
        return current;
      });
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      isListeningRef.current = false;
      recognitionRef.current = null;
      if (event.error !== "no-speech") {
        setError(`Microphone error: ${event.error}`);
      }
      setState("idle");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [stopAudio, think]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const interrupt = useCallback(() => {
    stopAudio();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
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
