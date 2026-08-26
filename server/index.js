const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const booksRouter = require('./routes/books');
const versionsRouter = require('./routes/versions');
const versesRouter = require('./routes/verses');
const searchRouter = require('./routes/search');
const settingsRouter = require('./routes/settings');
const liveStateRouter = require('./routes/liveState');
const networkInfoRouter = require('./routes/networkInfo');
const liveState = require('./liveState');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/books', booksRouter);
app.use('/api/versions', versionsRouter);
app.use('/api/verses', versesRouter);
app.use('/api/search', searchRouter);
app.use('/api/font-settings', settingsRouter);
app.use('/api/live-state', liveStateRouter);
app.use('/api/network-info', networkInfoRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// The presenter (audience) view is its own clean page — no toolbar.
app.get('/present', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'present.html'));
});

const server = http.createServer(app);

// WebSocket: pushes live verse updates to every connected control/presenter
// window whenever the operator navigates to a new reference.
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => liveState.registerClient(ws));

server.listen(PORT, () => {
  console.log(`MCGI Digital Bible server running at http://localhost:${PORT}`);
  console.log(`Presenter (audience) view: http://localhost:${PORT}/present`);
});
