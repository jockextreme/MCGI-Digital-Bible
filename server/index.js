const path = require('path');
const http = require('http');
const url = require('url');
const express = require('express');
const session = require('express-session');
const { WebSocketServer } = require('ws');

const booksRouter = require('./routes/books');
const versionsRouter = require('./routes/versions');
const versesRouter = require('./routes/verses');
const searchRouter = require('./routes/search');
const settingsRouter = require('./routes/settings');
const liveStateRouter = require('./routes/liveState');
const networkInfoRouter = require('./routes/networkInfo');
const authRouter = require('./routes/auth');
const operatorsRouter = require('./routes/operators');

const db = require('./db');
const liveState = require('./liveState');
const { consumeWsToken } = require('./wsTokens');
const { startCleanupSchedule } = require('./cleanup');

const app = express();
const PORT = process.env.PORT || 3000;

// Session cookie secret: set SESSION_SECRET in production. A random
// fallback is generated per-boot so it at least works out of the box,
// but that means sessions won't survive a restart unless you set your own.
const SESSION_SECRET = process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex');

app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRouter);
app.use('/api/books', booksRouter);
app.use('/api/versions', versionsRouter);
app.use('/api/verses', versesRouter);
app.use('/api/search', searchRouter);
app.use('/api/font-settings', settingsRouter);
app.use('/api/live-state', liveStateRouter);
app.use('/api/network-info', networkInfoRouter);
app.use('/api/operators', operatorsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// The operator control panel (login + controls) lives at /control.
app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'console.html'));
});
// Legacy URL from before the control panel was renamed.
app.get('/console', (req, res) => res.redirect('/control'));

// The presenter (audience) view is its own clean page — no toolbar, no border.
app.get('/present', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'present.html'));
});

// Legacy URL from before the homepage became the two-role landing page.
app.get('/operators', (req, res) => res.redirect('/'));

const server = http.createServer(app);

// WebSocket: role-based connection.
//   /ws?role=operator&token=<one-time token from /api/auth/ws-token>
//     — the operator's own console, mainly for online-presence tracking.
//   /ws?role=viewer&operator=<username>
//     — a presenter/viewer window watching one specific operator's room.
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const { query } = url.parse(req.url, true);

  if (query.role === 'operator') {
    const operatorId = consumeWsToken(query.token || '');
    if (!operatorId) {
      ws.close(4001, 'Invalid or expired token');
      return;
    }
    const row = db.prepare('SELECT username FROM operators WHERE id = ?').get(operatorId);
    if (!row) {
      ws.close(4001, 'Unknown operator');
      return;
    }
    liveState.registerOperatorSocket(row.username, ws);
    return;
  }

  if (query.role === 'viewer') {
    const username = query.operator;
    if (!username) {
      ws.close(4002, 'No operator specified');
      return;
    }
    liveState.registerViewerSocket(username, ws);
    return;
  }

  ws.close(4000, 'Missing role');
});

server.listen(PORT, () => {
  console.log(`MCGI Digital Bible server running at http://localhost:${PORT}`);
  console.log(`Landing page: http://localhost:${PORT}/`);
  console.log(`Control panel: http://localhost:${PORT}/control`);
  console.log(`Presenter: http://localhost:${PORT}/present`);
  startCleanupSchedule();
});
