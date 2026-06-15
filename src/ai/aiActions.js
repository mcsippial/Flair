import { applyTrackFx } from '../engine/audioEngine';
import { exportSessionMidi } from '../engine/exportMidi';

function genId() {
  return Math.random().toString(36).substr(2, 9);
}

export function parseAndDispatch(aiResponse, dispatch, session = null) {
  const { actions = [] } = aiResponse;

  actions.forEach(action => {
    try {
      switch (action.type) {

        // ── Track creation ────────────────────────────────────────────────────
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
              volume: action.volume ?? 0.8,
              pan: action.pan ?? 0,
              reverb: action.reverb ?? 0,
              delay: action.delay ?? 0,
              eq: action.eq || { low: 0, mid: 0, high: 0 },
              comp: action.comp || { enabled: false, threshold: -24, ratio: 4 },
              clips: (action.clips || []).map(c => ({
                id: genId(), name: c.name || 'Clip',
                start: c.start || 0, length: c.length || 4,
                notes: c.notes || [], type: 'midi',
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
              volume: action.volume ?? 0.8,
              pan: action.pan ?? 0,
              reverb: action.reverb ?? 0,
              delay: action.delay ?? 0,
              eq: action.eq || { low: 0, mid: 0, high: 0 },
              comp: action.comp || { enabled: false, threshold: -24, ratio: 4 },
              clips: (action.clips || []).map(c => ({
                id: genId(), name: c.name || 'Drum Pattern',
                start: c.start || 0, length: c.length || 4,
                notes: c.notes || [],
                pattern: c.pattern || Array(16).fill(false),
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
          dispatch({ type: 'ARM_TRACK', trackId });
          break;
        }

        // ── Clip operations ───────────────────────────────────────────────────
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
              pattern: action.pattern || undefined,
              type: action.clipType || 'midi',
            }
          });
          break;

        case 'UPDATE_CLIP':
          dispatch({ type: 'UPDATE_CLIP', trackId: action.trackId, clipId: action.clipId, changes: action.changes || {} });
          break;

        case 'UPDATE_DRUM_PATTERN':
          dispatch({ type: 'UPDATE_DRUM_PATTERN', trackId: action.trackId, clipId: action.clipId, pattern: action.pattern });
          break;

        case 'LOOP_CLIP':
          // Extend a MIDI/drum clip to loop-repeat to a new length
          dispatch({ type: 'UPDATE_CLIP', trackId: action.trackId, clipId: action.clipId,
            changes: { length: action.length, loopLength: action.loopLength || action.originalLength } });
          break;

        case 'REMOVE_CLIP':
          dispatch({ type: 'REMOVE_CLIP', trackId: action.trackId, clipId: action.clipId });
          break;

        case 'REMOVE_TRACK':
          dispatch({ type: 'REMOVE_TRACK', trackId: action.trackId });
          break;

        // ── Session settings ──────────────────────────────────────────────────
        case 'UPDATE_BPM':
          dispatch({ type: 'UPDATE_BPM', bpm: action.bpm });
          break;

        case 'UPDATE_KEY':
          dispatch({ type: 'UPDATE_KEY', key: action.key, scale: action.scale });
          break;

        case 'UNDO':
          dispatch({ type: 'UNDO' });
          break;

        case 'REDO':
          dispatch({ type: 'REDO' });
          break;

        // ── Track mixing ──────────────────────────────────────────────────────
        case 'MUTE_TRACK':
          dispatch({ type: 'MUTE_TRACK', trackId: action.trackId });
          break;

        case 'SOLO_TRACK':
          dispatch({ type: 'SOLO_TRACK', trackId: action.trackId });
          break;

        case 'SET_TRACK_VOLUME':
          dispatch({ type: 'SET_TRACK_VOLUME', trackId: action.trackId, volume: action.volume });
          break;

        case 'SET_TRACK_PAN': {
          dispatch({ type: 'UPDATE_TRACK', trackId: action.trackId, changes: { pan: action.pan } });
          applyTrackFx(action.trackId, { pan: action.pan });
          break;
        }

        case 'SET_TRACK_EQ': {
          const eq = action.eq || {};
          dispatch({ type: 'UPDATE_TRACK', trackId: action.trackId, changes: { eq } });
          applyTrackFx(action.trackId, { eq });
          break;
        }

        case 'SET_TRACK_REVERB': {
          dispatch({ type: 'UPDATE_TRACK', trackId: action.trackId, changes: { reverb: action.reverb } });
          applyTrackFx(action.trackId, { reverb: action.reverb });
          break;
        }

        case 'SET_TRACK_DELAY': {
          dispatch({ type: 'UPDATE_TRACK', trackId: action.trackId, changes: { delay: action.delay } });
          applyTrackFx(action.trackId, { delay: action.delay });
          break;
        }

        case 'SET_TRACK_COMPRESSOR': {
          const comp = { enabled: action.enabled ?? true, threshold: action.threshold ?? -24, ratio: action.ratio ?? 4 };
          dispatch({ type: 'UPDATE_TRACK', trackId: action.trackId, changes: { comp } });
          applyTrackFx(action.trackId, { comp });
          break;
        }

        // ── UI / Navigation ───────────────────────────────────────────────────
        case 'ARM_TRACK':
          dispatch({ type: 'ARM_TRACK', trackId: action.trackId });
          break;

        case 'SELECT_TRACK':
          dispatch({ type: 'SELECT_TRACK', trackId: action.trackId });
          break;

        case 'OPEN_PIANO_ROLL': {
          dispatch({ type: 'SELECT_TRACK', trackId: action.trackId });
          const clipId = action.clipId || (session?.tracks.find(t => t.id === action.trackId)?.clips[0]?.id);
          if (clipId) dispatch({ type: 'SELECT_CLIP', clipId });
          dispatch({ type: 'SET_OPEN_PANEL', panel: 'pianoroll' });
          break;
        }

        case 'OPEN_DRUM_SEQUENCER': {
          dispatch({ type: 'SELECT_TRACK', trackId: action.trackId });
          const drumClipId = action.clipId || (session?.tracks.find(t => t.id === action.trackId)?.clips[0]?.id);
          if (drumClipId) dispatch({ type: 'SELECT_CLIP', clipId: drumClipId });
          dispatch({ type: 'SET_OPEN_PANEL', panel: 'drumsequencer' });
          break;
        }

        case 'OPEN_MIXER':
          dispatch({ type: 'SET_OPEN_PANEL', panel: 'mixer' });
          break;

        // ── Export ────────────────────────────────────────────────────────────
        case 'EXPORT_MIDI':
          if (session) exportSessionMidi(session);
          break;

        // ── AI suggestions ────────────────────────────────────────────────────
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

        default:
          console.warn('Unknown AI action type:', action.type);
      }
    } catch (err) {
      console.error('Failed to dispatch AI action:', action, err);
    }
  });
}
