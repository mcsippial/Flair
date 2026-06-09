import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from './claudeClient';
import { generateSession } from '../music/generator';

function genId() { return Math.random().toString(36).substr(2, 9); }

// Claude's only job here is musical DECISIONS — not individual notes.
// The JS generator converts those decisions into actual note data.
const PARAM_SYSTEM = `You are a music director. Given a style or brief, output the musical parameters for a 16-bar composition as JSON.

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

CHORD TYPES (use these exact strings):
  maj, min, maj7, min7, dom7, dim, aug, sus2, sus4, maj9, min9, 6, min6

KEY RULES:
- Write a real 8-chord progression across bars 0–14 (one chord per 2 bars)
- Section B (bars 8–14) should use a different harmonic direction than Section A (bars 0–6)
  — e.g. section A: i–VI–VII–III, section B: iv–V–i–V
- For jazz: use min7/maj7/dom7/min9, and include a ii–V–I somewhere
- For minor: start and end on the tonic minor, go to relative major mid-way
- For pop/lofi: use I–V–vi–IV or I–IV–vi–V type progressions
- For dorian/mixolydian: exploit the modal character (flat VII for mixolydian, natural 6 for dorian)

TRACK RULES:
- Choose tracks appropriate for the style (drums, bass, chords, melody — not all required)
- Jazz: drums + walking bass + piano (keys) + lead sax/trumpet (lead) = 4 tracks
- Trap: drums + bass + pad = 3 tracks (no melody unless requested)
- Lo-fi: drums + bass + keys = 3 tracks
- Ambient: pad only, or pad + sparse lead = 1–2 tracks
- Full arrangement: up to 5 tracks max

Generate a specific hex color per track (something fitting the vibe — dark purple for trap, warm amber for jazz, etc.)`;

export async function composeStarterSession(intent) {
  const apiKey = getApiKey();
  if (!apiKey) return buildFallback(intent);

  const prompt = `${intent.description
    ? `User request: "${intent.description}"\n\n`
    : ''}Compose a 16-bar ${intent.type || 'track'}${intent.bpm ? ` at ${intent.bpm} BPM` : ''}. Interpret the request literally — if they say "dark trap", use a dark minor key and trap style; if they say "smooth jazz", use jazz chords and a relaxed tempo; if they say "energetic house", use a fast BPM and house style. Choose every parameter to serve the vibe. Make section B harmonically distinct from section A.`;

  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: PARAM_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
    const params = JSON.parse(text);

    // Assign real IDs and defaults to the track list
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

    // JS generates all note data from Claude's musical parameters
    // Pass description so styleFamily() can match more specific terms
    const session = generateSession({ ...params, description: intent.description || '' });

    return {
      bpm: session.bpm,
      key: session.key,
      scale: session.scale,
      tracks: session.tracks,
    };

  } catch (err) {
    console.error('Composition API error:', err);
    return buildFallback(intent);
  }
}

// ─── Fallback (no API key or API error) ──────────────────────────────────────
// Uses the JS generator with pre-baked parameters so the app always sounds decent.
function buildFallback(intent) {
  const type = (intent?.type || 'pop').toLowerCase();

  const presets = {
    beat: {
      bpm: 90, key: 'A', scale: 'minor', style: 'trap',
      chords: [
        { bar:0,  root:'A', type:'min7' }, { bar:2,  root:'F', type:'maj7' },
        { bar:4,  root:'G', type:'dom7' }, { bar:6,  root:'A', type:'min7' },
        { bar:8,  root:'D', type:'min7' }, { bar:10, root:'G', type:'dom7' },
        { bar:12, root:'C', type:'maj7' }, { bar:14, root:'A', type:'min7' },
      ],
      trackList: [
        { id: genId(), name:'Drums', type:'drum', instrument:null, color:'#c4a882', muted:false,solo:false,armed:false,volume:0.8,pan:0,reverb:0,delay:0,eq:{low:0,mid:0,high:0} },
        { id: genId(), name:'Bass',  type:'midi', instrument:'bass', color:'#6ba3c4', muted:false,solo:false,armed:false,volume:0.8,pan:0,reverb:0,delay:0,eq:{low:0,mid:0,high:0} },
        { id: genId(), name:'Chords',type:'midi', instrument:'pad',  color:'#9b82c4', muted:false,solo:false,armed:false,volume:0.75,pan:0,reverb:0,delay:0,eq:{low:0,mid:0,high:0} },
      ],
    },
    jazz: {
      bpm: 130, key: 'D', scale: 'minor', style: 'jazz',
      chords: [
        { bar:0,  root:'D', type:'min7' }, { bar:2,  root:'G', type:'dom7' },
        { bar:4,  root:'C', type:'maj7' }, { bar:6,  root:'A', type:'dom7' },
        { bar:8,  root:'D', type:'min7' }, { bar:10, root:'E', type:'dom7' },
        { bar:12, root:'A', type:'min7' }, { bar:14, root:'D', type:'min7' },
      ],
      trackList: [
        { id: genId(), name:'Drums', type:'drum', instrument:null, color:'#c4a882', muted:false,solo:false,armed:false,volume:0.75,pan:0,reverb:0,delay:0,eq:{low:0,mid:0,high:0} },
        { id: genId(), name:'Bass',  type:'midi', instrument:'bass', color:'#6bc49b', muted:false,solo:false,armed:false,volume:0.8,pan:0,reverb:0,delay:0,eq:{low:0,mid:0,high:0} },
        { id: genId(), name:'Piano', type:'midi', instrument:'keys', color:'#c4b86b', muted:false,solo:false,armed:false,volume:0.75,pan:0,reverb:0,delay:0,eq:{low:0,mid:0,high:0} },
        { id: genId(), name:'Lead',  type:'midi', instrument:'lead', color:'#c46b6b', muted:false,solo:false,armed:false,volume:0.7,pan:0,reverb:0,delay:0,eq:{low:0,mid:0,high:0} },
      ],
    },
  };

  const preset = presets[type] || presets.beat;
  const session = generateSession(preset);
  return { bpm: session.bpm, key: session.key, scale: session.scale, tracks: session.tracks };
}
