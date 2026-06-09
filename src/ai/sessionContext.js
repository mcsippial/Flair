export function buildSessionContext(session) {
  return {
    bpm: session.bpm,
    key: `${session.key} ${session.scale}`,
    isPlaying: session.isPlaying,
    selectedTrackId: session.selectedTrackId,
    tracks: session.tracks.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      instrument: t.instrument,
      muted: t.muted,
      solo: t.solo,
      volume: t.volume,
      clips: t.clips.map(c => ({
        id: c.id,
        name: c.name,
        start: c.start,
        length: c.length,
        noteCount: c.notes?.length || 0,
        notes: c.notes?.slice(0, 32) || [],
      })),
    })),
  };
}
