// Chromatic scale (sharps only — normalize flats before calling)
export const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export const FLAT_MAP = {
  'Db':'C#','Eb':'D#','Fb':'E','Gb':'F#','Ab':'G#','Bb':'A#','Cb':'B',
};

export function normalizeNote(note) {
  return FLAT_MAP[note] || note;
}

export const CHORD_INTERVALS = {
  maj:   [0,4,7],
  min:   [0,3,7],
  maj7:  [0,4,7,11],
  min7:  [0,3,7,10],
  dom7:  [0,4,7,10],
  dim:   [0,3,6],
  dim7:  [0,3,6,9],
  aug:   [0,4,8],
  sus2:  [0,2,7],
  sus4:  [0,5,7],
  maj9:  [0,4,7,11,14],
  min9:  [0,3,7,10,14],
  '6':   [0,4,7,9],
  'min6':[0,3,7,9],
};

export const SCALE_INTERVALS = {
  major:      [0,2,4,5,7,9,11],
  minor:      [0,2,3,5,7,8,10],
  dorian:     [0,2,3,5,7,9,10],
  mixolydian: [0,2,4,5,7,9,10],
  pentatonic: [0,2,4,7,9],
  blues:      [0,3,5,6,7,10],
};

function rootMidi(root, octave) {
  const idx = CHROMATIC.indexOf(normalizeNote(root));
  return idx + (octave + 1) * 12;
}

function midiToStr(midi) {
  if (midi < 0) midi += 12;
  return CHROMATIC[midi % 12] + (Math.floor(midi / 12) - 1);
}

// Chord tones as note strings
export function chordNotes(root, type, octave = 3) {
  const base = rootMidi(root, octave);
  const intervals = CHORD_INTERVALS[type] || CHORD_INTERVALS.maj;
  return intervals.map(i => midiToStr(base + i));
}

// Scale tones as note strings
export function scaleNotes(root, scale, startOctave = 3, numOctaves = 2) {
  const base = rootMidi(root, startOctave);
  const intervals = SCALE_INTERVALS[scale] || SCALE_INTERVALS.major;
  const out = [];
  for (let o = 0; o < numOctaves; o++)
    intervals.forEach(i => out.push(midiToStr(base + i + o * 12)));
  return out;
}

// Semitone below root (chromatic approach note)
export function approachBelow(root, octave = 2) {
  const idx = CHROMATIC.indexOf(normalizeNote(root));
  return midiToStr(rootMidi(root, octave) - 1);
}

// Interval above root
export function offsetNote(root, semitones, octave = 3) {
  return midiToStr(rootMidi(root, octave) + semitones);
}

// Find the chord active at a given bar
export function activeChord(chords, bar) {
  return [...chords].reverse().find(c => c.bar <= bar) || chords[0];
}

export function nextChord(chords, bar) {
  return chords.find(c => c.bar > bar) || null;
}
