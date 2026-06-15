import { initialSession } from './initialSession';

function genId() { return Math.random().toString(36).substr(2, 9); }

const MAX_HISTORY = 50;

function sessionReducerCore(session, action) {
  switch (action.type) {
    case 'ADD_TRACK': {
      const track = { ...action.track };
      track.clips = (track.clips || []).map(c => ({ ...c, trackId: track.id }));
      return { ...session, tracks: [...session.tracks, track] };
    }
    case 'REMOVE_TRACK':
      return { ...session, tracks: session.tracks.filter(t => t.id !== action.trackId) };
    case 'UPDATE_TRACK':
      return { ...session, tracks: session.tracks.map(t => t.id === action.trackId ? { ...t, ...action.changes } : t) };
    case 'SELECT_TRACK':
      return { ...session, selectedTrackId: action.trackId };
    case 'SELECT_CLIP':
      return { ...session, selectedClipId: action.clipId };
    case 'ADD_CLIP': {
      return {
        ...session,
        tracks: session.tracks.map(t => t.id === action.trackId
          ? { ...t, clips: [...t.clips, { ...action.clip, trackId: t.id }] }
          : t)
      };
    }
    case 'UPDATE_CLIP':
    case 'UPDATE_CLIP_LIVE':
      return {
        ...session,
        tracks: session.tracks.map(t => t.id === action.trackId
          ? { ...t, clips: t.clips.map(c => c.id === action.clipId ? { ...c, ...action.changes } : c) }
          : t)
      };
    case 'DUPLICATE_CLIP': {
      let dup = null;
      const tracks = session.tracks.map(t => {
        if (t.id !== action.trackId) return t;
        const src = t.clips.find(c => c.id === action.clipId);
        if (!src) return t;
        dup = { ...src, id: genId(), start: (src.start || 0) + (src.length || 0) };
        return { ...t, clips: [...t.clips, dup] };
      });
      return { ...session, tracks, selectedClipId: dup ? dup.id : session.selectedClipId };
    }
    case 'COPY_CLIP': {
      for (const t of session.tracks) {
        const c = t.clips.find(c => c.id === action.clipId);
        if (c) return { ...session, clipboard: { ...c } };
      }
      return session;
    }
    case 'PASTE_CLIP': {
      if (!session.clipboard) return session;
      const targetId = action.trackId || session.selectedTrackId;
      if (!targetId) return session;
      const at = action.atBar != null ? action.atBar : (session.playheadPosition || 0);
      let pasted = null;
      const tracks = session.tracks.map(t => {
        if (t.id !== targetId) return t;
        pasted = { ...session.clipboard, id: genId(), start: at, trackId: t.id };
        return { ...t, clips: [...t.clips, pasted] };
      });
      return { ...session, tracks, selectedClipId: pasted ? pasted.id : session.selectedClipId };
    }
    case 'SPLIT_CLIP': {
      const secPerBar = (60 / (session.bpm || 120)) * 4;
      return {
        ...session,
        tracks: session.tracks.map(t => {
          if (t.id !== action.trackId) return t;
          const clips = [];
          t.clips.forEach(c => {
            if (c.id !== action.clipId) { clips.push(c); return; }
            const rel = action.atBar - c.start;
            if (rel <= 0 || rel >= c.length) { clips.push(c); return; }
            clips.push({ ...c, length: rel });
            clips.push({
              ...c,
              id: genId(),
              start: action.atBar,
              length: c.length - rel,
              offset: (c.offset || 0) + rel * secPerBar,
            });
          });
          return { ...t, clips };
        }),
      };
    }
    case 'REMOVE_CLIP':
      return {
        ...session,
        tracks: session.tracks.map(t => t.id === action.trackId
          ? { ...t, clips: t.clips.filter(c => c.id !== action.clipId) }
          : t)
      };
    case 'UPDATE_BPM':
      return { ...session, bpm: action.bpm };
    case 'UPDATE_KEY':
      return { ...session, key: action.key, scale: action.scale };
    case 'SET_PLAYING':
      return { ...session, isPlaying: action.isPlaying };
    case 'SET_RECORDING':
      return { ...session, isRecording: action.isRecording };
    case 'ARM_TRACK':
      return { ...session, armedTrackId: session.armedTrackId === action.trackId ? null : action.trackId };
    case 'ADD_AUDIO_CLIP': {
      const clipId = genId();
      return {
        ...session,
        tracks: session.tracks.map(t => t.id === action.trackId
          ? { ...t, clips: [...t.clips, { id: clipId, name: action.name || 'Recording', start: 0, length: action.length || 16, audioUrl: action.audioUrl, type: 'audio', trackId: t.id }] }
          : t),
      };
    }
    case 'SET_PLAYHEAD':
      return { ...session, playheadPosition: action.position };
    case 'ADD_AI_MESSAGE':
      return { ...session, aiMessages: [...session.aiMessages, action.message] };
    case 'ADD_AI_SUGGESTION': {
      const suggestions = [...session.aiSuggestions, action.suggestion];
      return { ...session, aiSuggestions: suggestions.slice(-3) };
    }
    case 'REMOVE_AI_SUGGESTION':
      return { ...session, aiSuggestions: session.aiSuggestions.filter(s => s.id !== action.id) };
    case 'SET_OPEN_PANEL':
      return { ...session, openPanel: action.panel };
    case 'MUTE_TRACK':
      return { ...session, tracks: session.tracks.map(t => t.id === action.trackId ? { ...t, muted: !t.muted } : t) };
    case 'SOLO_TRACK':
      return { ...session, tracks: session.tracks.map(t => t.id === action.trackId ? { ...t, solo: !t.solo } : t) };
    case 'SET_TRACK_VOLUME':
      return { ...session, tracks: session.tracks.map(t => t.id === action.trackId ? { ...t, volume: action.volume } : t) };
    case 'NEW_CHAT': {
      const chatId = genId();
      const oldChat = {
        id: chatId,
        name: `Chat ${session.aiChatHistory.length + 1}`,
        createdAt: Date.now(),
        messages: session.aiMessages
      };
      return { ...session, aiMessages: [], aiChatHistory: [...session.aiChatHistory, oldChat], aiCurrentChatId: genId() };
    }
    case 'SELECT_CHAT':
      return { ...session, aiCurrentChatId: action.chatId };
    default:
      return session;
  }
}

