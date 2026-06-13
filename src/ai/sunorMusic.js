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
  const taskId = Array.isArray(data)
    ? (data[0]?.id ?? data[0])
    : (data.id ?? data.task_id);
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

    const status = (pred.status || '').toLowerCase();
    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      const audioUrl =
        pred.output?.audio_url ??
        pred.output?.audio ??
        (Array.isArray(pred.output) ? (pred.output[0]?.audio_url ?? pred.output[0]) : null) ??
        pred.audio_url;
      if (!audioUrl) throw new Error(`Suno completed but no audio URL: ${JSON.stringify(pred)}`);
      return audioUrl;
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`Suno failed: ${pred.error || JSON.stringify(pred)}`);
    }
  }
  throw new Error('Suno generation timed out');
}
