import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from './claudeClient';
import { getReplicateKey, generateMusicClip } from './musicGen';
import { generateSession } from '../music/generator';

function genId() { return Math.random().toString(36).substr(2, 9); }

// ─── Claude → MusicGen prompt ─────────────────────────────────────────────────
// Claude's job here is to translate a vague user description into a precise
// MusicGen prompt — specific instruments, tempo, key, production style.

const MUSICGEN_SYSTEM = `You are a music production prompt engineer for MusicGen, an AI audio model that generates real recorded-quality music from text.

Given a user request, write a precise MusicGen prompt and return metadata as JSON.

Output ONLY valid JSON — no markdown, no explanation:
{
  "audioPrompt": "<20-140 word description for MusicGen>",
  "bpm": <number 60-180>,
  "key": <"C"|"C#"|"D"|"D#"|"E"|"F"|"F#"|"G"|"G#"|"A"|"A#"|"B">,
  "scale": <"major"|"minor">,
  "name": "<short evocative track name, 2-4 words>"
}

MusicGen prompt guidelines:
- Name specific instruments: "Fender Rhodes, upright bass, brushed snare, ride cymbal"
- State the BPM explicitly: "90 BPM", "at 140 BPM"
- Name the key and mode: "in A minor", "D Dorian", "G major"
- Describe the energy arc if relevant: "sparse intro building into a full drop"
- Use production descriptors: "warm tape saturation", "lo-fi vinyl crackle", "crispy digital mix", "live room reverb"
- Reference genres or eras precisely: "early J Dilla boom bap", "UK drill 2020", "late 70s Philly soul", "minimal Berlin techno"
- Describe the mix: "heavy punchy kick, sub bass, bright hi-hats panned wide"
- Avoid vague words like "nice", "good", "cool" — be specific`;

// ─── Claude → MIDI parameters (fallback when no Replicate key) ────────────────

const MIDI_SYSTEM = `You are a music director. Given a style or brief, output the musical parameters for a 16-bar composition as JSON.

Output ONLY valid JSON — no markdown, no explanation:
{
  "bpm": <number 60–180>,
  "key": <root note, sharps only: "C"|"C#"|"D"|"D#"|"E"|"F"|"F#"|"G"|"G#"|"A"|"A#"|"B">,
  "scale": <"major"|"minor"|"dorian"|"mixolydian">,
  "style": <one word describing the genre/feel, e.g. "jazz"|"trap"|"lofi"|"house"|"pop"|"bossa"|"ambient">,
  "chords": [
    { "bar": 0,  "root": <note>, "type": <chord type> },
    { "bar": 2,  "root": <note>, "type": <chord type> },
    { "bar": 4,  "root": <note>, "type": <chord type> },
    { "bar": 6,  "root": <note>, "type": <chord type> },
    { "bar": 8,  "root": <note>, "type": <chord type> },
    { "bar": 10, "root": <note>, "type": <chord type> },
    { "bar": 12, "root": <note>, "type": <chord type> },
    { "bar": 14, "root": <note>, "type": <chord type> }
  ],
  "trackList": [
    { "id": "...", "name": "...", "type": "drum"|"midi", "instrument": null|"bass"|"pad"|"keys"|"lead", "color": "<hex>" }
  ]
}

CHORD TYPES: maj, min, maj7, min7, dom7, dim, aug, sus2, sus4, maj9, min9, 6, min6

Section A (bars 0-6) and Section B (bars 8-14) must be harmonically distinct.`;


// ─── Main entry point ─────────────────────────────────────────────────────────

export async function composeStarterSession(intent) {
  const replicateKey = getReplicateKey();
  const claudeKey    = getApiKey();

  if (replicateKey) {
    return composeWithAudio(intent, claudeKey);
  }
  if (claudeKey) {
    return composeWithMidi(intent, claudeKey);
  }
  return buildFallback(intent);
}


// ─── Audio path (Replicate MusicGen) ─────────────────────────────────────────

