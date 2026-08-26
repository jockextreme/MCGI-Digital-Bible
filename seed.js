// Populates data/bible.db from the two full-text datasets (adb.json, kjv.json)
// plus static metadata: book list/order/Tagalog names, version list, the
// content-length font table, and a handful of demo cross-references.
//
// Run with: npm run seed
// Safe to re-run — it wipes and rebuilds the relevant tables each time.

const fs = require('fs');
const path = require('path');
const db = require('../db');

const BOOKS = [
  ['Genesis', 50], ['Exodus', 40], ['Leviticus', 27], ['Numbers', 36], ['Deuteronomy', 34],
  ['Joshua', 24], ['Judges', 21], ['Ruth', 4], ['1 Samuel', 31], ['2 Samuel', 24],
  ['1 Kings', 22], ['2 Kings', 25], ['1 Chronicles', 29], ['2 Chronicles', 36], ['Ezra', 10],
  ['Nehemiah', 13], ['Esther', 10], ['Job', 42], ['Psalms', 150], ['Proverbs', 31],
  ['Ecclesiastes', 12], ['Song of Solomon', 8], ['Isaiah', 66], ['Jeremiah', 52], ['Lamentations', 5],
  ['Ezekiel', 48], ['Daniel', 12], ['Hosea', 14], ['Joel', 3], ['Amos', 9],
  ['Obadiah', 1], ['Jonah', 4], ['Micah', 7], ['Nahum', 3], ['Habakkuk', 3],
  ['Zephaniah', 3], ['Haggai', 2], ['Zechariah', 14], ['Malachi', 4],
  ['Matthew', 28], ['Mark', 16], ['Luke', 24], ['John', 21], ['Acts', 28],
  ['Romans', 16], ['1 Corinthians', 16], ['2 Corinthians', 13], ['Galatians', 6], ['Ephesians', 6],
  ['Philippians', 4], ['Colossians', 4], ['1 Thessalonians', 5], ['2 Thessalonians', 3], ['1 Timothy', 6],
  ['2 Timothy', 4], ['Titus', 3], ['Philemon', 1], ['Hebrews', 13], ['James', 5],
  ['1 Peter', 5], ['2 Peter', 3], ['1 John', 5], ['2 John', 1], ['3 John', 1],
  ['Jude', 1], ['Revelation', 22]
];

// Tagalog display names, same order as BOOKS, matching the app's own
// convention (Roman numerals for numbered books — "I CORINTO", not "1 Corinthians").
const BOOK_NAMES_TL = [
  'Genesis', 'Exodo', 'Levitico', 'Mga Bilang', 'Deuteronomio',
  'Josue', 'Mga Hukom', 'Ruth', 'I Samuel', 'II Samuel',
  'I Mga Hari', 'II Mga Hari', 'I Mga Cronica', 'II Mga Cronica', 'Ezra',
  'Nehemias', 'Ester', 'Job', 'Awit', 'Kawikaan',
  'Mangangaral', 'Awit ng mga Awit', 'Isaias', 'Jeremias', 'Panaghoy',
  'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadias', 'Jonas', 'Mikas', 'Nahum', 'Habacuc',
  'Sofonias', 'Hagai', 'Zacarias', 'Malakias',
  'Mateo', 'Marcos', 'Lucas', 'Juan', 'Mga Gawa',
  'Roma', 'I Corinto', 'II Corinto', 'Galacia', 'Efeso',
  'Filipos', 'Colosas', 'I Tesalonica', 'II Tesalonica', 'I Timoteo',
  'II Timoteo', 'Tito', 'Filemon', 'Mga Hebreo', 'Santiago',
  'I Pedro', 'II Pedro', 'I Juan', 'II Juan', 'III Juan',
  'Judas', 'Pahayag'
];

