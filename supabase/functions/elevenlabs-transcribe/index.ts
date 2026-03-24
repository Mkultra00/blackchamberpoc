import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSafeElevenLabsApiKey() {
  const rawApiKey = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
  const sanitizedApiKey = rawApiKey.replace(/[^\x20-\x7E]/g, "").trim();

  if (!sanitizedApiKey) {
    throw new Error("ELEVENLABS_API_KEY not configured");
  }

  if (sanitizedApiKey !== rawApiKey.trim()) {
    console.warn("ELEVENLABS_API_KEY contained unsupported characters and was sanitized");
  }

  return sanitizedApiKey;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const elevenLabsApiKey = getSafeElevenLabsApiKey();

    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!(audioFile instanceof File)) {
      throw new Error("No audio file provided");
    }

    const apiFormData = new FormData();
    apiFormData.append("file", audioFile);
    apiFormData.append("model_id", "scribe_v2");
    apiFormData.append("language_code", "eng");

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: new Headers([["xi-api-key", elevenLabsApiKey]]),
      body: apiFormData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Scribe error:", response.status, errText);
      throw new Error(`Transcription failed: ${response.status}`);
    }

    const transcription = await response.json();

    return new Response(JSON.stringify(transcription), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
