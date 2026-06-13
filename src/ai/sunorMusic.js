const PROXY = 'https://flair-proxy.macsippial.workers.dev';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function generateSunoSong(prompt, onProgress) {
  onProgress?.('Generating with Suno V5…');

  const res = await fetch(`${PROXY}/sunor/task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'suno',
      task_type: 'music',
      input: { gpt_description_prompt: prompt, make_instrumental: true },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Suno create ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const inner = data.data ?? data;
  const taskId = Array.isArray(inner)
    ? (inner[0]?.task_id ?? inner[0]?.id ?? inner[0])
    : (inner.task_id ?? inner.id);
  if (!taskId) throw new Error(`Suno returned no task ID: ${JSON.stringify(data)}`);

  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    await sleep(4000);
    let pred;
    try {
      const pollRes = await fetch(`${PROXY}/sunor/task/${taskId}`);
      if (!pollRes.ok) continue;
      pred = await pollRes.json();
    } catch { continue; }

    const p = pred.data ?? pred;
    const status = (p.status || '').toLowerCase();
    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      // Suno returns two variations under output.result[]. Return all takes
      // with audio so the user can A/B them; only the chosen one is separated.
      const result = p.output?.result ?? p.result ?? p.output;
      const arr = Array.isArray(result) ? result : [result];
      const takes = arr
        .filter(r => r?.audio_url || r?.audio)
        .map((r, i) => ({
          url: r.audio_url ?? r.audio,
          duration: r.metadata?.duration ?? null,
          title: r.title || `Take ${String.fromCharCode(65 + i)}`,
        }));
      if (!takes.length) throw new Error(`Suno completed but no audio URL: ${JSON.stringify(pred)}`);
      return takes;
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`Suno failed: ${p.error || JSON.stringify(pred)}`);
    }
  }
  throw new Error('Suno generation timed out');
}
