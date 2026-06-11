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
function styleFamily(style = '', description = '') {
  const s = (style + ' ' + description).toLowerCase();
  if (/jazz|swing|bossa|bebop|blues/.test(s)) return 'jazz';
  if (/trap|drill|hiphop|hip.hop|rap|808/.test(s)) return 'trap';
  if (/lofi|lo.fi|chill|study|bedroom/.test(s)) return 'lofi';
  if (/house|techno|edm|electronic|dance|club/.test(s)) return 'house';
  if (/ambient|drone|pad|space|meditation/.test(s)) return 'ambient';
  return 'pop';
}

// ─── Arrangement builder ──────────────────────────────────────────────────────
// Returns an array of 16 section names, one per bar
// Sections: 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'build' | 'drop' | 'break' | 'outro' | 'peak'
function buildArrangement(style) {
  const sections = new Array(16);

  if (style === 'jazz') {
    // AABA form. A = bars 0-7, B = bars 8-11, A' = bars 12-15
    // Randomize intro length: 2 or 4 bars
    const introLen = Math.random() < 0.5 ? 2 : 4;
    for (let b = 0; b < 16; b++) {
      if (b < introLen)       sections[b] = 'intro';
      else if (b < 8)         sections[b] = 'verse';   // A section
      else if (b < 12)        sections[b] = 'bridge';  // B section
      else                    sections[b] = 'verse';   // A' recap
    }

  } else if (style === 'trap') {
    // Intro → verse → hook (hook is HEAVIER, not sparser)
    // Randomize: hook starts at bar 6 or bar 8
    const hookStart = Math.random() < 0.4 ? 6 : 8;
    for (let b = 0; b < 16; b++) {
      if (b < 2)              sections[b] = 'intro';
      else if (b < hookStart) sections[b] = 'verse';
      else if (b < 14)        sections[b] = 'chorus';  // heavy hook
      else                    sections[b] = 'outro';
    }

  } else if (style === 'house') {
    // Kick-only intro → build → breakdown → big drop
    // Randomize drop start: bar 6 or bar 8
    const dropStart = Math.random() < 0.35 ? 6 : 8;
    const breakStart = dropStart - 2;
    for (let b = 0; b < 16; b++) {
      if (b < 4)               sections[b] = 'intro';   // layering in
      else if (b < breakStart) sections[b] = 'build';
      else if (b < dropStart)  sections[b] = 'break';  // tension / filter sweep
      else                     sections[b] = 'drop';    // full energy
    }

  } else if (style === 'lofi') {
    // Continuous, relaxed. No drops, no drama. Just A and B.
    // Slight variation: B starts at bar 8 or bar 10
    const bStart = Math.random() < 0.4 ? 10 : 8;
    for (let b = 0; b < 16; b++) {
      if (b === 0)            sections[b] = 'intro';
      else if (b < bStart)    sections[b] = 'verse';
      else                    sections[b] = 'chorus';  // subtle B variation
    }

  } else if (style === 'ambient') {
    // Very gradual. Long intro, sustained middle, fade.
    for (let b = 0; b < 16; b++) {
      if (b < 4)              sections[b] = 'intro';
      else if (b < 12)        sections[b] = 'verse';
      else                    sections[b] = 'outro';
    }

  } else {
    // Pop / RnB: intro → verse → pre-chorus → chorus → outro
    // Randomize chorus start: bar 8 or bar 10
    const chorusStart = Math.random() < 0.4 ? 10 : 8;
    const preStart = chorusStart - 2;
    for (let b = 0; b < 16; b++) {
      if (b < 2)                sections[b] = 'intro';
      else if (b < preStart)    sections[b] = 'verse';
      else if (b < chorusStart) sections[b] = 'prechorus';
      else if (b < 14)          sections[b] = 'chorus';
      else                      sections[b] = 'outro';
    }
  }

  return sections;
}

