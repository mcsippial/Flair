import { getApiKey } from './claudeClient';

function genId() { return Math.random().toString(36).substr(2, 9); }

const COMPOSE_SYSTEM = `You are a professional session musician and arranger. Your job is to compose a complete 16-bar piece of music as JSON. Every note in every bar must be written out explicitly — do NOT repeat patterns by omission.

OUTPUT: valid JSON only, no markdown, no explanation.

{
  "bpm": <number>,
  "key": <"C"|"C#"|"D"|"Eb"|"E"|"F"|"F#"|"G"|"Ab"|"A"|"Bb"|"B">,
  "scale": <"major"|"minor">,
  "tracks": [ ...as many tracks as the style demands ]
}

═══════════════════════════
TRACKS — match track count to what the style actually needs:
  Minimal/ambient: 1–2 tracks (e.g. pad + sparse lead, or just drums + bass)
  Standard groove: 3–4 tracks (drums, bass, chords, optional lead)
  Full arrangement: 5–8 tracks (add counter-melodies, layers, textures)
  Dense production: 8+ tracks if the genre calls for it

Available types:
  type:"drum"  → percussion
  type:"midi", instrument:"bass"  → bass line
  type:"midi", instrument:"pad"   → chords / atmosphere
  type:"midi", instrument:"keys"  → piano / keyboard
  type:"midi", instrument:"lead"  → solo melody (sax, trumpet, synth, etc.)

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

Step 2 — Write drums for all 16 bars:
  FOUNDATION (bars 0–3):
    Kick: "N:0:0" (vel 0.9), "N:2:0" (vel 0.75)
    Snare: "N:1:0" (vel 0.8), "N:3:0" (vel 0.8)
    Hihat: beats 0,2 (vel 0.5) and off-beats 0:2, 1:2, 2:2, 3:2 (vel 0.25)
  FILL BAR 4: extra snare/kick hits at sixteenths 1,2,3 of beat 3 (vel 0.6–0.9 varying)
  GROOVE bars 5–7: add ghost snares (vel 0.15–0.20) on sixteenth 2 of beats 0 and 2
  BAR 8 BREAKDOWN: kick on beat 0 only, snare on beat 2 only — maximum space
  SECTION B (bars 9–11): 16th hihats every sixteenth (vel 0.15–0.45 alternating), extra kick on beat 1+sixteenth 2
  BUILD (bar 12): 8 snare hits spread across the bar on sixteenths, velocity rising 0.3→0.9
  PUSH (bars 13–14): dense hihat + kick on all 4 beats
  ENDING FILL (bar 15): kick on every beat with snare rolls

Step 3 — Write bass for all 16 bars:
  Use these velocities: downbeat root 0.8, upbeat notes 0.55, ghost/passing notes 0.3
  Section A (bars 0–7): root on beat 0, fifth on beat 2, chromatic approach on beat 3+sixteenth 2
  Section B (bars 8–15): syncopated — root on beat 0, anticipate next chord on beat 3+sixteenth 2 of prior bar, add octave jumps for tension
  When chord changes, bass root changes with it immediately on the downbeat.

Step 4 — Write chords (pad) for all 16 bars:
  2–3 note close voicings. Duration "1n" for whole-bar sustain or "2n" for 2-beat sustain.
  Let chords breathe — silence between voicings is fine. Don't arpeggiate, hold them.
  Velocity 0.5–0.65 (pads are background, not foreground).
  Register 3–4. Jazz: include 7ths and 9ths ("C3","E3","G3","B3" for Cmaj7).

Step 5 — Write lead melody for all 16 bars:
  Velocities: phrase peaks 0.8, regular notes 0.55–0.65, pickup notes 0.4
  Section A (bars 0–3): introduce a memorable 2-bar motif, then a 2-bar response
  Section A (bars 4–7): repeat motif with slight variation (different end note, different rhythm)
  Section B (bars 8–11): develop — raise the register, extend the phrase, add runs
  Section B (bars 12–15): climax and resolution — reach the highest note of the piece, then resolve down to the root
  Use "8n" and "16n". Leave deliberate rests — silence shapes the phrase. Never play on every 16th.

═══════════════════════════
VELOCITY IS EVERYTHING — mechanical music happens when every note has the same velocity.
  Rule: within any pattern, no two consecutive notes should have the same velocity.
  Use the full range: ghost notes 0.1–0.2, supporting notes 0.4–0.6, accents 0.75–0.95.

═══════════════════════════
MINIMUM NOTE COUNTS (per track, when present):
  Drums: 60+ events  |  Bass: 24+ notes  |  Chords: 12+ notes  |  Lead: 20+ notes

═══════════════════════════
STYLE SPECIFICS:
  Jazz: swing feel (push 8th notes to the "and"), chord tones on downbeats, chromatic approach notes (semitone below target), ghost snares, walking bass
  Trap: 16th hihat runs with alternating velocities (0.1, 0.4, 0.1, 0.4…), heavy kick syncopation, 808-style bass slides (two notes overlapping)
  Lo-fi: simple 4-bar loop groove, laid-back bass, sparse lead with lots of space, vinyl-feel ghost snares
  Bossa nova: bass on beats 0+2, cross-stick snare on beat 1+sixteenth 2, guitar-stab chord rhythms
  Ambient: whole-bar pad sustains (1n), extremely sparse lead (one note every 2–4 bars), minimal or no drums

Every bar must be fully written. Do not repeat prior bars by omission — each bar is its own block of JSON.`;

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

Use as many tracks as the style genuinely needs — no more, no less. A minimal ambient piece might need 2; a full band arrangement might need 6 or more.

Requirements:
- 16 bars (bars 0–15), every bar fully notated — no abbreviation
- Section B (bars 8–15) must feel different from Section A (bars 0–7)
- Real chord progression with changes every 2 bars
- If drums are present: fills at bars 4, 8, 12, 15
- If bass is present: follows chord roots with rhythmic variation
- If a melody track is present: real phrases with rests, not scale runs

Write every note explicitly.`;

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
