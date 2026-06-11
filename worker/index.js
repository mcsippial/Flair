const REPLICATE = 'https://api.replicate.com';

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(req.url);
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
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(),
      },
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
