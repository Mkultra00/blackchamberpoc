import { useState } from "react";
import { SeraphOrb } from "@/components/SeraphOrb";
import { SeraphTranscript } from "@/components/SeraphTranscript";
import { SeraphHistory } from "@/components/SeraphHistory";
import { useSeraphVoice } from "@/hooks/useSeraphVoice";
import { MessageSquare } from "lucide-react";

const Index = () => {
  const { state, transcript, lastResponse, messages, error, startListening, stopListening, interrupt } =
    useSeraphVoice();
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-background overflow-hidden">
      {/* Background sacred geometry */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-primary" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-primary rotate-45" />
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-5 z-30">
        <div>
          <h1 className="font-mono text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
            Black Chamber
          </h1>
        </div>
        <button
          onClick={() => setHistoryOpen(true)}
          className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground relative"
          aria-label="View conversation history"
        >
          <MessageSquare className="w-4 h-4" />
          {messages.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
          )}
        </button>
      </header>

      {/* Main interface */}
      <div className="relative z-10 flex flex-col items-center gap-16">
        {/* Title */}
        <div className="text-center animate-fade-up">
          <h2 className="font-display text-3xl md:text-4xl tracking-wide text-foreground mb-2">
            Seraph
          </h2>
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            Personal Intelligence
          </p>
        </div>

        {/* Orb */}
        <SeraphOrb state={state} onActivate={startListening} onInterrupt={interrupt} />

        {/* Transcript */}
        <SeraphTranscript
          state={state}
          transcript={transcript}
          lastResponse={lastResponse}
          error={error}
        />
      </div>

      {/* History panel */}
      <SeraphHistory messages={messages} open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
};

export default Index;
