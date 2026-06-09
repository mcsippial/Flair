import { getApiKey } from './claudeClient';

function genId() { return Math.random().toString(36).substr(2, 9); }

const COMPOSE_SYSTEM = `You are a professional music producer AI. Compose a complete, musically rich 16-bar session.

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

Time format — "bar:beat:sixteenth": bar=0-15, beat=0-3, sixteenth=0-3
  Examples: "0:0:0"=bar0 beat0, "0:2:0"=bar0 beat2, "1:0:0"=bar1 beat0, "4:0:0"=bar4 beat0

COMPOSITION RULES — follow these strictly:

1. CHORD PROGRESSION: Choose a real 4-chord progression for the key/scale.
   Write out which chord plays at each 2-bar block (bars 0-1, 2-3, 4-5, etc).
   The progression repeats twice: bars 0-7 (section A) and bars 8-15 (section B).

2. PAD/CHORDS track: Play the chord tones as a pad. Chord changes happen every 2 bars.
   Include 2-3 notes per chord voicing. Duration "2n" or "1n".

3. BASS track: Follow chord roots. Use rhythmic variation — syncopation, ghost notes.
   Bar 0-7: simpler pattern. Bar 8-15: busier, more movement.

4. DRUMS:
   - Bars 0-3: foundation pattern (kick on 0+2, snare on 1+3, hihat every 8th)
   - Bar 4: add a fill (extra kicks/snares on sixteenths)
   - Bars 4-7: slight variation (open hihat on beat 3)
   - Bar 8: big fill or drop (sparse)
   - Bars 8-11: section B pattern (denser hihat, extra kick)
   - Bar 12: fill
   - Bars 12-15: push toward climax, bar 15 = ending fill

5. MELODY (optional lead track): Write an actual melodic phrase using scale tones.
   Section A melody (bars 0-7): one phrase. Section B (bars 8-15): developed variation.
   Use "8n" and "16n" durations. Rests are fine (just omit notes for those beats).

6. Section B (bars 8-15) MUST differ from Section A (bars 0-7) in at least 2 tracks.

Create 3-4 tracks. Be specific with note choices — no generic placeholder patterns.`;

export async function composeStarterSession(intent) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const prompt = `Compose a 16-bar ${intent.type} in ${intent.key} ${intent.scale} at ${intent.bpm} BPM. Mood: ${intent.mood}. ${intent.description ? `Artist description: "${intent.description}".` : ''} Make section B (bars 8-15) feel noticeably different from section A. Include a real chord progression.`;

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
      max_tokens: 8000,
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
