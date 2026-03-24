import React from "react";

type SeraphState = "idle" | "listening" | "thinking" | "speaking";

interface SeraphTranscriptProps {
  state: SeraphState;
  transcript: string;
  lastResponse: string;
  error: string | null;
}

export function SeraphTranscript({
  state,
  transcript,
  lastResponse,
  error,
}: SeraphTranscriptProps) {
  const stateLabel: Record<SeraphState, string> = {
    idle: "Awaiting",
    listening: "",
    thinking: "Contemplating",
    speaking: "Speaking",
  };

  return (
    <div className="flex flex-col items-center gap-6 max-w-lg mx-auto px-4">
      {/* Status indicator — hidden when listening */}
      {state !== "listening" && (
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${
              state === "idle"
                ? "bg-gold-muted/40"
                : state === "thinking"
                ? "bg-gold-muted animate-pulse"
                : "bg-gold-glow"
            }`}
          />
          <span className="font-mono text-xs tracking-[0.3em] uppercase text-muted-foreground">
            {stateLabel[state]}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="font-mono text-xs text-destructive animate-fade-up">
          {error}
        </p>
      )}

      {/* Live transcript */}
      {state === "listening" && transcript && (
        <p className="text-center text-ivory-muted font-display text-lg italic animate-fade-up">
          "{transcript}"
        </p>
      )}

      {/* Seraph's response */}
      {(state === "speaking" || (state === "idle" && lastResponse)) && lastResponse && (
        <p className="text-center text-foreground font-display text-xl leading-relaxed animate-fade-up">
          {lastResponse}
        </p>
      )}

      {/* Idle prompt */}
      {state === "idle" && !lastResponse && !error && (
        <p className="text-center text-muted-foreground font-display text-lg">
          Touch the seal to speak
        </p>
      )}
    </div>
  );
}
