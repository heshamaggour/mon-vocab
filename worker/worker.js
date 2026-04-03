// Cloudflare Worker — proxy for mon-vocab
// Secrets required (Worker Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  — from console.anthropic.com
//   GOOGLE_TTS_KEY     — from console.cloud.google.com
// KV binding required (Worker Settings → KV Namespace Bindings):
//   VOCAB_KV           — create a namespace called "mon-vocab-store"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function cors(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── CORS preflight ───────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // ── GET /bank — load word bank from KV ───────────────────────────
    if (request.method === "GET" && url.pathname.endsWith("/bank")) {
      try {
        const data = await env.VOCAB_KV.get("bank");
        return cors(data || "{}");
      } catch (err) {
        return cors(JSON.stringify({ error: err.message }), 500);
      }
    }

    // ── PUT /bank — save word bank to KV ────────────────────────────
    if (request.method === "PUT" && url.pathname.endsWith("/bank")) {
      try {
        const body = await request.text();
        await env.VOCAB_KV.put("bank", body);
        return cors('{"ok":true}');
      } catch (err) {
        return cors(JSON.stringify({ error: err.message }), 500);
      }
    }

    // ── POST /tts — Google Cloud Text-to-Speech proxy ────────────────
    if (request.method === "POST" && url.pathname.endsWith("/tts")) {
      try {
        const body = await request.json();
        const res = await fetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${env.GOOGLE_TTS_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        const data = await res.text();
        return cors(data, res.status);
      } catch (err) {
        return cors(JSON.stringify({ error: err.message }), 500);
      }
    }

    // ── POST / — Anthropic API proxy (default) ───────────────────────
    if (request.method === "POST") {
      try {
        const body = await request.json();
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        });
        const data = await res.text();
        return cors(data, res.status);
      } catch (err) {
        return cors(JSON.stringify({ error: err.message }), 500);
      }
    }

    return cors(JSON.stringify({ error: "Not found" }), 404);
  },
};
