import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function tavilySearch(query: string, searchDepth: string = "basic") {
  const apiKey = Deno.env.get("TAVILY_API_KEY");
  if (!apiKey) throw new Error("TAVILY_API_KEY not configured");

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: searchDepth,
      max_results: 5,
      include_answer: true,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Tavily error:", response.status, text);
    throw new Error(`Tavily search failed: ${response.status}`);
  }

  const data = await response.json();

  // Format results for the LLM
  let formatted = "";
  if (data.answer) {
    formatted += `Summary: ${data.answer}\n\n`;
  }
  if (data.results && data.results.length > 0) {
    formatted += "Sources:\n";
    for (const r of data.results) {
      formatted += `- ${r.title}: ${r.content} (${r.url})\n`;
    }
  }
  return formatted || "No results found.";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const messageType = body.message?.type;

    // Vapi sends tool-calls messages
    if (messageType === "tool-calls") {
      const toolCallList = body.message?.toolCallList || [];
      const results = [];

      for (const toolCall of toolCallList) {
        const { id, function: fn } = toolCall;
        const args = typeof fn.arguments === "string" 
          ? JSON.parse(fn.arguments) 
          : fn.arguments;

        let result = "";

        if (fn.name === "web_search") {
          result = await tavilySearch(
            args.query,
            args.search_depth || "basic"
          );
        } else if (fn.name === "web_research") {
          result = await tavilySearch(args.query, "advanced");
        } else {
          result = `Unknown tool: ${fn.name}`;
        }

        results.push({ toolCallId: id, result });
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For any other Vapi webhook events, acknowledge
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("vapi-tools error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
