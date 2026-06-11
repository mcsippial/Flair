import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from './claudeClient';
import { getReplicateKey, generateMusicClip } from './musicGen';

function genId() { return Math.random().toString(36).substr(2, 9); }

// ─── Stem decomposition prompt ────────────────────────────────────────────────
// Claude's job: turn a vague user request into per-stem MusicGen prompts.
// Each stem is generated separately so the user can mix/mute/solo them.

const STEM_SYSTEM = `You are a professional music producer decomposing a track into individual stems for AI audio generation.

Given a user request, output JSON describing 4 stems. Each stem will be sent to MusicGen separately.

Output ONLY valid JSON — no markdown, no explanation:
{
  "bpm": <number 60-180>,
  "key": <"C"|"C#"|"D"|"D#"|"E"|"F"|"F#"|"G"|"G#"|"A"|"A#"|"B">,
  "scale": <"major"|"minor">,
  "trackName": "<evocative 2-4 word project name>",
  "stems": [
    {
      "name": "Drums",
      "color": "#c4a882",
      "volume": 0.85,
      "prompt": "<MusicGen prompt for drums/percussion ONLY — no other instruments>"
    },
    {
      "name": "Bass",
      "color": "#6ba3c4",
      "volume": 0.8,
      "prompt": "<MusicGen prompt for bass ONLY — no drums, no chords>"
    },
    {
      "name": "Chords",
      "color": "#9b82c4",
      "volume": 0.75,
      "prompt": "<MusicGen prompt for harmonic elements — pads, chords, keys — no drums, no bass>"
    },
    {
      "name": "Melody",
      "color": "#82c49b",
      "volume": 0.7,
      "prompt": "<MusicGen prompt for lead melody/top line — no drums, no bass, no chords>"
    }
  ]
}

STEM PROMPT RULES — each prompt must:
- State "isolated [instrument] stem, no other instruments" explicitly
- Name the BPM: "at 140 BPM"
- Name the key and mode: "in A minor"
- Use specific instrument names: "Fender Rhodes", "upright bass", "Roland TR-808 kick"
- Include production descriptors: "dry and punchy", "warm analog", "heavy sub"
- Reference genre/era: "UK drill 2020", "early J Dilla boom bap", "minimal Berlin techno"
- For drums: describe the pattern feel — "four-on-the-floor with syncopated hi-hats", "trap 808 pattern"
- For bass: describe the rhythmic relationship to the kick
- Avoid vague words like "nice", "good", "cool"
- Each prompt: 30-100 words`;

// ─── MIDI fallback system prompt ──────────────────────────────────────────────

const MIDI_SYSTEM = `You are a professional music producer AI. Compose a complete, musically rich 16-bar session.

Output ONLY valid JSON — no explanation, no markdown fences. Exact shape:
{
  "bpm": <60-180>,
  "key": <"C"|"C#"|"D"|"D#"|"E"|"F"|"F#"|"G"|"G#"|"A"|"A#"|"B">,
  "scale": <"major"|"minor">,
  "tracks": [
    {
      "name": <string>,
      "type": <"drum"|"midi">,
      "instrument": <"bass"|"pad"|"keys"|"lead"|null>,
      "color": <hex>,
      "volume": <0-1>,
      "clips": [{
        "name": <string>,
        "start": 0,
        "length": 16,
        "notes": [ ...note objects ]
      }]
    }
  ]
}

DRUM note: { "time": "bar:beat:sixteenth", "drum": "kick"|"snare"|"hihat", "velocity": 0.0-1.0 }
MIDI note: { "time": "bar:beat:sixteenth", "note": "C3", "duration": "16n"|"8n"|"4n"|"2n", "velocity": 0.0-1.0 }

Time format: bar=0-15, beat=0-3, sixteenth=0-3. Example: "0:2:0" = bar 0, beat 2.

Create 3-4 tracks. Section B (bars 8-15) must differ from Section A (bars 0-7) in at least 2 tracks.`;


