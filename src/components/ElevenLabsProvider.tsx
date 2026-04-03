import { useElevenLabsVoice } from "@/hooks/useElevenLabsVoice";
import type { SeraphVoiceReturn } from "@/hooks/useSeraphVoice";

interface Props {
  children: (voice: SeraphVoiceReturn) => React.ReactNode;
}

const ElevenLabsProvider = ({ children }: Props) => {
  const voice = useElevenLabsVoice();
  return <>{children(voice)}</>;
};

export default ElevenLabsProvider;
