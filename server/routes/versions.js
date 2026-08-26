const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/versions — all versions, flagged with whether they have real text loaded.
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT code, display_name AS displayName, language, has_data AS hasData
    FROM versions
    ORDER BY sort_order ASC
  `).all();
  res.json(rows.map(r => ({ ...r, hasData: !!r.hasData })));
});

module.exports = router;
