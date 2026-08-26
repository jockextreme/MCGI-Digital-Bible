const express = require('express');
const { getBook, getVersion, chapterVerseCount, getVersePayload } = require('../verseLookup');

const router = express.Router();

// GET /api/verses/chapter-meta?version=ADB&book=Genesis&chapter=1
router.get('/chapter-meta', (req, res) => {
  const { version, book, chapter } = req.query;
  const chapterNum = parseInt(chapter, 10);
  if (!version || !book || !chapterNum) {
    return res.status(400).json({ error: 'version, book, and chapter are required' });
  }
  res.json({ chapterVerseCount: chapterVerseCount(version, book, chapterNum) });
});

// GET /api/verses?version=ADB&book=Genesis&chapter=1&verse=1
router.get('/', (req, res) => {
  const { version, book, chapter, verse } = req.query;
  const chapterNum = parseInt(chapter, 10);
  const verseNum = parseInt(verse, 10);

  if (!version || !book || !chapterNum || !verseNum) {
    return res.status(400).json({ error: 'version, book, chapter, and verse are required' });
  }
  if (!getBook(book)) return res.status(404).json({ error: `Unknown book "${book}"` });
  if (!getVersion(version)) return res.status(404).json({ error: `Unknown version "${version}"` });

  res.json(getVersePayload(version, book, chapterNum, verseNum));
});

module.exports = router;
