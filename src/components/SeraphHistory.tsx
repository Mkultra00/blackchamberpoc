import React from "react";
import { X, MessageSquare } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

interface SeraphHistoryProps {
  messages: Message[];
  open: boolean;
  onClose: () => void;
}

export function SeraphHistory({ messages, open, onClose }: SeraphHistoryProps) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-card border-l border-border
          transform transition-transform duration-300 ease-out
          ${open ? "translate-x-0" : "translate-x-full"}
          flex flex-col
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h2 className="font-display text-lg tracking-wide text-foreground">
              Exchanges
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close history"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {messages.length === 0 && (
            <p className="text-center text-muted-foreground font-mono text-xs tracking-widest uppercase pt-12">
              No exchanges yet
            </p>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`animate-fade-up ${
                msg.role === "user" ? "pl-6" : "pr-6"
              }`}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className={`w-1 h-1 rounded-full ${
                    msg.role === "user" ? "bg-muted-foreground" : "bg-primary"
                  }`}
                />
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
                  {msg.role === "user" ? "You" : "Seraph"}
                </span>
              </div>
              <p
                className={`font-display text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "text-muted-foreground italic"
                    : "text-foreground"
                }`}
              >
                {msg.content}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border">
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/50 uppercase text-center">
            {messages.length} message{messages.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </>
  );
}
