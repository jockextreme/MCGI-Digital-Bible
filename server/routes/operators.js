const express = require('express');
const db = require('../db');
const liveState = require('../liveState');

const router = express.Router();

function buildPreview(locale) {
  const payload = liveState.getCurrentPayload(locale);
  return {
    locale,
    operatorName: payload ? payload.operatorName : null,
    online: liveState.isOperatorOnline(locale),
    viewerCount: liveState.getViewerCount(locale),
    preview: payload ? {
      reference: `${payload.tagalogName || payload.book} ${payload.chapter}:${payload.verse}`,
      versionDisplayName: payload.versionDisplayName,
      text: payload.text
    } : null
  };
}

// GET /api/operators/online — locales whose room currently has an operator
// connected AND whose connected operator's account is public. Multiple
// operator accounts can share a locale, so "public" here is resolved
// against whichever specific operator is actually driving the room right
// now (tracked in liveState), not the locale as a blanket property.
router.get('/online', (req, res) => {
  const onlineLocales = liveState.listOnlineLocales();
  if (!onlineLocales.length) return res.json([]);

  const results = [];
  for (const locale of onlineLocales) {
    const payload = liveState.getCurrentPayload(locale);
    const operatorName = payload ? payload.operatorName : null;
    if (!operatorName) continue;

    const row = db.prepare(
      'SELECT is_public FROM operators WHERE locale = ? COLLATE NOCASE AND operator_name = ? COLLATE NOCASE'
    ).get(locale, operatorName);
    if (row && row.is_public) results.push(buildPreview(locale));
  }

  res.json(results);
});

module.exports = router;
