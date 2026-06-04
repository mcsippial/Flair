import React, { useReducer, useEffect, useRef, useState, useCallback } from 'react';
import { sessionReducer, initialState } from './state/sessionReducer';
import StartScreen from './components/StartScreen';
import TopBar from './components/TopBar';
import TrackList from './components/TrackList';
import Timeline from './components/Timeline';
import AIPanel from './components/AIPanel';
import Mixer from './components/Mixer';
import PianoRoll from './components/PianoRoll';
import { setupMasterBus, ensureToneStarted } from './engine/audioEngine';
import * as Tone from 'tone';
import { scheduleSession, clearSchedule } from './engine/scheduler';

export default function App() {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const { present: session } = state;
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const toneSetup = useRef(false);

  useEffect(() => {
    if (!toneSetup.current) {
      setupMasterBus();
      toneSetup.current = true;
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (['input', 'textarea'].includes(tag)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayStop();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      } else if (e.key === 'Escape') {
        dispatch({ type: 'SET_OPEN_PANEL', panel: 'mixer' });
        dispatch({ type: 'SELECT_TRACK', trackId: null });
      } else if (e.key === 'm' || e.key === 'M') {
        if (session.selectedTrackId) dispatch({ type: 'MUTE_TRACK', trackId: session.selectedTrackId });
      } else if (e.key === 's' || e.key === 'S') {
        if (session.selectedTrackId) dispatch({ type: 'SOLO_TRACK', trackId: session.selectedTrackId });
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [session.isPlaying, session.selectedTrackId]);

  const handlePlayStop = useCallback(async () => {
    if (!session.isPlaying) {
      await ensureToneStarted();
      Tone.Transport.bpm.value = session.bpm;
      clearSchedule();
      scheduleSession(session.tracks);
      Tone.Transport.start();
      dispatch({ type: 'SET_PLAYING', isPlaying: true });
    } else {
      Tone.Transport.stop();
      clearSchedule();
      dispatch({ type: 'SET_PLAYING', isPlaying: false });
      dispatch({ type: 'SET_PLAYHEAD', position: 0 });
    }
  }, [session.isPlaying, session.bpm, session.tracks]);

  return (
    <div className="app-root">
      {showStartScreen && (
        <StartScreen
          onDismiss={() => setShowStartScreen(false)}
          dispatch={dispatch}
          session={session}
        />
      )}
      <div className={`app-layout ${showStartScreen ? 'blurred' : ''}`}>
        <TopBar
          session={session}
          dispatch={dispatch}
          onPlayStop={handlePlayStop}
          onOpenSettings={() => setApiKeyModalOpen(true)}
          canUndo={state.past.length > 0}
          canRedo={state.future.length > 0}
        />
        <TrackList session={session} dispatch={dispatch} />
        <Timeline session={session} dispatch={dispatch} />
        <AIPanel session={session} dispatch={dispatch} />
        <div className="bottom-panel">
          {session.openPanel === 'pianoroll' ? (
            <PianoRoll session={session} dispatch={dispatch} />
          ) : (
            <Mixer session={session} dispatch={dispatch} />
          )}
        </div>
      </div>
      {apiKeyModalOpen && (
        <ApiKeyModal onClose={() => setApiKeyModalOpen(false)} />
      )}
    </div>
  );
}

function ApiKeyModal({ onClose }) {
  const [key, setKey] = useState(localStorage.getItem('flair_claude_api_key') || '');
  const save = () => {
    localStorage.setItem('flair_claude_api_key', key);
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Claude API Key</h2>
        <p className="modal-desc">Your key is stored locally in this browser only.</p>
        <input
          className="modal-input"
          type="password"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="sk-ant-..."
          onKeyDown={e => e.key === 'Enter' && save()}
        />
        <div className="modal-actions">
          <button className="btn-primary" onClick={save}>Save</button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
