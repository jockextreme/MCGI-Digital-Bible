const { getVersePayload } = require('./verseLookup');

// The single "what's currently on screen" state for the whole service.
// Deliberately simple and in-memory: one service happens at a time, and if
// the server restarts, the operator just navigates to a verse again.
let current = { version: 'ADB', book: 'Genesis', chapter: 1, verse: 1 };
let lastPayload = null;

const clients = new Set(); // connected WebSocket clients (control + presenter)

function computePayload() {
  const payload = getVersePayload(current.version, current.book, current.chapter, current.verse);
  lastPayload = payload || { ...current, text: null, found: false };
  return lastPayload;
}

function getCurrentPayload() {
  return lastPayload || computePayload();
}

function broadcast(message) {
  const json = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(json);
  }
}

function setReference({ version, book, chapter, verse }) {
  current = {
    version: version || current.version,
    book: book || current.book,
    chapter: parseInt(chapter, 10) || current.chapter,
    verse: parseInt(verse, 10) || current.verse
  };
  const payload = computePayload();
  broadcast({ type: 'verse', payload });
  return payload;
}

function registerClient(ws) {
  clients.add(ws);
  // Send the current state immediately so a newly-opened presenter/control
  // window shows the right thing without waiting for the next navigation.
  ws.send(JSON.stringify({ type: 'verse', payload: getCurrentPayload() }));
  ws.on('close', () => clients.delete(ws));
}

module.exports = { setReference, getCurrentPayload, registerClient, broadcast };
