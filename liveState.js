const { getVersePayload } = require('./verseLookup');

// One "room" per operator username. Each room tracks its own current
// reference, its own operator socket (for presence/online detection), and
// its own set of viewer sockets. Deliberately in-memory: if the server
// restarts, operators just navigate to a verse again and viewers resync
// automatically (registerViewerSocket sends current state on connect).
const rooms = new Map();

function getRoom(username) {
  if (!rooms.has(username)) {
    rooms.set(username, {
      current: { version: 'ADB', book: 'Genesis', chapter: 1, verse: 1 },
      lastPayload: null,
      operatorSocket: null,
      viewerSockets: new Set()
    });
  }
  return rooms.get(username);
}

function computePayload(room) {
  const payload = getVersePayload(room.current.version, room.current.book, room.current.chapter, room.current.verse);
  room.lastPayload = payload || { ...room.current, text: null, found: false };
  return room.lastPayload;
}

function getCurrentPayload(username) {
  const room = getRoom(username);
  return room.lastPayload || computePayload(room);
}

function broadcastToRoom(username, message) {
  const room = getRoom(username);
  const json = JSON.stringify(message);
  if (room.operatorSocket && room.operatorSocket.readyState === room.operatorSocket.OPEN) {
    room.operatorSocket.send(json);
  }
  for (const ws of room.viewerSockets) {
    if (ws.readyState === ws.OPEN) ws.send(json);
  }
}

function setReference(username, { version, book, chapter, verse }) {
  const room = getRoom(username);
  room.current = {
    version: version || room.current.version,
    book: book || room.current.book,
    chapter: parseInt(chapter, 10) || room.current.chapter,
    verse: parseInt(verse, 10) || room.current.verse
  };
  const payload = computePayload(room);
  broadcastToRoom(username, { type: 'verse', payload });
  return payload;
}

// The operator's own console connects here — mainly for "who's online" presence.
function registerOperatorSocket(username, ws) {
  const room = getRoom(username);
  if (room.operatorSocket && room.operatorSocket !== ws) {
    try { room.operatorSocket.close(); } catch (err) { /* already closed */ }
  }
  room.operatorSocket = ws;
  ws.send(JSON.stringify({ type: 'verse', payload: getCurrentPayload(username) }));
  ws.on('close', () => { if (room.operatorSocket === ws) room.operatorSocket = null; });
}

// A viewer/presenter window connects here, watching one specific operator's room.
function registerViewerSocket(username, ws) {
  const room = getRoom(username);
  room.viewerSockets.add(ws);
  ws.send(JSON.stringify({ type: 'verse', payload: getCurrentPayload(username) }));
  ws.on('close', () => room.viewerSockets.delete(ws));
}

function isOperatorOnline(username) {
  const room = rooms.get(username);
  return !!(room && room.operatorSocket && room.operatorSocket.readyState === room.operatorSocket.OPEN);
}

function listOnlineUsernames() {
  const online = [];
  for (const [username] of rooms.entries()) {
    if (isOperatorOnline(username)) online.push(username);
  }
  return online;
}

module.exports = {
  setReference,
  getCurrentPayload,
  registerOperatorSocket,
  registerViewerSocket,
  isOperatorOnline,
  listOnlineUsernames
};
