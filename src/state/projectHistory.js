const STORAGE_KEY = 'flair_project_history';
const MAX_RECORDS = 20;

const genId = () => Math.random().toString(36).slice(2, 10);

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {}
}

export function saveProjectRecord(session) {
  if (!session) return;
  const records = load();
  const sessionId = session.id || genId();

  const trackTypes = (session.tracks || []).map(t => t.type || 'midi');
  const instruments = (session.tracks || [])
    .filter(t => t.instrument)
    .map(t => t.instrument);

  const existing = records.find(r => r.id === sessionId);
  if (existing) {
    Object.assign(existing, {
      name: session.name || 'Untitled',
      bpm: session.bpm || 120,
      key: session.key || 'C',
      scale: session.scale || 'minor',
      trackCount: (session.tracks || []).length,
      trackTypes,
      instruments,
      lastOpenedAt: Date.now(),
      sessionSnapshot: session,
    });
  } else {
    const record = {
      id: sessionId,
      name: session.name || 'Untitled',
      bpm: session.bpm || 120,
      key: session.key || 'C',
      scale: session.scale || 'minor',
      trackCount: (session.tracks || []).length,
      trackTypes,
      instruments,
      playCount: 0,
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
      sessionSnapshot: session,
    };
    records.unshift(record);
  }

  // Keep max 20
  save(records.slice(0, MAX_RECORDS));
}

export function getProjectHistory() {
  return load().sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export function incrementPlayCount(sessionId) {
  if (!sessionId) return;
  const records = load();
  const record = records.find(r => r.id === sessionId);
  if (record) {
    record.playCount = (record.playCount || 0) + 1;
    save(records);
  }
}

export function deleteProjectRecord(id) {
  save(load().filter(r => r.id !== id));
}
