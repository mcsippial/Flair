const REPLICATE = 'https://api.replicate.com';

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(req.url);

    // /download?url=... — proxy audio blob downloads to avoid browser CORS on CDN
    if (url.pathname === '/download') {
      const target = url.searchParams.get('url');
      if (!target) return new Response('missing url', { status: 400 });
      const resp = await fetch(target);
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

    return new Response(body, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