async function composeWithAudio(intent, claudeKey) {
  let audioPrompt, bpm, key, scale, name;

  if (claudeKey) {
    // Claude crafts the optimized MusicGen prompt
    const client = new Anthropic({ apiKey: claudeKey, dangerouslyAllowBrowser: true });
    const userMsg = intent.description
      ? `Create a MusicGen prompt for: "${intent.description}". Type: ${intent.type}, mood: ${intent.mood}.`
      : `Create a MusicGen prompt for a ${intent.mood} ${intent.type} at ${intent.bpm} BPM in ${intent.key} ${intent.scale}.`;

    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: MUSICGEN_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });

    const parsed = JSON.parse(
      resp.content[0].text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    );
    audioPrompt = parsed.audioPrompt;
    bpm         = parsed.bpm   || intent.bpm;
    key         = parsed.key   || intent.key;
    scale       = parsed.scale || intent.scale;
    name        = parsed.name  || 'AI Track';
  } else {
    // Build prompt directly from intent without Claude
    audioPrompt = buildDirectPrompt(intent);
    bpm   = intent.bpm;
    key   = intent.key;
    scale = intent.scale;
    name  = `${intent.mood} ${intent.type}`;
  }

  // Duration in seconds for 16 bars at the chosen BPM
  const durationSecs = Math.min(30, Math.round((16 * 4 * 60) / bpm));

  const audioUrl = await generateMusicClip(audioPrompt, durationSecs);

  const barsGenerated = Math.round((durationSecs / 60) * bpm / 4);

  return {
    bpm, key, scale,
    audioPrompt, // expose so the AI panel can show what was generated
    tracks: [{
      id: genId(),
      name,
      type: 'audio',
      color: '#9b82c4',
      muted: false, solo: false, armed: false,
      volume: 0.85, pan: 0, reverb: 0.1, delay: 0,
      eq: { low: 0, mid: 0, high: 0 },
      clips: [{
        id: genId(),
        name,
        type: 'audio',
        start: 0,
        length: barsGenerated,
        audioUrl,
      }],
    }],
  };
}

function buildDirectPrompt(intent) {
  const style = intent.type === 'beat' ? 'drum beat and bass' : intent.type;
  return `${intent.mood} ${style} at ${intent.bpm} BPM in ${intent.key} ${intent.scale}. Professional mix, full arrangement.`;
}


// ─── MIDI path (Claude only, no Replicate) ────────────────────────────────────

async function composeWithMidi(intent, claudeKey) {
  const prompt = `${intent.description
    ? `User request: "${intent.description}"\n\n`
    : ''}Compose a 16-bar ${intent.type || 'track'}${intent.bpm ? ` at ${intent.bpm} BPM` : ''}. Make section B harmonically distinct from section A.`;

  const client = new Anthropic({ apiKey: claudeKey, dangerouslyAllowBrowser: true });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: MIDI_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
  const params = JSON.parse(text);

  params.trackList = (params.trackList || []).map(t => ({
    id: genId(),
    name: t.name || t.type,
    type: t.type || 'midi',
    instrument: t.instrument || null,
    color: t.color || '#7eb8d4',
    muted: false, solo: false, armed: false,
    volume: 0.8, pan: 0, reverb: 0, delay: 0,
    eq: { low: 0, mid: 0, high: 0 },
  }));

  const session = generateSession({ ...params, description: intent.description || '' });
  return { bpm: session.bpm, key: session.key, scale: session.scale, tracks: session.tracks };
}


// ─── Fallback (no API keys) ───────────────────────────────────────────────────

function buildFallback(intent) {
  const type = (intent?.type || 'pop').toLowerCase();

  const presets = {
    beat: {
      bpm: 90, key: 'A', scale: 'minor', style: 'trap',
      chords: [
        { bar:0, root:'A', type:'min7' }, { bar:2, root:'F', type:'maj7' },
        { bar:4, root:'G', type:'dom7' }, { bar:6, root:'A', type:'min7' },
        { bar:8, root:'D', type:'min7' }, { bar:10,root:'G', type:'dom7' },
        { bar:12,root:'C', type:'maj7' }, { bar:14,root:'A', type:'min7' },
      ],
      trackList: [
        { id:genId(), name:'Drums',  type:'drum', instrument:null,   color:'#c4a882', muted:false,solo:false,armed:false,volume:0.8,pan:0,reverb:0,delay:0,eq:{low:0,mid:0,high:0} },
        { id:genId(), name:'Bass',   type:'midi', instrument:'bass', color:'#6ba3c4', muted:false,solo:false,armed:false,volume:0.8,pan:0,reverb:0,delay:0,eq:{low:0,mid:0,high:0} },
        { id:genId(), name:'Chords', type:'midi', instrument:'pad',  color:'#9b82c4', muted:false,solo:false,armed:false,volume:0.75,pan:0,reverb:0,delay:0,eq:{low:0,mid:0,high:0} },
      ],
    },
  };

  const preset = presets[type] || presets.beat;
  const session = generateSession(preset);
  return { bpm: session.bpm, key: session.key, scale: session.scale, tracks: session.tracks };
}
