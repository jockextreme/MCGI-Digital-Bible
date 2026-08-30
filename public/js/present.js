(() => {
  'use strict';

  const el = id => document.getElementById(id);
  const DESIGN_WIDTH = 1920;
  const MIN_FIT_SIZE = 15;
  let fontTable = [];
  let versions = [];
  let lastReference = null; // { book, chapter, verse } from whatever the operator last sent
  let lastSafeMargin = 0;

  const params = new URLSearchParams(location.search);
  const operatorUsername = params.get('operator');

  if (!operatorUsername) {
    location.href = '/';
    return;
  }

  const STORAGE_KEY = `mcgi-version-mode:${operatorUsername}`;
  let mode = { type: 'auto', version: null }; // type: 'auto' | 'manual'
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.type === 'manual' && saved.version) mode = saved;
  } catch (err) { /* ignore bad localStorage content */ }

  async function loadFontTable() {
    try {
      const res = await fetch('/api/font-settings');
      fontTable = await res.json();
    } catch (err) {
      console.error('Could not load font settings', err);
    }
  }

  async function loadVersions() {
    try {
      const res = await fetch('/api/versions');
      versions = await res.json();
      const sel = el('versionModeSelect');
      sel.innerHTML = '';
      sel.add(new Option('Auto (follow operator)', 'auto'));
      versions.filter(v => v.hasData).forEach(v => sel.add(new Option(v.displayName, v.code)));
      sel.value = mode.type === 'manual' ? mode.version : 'auto';
      sel.addEventListener('change', () => onModeChange(sel.value));
    } catch (err) {
      console.error('Could not load versions', err);
    }
  }

  function onModeChange(value) {
    if (value === 'auto') {
      mode = { type: 'auto', version: null };
    } else {
      mode = { type: 'manual', version: value };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mode));
    if (lastReference) refreshDisplay();
  }

  function fontSizeForLength(len) {
    for (const row of fontTable) {
      if (len <= row.maxLength) return row.fontSize;
    }
    return fontTable.length ? fontTable[fontTable.length - 1].fontSize : 24;
  }

  function fitText() {
    const p = el('stageText');
    const inner = document.querySelector('.card-inner');
    const card = el('card');
    if (!p || !inner) return;

    const scale = Math.max(0.35, Math.min((card ? card.clientWidth : DESIGN_WIDTH) / DESIGN_WIDTH, 3));
    let size = Math.round(fontSizeForLength(p.textContent.length) * scale);
    p.style.fontSize = size + 'px';

    let guard = 0;
    const fits = () => inner.scrollHeight <= inner.clientHeight + 1;
    while (!fits() && size > MIN_FIT_SIZE && guard < 100) {
      size -= 1;
      p.style.fontSize = size + 'px';
      guard++;
    }
  }

  let hasRenderedOnce = false;

  function applyPayloadContent(payload) {
    el('stageRef').textContent = `${(payload.tagalogName || payload.book || '').toUpperCase()} ${payload.chapter}:${payload.verse}`;
    el('stageVersion').textContent = payload.versionDisplayName || payload.version || '';
    el('stageText').textContent = payload.found
      ? payload.text
      : (payload.hasData
          ? `${payload.tagalogName || payload.book} ${payload.chapter}:${payload.verse} is out of range.`
          : `No text loaded for this version yet.`);

    applyBackgroundTheme(el('card'), payload.background || 'default');
    lastSafeMargin = payload.safeMargin || 0;
    applySafeMargin(document.querySelector('.card-inner'), lastSafeMargin, el('card').clientWidth);

    const crEl = el('crossrefs');
    crEl.innerHTML = '';
    if (payload.crossrefs && payload.crossrefs.length) {
      crEl.classList.remove('empty');
      payload.crossrefs.forEach(label => {
        const a = document.createElement('a');
        a.textContent = label;
        crEl.appendChild(a);
      });
    } else {
      crEl.classList.add('empty');
    }

    fitText();
  }

  function renderPayload(payload) {
    if (!payload) return;
    const inner = document.querySelector('.card-inner');

    // Don't fade on the very first paint — only when swapping one verse for another.
    if (!hasRenderedOnce) {
      hasRenderedOnce = true;
      applyPayloadContent(payload);
      return;
    }

    inner.classList.add('fading');
    setTimeout(() => {
      applyPayloadContent(payload);
      inner.classList.remove('fading');
    }, 150);
  }

  // Called whenever a new reference arrives from the operator, AND whenever
  // the viewer switches version mode locally.
  async function refreshDisplay() {
    if (!lastReference) return;
    const opPayload = lastReference.operatorPayload;

    if (mode.type === 'auto') {
      renderPayload(opPayload);
      return;
    }

    // Manual mode: fetch this same book/chapter/verse in the viewer's own
    // chosen version, independent of whatever the operator is showing.
    // Background/safe-margin are production settings for the room, not
    // Bible content, so those always come from the operator regardless of
    // which version the viewer is reading.
    try {
      const { book, chapter, verse } = lastReference;
      const res = await fetch(`/api/verses?version=${encodeURIComponent(mode.version)}&book=${encodeURIComponent(book)}&chapter=${chapter}&verse=${verse}`);
      const data = await res.json();
      renderPayload({ ...data, background: opPayload.background, safeMargin: opPayload.safeMargin });
    } catch (err) {
      console.error('Could not load verse in manual version', err);
    }
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws?role=viewer&operator=${encodeURIComponent(operatorUsername)}`);

    ws.addEventListener('open', () => {
      el('connBadge').classList.add('connected');
    });
    ws.addEventListener('close', () => {
      el('connBadge').classList.remove('connected');
      el('connBadge').textContent = 'Disconnected — retrying…';
      setTimeout(connect, 2000);
    });
    ws.addEventListener('error', () => ws.close());
    ws.addEventListener('message', evt => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'verse') {
          lastReference = {
            book: msg.payload.book,
            chapter: msg.payload.chapter,
            verse: msg.payload.verse,
            operatorPayload: msg.payload
          };
          refreshDisplay();
        }
      } catch (err) {
        console.error('Bad message from server', err);
      }
    });
  }

  window.addEventListener('resize', () => {
    fitText();
    applySafeMargin(document.querySelector('.card-inner'), lastSafeMargin, el('card').clientWidth);
  });

  Promise.all([loadFontTable(), loadVersions()]).then(connect);
})();