// How dense/energetic each section is (affects note density and velocity scaling)
const SECTION_ENERGY = {
  intro:     { velScale: 0.7,  density: 'sparse' },
  verse:     { velScale: 0.85, density: 'normal' },
  prechorus: { velScale: 0.92, density: 'building' },
  chorus:    { velScale: 1.0,  density: 'full' },
  bridge:    { velScale: 0.88, density: 'normal' },
  build:     { velScale: 0.9,  density: 'building' },
  break:     { velScale: 0.6,  density: 'sparse' },  // tension before drop
  drop:      { velScale: 1.0,  density: 'full' },
  peak:      { velScale: 1.0,  density: 'full' },
  outro:     { velScale: 0.75, density: 'sparse' },
};

// ─── DRUMS ────────────────────────────────────────────────────────────────────
function drumBar(bar, style, arrangement) {
  const section = arrangement[bar];
  const energy  = SECTION_ENERGY[section] || SECTION_ENERGY.verse;
  const v       = energy.velScale;
  const sparse  = energy.density === 'sparse';
  const full    = energy.density === 'full';
  const building = energy.density === 'building';

  const h = (beat, s, drum, vel) => note(`${bar}:${beat}:${s}`, drum, humanize(vel * v));
  const hits = [];

  // Sparse sections: kick only (or kick + minimal hihat for context)
  if (sparse) {
    hits.push(h(0, 0, 'kick', 0.82));
    if (section !== 'break') {
      hits.push(h(2, 0, 'kick', 0.65));
    }
    if (section === 'intro' && style === 'house') {
      // House intro: just kick (four-on-floor from bar 0, that's the house thing)
      for (let b = 1; b < 4; b++) hits.push(note(`${bar}:${b}:0`, 'kick', humanize(0.85 * v)));
    }
    return hits;
  }

  // isFill: fills at chorus/peak/drop sections or last bar
  const isFill = bar === 15 || ((section === 'chorus' || section === 'peak' || section === 'drop') && bar % 4 === 3);
  const sectionB = full || building;

  if (style === 'jazz') {
    // Ride pattern (hihat as ride): ding ding-a ding ding-a
    for (let b = 0; b < 4; b++) {
      hits.push(h(b, 0, 'hihat', b % 2 === 0 ? 0.52 : 0.44));
      hits.push(h(b, '2.55', 'hihat', 0.22)); // swung "a"
    }
    // Extra hihat density for building
    if (building) {
      for (let b = 0; b < 4; b++) hits.push(h(b, 1, 'hihat', 0.15));
    }
    // Kick
    hits.push(h(0, 0, 'kick', 0.84));
    hits.push(h(2, 0, 'kick', sectionB ? 0.68 : 0.62));
    if (full) hits.push(h(3, '2.55', 'kick', 0.52));
    // Snare + ghosts
    hits.push(h(1, 0, 'snare', 0.76));
    hits.push(h(3, 0, 'snare', 0.82));
    hits.push(h(0, '2.55', 'snare', 0.14)); // ghost (swung)
    hits.push(h(2, '2.55', 'snare', 0.16)); // ghost (swung)
    if (sectionB) {
      hits.push(h(1, '2.55', 'snare', 0.12));
      hits.push(h(3, '2.55', 'snare', 0.13));
    }
    if (full) {
      // Extra ghost notes for full energy
      hits.push(h(0, 1, 'snare', 0.10));
      hits.push(h(2, 1, 'snare', 0.11));
    }

  } else if (style === 'trap') {
    // 16th hihats, alternating velocity
    for (let b = 0; b < 4; b++) {
      hits.push(h(b, 0, 'hihat', sectionB ? 0.44 : 0.38));
      hits.push(h(b, 1, 'hihat', 0.12));
      hits.push(h(b, 2, 'hihat', sectionB ? 0.34 : 0.28));
      hits.push(h(b, 3, 'hihat', 0.1));
    }
    // Extra hihats for building sections
    if (building) {
      for (let b = 0; b < 4; b++) hits.push(h(b, '1.5', 'hihat', 0.08));
    }
    // Full sections: open hat accent
    if (full) {
      hits.push(h(2, 0, 'hihat', 0.55)); // open hat on the 3
    }
    // Syncopated kick
    hits.push(h(0, 0, 'kick', 0.92));
    hits.push(h(0, 2, 'kick', 0.52));
    hits.push(h(2, 2, 'kick', 0.76));
    if (sectionB) { hits.push(h(1, 2, 'kick', 0.6)); hits.push(h(3, 0, 'kick', 0.58)); }
    if (full) hits.push(h(3, 2, 'kick', 0.5)); // extra kick for full energy
    hits.push(h(1, 0, 'snare', 0.88));
    hits.push(h(3, 0, 'snare', 0.82));

  } else if (style === 'lofi') {
    // Simple, slightly loose feel with light swing (2.33)
    for (let b = 0; b < 4; b++) hits.push(h(b, 0, 'hihat', 0.32));
    // Lofi swing: light push on the offbeat hihat
    if (sectionB) for (let b = 0; b < 4; b++) hits.push(h(b, '2.33', 'hihat', 0.14));
    else          for (let b = 0; b < 4; b++) hits.push(h(b, 2,      'hihat', 0.14));
    // Extra hihat for building
    if (building) for (let b = 0; b < 4; b++) hits.push(h(b, 1, 'hihat', 0.09));
    hits.push(h(0, 0, 'kick', 0.76));
    hits.push(h(2, 0, 'kick', 0.62));
    hits.push(h(2, 2, 'kick', 0.42));
    if (full) hits.push(h(1, 2, 'kick', 0.38)); // extra ghost kick for full
    hits.push(h(1, 0, 'snare', 0.68));
    hits.push(h(3, 0, 'snare', 0.65));
    hits.push(h(0, 2, 'snare', 0.12)); // vinyl ghost
    if (sectionB) hits.push(h(2, 2, 'snare', 0.11));
    if (full) hits.push(h(3, 2, 'snare', 0.10)); // extra ghost

  } else if (style === 'house') {
    // Four-on-floor
    for (let b = 0; b < 4; b++) {
      hits.push(h(b, 0, 'kick', 0.88));
      hits.push(h(b, 2, 'hihat', b % 2 === 1 ? 0.55 : 0.4)); // offbeat hihat
    }
    hits.push(h(1, 0, 'snare', 0.82));
    hits.push(h(3, 0, 'snare', 0.8));
    if (sectionB) for (let b = 0; b < 4; b++) hits.push(h(b, 1, 'hihat', 0.18));
    // Full sections: extra density
    if (full) {
      for (let b = 0; b < 4; b++) hits.push(h(b, 3, 'hihat', 0.14));
      hits.push(h(0, 2, 'kick', 0.5)); // extra kick hit
    }
    // Building: more hihat density
    if (building) {
      for (let b = 0; b < 4; b++) hits.push(h(b, '1.5', 'hihat', 0.12));
    }

  } else {
    // Pop / RnB
    for (let b = 0; b < 4; b++) {
      hits.push(h(b, 0, 'hihat', b % 2 === 0 ? 0.48 : 0.42));
      hits.push(h(b, 2, 'hihat', sectionB ? 0.28 : 0.2));
    }
    if (sectionB) for (let b = 0; b < 4; b++) { hits.push(h(b, 1, 'hihat', 0.12)); hits.push(h(b, 3, 'hihat', 0.1)); }
    // Building: extra hihat hits
    if (building) for (let b = 0; b < 4; b++) hits.push(h(b, '1.5', 'hihat', 0.09));
    hits.push(h(0, 0, 'kick', 0.88));
    hits.push(h(2, 0, 'kick', 0.78));
    hits.push(h(2, 2, 'kick', 0.55));
    if (sectionB) hits.push(h(1, 2, 'kick', 0.48));
    if (full) hits.push(h(3, 2, 'kick', 0.45)); // extra kick for full energy
    hits.push(h(1, 0, 'snare', 0.82));
    hits.push(h(3, 0, 'snare', 0.8));
    hits.push(h(1, 2, 'snare', 0.18)); // ghost
    if (sectionB) hits.push(h(3, 2, 'snare', 0.15));
    if (full) hits.push(h(0, 2, 'snare', 0.12)); // extra ghost for full
  }

  // Fills at chorus/peak/drop sections or last bar
  if (isFill) {
    [0, 1, 2, 3].forEach((s, i) => hits.push(h(3, s, 'snare', 0.55 + i * 0.13)));
    if (bar === 15) { // ending fill: kick every beat
      for (let b = 0; b < 4; b++) hits.push(h(b, 0, 'kick', 0.72 + b * 0.06));
    }
  }

  return hits;
}

