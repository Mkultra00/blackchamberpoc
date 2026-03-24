import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function parseScribeError(response: Response) {
  const rawError = await response.text();
  console.error("Scribe error:", response.status, rawError);

  try {
    const parsed = JSON.parse(rawError);
    const detail = parsed?.detail;
    const providerCode = detail?.status;
    const providerMessage = detail?.message;

    if (providerCode === "invalid_api_key") {
      return {
        status: 401,
        error: "The ElevenLabs API key is invalid. Update the key and try again.",
        code: providerCode,
      };
    }

    if (providerCode === "detected_unusual_activity") {
      return {
        status: 403,
        error:
          "Voice transcription is unavailable for this ElevenLabs account right now. ElevenLabs has restricted the account, so you’ll need a paid/healthy account or a different API key.",
        code: providerCode,
      };
    }

    return {
      status: response.status,
      error: providerMessage || `Transcription failed: ${response.status}`,
      code: providerCode || "transcription_failed",
    };
  } catch {
    return {
      status: response.status,
      error: `Transcription failed: ${response.status}`,
      code: "transcription_failed",
    };
  }
}

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
      return jsonResponse({ error: "No audio file provided", code: "missing_audio" }, 400);
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
      const parsedError = await parseScribeError(response);
      return jsonResponse(
        {
          error: parsedError.error,
          code: parsedError.code,
          providerStatus: response.status,
        },
        parsedError.status
      );
    }

    const transcription = await response.json();

    return jsonResponse(transcription);
  } catch (e) {
    console.error("transcribe error:", e);
    return jsonResponse(
      {
        error: e instanceof Error ? e.message : "Unknown error",
        code: "internal_error",
      },
      500
    );
  }
});
