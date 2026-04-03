import { useState } from "react";
import { SeraphOrb } from "@/components/SeraphOrb";
import { SeraphTranscript } from "@/components/SeraphTranscript";
import { SeraphHistory } from "@/components/SeraphHistory";
import { useVapiVoice } from "@/hooks/useVapiVoice";
import { useIsMobile } from "@/hooks/use-mobile";
import type { VoiceEngine, SeraphVoiceReturn } from "@/hooks/useSeraphVoice";
import { MessageSquare } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import React from "react";

// Lazy-load the ElevenLabs hook component to avoid mounting useScribe when not needed
const ElevenLabsProvider = React.lazy(() => import("@/components/ElevenLabsProvider"));

const defaultVoice: SeraphVoiceReturn = {
  state: "idle",
  transcript: "",
  lastResponse: "",
  messages: [],
  error: null,
  startListening: async () => {},
  stopListening: () => {},
  interrupt: () => {},
};

const IndexContent = ({ voiceEngine, elevenlabsVoice }: { voiceEngine: VoiceEngine; elevenlabsVoice: SeraphVoiceReturn | null }) => {
  const isMobile = useIsMobile();
  const [engine, setEngine] = useState<VoiceEngine>(voiceEngine);
  const effectiveEngine: VoiceEngine = isMobile ? "vapi" : engine;
  const [historyOpen, setHistoryOpen] = useState(false);

  const vapi = useVapiVoice();
  const active = effectiveEngine === "vapi" ? vapi : (elevenlabsVoice || defaultVoice);
  const { state, transcript, lastResponse, messages, error, startListening, stopListening, interrupt } = active;

  const isActive = state !== "idle";

  const handleEngineToggle = (checked: boolean) => {
    if (isActive) stopListening();
    setEngine(checked ? "elevenlabs" : "vapi");
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-background overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-primary" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-primary rotate-45" />
      </div>

      <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-5 z-30">
        <div>
          <h1 className="font-mono text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
            Black Chamber
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {!isMobile && (
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
          )}

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

      <div className="relative z-10 flex flex-col items-center gap-16">
        <div className="text-center animate-fade-up">
          <h2 className="font-display text-3xl md:text-4xl tracking-wide text-foreground mb-2">
            Seraph
          </h2>
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            Personal Intelligence
          </p>
        </div>

        <SeraphOrb state={state} onActivate={startListening} onStop={stopListening} onInterrupt={interrupt} />

        <SeraphTranscript
          state={state}
          transcript={transcript}
          lastResponse={lastResponse}
          error={error}
        />
      </div>

      <SeraphHistory messages={messages} open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
};

const Index = () => {
  const isMobile = useIsMobile();

  // On mobile, skip ElevenLabs entirely to avoid useScribe hook issues
  if (isMobile) {
    return <IndexContent voiceEngine="vapi" elevenlabsVoice={null} />;
  }

  return (
    <React.Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">Loading...</p>
      </div>
    }>
      <ElevenLabsProvider>
        {(elevenlabsVoice) => (
          <IndexContent voiceEngine="elevenlabs" elevenlabsVoice={elevenlabsVoice} />
        )}
      </ElevenLabsProvider>
    </React.Suspense>
  );
};

export default Index;
