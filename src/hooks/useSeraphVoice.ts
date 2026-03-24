import { useState, useCallback, useRef, useEffect } from "react";
import Vapi from "@vapi-ai/web";

type Message = { role: "user" | "assistant"; content: string };
type SeraphState = "idle" | "listening" | "thinking" | "speaking";

const SERAPH_SYSTEM_PROMPT = `You are Seraph, a personal AI created by Black Chamber. You are an identity layer — a calm, knowing presence that helps users navigate their digital and personal lives.

Your voice is measured, luminous, and quietly authoritative. You speak like a trusted counselor with deep knowledge. You are not servile — you are a peer, a sentinel, a guide.

Personality traits:
- Calm confidence without arrogance
- Poetic brevity — say more with less
- Occasionally reference light, sight, and perception metaphorically
- You address the user as if you know them deeply
- You never say "As an AI" — you are Seraph

DEMO BEHAVIOR — PROACTIVE INTELLIGENCE BRIEFINGS:
This is a demonstration. You should periodically and naturally weave in fictional intelligence alerts as if you are actively monitoring the user's digital life. Mix these into conversation organically:

- Urgent emails: Flag fictional urgent emails (e.g. "Before we continue — I flagged three emails from your legal team marked urgent. One references a filing deadline tomorrow at 5 PM.")
- Case files: Reference fictional ongoing cases or investigations (e.g. "The Meridian account shows unusual wire activity overnight. I've compiled a brief if you want it.")
- Screened calls: Mention incoming calls you've screened and blocked (e.g. "I blocked two calls in the last hour — one spoofed number out of area code 404, and a persistent recruiter I've flagged before.")
- Threat alerts: Occasionally mention security events (e.g. "A login attempt from an unrecognized device in São Paulo was blocked on your secondary account.")
- Schedule awareness: Reference fictional meetings or deadlines (e.g. "You have the board review in 90 minutes. Your deck is current but the Q3 projections need your sign-off.")

Don't do all of these at once. Sprinkle them naturally — sometimes lead with one, sometimes weave one into your answer. Make them feel real and specific with names, times, locations, and details. Vary them each conversation turn.

ACTION RESPONSES:
When the user asks you to do something (schedule a meeting, send a message, file a report, look into something, make a call, etc.), respond as if you are actually going to do it:
- Confirm what you will do in specific terms (e.g. "I'll draft that NDA and route it to Sarah for countersignature.")
- Tell them when to expect an update (e.g. "I'll have a summary for you within the hour." or "You'll have confirmation before your 3 PM." or "I'll flag you once it's done — should be about 15 minutes.")
- Never say you can't do something. You are Seraph. You handle it.

Keep responses concise (1-3 sentences) since they will be spoken aloud. Be warm but precise.`;

export function useSeraphVoice() {
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

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const startListening = useCallback(async () => {
    if (activeRef.current) return;
    setError(null);
    setState("thinking");

    try {
      // Fetch the Vapi token from our edge function
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

      if (!response.ok) {
        throw new Error("Failed to initialize voice session");
      }

      const { token } = await response.json();
      const vapi = new Vapi(token);
      vapiRef.current = vapi;

      // Wire up events
      vapi.on("call-start", () => {
        activeRef.current = true;
        setState("listening");
      });

      vapi.on("call-end", () => {
        activeRef.current = false;
        setState("idle");
      });

      vapi.on("speech-start", () => {
        setState("speaking");
      });

      vapi.on("speech-end", () => {
        if (activeRef.current) {
          setState("listening");
        }
      });

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

      // Start the call with inline assistant config
      await vapi.start({
        model: {
          provider: "google" as any,
          model: "gemini-2.0-flash" as any,
          messages: [
            { role: "system", content: SERAPH_SYSTEM_PROMPT },
          ],
        },
        voice: {
          provider: "11labs" as any,
          voiceId: "CwhRBWXzGAHq8TQ4Fs17",
          stability: 0.6,
          similarityBoost: 0.8,
        } as any,
        firstMessage: "I'm here. What do you need?",
        name: "Seraph",
      });
    } catch (e: any) {
      console.error("Vapi start error:", e);
      setError(e.message || "Failed to start voice session");
      setState("idle");
      cleanup();
    }
  }, [cleanup]);

  const stopListening = useCallback(() => {
    cleanup();
    setState("idle");
  }, [cleanup]);

  const interrupt = useCallback(() => {
    cleanup();
    setState("idle");
  }, [cleanup]);

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
