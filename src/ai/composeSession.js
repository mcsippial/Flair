import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from './claudeClient';
import { getAudioDuration, downloadAudio } from './audioUtils';
import { generateMusicTakes, separateNativeStems } from './kieClient';

function genId() { return Math.random().toString(36).substr(2, 9); }


// ─── Phase 1: Claude writes prompt → Suno V5 → two full-mix takes ────────────
// Returns both variations so the user can A/B them before committing to stems.

export async function generateTakes(intent, onProgress) {
  const claudeKey = getApiKey();
  let prompt, bpm, key, scale;

  if (claudeKey) {
    onProgress?.('Crafting your track…');
    const client = new Anthropic({ apiKey: claudeKey, dangerouslyAllowBrowser: true });
    const userMsg = `You are a music producer writing style tags for Suno V5 (AI music generator) in customMode. Style tags are comma-separated genre/mood/instrument descriptors, max 120 characters total. Be specific and evocative — unusual combinations produce unique tracks that won't match existing catalog recordings.

User request: ${intent.description ? `"${intent.description}"` : `${intent.mood} ${intent.type}`}
BPM hint: ${intent.bpm} | Key: ${intent.key} ${intent.scale} | Mood: ${intent.mood}

Write Suno style tags: comma-separated list of genre, sub-genre, key instruments, mood adjectives. No vocals, no lyrics, purely instrumental. Be specific (e.g. "neo-soul, fender rhodes, muted guitar, brushed drums, warm bassline, late-night" not just "soul"). Max 120 characters.

Output ONLY valid JSON, no markdown:
{"bpm":<number>,"key":<string>,"scale":"major"|"minor","tags":<comma-separated style string max 120 chars>}`;

    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{ role: 'user', content: userMsg }],
    });
    const plan = JSON.parse(
      resp.content[0].text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    );
    prompt = plan.tags || plan.prompt;
    bpm    = plan.bpm    || intent.bpm;
    key    = plan.key    || intent.key;
    scale  = plan.scale  || intent.scale;
  } else {
    bpm   = intent.bpm;
    key   = intent.key;
    scale = intent.scale;
    prompt = `${intent.mood}, ${intent.type}, instrumental, ${key} ${scale}, no vocals`;
  }

  // Append a randomized production texture so each generation drifts toward a
  // novel render — diversifies output and reduces catalog-match collisions.
  const FLAVORS = [
    'analog tape warmth', 'subtle swing', 'live-room ambience', 'vintage character',
    'organic imperfections', 'dynamic shifts', 'hand-played feel', 'unconventional harmony',
  ];
  const flavor = FLAVORS[Math.floor(Math.random() * FLAVORS.length)];
  if (prompt && (`${prompt}, ${flavor}`).length <= 120) prompt = `${prompt}, ${flavor}`;

  let result;
  try {
    result = await generateMusicTakes(prompt, onProgress); // { taskId, takes:[{url,duration,title,audioId,taskId}] }
  } catch (err) {
    throw new Error(`Suno step failed: ${err.message}`);
  }

  return { bpm, key, scale, takes: result.takes };
}


// ─── Phase 2: chosen take → native Suno stems (WAV) → mixable tracks ──────────

export async function separateTake(take, meta, onProgress) {
  const { bpm, key, scale } = meta;

  let stems;
  try {
    stems = await separateNativeStems(take.taskId, take.audioId, onProgress);
  } catch (err) {
    throw new Error(`Stem step failed: ${err.message}`);
  }
  if (!stems.length) throw new Error('No usable stems returned');

  // Download each WAV stem to a blob URL so it plays offline in the DAW.
  onProgress?.('Downloading stems…');
  const downloaded = await Promise.all(stems.map(async (s) => {
    let blobUrl;
    try { blobUrl = await downloadAudio(s.url); }
    catch (err) { throw new Error(`Stem download "${s.name}": ${err.message}`); }
    return { ...s, audioUrl: blobUrl };
  }));

  // Measure the real song length so clips and the timeline fit the full track.
  let lengthBars = 16; // fallback if duration can't be measured
  let realSecs = null;
  try {
    realSecs = await getAudioDuration(downloaded[0].audioUrl);
    if (realSecs && isFinite(realSecs)) {
      lengthBars = Math.max(1, Math.ceil((realSecs / 60) * bpm / 4));
    } else {
      realSecs = null;
    }
  } catch { /* fall back to the estimate */ }

  const tracks = downloaded.map(stem => ({
    id: genId(),
    name: stem.name,
    type: 'audio',
    color: stem.color,
    muted: false, solo: false, armed: false,
    volume: stem.volume, pan: 0, reverb: 0, delay: 0,
    eq: { low: 0, mid: 0, high: 0 },
    clips: [{
      id: genId(),
      name: stem.name,
      type: 'audio',
      start: 0,
      length: lengthBars,
      offset: 0,                  // seconds into the source; trimming adjusts this
      audioDuration: realSecs,    // full source length, for trim clamping & waveform
      audioUrl: stem.audioUrl,
    }],
  }));

  return { bpm, key, scale, tracks };
}
