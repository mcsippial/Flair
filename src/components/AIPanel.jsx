import React, { useState, useRef, useEffect } from 'react';
import { sendMessage, getApiKey } from '../ai/claudeClient';
import { parseAndDispatch } from '../ai/aiActions';
import { buildSessionContext } from '../ai/sessionContext';

export default function AIPanel({ session, dispatch }) {
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const chatRef = useRef(null);
  const hasKey = !!getApiKey();

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [session.aiMessages, thinking]);

  const handleSend = async () => {
    if (!input.trim() || thinking) return;
    const userMsg = input.trim();
    setInput('');

    dispatch({
      type: 'ADD_AI_MESSAGE',
      message: {
        id: Math.random().toString(36).substr(2, 9),
        role: 'user',
        text: userMsg,
        timestamp: Date.now()
      }
    });

    setThinking(true);
    try {
      const ctx = buildSessionContext(session);
      const response = await sendMessage(userMsg, ctx);

      dispatch({
        type: 'ADD_AI_MESSAGE',
        message: {
          id: Math.random().toString(36).substr(2, 9),
          role: 'assistant',
          text: response.message,
          actions: response.actions,
          timestamp: Date.now()
        }
      });

      if (response.actions && response.actions.length > 0) {
        parseAndDispatch(response, dispatch);
      }
    } catch (err) {
      dispatch({
        type: 'ADD_AI_MESSAGE',
        message: {
          id: Math.random().toString(36).substr(2, 9),
          role: 'assistant',
          text: `Error: ${err.message}`,
          timestamp: Date.now()
        }
      });
    } finally {
      setThinking(false);
    }
  };

  const startNewChat = () => {
    dispatch({ type: 'NEW_CHAT' });
  };

  return (
    <div className="ai-panel">
      <div className="ai-session-bar">
        <span>{session.bpm} BPM</span>
        <span>{session.key} {session.scale}</span>
        <span>{session.tracks.length} tracks</span>
        {session.isPlaying && <span className="playing-dot" />}
      </div>

      <div className="ai-chat-header">
        <span className="ai-chat-title">AI Producer</span>
        <button className="new-chat-btn" onClick={startNewChat}>New chat</button>
      </div>

      <div className="ai-chat-feed" ref={chatRef}>
        {session.aiMessages.length === 0 && (
          <div className="ai-empty">Start a conversation with your AI producer.</div>
        )}
        {session.aiMessages.map(msg => (
          <div key={msg.id} className={`ai-message ${msg.role}`}>
            <p className="msg-text">{msg.text}</p>
            {msg.actions && msg.actions.length > 0 && (
              <div className="msg-actions">
                <button
                  className="action-chip apply"
                  onClick={() => parseAndDispatch({ message: msg.text, actions: msg.actions }, dispatch)}
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="ai-message assistant thinking">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
          </div>
        )}
      </div>

      <div className="ai-input-area">
        {!hasKey ? (
          <div className="no-key-prompt">Set your Claude API key in ⚙ Settings to use the AI producer.</div>
        ) : (
          <>
            <input
              className="ai-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Tell your producer what to do..."
              disabled={thinking}
            />
            <button
              className="ai-send-btn"
              onClick={handleSend}
              disabled={thinking || !input.trim()}
            >
              {thinking ? '...' : '→'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