export function generateDrums(chords, style, bars = 16, arrangement) {
  const out = [];
  for (let bar = 0; bar < bars; bar++) out.push(...drumBar(bar, style, arrangement));
  return out;
}

// ─── BASS ─────────────────────────────────────────────────────────────────────
export function generateBass(chords, style, key, scale, bars = 16, arrangement) {
  const out = [];

  for (let bar = 0; bar < bars; bar++) {
    const chord  = activeChord(chords, bar);
    const next   = nextChord(chords, bar);
    const root   = normalizeNote(chord.root);
    const type   = chord.type;
    const section = arrangement[bar];
    const energy  = SECTION_ENERGY[section] || SECTION_ENERGY.verse;
    const full    = energy.density === 'full';
    const building = energy.density === 'building';
    const sparse  = energy.density === 'sparse';

    const R2  = offsetNote(root, 0, 2);  // root, octave 2
    const R3  = offsetNote(root, 0, 3);  // root, octave 3
    const P5  = offsetNote(root, 7, 2);  // perfect fifth
    const M3  = offsetNote(root, type.includes('min') ? 3 : 4, 2); // third
    const app = next ? approachBelow(normalizeNote(next.root), 2) : P5; // approach to next

    // Intro or break: just root whole note, very quiet
    if (section === 'intro' || section === 'break') {
      out.push(midi(`${bar}:0:0`, R2, '1n', 0.5));
      continue;
    }

    // Outro: very quiet sustained root
    if (section === 'outro') {
      out.push(midi(`${bar}:0:0`, R2, '1n', humanize(0.4)));
      continue;
    }

    if (style === 'jazz') {
      // Walking bass: root → third → fifth → approach
      out.push(midi(`${bar}:0:0`, R2, '4n', humanize(full ? 0.85 : 0.78)));
      out.push(midi(`${bar}:1:0`, M3, '4n', humanize(full ? 0.68 : 0.62)));
      out.push(midi(`${bar}:2:0`, P5, '4n', humanize(full ? 0.72 : 0.66)));
      out.push(midi(`${bar}:3:0`, app, '4n', humanize(0.56)));
      // Building: add extra passing note
      if (building) out.push(midi(`${bar}:3:2`, app, '8n', humanize(0.42)));

    } else if (style === 'trap') {
      out.push(midi(`${bar}:0:0`, R2, '4n', humanize(0.88)));
      out.push(midi(`${bar}:0:2`, R2, '8n', humanize(0.42)));
      out.push(midi(`${bar}:2:0`, P5, '4n', humanize(0.72)));
      if (building || full) out.push(midi(`${bar}:1:2`, M3, '8n', humanize(0.5)));
      if (next && bar % 2 === 1) out.push(midi(`${bar}:3:2`, app, '8n', humanize(0.4)));
      // Full sections: octave jump for chorus energy
      if (full) out.push(midi(`${bar}:2:2`, R3, '8n', humanize(0.58)));

    } else if (style === 'lofi') {
      out.push(midi(`${bar}:0:0`, R2, '4n', humanize(0.75)));
      out.push(midi(`${bar}:2:0`, P5, '4n', humanize(0.62)));
      if (building || full) {
        out.push(midi(`${bar}:1:0`, M3, '8n', humanize(0.44)));
        out.push(midi(`${bar}:3:2`, app, '8n', humanize(0.38)));
      }

    } else {
      // Pop / RnB
      out.push(midi(`${bar}:0:0`, R2, '4n', humanize(0.82)));
      out.push(midi(`${bar}:2:0`, P5, '4n', humanize(0.68)));
      out.push(midi(`${bar}:1:2`, R2, '8n', humanize(0.38))); // ghost
      if (building || full) {
        out.push(midi(`${bar}:3:0`, R3, '8n', humanize(0.58))); // octave jump
        if (next && bar % 2 === 1) out.push(midi(`${bar}:3:2`, app, '8n', humanize(0.45)));
      }
      // Full: extra octave hit
      if (full) out.push(midi(`${bar}:1:0`, R3, '8n', humanize(0.42)));
    }
  }

  return out;
}

