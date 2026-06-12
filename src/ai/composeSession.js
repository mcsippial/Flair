import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from './claudeClient';
import { getReplicateKey, generateMusicUrl, downloadAudio } from './musicGen';
import { separateStems } from './demucs';

function genId() { return Math.random().toString(36).substr(2, 9); }

// ─── Stem decomposition prompt ────────────────────────────────────────────────
// Claude's job: turn a vague user request into per-stem MusicGen prompts.
// Each stem is generated separately so the user can mix/mute/solo them.

const STEM_SYSTEM = `You are a professional music producer creating two complementary audio layers for a track. Each layer is generated separately by MusicGen and played together in a DAW.

Output ONLY valid JSON — no markdown, no explanation:
{
  "bpm": <number 60-180>,
  "key": <"C"|"C#"|"D"|"D#"|"E"|"F"|"F#"|"G"|"G#"|"A"|"A#"|"B">,
  "scale": <"major"|"minor">,
  "stems": [
    {
      "name": "Rhythm",
      "color": "#c4a882",
      "volume": 0.82,
      "prompt": "<MusicGen prompt: drums and bass together as a groove layer>"
    },
    {
      "name": "Harmonic",
      "color": "#9b82c4",
      "volume": 0.68,
      "prompt": "<MusicGen prompt: chords, pads, and melodic elements — NO drums, NO bass>"
    }
  ]
}

PROMPT RULES — each prompt must:
- Describe a single coherent musical texture, not isolated stems
- Name the exact BPM: "at 140 BPM"
- Name key and mode: "in A minor"
- Use specific instrument names: "Roland TR-808", "Fender Rhodes", "Moog sub bass"
- Include production feel: "punchy and dry", "warm analog", "deep sub"
- Name the genre/era: "UK drill 2020", "J Dilla boom bap", "Berlin techno"
- Rhythm prompt: emphasize the groove, kick pattern, hi-hat feel, bass line rhythm
- Harmonic prompt: emphasize chord voicings, pad texture, melodic phrases — explicitly say "no drums, no bass"
- Each prompt: 40-80 words`;

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


// ─── Stems path: Claude writes prompt → MusicGen → Demucs ────────────────────

async function composeWithStems(intent, claudeKey, onProgress) {
  const durationSecs = Math.min(30, Math.round((16 * 4 * 60) / intent.bpm));

  // Step 1: build the MusicGen prompt
  let prompt, bpm, key, scale;

  if (claudeKey) {
    onProgress?.('Crafting your track…');
    const client = new Anthropic({ apiKey: claudeKey, dangerouslyAllowBrowser: true });
    const userMsg = `You are writing a prompt for MusicGen, an AI music generation model. Your prompt must be hyper-specific — vague prompts produce generic output.

Request: ${intent.description ? `"${intent.description}"` : `${intent.mood} ${intent.type}`}
BPM hint: ${intent.bpm} | Key hint: ${intent.key} ${intent.scale} | Mood: ${intent.mood}

Write a MusicGen prompt that includes ALL of the following:
- Exact genre and sub-genre (e.g. "UK drill", "lo-fi boom bap", "Berlin minimal techno", "trap soul")
- Era or scene reference (e.g. "2019 SoundCloud era", "early 2000s Neptunes", "classic Motown")
- Named instruments with specific models (e.g. "Roland TR-808 kick", "Fender Rhodes electric piano", "Moog Minimoog bassline", "Akai MPC chopped samples")
- Drum pattern description (e.g. "four-on-the-floor kick, syncopated snare on 3, rolling hi-hats")
- Bass character (e.g. "deep sub bass, slides between root notes", "punchy fingerstyle bass")
- Harmonic texture (e.g. "lush minor 7th chord pads", "stacked vocal harmonics", "distorted power chords")
- Melody description (e.g. "sparse pentatonic lead melody", "soulful vocal hook line")
- Production feel (e.g. "lo-fi vinyl crackle", "heavy compression and sidechain", "wide stereo reverb")
- Energy and tempo feel (e.g. "laid-back behind the beat", "urgent and driving")
- Exact BPM

Output ONLY valid JSON, no markdown:
{"bpm":<number>,"key":<string>,"scale":"major"|"minor","prompt":<string, 80-150 words>}`;

    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: userMsg }],
    });
    const plan = JSON.parse(
      resp.content[0].text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    );
    prompt = plan.prompt;
    bpm    = plan.bpm    || intent.bpm;
    key    = plan.key    || intent.key;
    scale  = plan.scale  || intent.scale;
  } else {
    bpm   = intent.bpm;
    key   = intent.key;
    scale = intent.scale;
    prompt = `${intent.mood} ${intent.type} at ${bpm} BPM in ${key} ${scale}. Roland TR-808 kick drum, tight snare, rolling hi-hats. Deep sub bass following chord roots. Lush ${key} ${scale} chord pads with slow attack. Sparse melodic lead on top. Professional mix, wide stereo, heavy low end.`;
  }

  // Step 2: generate the full mix with MusicGen
  onProgress?.('Composing music…');
  let rawAudioUrl;
  try {
    rawAudioUrl = await generateMusicUrl(prompt, durationSecs);
  } catch (err) {
    throw new Error(`MusicGen step failed: ${err.message}`);
  }

  // Step 3: separate into stems with Demucs
  let stems;
  try {
    stems = await separateStems(rawAudioUrl, onProgress);
  } catch (err) {
    throw new Error(`Demucs step failed: ${err.message}`);
  }

  const barsGenerated = Math.round((durationSecs / 60) * bpm / 4);

  const tracks = stems.map(stem => ({
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
      length: barsGenerated,
      audioUrl: stem.audioUrl,
    }],
  }));

  return { bpm, key, scale, tracks };
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
