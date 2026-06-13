import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from './claudeClient';
import { getAudioDuration, downloadAudio } from './audioUtils';
import { generateMusicTakes, separateNativeStems } from './kieClient';

function genId() { return Math.random().toString(36).substr(2, 9); }


// ─── Phase 1: Claude writes prompt → Suno V5 → two full-mix takes ────────────
// Returns both variations so the user can A/B them before committing to stems.

export async function generateTakes(intent, onProgress) {
  const claudeKey = getApiKey();
  const weirdness = typeof intent.weirdness === 'number' ? intent.weirdness : 0.45;
  const advPct = Math.round(weirdness * 100);
  let style, title, bpm, key, scale;

  if (claudeKey) {
    onProgress?.('Crafting your track…');
    const client = new Anthropic({ apiKey: claudeKey, dangerouslyAllowBrowser: true });
    const userMsg = `You are an innovative music producer writing a style descriptor for Suno V5 (AI music generator, customMode, instrumental only).

User request: ${intent.description ? `"${intent.description}"` : `${intent.mood} ${intent.type}`}
BPM hint: ${intent.bpm} | Key: ${intent.key} ${intent.scale} | Mood: ${intent.mood}
Adventurousness: ${advPct}/100.

How to use adventurousness:
- If the request already names a clear genre/style, honor it as the CORE. At low adventurousness keep it conventional and faithful; at higher adventurousness add a complementary secondary influence (subtle at mid, bold genre fusion at high). Examples of bold fusions: "dub techno meets spaghetti western", "neo-soul meets IDM".
- If the request is vague, you have freedom — scale how unusual the blend is to the adventurousness level.
- The goal is a track that's distinctive enough to avoid matching existing catalog recordings, without betraying what the user asked for.

Return a style descriptor: comma-separated list leading with genre(s), then key instruments, then mood adjectives. Purely instrumental, no vocals. Be specific (e.g. "neo-soul, fender rhodes, brushed drums, warm sub bass, late-night"). Max 110 characters. Also give a short evocative track title (2-4 words).

Output ONLY valid JSON, no markdown:
{"bpm":<number>,"key":<string>,"scale":"major"|"minor","style":<descriptor max 110 chars>,"title":<2-4 word title>}`;

    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 250,
      temperature: 1, // max variety per call (Anthropic's ceiling)
      messages: [{ role: 'user', content: userMsg }],
    });
    const plan = JSON.parse(
      resp.content[0].text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    );
    style = plan.style || plan.tags || plan.prompt;
    title = plan.title || 'Flair Session';
    bpm   = plan.bpm   || intent.bpm;
    key   = plan.key   || intent.key;
    scale = plan.scale || intent.scale;
  } else {
    bpm   = intent.bpm;
    key   = intent.key;
    scale = intent.scale;
    style = `${intent.mood}, ${intent.type}, instrumental, ${key} ${scale}, no vocals`;
    title = `${intent.mood} ${intent.type}`;
  }

  // Append a randomized production texture so each generation drifts toward a
  // novel render — diversifies output and reduces catalog-match collisions.
  const FLAVORS = [
    'analog tape warmth', 'subtle swing', 'live-room ambience', 'vintage character',
    'organic imperfections', 'dynamic shifts', 'hand-played feel', 'unconventional harmony',
  ];
  const flavor = FLAVORS[Math.floor(Math.random() * FLAVORS.length)];
  if (style && (`${style}, ${flavor}`).length <= 120) style = `${style}, ${flavor}`;

  let result;
  try {
    result = await generateMusicTakes({ style, title, weirdness }, onProgress); // { taskId, takes:[…] }
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
