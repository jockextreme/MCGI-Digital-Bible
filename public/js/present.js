(() => {
  'use strict';

  const el = id => document.getElementById(id);
  const DESIGN_WIDTH = 1920;
  const MIN_FIT_SIZE = 15;
  let fontTable = [];
  let versions = [];
  let lastReference = null; // { book, chapter, verse } from whatever the operator last sent
  let lastSafeMargin = 0;
  let frozen = false;
  let hasPendingUpdate = false;

  const params = new URLSearchParams(location.search);
  const locale = params.get('locale');

  if (!locale) {
    showOperatorPicker();
    return;
  }

  async function showOperatorPicker() {
    document.querySelector('.stage-shell').style.display = 'none';
    el('connBadge').style.display = 'none';
    document.querySelector('.version-mode').style.display = 'none';
    el('pickerShell').classList.add('show');

    el('pickerList').innerHTML = '<div class="picker-skeleton-row"></div><div class="picker-skeleton-row"></div><div class="picker-skeleton-row"></div>';

    let allOps = [];
    try {
      const res = await fetch('/api/operators/online');
      allOps = await res.json();
    } catch (err) { /* fall through to empty state */ }

    el('pickerList').innerHTML = '';

    if (!allOps.length) {
      el('pickerEmpty').style.display = 'block';
      return;
    }

    if (allOps.length > 5) el('pickerSearch').style.display = '';

    function escapeHtml(s) {
      return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderList(ops) {
      const listEl = el('pickerList');
      if (!ops.length) {
        listEl.innerHTML = '<p class="picker-empty">No locale matches that search.</p>';
        return;
      }
      listEl.innerHTML = ops.map(op => {
        const count = op.viewerCount || 0;
        const label = count === 1 ? '1 watching' : `${count} watching`;
        const displayLabel = op.operatorName ? `${op.locale} · ${op.operatorName}` : op.locale;
        return `<div class="picker-row" tabindex="0" role="button" aria-label="Follow ${escapeHtml(displayLabel)}, ${label}" data-locale="${escapeHtml(op.locale)}">
          <span class="locale">${escapeHtml(displayLabel)}</span>
          <span class="viewers">${label}</span>
        </div>`;
      }).join('');

      listEl.querySelectorAll('.picker-row').forEach(row => {
        const go = () => { location.href = `/present?locale=${encodeURIComponent(row.dataset.locale)}`; };
        row.addEventListener('click', go);
        row.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      });
    }

    renderList(allOps);

    el('pickerSearch').addEventListener('input', () => {
      const q = el('pickerSearch').value.trim().toLowerCase();
      renderList(q ? allOps.filter(op => op.locale.toLowerCase().includes(q)) : allOps);
    });
  }

  const STORAGE_KEY = `mcgi-version-mode:${locale}`;
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
    const card = el('card');
    if (payload.blank) {
      card.classList.add('emergency-blank');
      el('stageRef').textContent = '';
      el('stageVersion').textContent = '';
      el('stageText').textContent = '';
      document.title = 'MCGI Digital Bible';
      return;
    }
    card.classList.remove('emergency-blank');

    el('stageRef').textContent = `${(payload.tagalogName || payload.book || '').toUpperCase()} ${payload.chapter}:${payload.verse}`;
    el('stageVersion').textContent = payload.versionDisplayName || payload.version || '';
    el('stageText').textContent = payload.found
      ? payload.text
      : (payload.hasData
          ? `${payload.tagalogName || payload.book} ${payload.chapter}:${payload.verse} is out of range.`
          : `No text loaded for this version yet.`);

    // Viewer background is independent of whatever the operator has set for
    // their own broadcast (they may be using Chroma/Black for a production
    // overlay) — a plain viewer always gets the Default theme. Only one
    // option exists for viewers right now, but the localStorage read/write
    // is here so more viewer-selectable themes can slot in later without
    // restructuring this.
    const viewerTheme = localStorage.getItem('mcgi-viewer-bg') || 'default';
    applyBackgroundTheme(el('card'), viewerTheme);
    lastSafeMargin = payload.safeMargin || 0;
    applySafeMargin(document.querySelector('.card-inner'), lastSafeMargin, el('card').clientWidth);

    fitText();

    const ref = `${payload.tagalogName || payload.book} ${payload.chapter}:${payload.verse}`;
    document.title = `${ref} — ${locale} | MCGI Digital Bible`;

    const followBadge = el('followingBadge');
    if (followBadge) {
      followBadge.textContent = payload.operatorName ? `Following: ${locale} · ${payload.operatorName}` : `Following: ${locale}`;
    }
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
      renderPayload({ ...data, safeMargin: opPayload.safeMargin });
    } catch (err) {
      console.error('Could not load verse in manual version', err);
    }
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    el('connBadge').classList.remove('connected');
    el('connBadge').textContent = 'Connecting…';
    const ws = new WebSocket(`${proto}//${location.host}/ws?role=viewer&locale=${encodeURIComponent(locale)}`);

    ws.addEventListener('open', () => {
      el('connBadge').classList.add('connected');
      el('connBadge').textContent = 'Live';
      const badge = el('followingBadge');
      badge.textContent = `Following: ${locale}`;
      badge.style.display = '';
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
          if (frozen) {
            hasPendingUpdate = true;
          } else {
            refreshDisplay();
          }
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

  function toggleFreeze() {
    frozen = !frozen;
    const badge = el('freezeBadge');
    if (frozen) {
      badge.style.display = '';
      badge.textContent = 'Paused — press P to resume';
    } else {
      badge.style.display = 'none';
      if (hasPendingUpdate) { hasPendingUpdate = false; refreshDisplay(); }
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen();
    } else if (e.key === 'p' || e.key === 'P') {
      toggleFreeze();
    }
  });

  Promise.all([loadFontTable(), loadVersions()]).then(connect);
})();
