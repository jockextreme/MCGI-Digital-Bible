const { getVersePayload } = require('./verseLookup');

// One "room" per locale (not per individual operator account) — multiple
// operators can be registered under the same locale, but they share a
// single broadcast room, matching "prefer one active broadcaster per
// locale." Each room tracks its own current reference, its own operator
// socket (whoever most recently connected — connecting a new one closes
// the previous), and its own set of viewer sockets. Deliberately
// in-memory: if the server restarts, operators just navigate to a verse
// again and viewers resync automatically (registerViewerSocket sends
// current state on connect).
const rooms = new Map();

function getRoom(locale) {
  if (!rooms.has(locale)) {
    rooms.set(locale, {
      current: { version: 'ADB', book: 'Genesis', chapter: 1, verse: 1, background: 'default', safeMargin: 0, blank: false },
      lastPayload: null,
      operatorSocket: null,
      currentOperatorName: null,
      viewerSockets: new Set()
    });
  }
  return rooms.get(locale);
}

function computePayload(room) {
  const payload = getVersePayload(room.current.version, room.current.book, room.current.chapter, room.current.verse);
  const base = payload || { ...room.current, text: null, found: false };
  room.lastPayload = {
    ...base,
    background: room.current.background,
    safeMargin: room.current.safeMargin,
    blank: !!room.current.blank,
    operatorName: room.currentOperatorName
  };
  return room.lastPayload;
}

function getCurrentPayload(locale) {
  const room = getRoom(locale);
  return room.lastPayload || computePayload(room);
}

function broadcastToRoom(locale, message) {
  const room = getRoom(locale);
  const json = JSON.stringify(message);
  if (room.operatorSocket && room.operatorSocket.readyState === room.operatorSocket.OPEN) {
    room.operatorSocket.send(json);
  }
  for (const ws of room.viewerSockets) {
    if (ws.readyState === ws.OPEN) ws.send(json);
  }
}

function setReference(locale, { version, book, chapter, verse, background, safeMargin }) {
  const room = getRoom(locale);
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
  broadcastToRoom(locale, { type: 'verse', payload });
  return payload;
}

// Emergency blank screen — toggled independently of navigation, so it
// doesn't require picking a verse first.
function setBlank(locale, blank) {
  const room = getRoom(locale);
  room.current.blank = !!blank;
  const payload = computePayload(room);
  broadcastToRoom(locale, { type: 'verse', payload });
  return payload;
}

// An operator's own console connects here — mainly for "who's online"
// presence. Only one operator socket is kept per locale at a time
// ("prefer one active broadcaster per locale") — a new connection closes
// whichever one was previously live for that locale.
function registerOperatorSocket(locale, operatorName, ws) {
  const room = getRoom(locale);
  if (room.operatorSocket && room.operatorSocket !== ws) {
    try { room.operatorSocket.close(); } catch (err) { /* already closed */ }
  }
  room.operatorSocket = ws;
  room.currentOperatorName = operatorName;
  ws.send(JSON.stringify({ type: 'verse', payload: getCurrentPayload(locale) }));
  ws.send(JSON.stringify({ type: 'viewerCount', count: room.viewerSockets.size }));
  ws.on('close', () => {
    if (room.operatorSocket === ws) {
      room.operatorSocket = null;
      room.currentOperatorName = null;
    }
  });
}

// A viewer/presenter window connects here, watching one locale's room.
function registerViewerSocket(locale, ws) {
  const room = getRoom(locale);
  room.viewerSockets.add(ws);
  ws.send(JSON.stringify({ type: 'verse', payload: getCurrentPayload(locale) }));
  notifyViewerCount(locale);
  ws.on('close', () => {
    room.viewerSockets.delete(ws);
    notifyViewerCount(locale);
  });
}

function getViewerCount(locale) {
  const room = rooms.get(locale);
  return room ? room.viewerSockets.size : 0;
}

function notifyViewerCount(locale) {
  const room = getRoom(locale);
  if (room.operatorSocket && room.operatorSocket.readyState === room.operatorSocket.OPEN) {
    room.operatorSocket.send(JSON.stringify({ type: 'viewerCount', count: room.viewerSockets.size }));
  }
}

function isOperatorOnline(locale) {
  const room = rooms.get(locale);
  return !!(room && room.operatorSocket && room.operatorSocket.readyState === room.operatorSocket.OPEN);
}

function listOnlineLocales() {
  const online = [];
  for (const [locale] of rooms.entries()) {
    if (isOperatorOnline(locale)) online.push(locale);
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
  listOnlineLocales,
  getViewerCount
};
