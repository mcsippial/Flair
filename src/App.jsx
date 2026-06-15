import React, { useReducer, useEffect, useRef, useState, useCallback } from 'react';
import { sessionReducer, initialState } from './state/sessionReducer';
import StartScreen from './components/StartScreen';
import TopBar from './components/TopBar';
import TrackList from './components/TrackList';
import Timeline from './components/Timeline';
import AIPanel from './components/AIPanel';
import Mixer from './components/Mixer';
import PianoRoll from './components/PianoRoll';
import DrumSequencer from './components/DrumSequencer';
import { ensureToneStarted, getTrackNodes, disposeTrack,
         disposeAllTracks, startRecording, stopRecording } from './engine/audioEngine';
import Tone from 'tone';
import { scheduleSession, scheduleTrack, rescheduleTrack, clearSchedule } from './engine/scheduler';


const SAVE_KEY = 'flair_session_v1';

export default function App() {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const { present: session } = state;
  const [savedData] = useState(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const scheduledTrackIds = useRef(new Set());
  const saveTimerRef = useRef(null);
  const trackNotesFingerprints = useRef({});

  // Auto-save session to localStorage, debounced 1 second.
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(session));
      } catch {}
    }, 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [session]);

  // Sync mute/solo/volume to audio engine; hot-add new tracks if playing
  useEffect(() => {
    const anySolo = session.tracks.some(t => t.solo);
    const currentIds = new Set(session.tracks.map(t => t.id));

    // Dispose removed tracks
    for (const id of scheduledTrackIds.current) {
      if (!currentIds.has(id)) {
        disposeTrack(id);
        scheduledTrackIds.current.delete(id);
      }
    }

    session.tracks.forEach(track => {
      const nodes = getTrackNodes(track.id);

      // Hot-schedule new tracks added while playing
      if (!nodes && session.isPlaying) {
        scheduleTrack(track);
        scheduledTrackIds.current.add(track.id);
      }

      // Reschedule track when its notes/pattern change while playing
      if (nodes && session.isPlaying) {
        const fp = track.clips.map(c =>
          (c.notes || []).map(n => n.note + n.time).join('|') +
          (c.pattern || []).join('')
        ).join(';');
        if (trackNotesFingerprints.current[track.id] !== fp) {
          trackNotesFingerprints.current[track.id] = fp;
          rescheduleTrack(track);
          scheduledTrackIds.current.add(track.id);
        }
      }

      const liveNodes = getTrackNodes(track.id);
      if (!liveNodes) return;

      const shouldPlay = !track.muted && (!anySolo || track.solo);
      const dbVal = shouldPlay ? Tone.gainToDb(Math.max(0.0001, track.volume)) : -Infinity;
      if (liveNodes.synth?.volume)  liveNodes.synth.volume.value  = dbVal;
      if (liveNodes.kick?.volume)   liveNodes.kick.volume.value   = dbVal;
      if (liveNodes.snare?.volume)  liveNodes.snare.volume.value  = dbVal;
      if (liveNodes.hihat) liveNodes.hihat.volume.value = dbVal;
      // Audio (stem) tracks play through Tone.Player nodes — apply gain there
      // so mute / solo / volume actually affect them.
      if (liveNodes.players) {
        liveNodes.players.forEach(p => { if (p.volume) p.volume.value = dbVal; });
      }
    });
  }, [session.tracks, session.isPlaying]);

  const handlePlayStop = useCallback(async () => {
    if (!session.isPlaying) {
      await ensureToneStarted();
      Tone.Transport.bpm.value = session.bpm;
      clearSchedule();
      scheduleSession(session.tracks);
      scheduledTrackIds.current = new Set(session.tracks.map(t => t.id));
      // Start immediately using synth fallbacks; samples upgrade in the background
      Tone.Transport.start();
      dispatch({ type: 'SET_PLAYING', isPlaying: true });
    } else {
      Tone.Transport.stop();
      clearSchedule();
      session.tracks.forEach(track => {
        const nodes = getTrackNodes(track.id);
        if (nodes?.players) nodes.players.forEach(p => { try { p.stop(0); } catch {} });
      });
      disposeAllTracks();
      scheduledTrackIds.current = new Set();
      trackNotesFingerprints.current = {};
      dispatch({ type: 'SET_PLAYING', isPlaying: false });
      dispatch({ type: 'SET_PLAYHEAD', position: 0 });
    }
  }, [session.isPlaying, session.bpm, session.tracks]);

  const handleRecord = useCallback(async () => {
    if (!session.armedTrackId) return;
    if (!session.isRecording) {
      await ensureToneStarted();
      await startRecording();
      dispatch({ type: 'SET_RECORDING', isRecording: true });
      if (!session.isPlaying) {
        Tone.Transport.bpm.value = session.bpm;
        clearSchedule();
        scheduleSession(session.tracks);
        scheduledTrackIds.current = new Set(session.tracks.map(t => t.id));
        Tone.Transport.start();
        dispatch({ type: 'SET_PLAYING', isPlaying: true });
      }
    } else {
      const audioUrl = await stopRecording();
      dispatch({ type: 'SET_RECORDING', isRecording: false });
      if (audioUrl) {
        const durationBars = Math.ceil(Tone.Transport.seconds / (60 / session.bpm) / 4) || 4;
        dispatch({ type: 'ADD_AUDIO_CLIP', trackId: session.armedTrackId, audioUrl, name: 'Recording', length: durationBars });
      }
      Tone.Transport.stop();
      clearSchedule();
      session.tracks.forEach(track => {
        const nodes = getTrackNodes(track.id);
        if (nodes?.players) nodes.players.forEach(p => { try { p.stop(0); } catch {} });
      });
      disposeAllTracks();
      scheduledTrackIds.current = new Set();
      trackNotesFingerprints.current = {};
      dispatch({ type: 'SET_PLAYING', isPlaying: false });
      dispatch({ type: 'SET_PLAYHEAD', position: 0 });
    }
  }, [session.armedTrackId, session.isRecording, session.isPlaying, session.bpm, session.tracks]);

  // Keyboard shortcuts — defined after handlePlayStop so it's not in TDZ when used in deps
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
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        if (session.selectedClipId && session.selectedTrackId) {
          e.preventDefault();
          dispatch({ type: 'DUPLICATE_CLIP', trackId: session.selectedTrackId, clipId: session.selectedClipId });
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
        if (session.selectedClipId) dispatch({ type: 'COPY_CLIP', clipId: session.selectedClipId });
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
        dispatch({ type: 'PASTE_CLIP' });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (session.selectedClipId && session.selectedTrackId) {
          e.preventDefault();
          dispatch({ type: 'REMOVE_CLIP', trackId: session.selectedTrackId, clipId: session.selectedClipId });
        }
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
  }, [session.isPlaying, session.selectedTrackId, session.selectedClipId, handlePlayStop]);

  return (
    <div className="app-root">
      {showStartScreen && (
        <StartScreen
          onDismiss={() => setShowStartScreen(false)}
          dispatch={dispatch}
          session={session}
          savedData={savedData}
        />
      )}
      <div className={`app-layout ${showStartScreen ? 'blurred' : ''}`}>
        <TopBar
          session={session}
          dispatch={dispatch}
          onPlayStop={handlePlayStop}
          onRecord={handleRecord}
          onOpenSettings={() => setApiKeyModalOpen(true)}
          canUndo={state.past.length > 0}
          canRedo={state.future.length > 0}
        />
        <TrackList session={session} dispatch={dispatch} />
        <Timeline session={session} dispatch={dispatch} />
        <AIPanel session={session} dispatch={dispatch} />
        <div className="bottom-panel">
          {(() => {
            // Check if selected clip is a drum clip (auto-open drum sequencer)
            const selectedClip = session.tracks.flatMap(t => t.clips).find(c => c.id === session.selectedClipId);
            const isDrumPanel = session.openPanel === 'drumsequencer' || selectedClip?.type === 'drum';
            if (isDrumPanel) return <DrumSequencer session={session} dispatch={dispatch} />;
            if (session.openPanel === 'pianoroll') return <PianoRoll session={session} dispatch={dispatch} />;
            return <Mixer session={session} dispatch={dispatch} />;
          })()}
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
