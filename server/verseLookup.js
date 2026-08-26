const db = require('./db');

function getBook(bookKey) {
  return db.prepare(`
    SELECT key, tagalog_name AS tagalogName, chapter_count AS chapterCount
    FROM books WHERE key = ?
  `).get(bookKey);
}

function getVersion(code) {
  return db.prepare('SELECT * FROM versions WHERE code = ?').get(code);
}

function chapterVerseCount(versionCode, bookKey, chapter) {
  const row = db.prepare(`
    SELECT MAX(verse) AS maxVerse FROM verses
    WHERE version_code = ? AND book_key = ? AND chapter = ?
  `).get(versionCode, bookKey, chapter);
  return row ? row.maxVerse : null;
}

// Builds the full, ready-to-render payload for a given reference —
// used by GET /api/verses and by the live presenter/control sync.
function getVersePayload(version, book, chapter, verse) {
  const chapterNum = parseInt(chapter, 10);
  const verseNum = parseInt(verse, 10);

  const bookInfo = getBook(book);
  const versionInfo = getVersion(version);
  if (!bookInfo || !versionInfo) return null;

  const row = db.prepare(`
    SELECT text FROM verses
    WHERE version_code = ? AND book_key = ? AND chapter = ? AND verse = ?
  `).get(version, book, chapterNum, verseNum);

  const crossrefs = db.prepare(`
    SELECT label FROM crossrefs WHERE book_key = ? AND chapter = ? AND verse = ?
  `).all(book, chapterNum, verseNum).map(r => r.label);

  return {
    version,
    versionDisplayName: versionInfo.display_name,
    hasData: !!versionInfo.has_data,
    book,
    tagalogName: bookInfo.tagalogName,
    chapter: chapterNum,
    verse: verseNum,
    text: row ? row.text : null,
    found: !!row,
    bookChapterCount: bookInfo.chapterCount,
    chapterVerseCount: chapterVerseCount(version, book, chapterNum),
    crossrefs
  };
}

module.exports = { getBook, getVersion, chapterVerseCount, getVersePayload };
