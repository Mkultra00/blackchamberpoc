import { useState } from "react";
import { SeraphOrb } from "@/components/SeraphOrb";
import { SeraphTranscript } from "@/components/SeraphTranscript";
import { SeraphHistory } from "@/components/SeraphHistory";
import { useVapiVoice } from "@/hooks/useVapiVoice";
import { useElevenLabsVoice } from "@/hooks/useElevenLabsVoice";
import type { VoiceEngine } from "@/hooks/useSeraphVoice";
import { MessageSquare } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const Index = () => {
  const [engine, setEngine] = useState<VoiceEngine>("elevenlabs");
  const [historyOpen, setHistoryOpen] = useState(false);

  // Both hooks must always be called (React rules of hooks)
  const vapi = useVapiVoice();
  const elevenlabs = useElevenLabsVoice();

  const active = engine === "vapi" ? vapi : elevenlabs;
  const { state, transcript, lastResponse, messages, error, startListening, stopListening, interrupt } = active;

  const isActive = state !== "idle";

  const handleEngineToggle = (checked: boolean) => {
    // Stop any active session before switching
    if (isActive) {
      stopListening();
    }
    setEngine(checked ? "elevenlabs" : "vapi");
  };

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
        <div className="flex items-center gap-4">
          {/* Engine toggle */}
          <div className="flex items-center gap-2">
            <Label
              htmlFor="engine-toggle"
              className={`font-mono text-[9px] tracking-[0.2em] uppercase transition-colors ${
                engine === "vapi" ? "text-foreground" : "text-muted-foreground/50"
              }`}
            >
              Vapi
            </Label>
            <Switch
              id="engine-toggle"
              checked={engine === "elevenlabs"}
              onCheckedChange={handleEngineToggle}
              disabled={isActive}
              className="data-[state=checked]:bg-primary"
            />
            <Label
              htmlFor="engine-toggle"
              className={`font-mono text-[9px] tracking-[0.2em] uppercase transition-colors ${
                engine === "elevenlabs" ? "text-foreground" : "text-muted-foreground/50"
              }`}
            >
              ElevenLabs
            </Label>
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
        </div>
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
        <SeraphOrb state={state} onActivate={startListening} onStop={stopListening} onInterrupt={interrupt} />

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
