const express = require('express');
const liveState = require('../liveState');

const router = express.Router();

// GET /api/live-state — current reference (useful for a page that loads before the WS connects)
router.get('/', (req, res) => {
  res.json(liveState.getCurrentPayload());
});

// POST /api/live-state — body: { version, book, chapter, verse }
// Updates the shared reference and broadcasts it to every connected
// presenter/control window over WebSocket.
router.post('/', (req, res) => {
  const { version, book, chapter, verse } = req.body || {};
  if (!book || !chapter || !verse) {
    return res.status(400).json({ error: 'book, chapter, and verse are required' });
  }
  const payload = liveState.setReference({ version, book, chapter, verse });
  res.json(payload);
});

module.exports = router;