// ─── CHORDS ───────────────────────────────────────────────────────────────────
export function generateChords(chords, style, bars = 16, arrangement) {
  const out = [];

  chords.forEach((chord, i) => {
    const nextC  = chords[i + 1];
    const endBar = nextC ? nextC.bar : bars;
    const dur    = endBar - chord.bar; // bars this chord lasts
    const root   = normalizeNote(chord.root);
    const type   = chord.type;
    const section = arrangement[chord.bar];
    const energy  = SECTION_ENERGY[section] || SECTION_ENERGY.verse;
    const full    = energy.density === 'full';
    const building = energy.density === 'building';
    const sparse  = energy.density === 'sparse';

    // Intro or break: silence — let drums breathe / tension
    if (section === 'intro' || section === 'break') return;

    // Spread voicing: root in octave 2, upper voices in octave 3
    const rootNote   = chordNotes(root, type, 2)[0];
    const upperNotes = chordNotes(root, type, 3).slice(1, type.includes('7') || type.includes('9') ? 4 : 3);
    const voicing    = [rootNote, ...upperNotes];

    // Outro: very quiet sustained
    if (section === 'outro') {
      voicing.forEach(n => out.push(midi(`${chord.bar}:0:0`, n, '1n', humanize(0.28))));
      return;
    }

    // Verse/bridge: sustained chords (whole/half note)
    if (section === 'verse' || section === 'bridge') {
      const velocity = 0.52;
      voicing.forEach(n => out.push(midi(`${chord.bar}:0:0`, n, '2n', humanize(velocity))));
      voicing.forEach(n => out.push(midi(`${chord.bar}:2:0`, n, '2n', humanize(velocity - 0.04))));
      if (dur >= 2) {
        voicing.forEach(n => out.push(midi(`${chord.bar + 1}:0:0`, n, '2n', humanize(velocity - 0.06))));
        voicing.forEach(n => out.push(midi(`${chord.bar + 1}:2:0`, n, '2n', humanize(velocity - 0.08))));
      }
      return;
    }

    // Prechorus/build: building energy, half-note stabs
    if (building) {
      const velocity = 0.55;
      voicing.forEach(n => out.push(midi(`${chord.bar}:0:0`, n, '2n', humanize(velocity))));
      voicing.forEach(n => out.push(midi(`${chord.bar}:2:0`, n, '4n', humanize(velocity + 0.04))));
      if (dur >= 2) {
        voicing.forEach(n => out.push(midi(`${chord.bar + 1}:0:0`, n, '2n', humanize(velocity + 0.02))));
        voicing.forEach(n => out.push(midi(`${chord.bar + 1}:2:0`, n, '4n', humanize(velocity + 0.06))));
      }
      return;
    }

    // Chorus/drop/peak: rhythmic stabs for full energy
    if (full) {
      const velocity = 0.62;
      voicing.forEach(n => out.push(midi(`${chord.bar}:0:0`, n, '2n', humanize(velocity))));
      if (dur >= 2) {
        voicing.forEach(n => out.push(midi(`${chord.bar}:2:0`, n, '4n', humanize(velocity + 0.08))));
        voicing.forEach(n => out.push(midi(`${chord.bar + 1}:0:0`, n, '2n', humanize(velocity - 0.04))));
        voicing.forEach(n => out.push(midi(`${chord.bar + 1}:2:0`, n, '4n', humanize(velocity + 0.06))));
      }
      return;
    }

    // Fallback: sustained half notes
    const velocity = 0.5;
    voicing.forEach(n => out.push(midi(`${chord.bar}:0:0`, n, '2n', humanize(velocity))));
    voicing.forEach(n => out.push(midi(`${chord.bar}:2:0`, n, '2n', humanize(velocity - 0.04))));
  });

  return out;
}

