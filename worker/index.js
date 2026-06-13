const REPLICATE = 'https://api.replicate.com';
const SUNOR = 'https://sunor.cc/api/v1';
const SUNOAPI = 'https://api.sunoapi.org/api/v1';

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

        // Replicate output URLs (replicate.delivery / api.replicate.com) need auth.
        // Public CDN URLs (e.g. from other providers) do not.
        const needsAuth = target.includes('replicate.delivery') || target.includes('replicate.com');
        const headers = needsAuth ? { 'Authorization': `Token ${env.REPLICATE_API_KEY}` } : {};

        let resp;
        try {
          resp = await fetch(target, { headers });
        } catch (err) {
          return json({ error: `Download fetch failed: ${err.message}` }, 502);
        }

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

      // /callback — sunoapi.org requires a callBackUrl, but we poll instead.
      // This endpoint just absorbs those callbacks harmlessly.
      if (url.pathname === '/callback') {
        return json({ ok: true });
      }

      // /sunoapi/* — proxy to sunoapi.org with Bearer auth from Worker secret
      if (url.pathname.startsWith('/sunoapi/')) {
        if (!env.SUNOAPI_KEY) return json({ error: 'Worker misconfigured: SUNOAPI_KEY secret not set' }, 500);
        const apiPath = url.pathname.replace('/sunoapi', '');
        const target = `${SUNOAPI}${apiPath}${url.search}`;
        const init = {
          method: req.method,
          headers: { 'Authorization': `Bearer ${env.SUNOAPI_KEY}`, 'Content-Type': 'application/json' },
        };
        if (req.method === 'POST') init.body = await req.text();
        let resp;
        try { resp = await fetch(target, init); }
        catch (err) { return json({ error: `sunoapi fetch failed: ${err.message}` }, 502); }
        const body = await resp.text();
        return new Response(body, {
          status: resp.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }

      // /sunor/* — proxy to Sunor API using embedded Worker secret
      if (url.pathname.startsWith('/sunor/')) {
        if (!env.SUNOR_API_KEY) return json({ error: 'Worker misconfigured: SUNOR_API_KEY secret not set' }, 500);
        const sunorPath = url.pathname.replace('/sunor', '');
        const target = `${SUNOR}${sunorPath}${url.search}`;
        const init = {
          method: req.method,
          headers: { 'x-api-key': env.SUNOR_API_KEY, 'Content-Type': 'application/json' },
        };
        if (req.method === 'POST') init.body = await req.text();
        let resp;
        try { resp = await fetch(target, init); }
        catch (err) { return json({ error: `Sunor fetch failed: ${err.message}` }, 502); }
        const body = await resp.text();
        return new Response(body, {
          status: resp.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
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
