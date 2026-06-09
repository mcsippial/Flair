import {
  chordNotes, scaleNotes, approachBelow, offsetNote,
  activeChord, nextChord, normalizeNote,
} from './theory.js';

function genId() { return Math.random().toString(36).substr(2, 9); }
function note(time, drum, velocity) { return { id: genId(), time, drum, velocity }; }
function midi(time, n, duration, velocity) { return { id: genId(), time, note: n, duration, velocity }; }

// Humanize velocity by ±amount (small random deviation for organic feel)
function humanize(vel, amount = 0.07) {
  return Math.max(0.04, Math.min(1.0, vel + (Math.random() - 0.5) * 2 * amount));
}

// ─── Style classifier ─────────────────────────────────────────────────────────
function styleFamily(style = '') {
  const s = style.toLowerCase();
  if (/jazz|swing|bossa|bebop/.test(s)) return 'jazz';
  if (/trap|drill|hiphop|hip.hop|rap/.test(s)) return 'trap';
  if (/lofi|lo.fi|chill|study/.test(s)) return 'lofi';
  if (/house|techno|edm|electronic|dance/.test(s)) return 'house';
  if (/ambient|drone|pad|space/.test(s)) return 'ambient';
  return 'pop';
}

// ─── DRUMS ────────────────────────────────────────────────────────────────────
function drumBar(bar, style) {
  const sectionB = bar >= 8;
  const isFill   = bar === 4 || bar === 12 || bar === 15;
  const isBreak  = bar === 8;
  // h: note helper that applies humanize to all velocities
  const h = (beat, s, drum, vel) => note(`${bar}:${beat}:${s}`, drum, humanize(vel));
  const hits = [];

  if (style === 'jazz') {
    // Ride pattern (hihat as ride): ding ding-a ding ding-a
    // Swing: the "a" beat (sixteenth 2) is pushed to 2.55 for a laid-back feel
    if (!isBreak) {
      for (let b = 0; b < 4; b++) {
        hits.push(h(b, 0, 'hihat', b % 2 === 0 ? 0.52 : 0.44));
        hits.push(h(b, '2.55', 'hihat', 0.22)); // swung "a"
      }
    }
    // Kick
    hits.push(h(0, 0, 'kick', 0.84));
    if (!isBreak) {
      hits.push(h(2, 0, 'kick', sectionB ? 0.68 : 0.62));
      if (sectionB) hits.push(h(3, '2.55', 'kick', 0.52));
    }
    // Snare + ghosts
    if (!isBreak) {
      hits.push(h(1, 0, 'snare', 0.76));
      hits.push(h(3, 0, 'snare', 0.82));
      hits.push(h(0, '2.55', 'snare', 0.14)); // ghost (swung)
      hits.push(h(2, '2.55', 'snare', 0.16)); // ghost (swung)
      if (sectionB) {
        hits.push(h(1, '2.55', 'snare', 0.12));
        hits.push(h(3, '2.55', 'snare', 0.13));
      }
    } else {
      hits.push(h(2, 0, 'snare', 0.65));
    }

  } else if (style === 'trap') {
    // 16th hihats, alternating velocity
    if (!isBreak) {
      for (let b = 0; b < 4; b++) {
        hits.push(h(b, 0, 'hihat', sectionB ? 0.44 : 0.38));
        hits.push(h(b, 1, 'hihat', 0.12));
        hits.push(h(b, 2, 'hihat', sectionB ? 0.34 : 0.28));
        hits.push(h(b, 3, 'hihat', 0.1));
      }
    }
    // Syncopated kick
    hits.push(h(0, 0, 'kick', 0.92));
    if (!isBreak) {
      hits.push(h(0, 2, 'kick', 0.52));
      hits.push(h(2, 2, 'kick', 0.76));
      if (sectionB) { hits.push(h(1, 2, 'kick', 0.6)); hits.push(h(3, 0, 'kick', 0.58)); }
    }
    hits.push(h(1, 0, 'snare', 0.88));
    if (!isBreak) hits.push(h(3, 0, 'snare', 0.82));

  } else if (style === 'lofi') {
    // Simple, slightly loose feel with light swing (2.33)
    if (!isBreak) {
      for (let b = 0; b < 4; b++) hits.push(h(b, 0, 'hihat', 0.32));
      // Lofi swing: light push on the offbeat hihat
      if (sectionB) for (let b = 0; b < 4; b++) hits.push(h(b, '2.33', 'hihat', 0.14));
      else          for (let b = 0; b < 4; b++) hits.push(h(b, 2,      'hihat', 0.14));
    }
    hits.push(h(0, 0, 'kick', 0.76));
    if (!isBreak) { hits.push(h(2, 0, 'kick', 0.62)); hits.push(h(2, 2, 'kick', 0.42)); }
    if (!isBreak) {
      hits.push(h(1, 0, 'snare', 0.68));
      hits.push(h(3, 0, 'snare', 0.65));
      hits.push(h(0, 2, 'snare', 0.12)); // vinyl ghost
      if (sectionB) hits.push(h(2, 2, 'snare', 0.11));
    } else {
      hits.push(h(2, 0, 'snare', 0.6));
    }

  } else if (style === 'house') {
    // Four-on-floor
    for (let b = 0; b < 4; b++) {
      hits.push(h(b, 0, 'kick', 0.88));
      hits.push(h(b, 2, 'hihat', b % 2 === 1 ? 0.55 : 0.4)); // offbeat hihat
    }
    if (!isBreak) {
      hits.push(h(1, 0, 'snare', 0.82));
      hits.push(h(3, 0, 'snare', 0.8));
      if (sectionB) for (let b = 0; b < 4; b++) hits.push(h(b, 1, 'hihat', 0.18));
    }

  } else {
    // Pop / RnB
    if (!isBreak) {
      for (let b = 0; b < 4; b++) {
        hits.push(h(b, 0, 'hihat', b % 2 === 0 ? 0.48 : 0.42));
        hits.push(h(b, 2, 'hihat', sectionB ? 0.28 : 0.2));
      }
      if (sectionB) for (let b = 0; b < 4; b++) { hits.push(h(b, 1, 'hihat', 0.12)); hits.push(h(b, 3, 'hihat', 0.1)); }
    }
    hits.push(h(0, 0, 'kick', 0.88));
    if (!isBreak) {
      hits.push(h(2, 0, 'kick', 0.78));
      hits.push(h(2, 2, 'kick', 0.55));
      if (sectionB) hits.push(h(1, 2, 'kick', 0.48));
    }
    if (!isBreak) {
      hits.push(h(1, 0, 'snare', 0.82));
      hits.push(h(3, 0, 'snare', 0.8));
      hits.push(h(1, 2, 'snare', 0.18)); // ghost
      if (sectionB) hits.push(h(3, 2, 'snare', 0.15));
    } else {
      hits.push(h(2, 0, 'snare', 0.72));
    }
  }

  // Fills (all styles)
  if (isFill && bar !== 8) {
    [0, 1, 2, 3].forEach((s, i) => hits.push(h(3, s, 'snare', humanize(0.55 + i * 0.13))));
    if (bar === 15) { // ending fill: kick every beat
      for (let b = 0; b < 4; b++) hits.push(h(b, 0, 'kick', 0.72 + b * 0.06));
    }
  }

  return hits;
}

