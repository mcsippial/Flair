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
      return {
        ...session,
        tracks: session.tracks.map(t => t.id === action.trackId
          ? { ...t, clips: t.clips.map(c => c.id === action.clipId ? { ...c, ...action.changes } : c) }
          : t)
      };
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

  // Non-undoable actions
  const nonUndoable = ['SET_PLAYING', 'SET_RECORDING', 'ARM_TRACK', 'SET_PLAYHEAD', 'SELECT_TRACK', 'SELECT_CLIP', 'ADD_AI_MESSAGE', 'ADD_AI_SUGGESTION', 'REMOVE_AI_SUGGESTION', 'NEW_CHAT', 'SELECT_CHAT'];
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
