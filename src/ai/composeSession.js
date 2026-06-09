import { getApiKey } from './claudeClient';

function genId() { return Math.random().toString(36).substr(2, 9); }

const COMPOSE_SYSTEM = `You are a professional session musician and arranger. Your job is to compose a complete 16-bar piece of music as JSON. Every note in every bar must be written out explicitly — do NOT repeat patterns by omission.

OUTPUT: valid JSON only, no markdown, no explanation.

{
  "bpm": <number>,
  "key": <"C"|"C#"|"D"|"Eb"|"E"|"F"|"F#"|"G"|"Ab"|"A"|"Bb"|"B">,
  "scale": <"major"|"minor">,
  "tracks": [ ...exactly 4 tracks ]
}

═══════════════════════════
REQUIRED TRACKS — you must include all 4:
  1. Drums    (type:"drum")
  2. Bass     (type:"midi", instrument:"bass")
  3. Chords   (type:"midi", instrument:"pad")
  4. Lead     (type:"midi", instrument:"lead" or "keys")

═══════════════════════════
TIME FORMAT
"bar:beat:sixteenth" — bar 0–15, beat 0–3, sixteenth 0–3
  "0:0:0" = bar 0 beat 0
  "0:2:0" = bar 0 beat 2
  "1:0:0" = bar 1 beat 0
  "4:0:0" = bar 4 beat 0

═══════════════════════════
NOTE FORMATS
Drum note:  { "time":"bar:beat:sixteenth", "drum":"kick"|"snare"|"hihat", "velocity":0.0–1.0 }
MIDI note:  { "time":"bar:beat:sixteenth", "note":"C3", "duration":"16n"|"8n"|"4n"|"2n"|"1n", "velocity":0.0–1.0 }

═══════════════════════════
COMPOSITION PROCESS — do this in your head before writing notes:

Step 1 — Choose a chord progression. Example for minor key: Am7–Dm7–G7–Cmaj7.
  Assign one chord per 2-bar block:
    Bars 0–1: chord I
    Bars 2–3: chord IV
    Bars 4–5: chord V
    Bars 6–7: chord I
    Bars 8–9: chord IV  ← Section B begins, change the feel
    Bars 10–11: chord V
    Bars 12–13: chord IV
    Bars 14–15: chord I (cadence home)

Step 2 — Write drums for all 16 bars following these EXACT rules:
  FOUNDATION (bars 0,1,2,3): kick on beats 0+2, snare on beats 1+3, hihat every 8th note (0+2+4+6 sixteenths)
  FILL AT BAR 4: add 4–6 extra kick/snare hits on sixteenths (e.g. "4:3:0","4:3:1","4:3:2","4:3:3")
  GROOVE (bars 5,6,7): same as foundation but add one ghost snare (velocity 0.25) on offbeats
  BIG BREAK (bar 8): drop to just kick on beat 0 and snare on beat 2 — create space
  SECTION B GROOVE (bars 9,10,11): denser — add 16th hihat (every sixteenth), extra kick on beat 2+sixteenth 2
  BUILD FILL (bar 12): roll of 8 snare hits across the bar at sixteenth resolution
  CLIMAX (bars 13,14): keep dense pattern
  ENDING FILL (bar 15): 4-note kick run into downbeat on every beat

Step 3 — Write bass for all 16 bars:
  Section A (bars 0–7): root note on beat 0, fifth on beat 2, approach note on beat 3+sixteenth 2
  Section B (bars 8–15): add syncopation — root on beat 0, ghost on beat 0+sixteenth 2, fifth on beat 1+sixteenth 2, octave jump on beat 3
  Follow chord roots: when chord changes, bass root changes with it.

Step 4 — Write chords (pad) for all 16 bars:
  Play each chord as 2–3 note voicing.
  Duration "2n" (half note) or "1n" (whole note) for pad sustain.
  Change chord at the bar boundary matching your progression.
  Use register 3–4 for piano voicings (e.g. "C3","E3","G3" for C major).

Step 5 — Write lead melody for all 16 bars:
  Section A melody (bars 0–7): one 4-bar phrase, then a response phrase.
  Section B melody (bars 8–15): develop the phrase — invert it, extend it, or modulate.
  Use scale degrees, aim for strong beats on chord tones.
  Use "8n" and "16n" durations. Leave rests (just skip beats — silence is important).
  Avoid playing on every single beat — syncopate.

═══════════════════════════
MINIMUM NOTE COUNTS:
  Drums: 80+ note events across 16 bars
  Bass: 32+ note events
  Chords: 16+ note events (one chord voicing every 2 bars = 8 voicings × 2–3 notes each)
  Lead: 24+ note events

═══════════════════════════
STYLE NOTES:
  Jazz: swing phrasing, chord tones on downbeats, chromatic approach notes, ghost snares on offbeats
  Trap: 808 slides, 16th hihat runs, heavy syncopation, bass on beat 0 + offbeat
  Lo-fi: simple groove, laid-back feel, sparse lead with lots of space
  Bossa nova: bass on 1 and 3, cross-stick snare, guitar-style chord stabs
  Ambient: long pad durations (1n), extremely sparse lead, minimal drums

Every bar must be explicitly notated. Do not assume bars repeat — write each bar fully.`;

export async function composeStarterSession(intent) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const style = intent.type || 'pop';
  const key = intent.key || 'C';
  const scale = intent.scale || 'major';
  const bpm = intent.bpm || 120;
  const mood = intent.mood || '';
  const description = intent.description || '';

  const prompt = `Compose a 16-bar ${style} piece in ${key} ${scale} at ${bpm} BPM.${mood ? ` Mood: ${mood}.` : ''}${description ? ` Reference: ${description}.` : ''}

Requirements:
- Exactly 4 tracks: drums, bass, chords (pad), lead
- 16 bars (bars 0–15), every bar fully written
- Section B (bars 8–15) must feel different from Section A (bars 0–7)
- Real chord progression with changes every 2 bars
- Drum fills at bars 4, 8, 12, 15
- Bass follows chord roots with rhythmic variation
- Lead melody with actual phrases, not scale runs

Write every note explicitly — do not loop or abbreviate.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: COMPOSE_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const data = await response.json();
  const text = data.content[0].text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
  const composed = JSON.parse(text);

  return {
    bpm: composed.bpm,
    key: composed.key,
    scale: composed.scale,
    tracks: composed.tracks.map(t => ({
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
