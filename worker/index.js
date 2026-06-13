// Flair proxy — fronts kie.ai (Suno generation + native stems) for the browser,
// attaching the Bearer key and adding CORS. Also proxies audio downloads.
const KIEAI = 'https://api.kie.ai/api/v1';

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      const url = new URL(req.url);

      // /download?url=... — proxy audio downloads to dodge cross-origin CDN issues.
      if (url.pathname === '/download') {
        const target = url.searchParams.get('url');
        if (!target) return json({ error: 'missing url param' }, 400);
        let resp;
        try { resp = await fetch(target); }
        catch (err) { return json({ error: `Download fetch failed: ${err.message}` }, 502); }
        if (!resp.ok) return json({ error: `CDN download failed: ${resp.status}` }, resp.status);
        return new Response(resp.body, {
          status: resp.status,
          headers: {
            'Content-Type': resp.headers.get('Content-Type') || 'audio/mpeg',
            'Cache-Control': 'public, max-age=3600',
            ...corsHeaders(),
          },
        });
      }

      // /callback — kie.ai requires a callBackUrl, but we poll instead.
      // This endpoint just absorbs those callbacks harmlessly.
      if (url.pathname === '/callback') {
        return json({ ok: true });
      }

      // /kieai/* — proxy to kie.ai with Bearer auth from Worker secret.
      if (url.pathname.startsWith('/kieai/')) {
        if (!env.KIEAI_KEY) return json({ error: 'Worker misconfigured: KIEAI_KEY secret not set' }, 500);
        const target = `${KIEAI}${url.pathname.replace('/kieai', '')}${url.search}`;
        const init = {
          method: req.method,
          headers: { 'Authorization': `Bearer ${env.KIEAI_KEY}`, 'Content-Type': 'application/json' },
        };
        if (req.method === 'POST') init.body = await req.text();
        let resp;
        try { resp = await fetch(target, init); }
        catch (err) { return json({ error: `kie.ai fetch failed: ${err.message}` }, 502); }
        const body = await resp.text();
        return new Response(body, {
          status: resp.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }

      return json({ error: `Unknown path: ${url.pathname}` }, 404);

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
