import { useState, useCallback, useRef, useEffect } from "react";
import Vapi from "@vapi-ai/web";
import { SERAPH_SYSTEM_PROMPT, type SeraphState, type Message, type SeraphVoiceReturn } from "./useSeraphVoice";

export function useVapiVoice(): SeraphVoiceReturn {
  const [state, setState] = useState<SeraphState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState("");
  const [lastResponse, setLastResponse] = useState("");
  const [error, setError] = useState<string | null>(null);

  const vapiRef = useRef<Vapi | null>(null);
  const activeRef = useRef(false);

  const cleanup = useCallback(() => {
    if (vapiRef.current) {
      vapiRef.current.removeAllListeners();
      vapiRef.current.stop();
      vapiRef.current = null;
    }
    activeRef.current = false;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startListening = useCallback(async () => {
    if (activeRef.current) return;
    setError(null);
    setState("thinking");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vapi-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );

      if (!response.ok) throw new Error("Failed to initialize voice session");

      const { token } = await response.json();
      const vapi = new Vapi(token);
      vapiRef.current = vapi;

      vapi.on("call-start", () => { activeRef.current = true; setState("listening"); });
      vapi.on("call-end", () => { activeRef.current = false; setState("idle"); });
      vapi.on("speech-start", () => setState("speaking"));
      vapi.on("speech-end", () => { if (activeRef.current) setState("listening"); });

      vapi.on("message", (msg: any) => {
        if (msg.type === "transcript") {
          if (msg.role === "user" && msg.transcriptType === "partial") {
            setTranscript(msg.transcript || "");
          }
          if (msg.role === "user" && msg.transcriptType === "final") {
            const text = msg.transcript || "";
            setTranscript(text);
            if (text.trim()) {
              setMessages((prev) => [...prev, { role: "user", content: text }]);
              setState("thinking");
            }
          }
          if (msg.role === "assistant" && msg.transcriptType === "final") {
            const text = msg.transcript || "";
            if (text.trim()) {
              setLastResponse(text);
              setMessages((prev) => [...prev, { role: "assistant", content: text }]);
            }
          }
        }
      });

      vapi.on("error", (err: any) => {
        console.error("Vapi error:", err);
        setError(err?.message || "Voice connection error");
        activeRef.current = false;
        setState("idle");
      });

      const serverUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vapi-tools`;

      await vapi.start({
        model: {
          provider: "google" as any,
          model: "gemini-2.0-flash" as any,
          messages: [{ role: "system", content: SERAPH_SYSTEM_PROMPT }],
          tools: [
            {
              type: "function",
              function: {
                name: "web_search",
                description: "Search the web for current information, news, facts, or any real-time data.",
                parameters: { type: "object", properties: { query: { type: "string", description: "The search query" } }, required: ["query"] },
              },
            } as any,
            {
              type: "function",
              function: {
                name: "web_research",
                description: "Perform deep web research on a topic.",
                parameters: { type: "object", properties: { query: { type: "string", description: "The research topic" } }, required: ["query"] },
              },
            } as any,
          ],
        },
        voice: { provider: "11labs" as any, voiceId: "CwhRBWXzGAHq8TQ4Fs17", stability: 0.6, similarityBoost: 0.8 } as any,
        firstMessage: "I'm here. What do you need?",
        name: "Seraph",
        server: { url: serverUrl } as any,
      });
    } catch (e: any) {
      console.error("Vapi start error:", e);
      setError(e.message || "Failed to start voice session");
      setState("idle");
      cleanup();
    }
  }, [cleanup]);

  const stopListening = useCallback(() => { cleanup(); setState("idle"); }, [cleanup]);
  const interrupt = useCallback(() => { cleanup(); setState("idle"); }, [cleanup]);

  return { state, transcript, lastResponse, messages, error, startListening, stopListening, interrupt };
}