// ─── Main entry point ─────────────────────────────────────────────────────────

export async function composeStarterSession(intent, onStemProgress) {
  const replicateKey = getReplicateKey();
  const claudeKey    = getApiKey();

  if (replicateKey) {
    return composeWithStems(intent, claudeKey, onStemProgress);
  }
  if (claudeKey) {
    return composeWithMidi(intent, claudeKey);
  }
  return buildFallback(intent);
}


// ─── Stems path: Claude plans → parallel MusicGen calls ──────────────────────

async function composeWithStems(intent, claudeKey, onStemProgress) {
  const durationSecs = Math.min(30, Math.round((16 * 4 * 60) / intent.bpm));

  let stemPlan;

  if (claudeKey) {
    const client = new Anthropic({ apiKey: claudeKey, dangerouslyAllowBrowser: true });
    const userMsg = intent.description
      ? `Decompose this into stems: "${intent.description}". Type: ${intent.type}, mood: ${intent.mood}, BPM hint: ${intent.bpm}, key hint: ${intent.key} ${intent.scale}.`
      : `Decompose a ${intent.mood} ${intent.type} at ${intent.bpm} BPM in ${intent.key} ${intent.scale} into 4 stems.`;

    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: STEM_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });

    stemPlan = JSON.parse(
      resp.content[0].text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    );
  } else {
    stemPlan = buildDirectStemPlan(intent);
  }

  const { bpm, key, scale, stems } = stemPlan;

  // Notify UI of initial pending state
  onStemProgress?.(stems.map(s => ({ name: s.name, status: 'pending' })));

  // Generate all stems in parallel, reporting progress per stem
  const audioUrls = await Promise.all(
    stems.map(async (stem, i) => {
      onStemProgress?.(prev => prev.map((s, j) => j === i ? { ...s, status: 'generating' } : s));
      const url = await generateMusicClip(stem.prompt, durationSecs);
      onStemProgress?.(prev => prev.map((s, j) => j === i ? { ...s, status: 'done' } : s));
      return url;
    })
  );

  const barsGenerated = Math.round((durationSecs / 60) * bpm / 4);

  const tracks = stems.map((stem, i) => ({
    id: genId(),
    name: stem.name,
    type: 'audio',
    color: stem.color,
    muted: false, solo: false, armed: false,
    volume: stem.volume ?? 0.8, pan: 0, reverb: 0.05, delay: 0,
    eq: { low: 0, mid: 0, high: 0 },
    clips: [{
      id: genId(),
      name: stem.name,
      type: 'audio',
      start: 0,
      length: barsGenerated,
      audioUrl: audioUrls[i],
    }],
  }));

  return { bpm, key, scale, tracks };
}

function buildDirectStemPlan(intent) {
  const { type, mood, bpm, key, scale } = intent;
  const keyMode = `${key} ${scale}`;
  return {
    bpm, key, scale,
    stems: [
      {
        name: 'Drums',
        color: '#c4a882',
        volume: 0.85,
        prompt: `Isolated drum stem only, no other instruments. ${mood} ${type} drum pattern at ${bpm} BPM in ${keyMode}. Punchy kick, crisp snare, rhythmic hi-hats. Professional mix.`,
      },
      {
        name: 'Bass',
        color: '#6ba3c4',
        volume: 0.8,
        prompt: `Isolated bass stem only, no drums, no chords, no melody. ${mood} bass line at ${bpm} BPM in ${keyMode}. Follows chord roots with rhythmic variation. Deep sub-bass tone.`,
      },
      {
        name: 'Chords',
        color: '#9b82c4',
        volume: 0.75,
        prompt: `Isolated chord/harmonic stem only, no drums, no bass, no melody. ${mood} pad and chords at ${bpm} BPM in ${keyMode}. Lush harmonic bed, atmospheric texture.`,
      },
      {
        name: 'Melody',
        color: '#82c49b',
        volume: 0.7,
        prompt: `Isolated melody/lead stem only, no drums, no bass, no chords. ${mood} melodic lead at ${bpm} BPM in ${keyMode}. Expressive phrases using scale tones.`,
      },
    ],
  };
}