export function generateDrums(chords, style, bars = 16) {
  const sf = styleFamily(style);
  const out = [];
  for (let bar = 0; bar < bars; bar++) out.push(...drumBar(bar, sf));
  return out;
}

// ─── BASS ─────────────────────────────────────────────────────────────────────
export function generateBass(chords, style, key, scale, bars = 16) {
  const sf = styleFamily(style);
  const out = [];

  for (let bar = 0; bar < bars; bar++) {
    const chord  = activeChord(chords, bar);
    const next   = nextChord(chords, bar);
    const root   = normalizeNote(chord.root);
    const type   = chord.type;
    const isBreak = bar === 8;
    const sectionB = bar >= 8;

    const R2  = offsetNote(root, 0, 2);  // root, octave 2
    const R3  = offsetNote(root, 0, 3);  // root, octave 3
    const P5  = offsetNote(root, 7, 2);  // perfect fifth
    const M3  = offsetNote(root, type.includes('min') ? 3 : 4, 2); // third
    const app = next ? approachBelow(normalizeNote(next.root), 2) : P5; // approach to next

    if (isBreak) {
      out.push(midi(`${bar}:0:0`, R2, '1n', 0.7));
      continue;
    }

    if (sf === 'jazz') {
      // Walking bass: root → third → fifth → approach
      out.push(midi(`${bar}:0:0`, R2, '4n', humanize(sectionB ? 0.82 : 0.78)));
      out.push(midi(`${bar}:1:0`, M3, '4n', humanize(sectionB ? 0.65 : 0.62)));
      out.push(midi(`${bar}:2:0`, P5, '4n', humanize(sectionB ? 0.7  : 0.66)));
      out.push(midi(`${bar}:3:0`, app, '4n', humanize(0.56)));

    } else if (sf === 'trap') {
      out.push(midi(`${bar}:0:0`, R2, '4n', humanize(0.88)));
      out.push(midi(`${bar}:0:2`, R2, '8n', humanize(0.42)));
      out.push(midi(`${bar}:2:0`, P5, '4n', humanize(0.72)));
      if (sectionB) out.push(midi(`${bar}:1:2`, M3, '8n', humanize(0.5)));
      if (next && bar % 2 === 1) out.push(midi(`${bar}:3:2`, app, '8n', humanize(0.4)));

    } else if (sf === 'lofi') {
      out.push(midi(`${bar}:0:0`, R2, '4n', humanize(0.75)));
      out.push(midi(`${bar}:2:0`, P5, '4n', humanize(0.62)));
      if (sectionB) {
        out.push(midi(`${bar}:1:0`, M3, '8n', humanize(0.44)));
        out.push(midi(`${bar}:3:2`, app, '8n', humanize(0.38)));
      }

    } else {
      // Pop / RnB
      out.push(midi(`${bar}:0:0`, R2, '4n', humanize(0.82)));
      out.push(midi(`${bar}:2:0`, P5, '4n', humanize(0.68)));
      out.push(midi(`${bar}:1:2`, R2, '8n', humanize(0.38))); // ghost
      if (sectionB) {
        out.push(midi(`${bar}:3:0`, R3, '8n', humanize(0.58))); // octave jump
        if (next && bar % 2 === 1) out.push(midi(`${bar}:3:2`, app, '8n', humanize(0.45)));
      }
    }
  }

  return out;
}

