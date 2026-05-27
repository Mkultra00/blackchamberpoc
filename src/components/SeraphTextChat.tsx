import React, { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Send } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

export function SeraphTextChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("seraph-chat", {
        body: { messages: next },
      });
      if (fnError) throw fnError;
      const content = (data as { content?: string })?.content || "";
      setMessages((m) => [...m, { role: "assistant", content }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col h-[60vh] border border-border rounded-lg bg-card/40">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
      >
        {messages.length === 0 && (
          <p className="text-center text-muted-foreground font-mono text-[10px] tracking-[0.3em] uppercase pt-8">
            Type to speak with Seraph
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`animate-fade-up ${m.role === "user" ? "pl-6" : "pr-6"}`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div
                className={`w-1 h-1 rounded-full ${
                  m.role === "user" ? "bg-muted-foreground" : "bg-primary"
                }`}
              />
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
                {m.role === "user" ? "You" : "Seraph"}
              </span>
            </div>
            <p
              className={`font-display text-sm leading-relaxed ${
                m.role === "user" ? "text-muted-foreground italic" : "text-foreground"
              }`}
            >
              {m.content}
            </p>
          </div>
        ))}
        {loading && (
          <div className="pr-6 animate-fade-up">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
                Seraph
              </span>
            </div>
            <p className="font-display text-sm leading-relaxed text-muted-foreground">
              Contemplating...
            </p>
          </div>
        )}
        {error && (
          <p className="font-mono text-xs text-destructive">{error}</p>
        )}
      </div>

      <div className="border-t border-border p-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Speak to Seraph..."
          rows={1}
          className="flex-1 resize-none bg-transparent text-foreground placeholder:text-muted-foreground font-display text-sm px-3 py-2 focus:outline-none max-h-32"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
