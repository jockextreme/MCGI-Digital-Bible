const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/font-settings — the content-length -> font-size table, in range order.
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT range_index AS rangeIndex, min_length AS minLength,
           max_length AS maxLength, font_size AS fontSize
    FROM font_settings
    ORDER BY range_index ASC
  `).all();
  res.json(rows);
});

// PUT /api/font-settings — body: [{ rangeIndex, fontSize }, ...]
// Only font sizes are editable; the ranges themselves are fixed (matches the
// real app's dialog, where only the size column has spinners).
router.put('/', (req, res) => {
  const updates = req.body;
  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Expected an array of { rangeIndex, fontSize }' });
  }

  const stmt = db.prepare(`UPDATE font_settings SET font_size = ? WHERE range_index = ?`);
  const applyAll = db.transaction(items => {
    for (const item of items) {
      const size = parseInt(item.fontSize, 10);
      const idx = parseInt(item.rangeIndex, 10);
      if (Number.isFinite(size) && size > 0 && Number.isFinite(idx)) {
        stmt.run(size, idx);
      }
    }
  });
  applyAll(updates);

  const rows = db.prepare(`
    SELECT range_index AS rangeIndex, min_length AS minLength,
           max_length AS maxLength, font_size AS fontSize
    FROM font_settings
    ORDER BY range_index ASC
  `).all();
  res.json(rows);
});

module.exports = router;