export function sessionReducer(state, action) {
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const prev = state.past[state.past.length - 1];
    return { past: state.past.slice(0, -1), present: prev, future: [state.present, ...state.future].slice(0, MAX_HISTORY) };
  }
  if (action.type === 'REDO') {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    return { past: [...state.past, state.present].slice(-MAX_HISTORY), present: next, future: state.future.slice(1) };
  }

  // PUSH_HISTORY snapshots the present so a multi-step live edit (e.g. a clip
  // drag made of many UPDATE_CLIP_LIVE dispatches) collapses to one Undo.
  if (action.type === 'PUSH_HISTORY') {
    return { ...state, past: [...state.past, state.present].slice(-MAX_HISTORY), future: [] };
  }

  // LOAD_SESSION replaces entire state and resets undo/redo history (non-undoable).
  if (action.type === 'LOAD_SESSION') {
    return { past: [], present: action.data, future: [] };
  }

  // Non-undoable actions
  const nonUndoable = ['SET_PLAYING', 'SET_RECORDING', 'ARM_TRACK', 'SET_PLAYHEAD', 'SELECT_TRACK', 'SELECT_CLIP', 'ADD_AI_MESSAGE', 'ADD_AI_SUGGESTION', 'REMOVE_AI_SUGGESTION', 'NEW_CHAT', 'SELECT_CHAT', 'UPDATE_CLIP_LIVE', 'COPY_CLIP'];
  if (nonUndoable.includes(action.type)) {
    return { ...state, present: sessionReducerCore(state.present, action) };
  }

  const newPresent = sessionReducerCore(state.present, action);
  if (newPresent === state.present) return state;
  return {
    past: [...state.past, state.present].slice(-MAX_HISTORY),
    present: newPresent,
    future: [],
  };
}

export const initialState = {
  past: [],
  present: initialSession,
  future: [],
};
