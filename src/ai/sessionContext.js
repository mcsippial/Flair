export function buildSessionContext(session) {
  return {
    bpm: session.bpm,
    key: `${session.key} ${session.scale}`,
    isPlaying: session.isPlaying,
    selectedTrackId: session.selectedTrackId,
    selectedClipId: session.selectedClipId,
    tracks: session.tracks.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      instrument: t.instrument,
      muted: t.muted,
      solo: t.solo,
      volume: t.volume,
      pan: t.pan ?? 0,
      reverb: t.reverb ?? 0,
      delay: t.delay ?? 0,
      eq: t.eq,
      comp: t.comp,
      clips: t.clips.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        start: c.start,
        length: c.length,
        loopLength: c.loopLength,
        noteCount: c.notes?.length || 0,
        notes: c.notes || [],          // send ALL notes so AI can transpose the full clip
        pattern: c.pattern || undefined, // drum step pattern
      })),
    })),
  };
}
