export function buildSessionContext(session) {
  return {
    session: {
      bpm: session.bpm,
      key: `${session.key} ${session.scale}`,
      isPlaying: session.isPlaying,
      trackCount: session.tracks.length,
      tracks: session.tracks.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        muted: t.muted,
        solo: t.solo,
        clipCount: t.clips.length,
      })),
      selectedTrackId: session.selectedTrackId,
      playheadBars: Math.floor(session.playheadPosition),
    }
  };
}
