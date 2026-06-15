import React, { useState } from 'react';
import { deleteProjectRecord } from '../state/projectHistory';
import '../styles/dashboard.css';

function relativeTime(ts) {
  if (!ts) return '';
  const diffMs = Date.now() - ts;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  return `${diffDay} days ago`;
}

function deriveInsight(history) {
  if (!history.length) return '';
  const avgBpm = Math.round(history.reduce((s, r) => s + (r.bpm || 120), 0) / history.length);
  const minorCount = history.filter(r => r.scale === 'minor').length;
  const minorPct = minorCount / history.length;
  const drumSessionCount = history.filter(r => (r.trackTypes || []).some(t => t === 'drum')).length;
  const allDrum = drumSessionCount === history.length;

  const parts = [];
  if (avgBpm > 130) {
    parts.push('Your sessions run fast — you gravitate toward high-energy production.');
  } else if (avgBpm < 95) {
    parts.push('You lean toward slower, more deliberate tempos — your music breathes.');
  }
  if (minorPct >= 0.6) {
    parts.push('You work predominantly in minor keys.');
  } else if (minorPct <= 0.35) {
    parts.push('You favour major keys — your sound tends toward the bright and open.');
  }
  if (allDrum && history.length >= 2) {
    parts.push('Drums-first producer — rhythm is your foundation.');
  }
  if (!parts.length) {
    parts.push(`You average ${avgBpm} BPM across ${history.length} session${history.length !== 1 ? 's' : ''} — a well-rounded palette.`);
  }
  return parts.join(' ');
}

function computeStats(history) {
  if (!history.length) return null;
  const avgBpm = Math.round(history.reduce((s, r) => s + (r.bpm || 120), 0) / history.length);

  // Most common key+scale
  const keyScaleCount = {};
  history.forEach(r => {
    const ks = `${r.key || 'C'} ${r.scale || 'minor'}`;
    keyScaleCount[ks] = (keyScaleCount[ks] || 0) + 1;
  });
  const topKeyScale = Object.entries(keyScaleCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'C minor';

  const majorCount = history.filter(r => r.scale === 'major').length;
  const minorCount = history.length - majorCount;
  const majorPct = Math.round((majorCount / history.length) * 100);
  const minorPct = 100 - majorPct;

  // Top instruments
  const instrCount = {};
  history.forEach(r => (r.instruments || []).forEach(i => {
    instrCount[i] = (instrCount[i] || 0) + 1;
  }));
  const topInstruments = Object.entries(instrCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  return { avgBpm, topKeyScale, majorPct, minorPct, topInstruments };
}

export default function Dashboard({ history: initialHistory, onLoadSession, onDismiss, onNewSession }) {
  const [history, setHistory] = useState(initialHistory);

  const handleDelete = (e, id) => {
    e.stopPropagation();
    deleteProjectRecord(id);
    setHistory(prev => prev.filter(r => r.id !== id));
  };

  const handleOpenCard = (record) => {
    onLoadSession(record.sessionSnapshot);
    onDismiss();
  };

  const stats = computeStats(history);
  const insight = deriveInsight(history);

  return (
    <div className="dashboard-overlay">
      {/* Header */}
      <div className="dashboard-header">
        <span className="dashboard-wordmark">Flair</span>
        <div className="dashboard-header-actions">
          <button className="dashboard-btn-secondary" onClick={onNewSession}>
            Generate with AI
          </button>
          <button className="dashboard-btn-primary" onClick={onNewSession}>
            + New Session
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="dashboard-body">
        {/* Left sidebar */}
        <div className="dashboard-stats">
          <div className="dashboard-stats-title">Your Sound</div>

          {stats ? (
            <>
              <div className="stat-block">
                <div className="stat-label">Avg Tempo</div>
                <div className="stat-value">{stats.avgBpm}</div>
                <div className="stat-label" style={{ marginTop: 2 }}>BPM</div>
              </div>

              <div className="stat-divider" />

              <div className="stat-block">
                <div className="stat-label">Top Key</div>
                <div className="stat-value-sm">{stats.topKeyScale}</div>
              </div>

              <div className="stat-block">
                <div className="stat-label">Scale Preference</div>
                <div className="scale-bars">
                  <div className="scale-bar-row">
                    <span className="scale-bar-label">Major</span>
                    <div className="scale-bar-track">
                      <div className="scale-bar-fill major" style={{ width: `${stats.majorPct}%` }} />
                    </div>
                    <span className="scale-bar-pct">{stats.majorPct}%</span>
                  </div>
                  <div className="scale-bar-row">
                    <span className="scale-bar-label">Minor</span>
                    <div className="scale-bar-track">
                      <div className="scale-bar-fill minor" style={{ width: `${stats.minorPct}%` }} />
                    </div>
                    <span className="scale-bar-pct">{stats.minorPct}%</span>
                  </div>
                </div>
              </div>

              {stats.topInstruments.length > 0 && (
                <>
                  <div className="stat-divider" />
                  <div className="stat-block">
                    <div className="stat-label">Top Instruments</div>
                    <div className="instrument-list">
                      {stats.topInstruments.map(instr => (
                        <div key={instr} className="instrument-item">
                          <div className="instrument-dot" />
                          <span style={{ textTransform: 'capitalize' }}>{instr}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="stat-divider" />
              <div className="total-sessions">{history.length} session{history.length !== 1 ? 's' : ''} total</div>
            </>
          ) : (
            <div className="total-sessions">No sessions yet</div>
          )}
        </div>

        {/* Right column */}
        <div className="dashboard-right">
          <div className="dashboard-right-scroll">
            <div className="sessions-section-title">Recent Sessions</div>
            <div className="sessions-grid">
              {history.map(record => {
                const trackTypesUniq = [...new Set((record.trackTypes || []))].slice(0, 4);
                return (
                  <div
                    key={record.id}
                    className="session-card"
                    onClick={() => handleOpenCard(record)}
                  >
                    <button
                      className="session-card-delete"
                      onClick={(e) => handleDelete(e, record.id)}
                      title="Delete session"
                    >
                      ×
                    </button>

                    <div className="session-card-name">{record.name || 'Untitled'}</div>

                    <div className="session-card-meta">
                      <span>{record.bpm} BPM</span>
                      <span className="session-card-meta-dot">·</span>
                      <span>{record.key} {record.scale}</span>
                      <span className="session-card-meta-dot">·</span>
                      <span>{record.trackCount} tracks</span>
                    </div>

                    {trackTypesUniq.length > 0 && (
                      <div className="session-card-tracks">
                        {trackTypesUniq.map((type, i) => (
                          <span key={i} className={`track-type-badge ${type}`}>{type}</span>
                        ))}
                      </div>
                    )}

                    <div className="session-card-footer">
                      <span className="session-play-count">
                        ▶ {record.playCount || 0}
                      </span>
                      <span className="session-last-opened">
                        {relativeTime(record.lastOpenedAt)}
                      </span>
                    </div>

                    <span className="session-card-open">Open →</span>
                  </div>
                );
              })}
            </div>
          </div>

          {insight && (
            <div className="insight-panel">
              <div className="insight-label">Producer Insight</div>
              <div className="insight-text">{insight}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
