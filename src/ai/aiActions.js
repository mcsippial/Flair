function genId() {
  return Math.random().toString(36).substr(2, 9);
}

export function parseAndDispatch(aiResponse, dispatch) {
  const { actions = [] } = aiResponse;

  actions.forEach(action => {
    try {
      switch (action.type) {
        case 'ADD_MIDI_TRACK':
          dispatch({
            type: 'ADD_TRACK',
            track: {
              id: genId(),
              name: action.trackName || 'MIDI Track',
              type: 'midi',
              instrument: action.instrument || 'keys',
              color: action.color || '#7eb8d4',
              muted: false, solo: false, armed: false,
              volume: 0.8, pan: 0,
              eq: { low: 0, mid: 0, high: 0 },
              clips: (action.clips || []).map(c => ({
                id: genId(),
                name: c.name || 'Clip',
                trackId: null,
                start: c.start || 0,
                length: c.length || 4,
                notes: c.notes || [],
                type: 'midi',
              })),
            }
          });
          break;
        case 'ADD_DRUM_TRACK':
          dispatch({
            type: 'ADD_TRACK',
            track: {
              id: genId(),
              name: action.trackName || 'Drums',
              type: 'drum',
              color: action.color || '#c4a882',
              muted: false, solo: false, armed: false,
              volume: 0.8, pan: 0,
              eq: { low: 0, mid: 0, high: 0 },
              clips: (action.clips || []).map(c => ({
                id: genId(),
                name: c.name || 'Drum Pattern',
                trackId: null,
                start: c.start || 0,
                length: c.length || 4,
                notes: c.notes || [],
                type: 'drum',
              })),
            }
          });
          break;
        case 'CREATE_AUDIO_TRACK': {
          const trackId = genId();
          dispatch({
            type: 'ADD_TRACK',
            track: {
              id: trackId,
              name: action.trackName || 'Audio',
              type: 'audio',
              color: '#c46b6b',
              muted: false, solo: false, armed: false,
              volume: 0.8, pan: 0, reverb: 0, delay: 0,
              eq: { low: 0, mid: 0, high: 0 },
              clips: [],
            }
          });
          // Auto-arm the new track
          dispatch({ type: 'ARM_TRACK', trackId });
          break;
        }
        case 'ADD_CLIP':
          dispatch({
            type: 'ADD_CLIP',
            trackId: action.trackId,
            clip: {
              id: genId(),
              name: action.name || 'Clip',
              start: action.start || 0,
              length: action.length || 16,
              notes: action.notes || [],
              type: action.clipType || 'midi',
            }
          });
          break;
        case 'UPDATE_CLIP':
          dispatch({ type: 'UPDATE_CLIP', trackId: action.trackId, clipId: action.clipId, changes: action.changes || {} });
          break;
        case 'REMOVE_TRACK':
          dispatch({ type: 'REMOVE_TRACK', trackId: action.trackId });
          break;
        case 'UPDATE_BPM':
          dispatch({ type: 'UPDATE_BPM', bpm: action.bpm });
          break;
        case 'UPDATE_KEY':
          dispatch({ type: 'UPDATE_KEY', key: action.key, scale: action.scale });
          break;
        case 'MUTE_TRACK':
          dispatch({ type: 'MUTE_TRACK', trackId: action.trackId });
          break;
        case 'SOLO_TRACK':
          dispatch({ type: 'SOLO_TRACK', trackId: action.trackId });
          break;
        case 'SET_TRACK_VOLUME':
          dispatch({ type: 'SET_TRACK_VOLUME', trackId: action.trackId, volume: action.volume });
          break;
        case 'ADD_AI_SUGGESTION':
          dispatch({
            type: 'ADD_AI_SUGGESTION',
            suggestion: {
              id: genId(),
              message: action.message,
              trackId: action.trackId,
              bar: action.bar || 0,
              actions: action.suggestionActions || [],
            }
          });
          break;
        case 'UNDO':
          dispatch({ type: 'UNDO' });
          break;
        default:
          console.warn('Unknown AI action type:', action.type);
      }
    } catch (err) {
      console.error('Failed to dispatch AI action:', action, err);
    }
  });
}
