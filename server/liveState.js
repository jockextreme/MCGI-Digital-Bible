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
      current: { version: 'ADB', book: 'Genesis', chapter: 1, verse: 1, background: 'default', safeMargin: 0, blank: false },
      lastPayload: null,
      operatorSocket: null,
      viewerSockets: new Set()
    });
  }
  return rooms.get(username);
}

function computePayload(room) {
  const payload = getVersePayload(room.current.version, room.current.book, room.current.chapter, room.current.verse);
  const base = payload || { ...room.current, text: null, found: false };
  room.lastPayload = { ...base, background: room.current.background, safeMargin: room.current.safeMargin, blank: !!room.current.blank };
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

function setReference(username, { version, book, chapter, verse, background, safeMargin }) {
  const room = getRoom(username);
  room.current = {
    version: version || room.current.version,
    book: book || room.current.book,
    chapter: parseInt(chapter, 10) || room.current.chapter,
    verse: parseInt(verse, 10) || room.current.verse,
    background: background || room.current.background,
    safeMargin: safeMargin !== undefined && safeMargin !== null ? parseInt(safeMargin, 10) : room.current.safeMargin,
    blank: room.current.blank
  };
  const payload = computePayload(room);
  broadcastToRoom(username, { type: 'verse', payload });
  return payload;
}

// Emergency blank screen — toggled independently of navigation, so it
// doesn't require picking a verse first.
function setBlank(username, blank) {
  const room = getRoom(username);
  room.current.blank = !!blank;
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
  ws.send(JSON.stringify({ type: 'viewerCount', count: room.viewerSockets.size }));
  ws.on('close', () => { if (room.operatorSocket === ws) room.operatorSocket = null; });
}

// A viewer/presenter window connects here, watching one specific operator's room.
function registerViewerSocket(username, ws) {
  const room = getRoom(username);
  room.viewerSockets.add(ws);
  ws.send(JSON.stringify({ type: 'verse', payload: getCurrentPayload(username) }));
  notifyViewerCount(username);
  ws.on('close', () => {
    room.viewerSockets.delete(ws);
    notifyViewerCount(username);
  });
}

function getViewerCount(username) {
  const room = rooms.get(username);
  return room ? room.viewerSockets.size : 0;
}

function notifyViewerCount(username) {
  const room = getRoom(username);
  if (room.operatorSocket && room.operatorSocket.readyState === room.operatorSocket.OPEN) {
    room.operatorSocket.send(JSON.stringify({ type: 'viewerCount', count: room.viewerSockets.size }));
  }
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
  setBlank,
  getCurrentPayload,
  registerOperatorSocket,
  registerViewerSocket,
  isOperatorOnline,
  listOnlineUsernames,
  getViewerCount
};
