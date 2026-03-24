import React from "react";

type SeraphState = "idle" | "listening" | "thinking" | "speaking";

interface SeraphOrbProps {
  state: SeraphState;
  onActivate: () => void;
  onStop: () => void;
  onInterrupt: () => void;
}

export function SeraphOrb({ state, onActivate, onInterrupt }: SeraphOrbProps) {
  const isActive = state !== "idle";

  const handleClick = () => {
    if (state === "speaking" || state === "thinking") {
      onInterrupt();
    } else if (state === "listening") {
      onStop();
    } else if (state === "idle") {
      onActivate();
    }
  };

  const orbAnimation =
    state === "speaking"
      ? "animate-seraph-speaking"
      : state === "listening"
      ? "animate-seraph-breathe"
      : state === "thinking"
      ? "animate-seraph-pulse"
      : "";

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer sacred geometry ring */}
      <div
        className={`absolute w-72 h-72 rounded-full border border-gold-muted/20 transition-opacity duration-1000 ${
          isActive ? "opacity-100 animate-glyph-rotate" : "opacity-30"
        }`}
      >
        {/* Compass points */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <div
            key={deg}
            className="absolute w-1.5 h-1.5 rounded-full bg-gold-muted/40 top-1/2 left-1/2"
            style={{
              transform: `rotate(${deg}deg) translateY(-144px) translate(-50%, -50%)`,
            }}
          />
        ))}
      </div>

      {/* Middle ring */}
      <div
        className={`absolute w-56 h-56 rounded-full border border-gold/10 transition-all duration-700 ${
          isActive ? "opacity-100 scale-100" : "opacity-20 scale-95"
        }`}
        style={{
          animation: isActive ? "glyph-rotate 20s linear infinite reverse" : "none",
        }}
      >
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <div
            key={deg}
            className="absolute w-1 h-4 bg-gradient-to-b from-gold/30 to-transparent top-1/2 left-1/2"
            style={{
              transform: `rotate(${deg}deg) translateY(-112px) translate(-50%, -50%)`,
            }}
          />
        ))}
      </div>

      {/* Core orb */}
      <button
        onClick={handleClick}
        className={`relative w-36 h-36 rounded-full cursor-pointer transition-all duration-500
          bg-gradient-to-br from-secondary via-navy-light to-secondary
          border border-gold/20 hover:border-gold/40
          flex items-center justify-center
          ${orbAnimation}
          focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50
        `}
        style={{
          boxShadow: isActive
            ? "0 0 40px hsl(43 60% 55% / 0.2), 0 0 80px hsl(43 60% 55% / 0.08), inset 0 0 30px hsl(43 60% 55% / 0.05)"
            : "0 0 20px hsl(43 60% 55% / 0.08), inset 0 0 15px hsl(43 60% 55% / 0.03)",
        }}
        aria-label={state === "idle" ? "Activate Seraph" : "Interrupt Seraph"}
      >
        {/* Inner glow */}
        <div
          className={`absolute inset-4 rounded-full bg-gradient-to-br from-gold/5 to-transparent transition-opacity duration-500 ${
            isActive ? "opacity-100" : "opacity-40"
          }`}
        />

        {/* Center symbol */}
        <div className="relative z-10 flex flex-col items-center gap-1">
          {state === "idle" && (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-gold/60">
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1" opacity="0.4" />
            </svg>
          )}
          {state === "listening" && (
            <div className="flex items-end gap-1 h-8">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="w-1 bg-gold/60 rounded-full"
                  style={{
                    animation: `seraph-breathe ${0.5 + i * 0.15}s ease-in-out infinite`,
                    height: `${8 + Math.random() * 16}px`,
                  }}
                />
              ))}
            </div>
          )}
          {state === "thinking" && (
            <div className="w-6 h-6 rounded-full border-2 border-gold/30 border-t-gold/80 animate-spin" />
          )}
          {state === "speaking" && (
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-gold/70"
                  style={{
                    animation: `seraph-breathe ${0.6 + i * 0.2}s ease-in-out infinite`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
