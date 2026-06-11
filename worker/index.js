const REPLICATE = 'https://api.replicate.com';

export default {
  async fetch(req, env) {
    // Preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      const url = new URL(req.url);

      // /download?url=... — proxy audio blob downloads to avoid browser CORS on CDN
      if (url.pathname === '/download') {
        const target = url.searchParams.get('url');
        if (!target) return json({ error: 'missing url param' }, 400);

        const resp = await fetch(target);
        if (!resp.ok) {
          return json({ error: `CDN download failed: ${resp.status}` }, resp.status);
        }
        return new Response(resp.body, {
          status: resp.status,
          headers: {
            'Content-Type': resp.headers.get('Content-Type') || 'audio/mpeg',
            'Cache-Control': 'public, max-age=3600',
            ...corsHeaders(),
          },
        });
      }

      // All other paths — proxy to Replicate API
      if (!env.REPLICATE_API_KEY) {
        return json({ error: 'Worker misconfigured: REPLICATE_API_KEY secret not set' }, 500);
      }

      const target = REPLICATE + url.pathname + url.search;
      const init = {
        method: req.method,
        headers: {
          'Authorization': `Token ${env.REPLICATE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      };
      if (req.method === 'POST') {
        init.body = await req.text();
      }

      const resp = await fetch(target, init);
      const body = await resp.text();

      // Forward Replicate's status and body verbatim, always with CORS.
      return new Response(body, {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });

    } catch (err) {
      // Any thrown error MUST still carry CORS headers, otherwise the browser
      // reports an opaque "Failed to fetch" instead of this message.
      return json({ error: `Worker exception: ${err?.message || String(err)}` }, 502);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
