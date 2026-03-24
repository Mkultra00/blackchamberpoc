import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_VOICE_ID = "CwhRBWXzGAHq8TQ4Fs17";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function parseTtsError(response: Response) {
  const rawError = await response.text();
  console.error("ElevenLabs TTS error:", response.status, rawError);

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
          "Voice playback is unavailable for this ElevenLabs account right now. ElevenLabs has restricted the account, so you’ll need a paid/healthy account or a different API key.",
        code: providerCode,
      };
    }

    return {
      status: response.status,
      error: providerMessage || `TTS failed: ${response.status}`,
      code: providerCode || "tts_failed",
    };
  } catch {
    return {
      status: response.status,
      error: `TTS failed: ${response.status}`,
      code: "tts_failed",
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
    const { text, voiceId } = await req.json();
    const elevenLabsApiKey = getSafeElevenLabsApiKey();
    const voice = voiceId || DEFAULT_VOICE_ID;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: new Headers([
          ["xi-api-key", elevenLabsApiKey],
          ["Content-Type", "application/json"],
        ]),
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.8,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const parsedError = await parseTtsError(response);
      return jsonResponse(
        {
          error: parsedError.error,
          code: parsedError.code,
          providerStatus: response.status,
        },
        parsedError.status
      );
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (e) {
    console.error("elevenlabs-tts error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error", code: "internal_error" },
      500
    );
  }
});
