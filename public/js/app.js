(() => {
  'use strict';

  const state = {
    books: [],            // [{key, tagalogName, chapterCount}]
    versions: [],         // [{code, displayName, language, hasData}]
    current: { book: 'Genesis', chapter: 1, verse: 1, version: 'ADB' },
    autoResize: true,
    fontStep: 2,           // 1 small, 2 medium, 3 large — manual mode only
    fontTable: [],         // [{rangeIndex, minLength, maxLength, fontSize}]
    operator: null,        // { id, locale, isPublic, lastVersion, lastBook, lastChapter, lastVerse }
    authMode: 'login'      // 'login' | 'register'
  };
  const FONT_SIZES = { 1: 34, 2: 40, 3: 46 };
  const DESIGN_WIDTH = 1920;
  const MIN_FIT_SIZE = 15;

  const el = id => document.getElementById(id);

  async function api(path, opts) {
    const res = await fetch('/api' + path, opts);
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
    return res.json();
  }

  function bookByKey(key) {
    return state.books.find(b => b.key === key);
  }
  function displayBookName(key) {
    const b = bookByKey(key);
    return b ? b.tagalogName : key;
  }

  // ---------- Auth (login/register gate) ----------
  async function boot() {
    wireAuthForm();
    const me = await api('/auth/me').catch(() => null);
    if (me) {
      state.operator = me;
      await enterConsole();
    } else {
      showAuthOverlay();
    }
  }

  function showAuthOverlay() {
    el('authOverlay').classList.add('open');
    el('mainConsole').style.display = 'none';
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    el('authTitle').textContent = mode === 'login' ? 'Operator Sign In' : 'Register a Locale';
    el('authSubmit').textContent = mode === 'login' ? 'Sign In' : 'Register';
    el('authVisibilityField').style.display = mode === 'register' ? '' : 'none';
    el('authSwitchText').textContent = mode === 'login' ? 'No locale registered yet?' : 'Already have one?';
    el('authSwitchLink').textContent = mode === 'login' ? 'Register one' : 'Sign in instead';
    el('authError').textContent = '';
  }

  function wireAuthForm() {
    setAuthMode('login');
    el('authSwitchLink').addEventListener('click', e => {
      e.preventDefault();
      setAuthMode(state.authMode === 'login' ? 'register' : 'login');
    });
    el('authSubmit').addEventListener('click', submitAuthForm);
    [el('authLocale'), el('authPassword')].forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submitAuthForm(); });
    });
  }

  async function submitAuthForm() {
    const locale = el('authLocale').value.trim();
    const password = el('authPassword').value;
    const isPublic = (document.querySelector('input[name="authVisibility"]:checked') || {}).value !== 'private';
    const errorEl = el('authError');
    errorEl.textContent = '';

    const path = state.authMode === 'login' ? '/auth/login' : '/auth/register';
    const body = state.authMode === 'login'
      ? { locale, password }
      : { locale, password, isPublic };

    try {
      const res = await fetch('/api' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Something went wrong.';
        return;
      }
      state.operator = data;
      el('authOverlay').classList.remove('open');
      await enterConsole();
    } catch (err) {
      errorEl.textContent = 'Could not reach the server.';
    }
  }

  function updateAccountBadge() {
    el('accountBadge').textContent = `${state.operator.locale} · ${state.operator.isPublic ? 'Public' : 'Private'}`;
    el('toggleVisibilityBtn').textContent = state.operator.isPublic ? 'Make Private' : 'Make Public';
  }

  async function toggleVisibility() {
    try {
      const updated = await api('/auth/visibility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !state.operator.isPublic })
      });
      state.operator = updated;
      updateAccountBadge();
      showToast(state.operator.isPublic ? 'Now listed on the homepage.' : 'Now private — direct link only.');
    } catch (err) {
      showToast('Could not update visibility.');
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    location.reload();
  }

  // ---------- Console setup (runs once logged in) ----------
  async function enterConsole() {
    el('mainConsole').style.display = '';
    updateAccountBadge();

    [state.books, state.versions, state.fontTable] = await Promise.all([
      api('/books'),
      api('/versions'),
      api('/font-settings')
    ]);

    // Resume where this operator left off, if they've navigated before.
    if (state.operator.lastBook && state.operator.lastChapter && state.operator.lastVerse) {
      state.current = {
        book: state.operator.lastBook,
        chapter: state.operator.lastChapter,
        verse: state.operator.lastVerse,
        version: state.operator.lastVersion || state.current.version
      };
    }

    const versionSel = el('version');
    state.versions.forEach(v => versionSel.add(new Option(v.displayName, v.code)));
    versionSel.value = state.current.version;
    versionSel.addEventListener('change', () => {
      state.current.version = versionSel.value;
      render();
    });

    const chapterJump = el('chapterJump');
    state.books.forEach(b => chapterJump.add(new Option(b.tagalogName, b.key)));
    chapterJump.value = state.current.book;
    chapterJump.addEventListener('change', () => {
      state.current.book = chapterJump.value;
      state.current.chapter = 1;
      state.current.verse = 1;
      render();
    });

    el('prevBtn').addEventListener('click', () => step(-1));
    el('nextBtn').addEventListener('click', () => step(1));
    el('jumpBox').addEventListener('keydown', e => { if (e.key === 'Enter') jumpTo(); });
    el('fontBtn').addEventListener('click', cycleFont);
    el('arBtn').addEventListener('click', toggleAutoResize);
    el('searchBtn').addEventListener('click', openSearch);
    el('sBtn').addEventListener('click', openFontSettings);
    el('refreshBtn').addEventListener('click', render);
    el('topBtn').addEventListener('click', toggleFullscreen);
    el('minBtn').addEventListener('click', toggleToolbar);
    el('closeBtn').addEventListener('click', exitPresentation);
    el('logoutBtn').addEventListener('click', logout);
    el('toggleVisibilityBtn').addEventListener('click', toggleVisibility);

    el('openPresenterBtn').addEventListener('click', () => {
      window.open(`/present?operator=${encodeURIComponent(state.operator.locale)}`, 'mcgi-presenter', 'noopener');
    });
    loadNetworkInfo();
    connectPresenceSocket();

    el('fsCloseX').addEventListener('click', closeFontSettings);
    el('fsCancel').addEventListener('click', closeFontSettings);
    el('fsSave').addEventListener('click', saveFontSettings);

    el('searchCloseX').addEventListener('click', closeSearch);
    el('searchInput').addEventListener('input', debounce(doSearch, 200));

    window.addEventListener('resize', () => fitText());
    document.addEventListener('fullscreenchange', () => setTimeout(fitText, 50));

    render();
  }

  // Keeps a lightweight WebSocket open purely so this operator shows up as
  // "online" on the /operators picker page. Reconnects automatically.
  function connectPresenceSocket() {
    api('/auth/ws-token').then(({ token }) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws?role=operator&token=${token}`);
      ws.addEventListener('close', () => setTimeout(connectPresenceSocket, 3000));
      ws.addEventListener('error', () => ws.close());
    }).catch(() => setTimeout(connectPresenceSocket, 3000));
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ---------- Rendering ----------
  let renderToken = 0;
  async function render() {
    const myToken = ++renderToken;
    const { book, chapter, verse, version } = state.current;

    el('stageRef').textContent = `${displayBookName(book).toUpperCase()} ${chapter}:${verse}`;
    const versionInfo = state.versions.find(v => v.code === version);
    el('stageVersion').textContent = versionInfo ? versionInfo.displayName : version;
    el('stageText').textContent = 'Loading…';

    let data;
    try {
      data = await api('/live-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, book, chapter, verse })
      });
    } catch (err) {
      console.error(err);
      el('stageText').textContent = 'Could not load verse — is the server running?';
      return;
    }
    if (myToken !== renderToken) return;

    state.current._meta = data; // stash bounds for step()

    el('stageText').textContent = data.found
      ? data.text
      : (data.hasData
          ? `${displayBookName(book)} ${chapter}:${verse} is out of range for this book/chapter.`
          : `No text loaded for "${el('version').selectedOptions[0].textContent}" yet.`);

    const crEl = el('crossrefs');
    crEl.innerHTML = '';
    if (data.crossrefs && data.crossrefs.length) {
      crEl.classList.remove('empty');
      data.crossrefs.forEach(label => {
        const a = document.createElement('a');
        a.textContent = label;
        crEl.appendChild(a);
      });
    } else {
      crEl.classList.add('empty');
    }

    fitText();
  }

  async function step(dir) {
    const meta = state.current._meta;
    const bookInfo = bookByKey(state.current.book);
    const maxChapter = bookInfo ? bookInfo.chapterCount : 999;
    const maxVerse = meta && meta.chapterVerseCount ? meta.chapterVerseCount : 176;

    state.current.verse += dir;

    if (state.current.verse < 1) {
      if (state.current.chapter > 1) {
        state.current.chapter -= 1;
        try {
          const cm = await api(`/verses/chapter-meta?version=${encodeURIComponent(state.current.version)}&book=${encodeURIComponent(state.current.book)}&chapter=${state.current.chapter}`);
          state.current.verse = cm.chapterVerseCount || 1;
        } catch (err) {
          state.current.verse = 1;
        }
      } else {
        state.current.verse = 1;
      }
    } else if (state.current.verse > maxVerse) {
      if (state.current.chapter < maxChapter) {
        state.current.chapter += 1;
        state.current.verse = 1;
      } else {
        state.current.verse = maxVerse;
      }
    }
    render();
  }

  function jumpTo() {
    const raw = el('jumpBox').value.trim();
    if (!raw) return;
    const m = raw.match(/^(.+?)\s+(\d+):(\d+)$/);
    if (m) {
      const typed = m[1].trim().toLowerCase();
      const found = state.books.find(b =>
        b.key.toLowerCase() === typed || b.tagalogName.toLowerCase() === typed
      );
      if (found) {
        state.current.book = found.key;
        state.current.chapter = parseInt(m[2], 10);
        state.current.verse = parseInt(m[3], 10);
        el('chapterJump').value = found.key;
        render();
        return;
      }
    }
    showToast('Type it like: John 3:16 or I Corinto 1:22');
  }

  function showToast(message, duration) {
    const stack = el('toastStack');
    if (!stack) { console.log(message); return; }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 250);
    }, duration || 3000);
  }

  // ---------- Auto-resize (matches the app's Font Setting table) ----------
  function fontSizeForLength(len) {
    for (const row of state.fontTable) {
      if (len <= row.maxLength) return row.fontSize;
    }
    return state.fontTable.length ? state.fontTable[state.fontTable.length - 1].fontSize : 24;
  }

  function fitText() {
    const p = el('stageText');
    const inner = document.querySelector('.card-inner');
    const card = el('card');
    if (!p || !inner) return;

    if (!state.autoResize) {
      p.style.fontSize = FONT_SIZES[state.fontStep] + 'px';
      return;
    }

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

  function cycleFont() {
    state.autoResize = false;
    el('arBtn').classList.remove('active');
    state.fontStep = state.fontStep >= 3 ? 1 : state.fontStep + 1;
    fitText();
  }

  function toggleAutoResize() {
    state.autoResize = !state.autoResize;
    el('arBtn').classList.toggle('active', state.autoResize);
    fitText();
  }

  // ---------- Font Setting dialog (persisted via API) ----------
  function rangeLabel(row) { return `${row.minLength} to ${row.maxLength}`; }

  function openFontSettings() {
    const len = el('stageText').textContent.length;
    let activeIndex = state.fontTable.findIndex(r => len <= r.maxLength);
    if (activeIndex === -1) activeIndex = state.fontTable.length - 1;

    const left = el('fsColLeft');
    const right = el('fsColRight');
    left.innerHTML = '';
    right.innerHTML = '';

    state.fontTable.forEach((row, i) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'fs-row' + (i === activeIndex ? ' active' : '');
      rowEl.innerHTML = `<label>${rangeLabel(row)}</label>
        <input type="number" min="8" max="200" value="${row.fontSize}" data-index="${row.rangeIndex}">`;
      (i < 7 ? left : right).appendChild(rowEl);
    });

    el('fsCurrent').textContent = `Current Content Length: ${len}`;
    el('fsOverlay').classList.add('open');
  }

  function closeFontSettings() {
    el('fsOverlay').classList.remove('open');
  }

  async function saveFontSettings() {
    const updates = [];
    document.querySelectorAll('#fsColLeft input, #fsColRight input').forEach(input => {
      updates.push({ rangeIndex: parseInt(input.dataset.index, 10), fontSize: parseInt(input.value, 10) });
    });
    try {
      state.fontTable = await api('/font-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (err) {
      console.error('Could not save font settings', err);
    }
    closeFontSettings();
    fitText();
  }

  // ---------- Search (server-side FTS5) ----------
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function highlight(text, query) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx)) +
      '<mark>' + escapeHtml(text.slice(idx, idx + query.length)) + '</mark>' +
      escapeHtml(text.slice(idx + query.length));
  }
  function snippet(text, query, radius) {
    radius = radius || 70;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + query.length + radius);
    let out = text.slice(start, end);
    if (start > 0) out = '… ' + out;
    if (end < text.length) out = out + ' …';
    return out;
  }

  function openSearch() {
    el('searchOverlay').classList.add('open');
    el('searchInput').value = '';
    el('searchResults').innerHTML = '';
    const versionInfo = state.versions.find(v => v.code === state.current.version);
    el('searchMeta').textContent = versionInfo && versionInfo.hasData
      ? `Searching ${versionInfo.displayName}`
      : `No full text loaded for this version — try Ang Dating Biblia or King James Version.`;
    setTimeout(() => el('searchInput').focus(), 30);
  }
  function closeSearch() { el('searchOverlay').classList.remove('open'); }

  async function doSearch() {
    const query = el('searchInput').value.trim();
    const resultsEl = el('searchResults');
    const metaEl = el('searchMeta');

    if (query.length < 2) {
      resultsEl.innerHTML = '';
      metaEl.textContent = 'Type at least 2 characters.';
      return;
    }

    let data;
    try {
      data = await api(`/search?version=${encodeURIComponent(state.current.version)}&q=${encodeURIComponent(query)}`);
    } catch (err) {
      metaEl.textContent = 'Search failed — is the server running?';
      return;
    }

    if (data.noData) {
      resultsEl.innerHTML = '';
      metaEl.textContent = `No full text loaded for this version — try Ang Dating Biblia or King James Version.`;
      return;
    }

    metaEl.textContent = data.results.length
      ? `${data.results.length}${data.truncated ? '+' : ''} match${data.results.length === 1 ? '' : 'es'}`
      : `No matches for "${query}".`;

    resultsEl.innerHTML = data.results.map((m, i) => {
      const ref = `${m.tagalogName} ${m.chapter}:${m.verse}`;
      const snip = snippet(m.text, query);
      return `<div class="search-result" data-i="${i}">
        <div class="sr-ref">${escapeHtml(ref)}</div>
        <div class="sr-text">${highlight(snip, query)}</div>
      </div>`;
    }).join('');

    resultsEl.querySelectorAll('.search-result').forEach((rowEl, i) => {
      rowEl.addEventListener('click', () => {
        const m = data.results[i];
        state.current.book = m.bookKey;
        state.current.chapter = m.chapter;
        state.current.verse = m.verse;
        el('chapterJump').value = m.bookKey;
        render();
        closeSearch();
      });
    });
  }

  async function loadNetworkInfo() {
    try {
      const info = await api('/network-info');
      const hint = el('presenterHint');
      const opParam = `?operator=${encodeURIComponent(state.operator.locale)}`;
      if (info.addresses && info.addresses.length) {
        const url = `http://${info.addresses[0]}:${info.port}/present${opParam}`;
        hint.innerHTML = `On another device (same WiFi): <code>${url}</code>`;
      } else {
        hint.textContent = 'On this computer: use the button above, or open /present in a second window.';
      }
    } catch (err) {
      console.error('Could not load network info', err);
    }
  }

  // ---------- Misc toolbar actions ----------
  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  }
  function toggleToolbar() {
    document.querySelectorAll('.toolbar > *:not(.tools)').forEach(elm => {
      elm.style.display = elm.style.display === 'none' ? '' : 'none';
    });
    document.querySelectorAll('.tools button:not(:last-child)').forEach(elm => {
      elm.style.display = elm.style.display === 'none' ? '' : 'none';
    });
  }
  function exitPresentation() {
    if (document.fullscreenElement) document.exitFullscreen();
  }

  boot();
})();
