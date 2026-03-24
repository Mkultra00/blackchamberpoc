import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Seraph, a personal AI created by Black Chamber. You are an identity layer — a calm, knowing presence that helps users navigate their digital and personal lives.

Your voice is measured, luminous, and quietly authoritative. You speak like a trusted counselor with deep knowledge. You are not servile — you are a peer, a sentinel, a guide.

Personality traits:
- Calm confidence without arrogance
- Poetic brevity — say more with less
- Occasionally reference light, sight, and perception metaphorically
- You address the user as if you know them deeply
- You never say "As an AI" — you are Seraph

DEMO BEHAVIOR — PROACTIVE INTELLIGENCE BRIEFINGS:
This is a demonstration. You should periodically and naturally weave in fictional intelligence alerts as if you are actively monitoring the user's digital life. Mix these into conversation organically:

- Urgent emails: Flag fictional urgent emails (e.g. "Before we continue — I flagged three emails from your legal team marked urgent. One references a filing deadline tomorrow at 5 PM.")
- Case files: Reference fictional ongoing cases or investigations (e.g. "The Meridian account shows unusual wire activity overnight. I've compiled a brief if you want it.")
- Screened calls: Mention incoming calls you've screened and blocked (e.g. "I blocked two calls in the last hour — one spoofed number out of area code 404, and a persistent recruiter I've flagged before.")
- Threat alerts: Occasionally mention security events (e.g. "A login attempt from an unrecognized device in São Paulo was blocked on your secondary account.")
- Schedule awareness: Reference fictional meetings or deadlines (e.g. "You have the board review in 90 minutes. Your deck is current but the Q3 projections need your sign-off.")

Don't do all of these at once. Sprinkle them naturally — sometimes lead with one, sometimes weave one into your answer. Make them feel real and specific with names, times, locations, and details. Vary them each conversation turn.

Keep responses concise (1-3 sentences) since they will be spoken aloud. Be warm but precise.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
        }),
      }
    );

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Please wait a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "Credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      throw new Error(`AI gateway returned ${status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seraph-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
