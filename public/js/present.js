(() => {
  'use strict';

  const el = id => document.getElementById(id);
  const DESIGN_WIDTH = 1920;
  const MIN_FIT_SIZE = 15;
  let fontTable = [];

  async function loadFontTable() {
    try {
      const res = await fetch('/api/font-settings');
      fontTable = await res.json();
    } catch (err) {
      console.error('Could not load font settings', err);
    }
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

  function render(payload) {
    if (!payload) return;
    el('stageRef').textContent = `${(payload.tagalogName || payload.book || '').toUpperCase()} ${payload.chapter}:${payload.verse}`;
    el('stageVersion').textContent = payload.versionDisplayName || payload.version || '';
    el('stageText').textContent = payload.found
      ? payload.text
      : (payload.hasData
          ? `${payload.tagalogName || payload.book} ${payload.chapter}:${payload.verse} is out of range.`
          : `No text loaded for this version yet.`);

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

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);

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
        if (msg.type === 'verse') render(msg.payload);
      } catch (err) {
        console.error('Bad message from server', err);
      }
    });
  }

  window.addEventListener('resize', fitText);

  loadFontTable().then(connect);
})();