// ─── CHORDS ───────────────────────────────────────────────────────────────────
export function generateChords(chords, style, bars = 16) {
  const sf = styleFamily(style);
  const out = [];

  chords.forEach((chord, i) => {
    const nextC  = chords[i + 1];
    const endBar = nextC ? nextC.bar : bars;
    const dur    = endBar - chord.bar; // bars this chord lasts
    const root   = normalizeNote(chord.root);
    const type   = chord.type;
    const sectionB = chord.bar >= 8;

    // Spread voicing: root in octave 2, upper voices in octave 3
    const rootNote   = chordNotes(root, type, 2)[0];
    const upperNotes = chordNotes(root, type, 3).slice(1, type.includes('7') || type.includes('9') ? 4 : 3);
    const voicing    = [rootNote, ...upperNotes];
    const velocity   = sectionB ? 0.58 : 0.52;

    if (sectionB && sf !== 'ambient') {
      // Section B: quarter-note stabs on beats 1 and 3 for energy
      voicing.forEach(n => out.push(midi(`${chord.bar}:0:0`, n, '2n', humanize(velocity))));
      if (dur >= 2) {
        voicing.forEach(n => out.push(midi(`${chord.bar}:2:0`, n, '4n', humanize(velocity + 0.08))));
        voicing.forEach(n => out.push(midi(`${chord.bar + 1}:0:0`, n, '2n', humanize(velocity - 0.04))));
        voicing.forEach(n => out.push(midi(`${chord.bar + 1}:2:0`, n, '4n', humanize(velocity + 0.06))));
      }
    } else {
      // Section A: half note, retrigger on beat 3
      voicing.forEach(n => out.push(midi(`${chord.bar}:0:0`, n, '2n', humanize(velocity))));
      voicing.forEach(n => out.push(midi(`${chord.bar}:2:0`, n, '2n', humanize(velocity - 0.04))));
      if (dur >= 2) {
        voicing.forEach(n => out.push(midi(`${chord.bar + 1}:0:0`, n, '2n', humanize(velocity - 0.06))));
        voicing.forEach(n => out.push(midi(`${chord.bar + 1}:2:0`, n, '2n', humanize(velocity - 0.08))));
      }
    }
  });

  return out;
}