const VERSIONS = [
  { code: 'ADB', display_name: 'ANG DATING BIBLIA', language: 'tl', dataFile: 'adb.json' },
  { code: 'AB1905', display_name: 'ANG BIBLIA 1905', language: 'tl', dataFile: null },
  { code: 'AB1982', display_name: 'ANG BIBLIA 1982', language: 'tl', dataFile: null },
  { code: 'ABAB', display_name: 'ANG BAGONG ANG BIBLIA', language: 'tl', dataFile: null },
  { code: 'AKJV', display_name: 'AMERICAN KING JAMES VERSION', language: 'en', dataFile: null },
  { code: 'KJV', display_name: 'KING JAMES VERSION', language: 'en', dataFile: 'kjv.json' }
];

// Matches the real app's "Font Setting" dialog exactly.
const FONT_TABLE = [
  [1, 50, 77], [51, 100, 70], [101, 150, 68], [151, 200, 58],
  [201, 250, 52], [251, 300, 51], [301, 350, 48], [351, 400, 37],
  [401, 450, 35], [451, 500, 34], [501, 550, 39], [551, 600, 27],
  [601, 650, 27], [651, 999, 24]
];

// A handful of demo cross-references (not a real cross-reference database).
const CROSSREFS = [
  ['Genesis', 1, 1, 'Kawikaan 8:22'],
  ['Genesis', 1, 1, 'Mateo 11:25'],
  ['Genesis', 1, 1, 'Juan 1:1'],
  ['Psalms', 23, 1, 'Juan 10:11'],
  ['John', 3, 16, '1 Juan 4:9'],
  ['John', 3, 16, 'Roma 5:8']
];

function seed() {
  console.log('Seeding database...');

  db.exec(`
    DELETE FROM verses_fts;
    DELETE FROM verses;
    DELETE FROM books;
    DELETE FROM versions;
    DELETE FROM font_settings;
    DELETE FROM crossrefs;
  `);

  const insertVersion = db.prepare(`
    INSERT INTO versions (code, display_name, language, has_data, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  VERSIONS.forEach((v, i) => {
    insertVersion.run(v.code, v.display_name, v.language, v.dataFile ? 1 : 0, i);
  });

  const insertBook = db.prepare(`
    INSERT INTO books (key, tagalog_name, sort_order, chapter_count)
    VALUES (?, ?, ?, ?)
  `);
  BOOKS.forEach(([name, chapters], i) => {
    insertBook.run(name, BOOK_NAMES_TL[i], i, chapters);
  });

  const insertFont = db.prepare(`
    INSERT INTO font_settings (range_index, min_length, max_length, font_size)
    VALUES (?, ?, ?, ?)
  `);
  FONT_TABLE.forEach(([min, max, size], i) => insertFont.run(i, min, max, size));

  const insertCrossref = db.prepare(`
    INSERT INTO crossrefs (book_key, chapter, verse, label)
    VALUES (?, ?, ?, ?)
  `);
  CROSSREFS.forEach(([book, ch, vs, label]) => insertCrossref.run(book, ch, vs, label));

  const insertVerse = db.prepare(`
    INSERT INTO verses (version_code, book_key, chapter, verse, text)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertVerseFts = db.prepare(`
    INSERT INTO verses_fts (rowid, text) VALUES (?, ?)
  `);

  const loadVersionData = db.transaction((code, dataFile) => {
    const filePath = path.join(__dirname, dataFile);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ! ${dataFile} not found, skipping ${code}`);
      return 0;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let count = 0;
    for (const bookKey of Object.keys(data)) {
      const chapters = data[bookKey];
      for (let c = 0; c < chapters.length; c++) {
        const verses = chapters[c];
        for (let v = 0; v < verses.length; v++) {
          const text = verses[v];
          if (!text) continue;
          const info = insertVerse.run(code, bookKey, c + 1, v + 1, text);
          insertVerseFts.run(info.lastInsertRowid, text);
          count++;
        }
      }
    }
    return count;
  });

  VERSIONS.forEach(v => {
    if (!v.dataFile) return;
    const count = loadVersionData(v.code, v.dataFile);
    console.log(`  ${v.code}: ${count} verses loaded`);
  });

  console.log('Seeding complete.');
}

seed();