// ─── MIDI path (Claude only, no Replicate) ────────────────────────────────────

async function composeWithMidi(intent, claudeKey) {
  const prompt = `Compose a 16-bar ${intent.type || 'track'} at ${intent.bpm} BPM in ${intent.key} ${intent.scale}. Mood: ${intent.mood}.${intent.description ? ` Description: "${intent.description}".` : ''} Make section B harmonically distinct from section A.`;

  const client = new Anthropic({ apiKey: claudeKey, dangerouslyAllowBrowser: true });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: MIDI_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
  const composed = JSON.parse(text);

  return {
    bpm: composed.bpm,
    key: composed.key,
    scale: composed.scale,
    tracks: (composed.tracks || []).map(t => ({
      id: genId(),
      name: t.name,
      type: t.type,
      instrument: t.instrument || undefined,
      color: t.color || '#7eb8d4',
      muted: false, solo: false, armed: false,
      volume: t.volume ?? 0.8, pan: 0,
      reverb: 0, delay: 0,
      eq: { low: 0, mid: 0, high: 0 },
      clips: (t.clips || []).map(c => ({
        id: genId(),
        name: c.name || 'Clip',
        start: c.start ?? 0,
        length: c.length ?? 16,
        type: t.type === 'drum' ? 'drum' : 'midi',
        notes: (c.notes || []).map(n => ({ id: genId(), ...n })),
      })),
    })),
  };
}


// ─── Fallback (no API keys) ───────────────────────────────────────────────────

function buildFallback(intent) {
  // Minimal offline session — 3 MIDI tracks with basic patterns
  const bpm   = intent?.bpm   || 90;
  const key   = intent?.key   || 'A';
  const scale = intent?.scale || 'minor';

  const drumNotes = [];
  for (let bar = 0; bar < 16; bar++) {
    drumNotes.push({ id: genId(), time: `${bar}:0:0`, drum: 'kick',  velocity: 0.9 });
    drumNotes.push({ id: genId(), time: `${bar}:1:0`, drum: 'hihat', velocity: 0.6 });
    drumNotes.push({ id: genId(), time: `${bar}:2:0`, drum: 'snare', velocity: 0.85 });
    drumNotes.push({ id: genId(), time: `${bar}:3:0`, drum: 'hihat', velocity: 0.6 });
  }

  const bassNotes = [];
  for (let bar = 0; bar < 16; bar++) {
    bassNotes.push({ id: genId(), time: `${bar}:0:0`, note: `${key}2`, duration: '4n', velocity: 0.8 });
    bassNotes.push({ id: genId(), time: `${bar}:2:0`, note: `${key}2`, duration: '8n', velocity: 0.7 });
  }

  return {
    bpm, key, scale,
    tracks: [
      {
        id: genId(), name: 'Drums', type: 'drum', color: '#c4a882',
        muted: false, solo: false, armed: false,
        volume: 0.8, pan: 0, reverb: 0, delay: 0, eq: { low: 0, mid: 0, high: 0 },
        clips: [{ id: genId(), name: 'Drums', start: 0, length: 16, type: 'drum', notes: drumNotes }],
      },
      {
        id: genId(), name: 'Bass', type: 'midi', instrument: 'bass', color: '#6ba3c4',
        muted: false, solo: false, armed: false,
        volume: 0.8, pan: 0, reverb: 0, delay: 0, eq: { low: 0, mid: 0, high: 0 },
        clips: [{ id: genId(), name: 'Bass', start: 0, length: 16, type: 'midi', notes: bassNotes }],
      },
    ],
  };
}