// ─── MELODY ───────────────────────────────────────────────────────────────────
export function generateMelody(chords, key, scale, style, bars = 16) {
  const sf = styleFamily(style);
  const sNotes = scaleNotes(normalizeNote(key), scale, 4, 2);
  const out = [];

  // Build a 2-bar melodic motif that resolves to chord tone
  function phrase(startBar, scaleOffset, rhythmVariant) {
    const chord = activeChord(chords, startBar);
    const root  = normalizeNote(chord.root);
    const tones = chordNotes(root, chord.type, 4);

    // Pick scale notes near chord tones
    const strong = sNotes.filter(n => tones.includes(n));
    const passing = sNotes.filter(n => !tones.includes(n));

    const s0 = strong[scaleOffset % strong.length] || sNotes[0];
    const s1 = strong[(scaleOffset + 1) % strong.length] || sNotes[2];
    const p0 = passing[scaleOffset % passing.length] || sNotes[1];
    const p1 = passing[(scaleOffset + 1) % passing.length] || sNotes[3];

    // Varied rhythmic patterns
    const patterns = [
      // Pattern 0: flowing 8ths with rest
      () => {
        out.push(midi(`${startBar}:0:0`, s0, '4n', 0.78));
        out.push(midi(`${startBar}:1:0`, p0, '8n', 0.62));
        out.push(midi(`${startBar}:1:2`, p1, '8n', 0.55));
        out.push(midi(`${startBar}:2:0`, s1, '4n', 0.72));
        // rest on beat 3
        out.push(midi(`${startBar + 1}:0:0`, s0, '2n', 0.7));
        out.push(midi(`${startBar + 1}:2:0`, p0, '8n', 0.52));
        out.push(midi(`${startBar + 1}:3:0`, s1, '4n', 0.58));
      },
      // Pattern 1: syncopated
      () => {
        out.push(midi(`${startBar}:0:0`, s1, '8n', 0.82));
        // rest beat 0+
        out.push(midi(`${startBar}:1:0`, p0, '8n', 0.62));
        out.push(midi(`${startBar}:1:2`, s0, '4n', 0.75));
        out.push(midi(`${startBar}:3:0`, p1, '8n', 0.55));
        out.push(midi(`${startBar}:3:2`, s0, '8n', 0.5));
        out.push(midi(`${startBar + 1}:0:0`, s1, '4n', 0.78));
        out.push(midi(`${startBar + 1}:2:0`, p0, '8n', 0.52));
        out.push(midi(`${startBar + 1}:3:0`, s0, '4n', 0.62));
      },
      // Pattern 2: high-register, more active (section B feel)
      () => {
        const s2 = strong[(scaleOffset + 2) % strong.length] || sNotes[4];
        out.push(midi(`${startBar}:0:0`, s2, '8n', 0.85));
        out.push(midi(`${startBar}:0:2`, p1, '16n', 0.55));
        out.push(midi(`${startBar}:1:0`, s1, '8n', 0.72));
        out.push(midi(`${startBar}:2:0`, p0, '8n', 0.62));
        out.push(midi(`${startBar}:2:2`, s0, '8n', 0.58));
        out.push(midi(`${startBar}:3:0`, p1, '8n', 0.52));
        out.push(midi(`${startBar + 1}:0:0`, s2, '4n', 0.82));
        out.push(midi(`${startBar + 1}:2:0`, s1, '4n', 0.65));
        out.push(midi(`${startBar + 1}:3:2`, s0, '8n', 0.5));
      },
      // Pattern 3: sparse, space-heavy
      () => {
        out.push(midi(`${startBar}:0:0`, s0, '2n', 0.75));
        out.push(midi(`${startBar}:2:2`, p0, '8n', 0.52));
        out.push(midi(`${startBar}:3:0`, s1, '4n', 0.68));
        out.push(midi(`${startBar + 1}:0:0`, s0, '1n', 0.72));
      },
    ];

    patterns[rhythmVariant % patterns.length]();
  }

  // Section A (bars 0–7): 4 phrases, introduce and vary
  phrase(0, 0, 0); // motif intro
  phrase(2, 0, 1); // syncopated variation
  phrase(4, 1, 0); // shifted chord tone
  phrase(6, 1, 1); // syncopated variation on shifted tone

  // Section B (bars 8–15): development
  phrase(8,  2, 2); // high register active
  phrase(10, 3, 2); // higher still
  phrase(12, 2, 3); // space — let it breathe before climax
  phrase(14, 0, 1); // resolve to root motif

  return out;
}

// ─── Main assembler ───────────────────────────────────────────────────────────
export function generateSession(params) {
  const { bpm, key, scale, style, chords, trackList, bars = 16 } = params;

  const tracks = trackList.map(t => {
    let notes = [];

    if (t.type === 'drum') {
      notes = generateDrums(chords, style, bars);
    } else if (t.instrument === 'bass') {
      notes = generateBass(chords, style, key, scale, bars);
    } else if (t.instrument === 'pad') {
      notes = generateChords(chords, style, bars);
    } else if (t.instrument === 'lead' || t.instrument === 'keys') {
      notes = generateMelody(chords, key, scale, style, bars);
    }

    return {
      ...t,
      clips: [{
        id: genId(),
        name: t.name || 'Clip',
        start: 0,
        length: bars,
        type: t.type === 'drum' ? 'drum' : 'midi',
        notes,
      }],
    };
  });

  return { bpm, key, scale, tracks };
}