// ─── MELODY ───────────────────────────────────────────────────────────────────
export function generateMelody(chords, key, scale, style, bars = 16, arrangement) {
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

  // Walk through bars and place melody based on section
  let b = 0;
  while (b < bars) {
    const section = arrangement[b];
    const energy  = SECTION_ENERGY[section] || SECTION_ENERGY.verse;

    if (section === 'intro') {
      // Intro: no melody, skip to first even bar after intro
      b++;
      continue;
    }

    if (section === 'outro' || section === 'break') {
      // Silence in outro and break
      b++;
      continue;
    }

    if (section === 'verse' || section === 'bridge' || section === 'prechorus' || section === 'build') {
      // Start phrase at this bar if even and we have room for 2 bars
      if (b % 2 === 0 && b + 1 < bars) {
        // Check next bar is not a drastically different section (don't cross section boundary awkwardly)
        const nextSection = arrangement[b + 1];
        const nextEnergy  = SECTION_ENERGY[nextSection] || SECTION_ENERGY.verse;
        // Only place phrase if the 2-bar window stays in a similar density
        if (nextSection === section || nextEnergy.density === energy.density) {
          const variant = section === 'bridge' ? 3 : (section === 'prechorus' || section === 'build' ? 1 : 0);
          phrase(b, b / 2, variant);
          b += 2;
          continue;
        }
      }
      b++;
      continue;
    }

    if (section === 'chorus' || section === 'drop' || section === 'peak') {
      if (b % 2 === 0 && b + 1 < bars) {
        const nextSection = arrangement[b + 1];
        const nextEnergy  = SECTION_ENERGY[nextSection] || SECTION_ENERGY.verse;
        if (nextEnergy.density === 'full') {
          phrase(b, b / 2, 2); // active pattern for full energy
          b += 2;
          continue;
        }
      }
      b++;
      continue;
    }

    b++;
  }

  return out;
}

// ─── Main assembler ───────────────────────────────────────────────────────────
export function generateSession(params) {
  const { bpm, key, scale, style, chords, trackList, bars = 16, description = '' } = params;
  const sf = styleFamily(style, description);
  const arrangement = buildArrangement(sf);  // single arrangement for entire session

  const tracks = trackList.map(t => {
    let notes = [];

    if (t.type === 'drum') {
      notes = generateDrums(chords, sf, bars, arrangement);
    } else if (t.instrument === 'bass') {
      notes = generateBass(chords, sf, key, scale, bars, arrangement);
    } else if (t.instrument === 'pad') {
      notes = generateChords(chords, sf, bars, arrangement);
    } else if (t.instrument === 'lead' || t.instrument === 'keys') {
      notes = generateMelody(chords, key, scale, sf, bars, arrangement);
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
