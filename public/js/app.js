(() => {
  'use strict';

  const state = {
    books: [],            // [{key, tagalogName, chapterCount}]
    versions: [],         // [{code, displayName, language, hasData}]
    current: { book: 'Genesis', chapter: 1, verse: 1, version: 'ADB', background: 'default', safeMargin: 0 },
    autoResize: true,
    fontStep: 2,           // 1 small, 2 medium, 3 large — manual mode only
    fontTable: [],         // [{rangeIndex, minLength, maxLength, fontSize}]
    operator: null,        // { id, locale, operatorName, label, isPublic, lastVersion, lastBook, lastChapter, lastVerse, lastBackground, lastSafeMargin }
    history: [],           // recently shown references, most recent last
    previewMode: { type: 'auto', version: null }, // local-only, doesn't affect the broadcast
    blank: false
  };
  const FONT_SIZES = { 1: 34, 2: 40, 3: 46 };
  const DESIGN_WIDTH = 1920;
  const MIN_FIT_SIZE = 15;
  const MAX_HISTORY = 25;

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

  // ---------- Entry (no login — just claim a locale + operator name) ----------
  async function boot() {
    wireAuthForm();
    trapFocus(el('authOverlay'));
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

  function wireAuthForm() {
    el('authSubmit').addEventListener('click', submitAuthForm);
    [el('authLocale'), el('authOperatorName')].forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submitAuthForm(); });
    });

    el('authLocale').addEventListener('input', debounce(checkOperatorAvailability, 350));
    el('authOperatorName').addEventListener('input', debounce(checkOperatorAvailability, 350));
  }

  // Informational only — no password gate anymore, so this just lets someone
  // know they'd be taking over an already-active room, not creating a conflict.
  async function checkOperatorAvailability() {
    const statusEl = el('authLocaleStatus');
    const locale = el('authLocale').value.trim();
    const operatorName = el('authOperatorName').value.trim();
    if (locale.length < 2 || operatorName.length < 2) { statusEl.textContent = ''; statusEl.className = 'auth-help'; return; }

    statusEl.textContent = 'Checking…';
    statusEl.className = 'auth-help status-checking';
    try {
      const data = await api(`/auth/check-operator?locale=${encodeURIComponent(locale)}&operatorName=${encodeURIComponent(operatorName)}`);
      if (!data.valid) {
        statusEl.textContent = '2-40 characters — letters, numbers, spaces, hyphens.';
        statusEl.className = 'auth-help status-taken';
      } else if (data.available) {
        statusEl.textContent = `"${operatorName}" is free under "${locale}".`;
        statusEl.className = 'auth-help status-available';
      } else {
        statusEl.textContent = `"${operatorName}" is already active under "${locale}" — continuing will take over that room.`;
        statusEl.className = 'auth-help status-checking';
      }
    } catch (err) {
      statusEl.textContent = '';
    }
  }

  async function submitAuthForm() {
    const locale = el('authLocale').value.trim();
    const operatorName = el('authOperatorName').value.trim();
    const isPublic = (document.querySelector('input[name="authVisibility"]:checked') || {}).value !== 'private';
    const errorEl = el('authError');
    errorEl.textContent = '';

    try {
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, operatorName, isPublic })
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
    el('accountBadge').textContent = `${state.operator.label} · ${state.operator.isPublic ? 'Public' : 'Private'}`;
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
      showToast(state.operator.isPublic ? 'Now listed on the presenter picker.' : 'Now private — direct link only.');
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
        version: state.operator.lastVersion || state.current.version,
        background: state.operator.lastBackground || 'default',
        safeMargin: state.operator.lastSafeMargin || 0
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
      pushHistory();
      state.current.book = chapterJump.value;
      state.current.chapter = 1;
      state.current.verse = 1;
      render();
    });

    const bgSelect = el('bgSelect');
    BACKGROUND_THEMES.forEach(t => bgSelect.add(new Option(t.label, t.key)));
    bgSelect.value = state.current.background;
    applyBackgroundTheme(el('card'), state.current.background);
    bgSelect.addEventListener('change', () => {
      state.current.background = bgSelect.value;
      applyBackgroundTheme(el('card'), state.current.background);
      render();
    });

    const safeMarginSelect = el('safeMarginSelect');
    safeMarginSelect.value = String(state.current.safeMargin || 0);
    applySafeMargin(document.querySelector('.card-inner'), state.current.safeMargin, el('card').clientWidth);
    safeMarginSelect.addEventListener('change', () => {
      state.current.safeMargin = parseInt(safeMarginSelect.value, 10);
      applySafeMargin(document.querySelector('.card-inner'), state.current.safeMargin, el('card').clientWidth);
      render();
    });

    const previewModeSelect = el('previewModeSelect');
    const previewVersionSelect = el('previewVersionSelect');
    state.versions.filter(v => v.hasData).forEach(v => previewVersionSelect.add(new Option(v.displayName, v.code)));
    previewModeSelect.addEventListener('change', () => {
      const manual = previewModeSelect.value === 'manual';
      previewVersionSelect.style.display = manual ? '' : 'none';
      state.previewMode = manual
        ? { type: 'manual', version: previewVersionSelect.value || (state.versions.find(v => v.hasData) || {}).code }
        : { type: 'auto', version: null };
      if (manual) previewVersionSelect.value = state.previewMode.version;
      if (manual) applyLocalPreviewOverride(); else render();
    });
    previewVersionSelect.addEventListener('change', () => {
      state.previewMode.version = previewVersionSelect.value;
      applyLocalPreviewOverride();
    });

    el('prevBtn').addEventListener('click', () => step(-1));
    el('nextBtn').addEventListener('click', () => step(1));
    el('jumpBox').addEventListener('keydown', e => { if (e.key === 'Enter') jumpTo(); });
    el('fontBtn').addEventListener('click', cycleFont);
    el('arBtn').addEventListener('click', toggleAutoResize);
    el('searchBtn').addEventListener('click', openSearch);
    el('historyBtn').addEventListener('click', openHistory);
    el('copyVerseBtn').addEventListener('click', copyVerseToClipboard);
    el('blankScreenBtn').addEventListener('click', toggleBlankScreen);
    el('sBtn').addEventListener('click', openFontSettings);
    el('refreshBtn').addEventListener('click', render);
    el('topBtn').addEventListener('click', toggleFullscreen);
    el('minBtn').addEventListener('click', toggleToolbar);
    el('closeBtn').addEventListener('click', exitPresentation);
    el('logoutBtn').addEventListener('click', logout);
    el('toggleVisibilityBtn').addEventListener('click', toggleVisibility);

    el('openPresenterBtn').addEventListener('click', () => {
      window.open(`/present?locale=${encodeURIComponent(state.operator.locale)}`, 'mcgi-presenter', 'noopener');
    });
    el('copyLinkBtn').addEventListener('click', copyPresenterLink);
    connectPresenceSocket();
    startHeartbeat();

    el('fsCloseX').addEventListener('click', closeFontSettings);
    el('fsCancel').addEventListener('click', closeFontSettings);
    el('fsSave').addEventListener('click', saveFontSettings);

    el('searchCloseX').addEventListener('click', closeSearch);
    el('searchInput').addEventListener('input', debounce(doSearch, 200));
    el('searchInput').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); navigateResultList(el('searchResults'), 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); navigateResultList(el('searchResults'), -1); }
      else if (e.key === 'Enter') { e.preventDefault(); activateSelectedResult(el('searchResults')); }
    });
    el('historyCloseX').addEventListener('click', closeHistory);

    window.addEventListener('resize', () => fitText());
    document.addEventListener('fullscreenchange', () => setTimeout(fitText, 50));
    document.addEventListener('keydown', handleGlobalKeydown);
    [el('fsOverlay'), el('searchOverlay'), el('historyOverlay')].forEach(trapFocus);

    render();
  }

  // ---------- Keyboard shortcuts ----------
  // Ignored while typing in a text field/select, except Escape (which should
  // always be able to close a dialog, even from inside the search box).
  function isTypingTarget(node) {
    return node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT');
  }

  function closeAnyOpenDialog() {
    const overlays = ['fsOverlay', 'searchOverlay', 'historyOverlay'];
    for (const id of overlays) {
      const overlay = el(id);
      if (overlay && overlay.classList.contains('open')) {
        overlay.classList.remove('open');
        return true;
      }
    }
    return false;
  }

  // Keeps Tab/Shift+Tab cycling within an open dialog instead of escaping to
  // the page behind it. Safe to attach once — the overlay stays in the DOM,
  // and closed overlays use visibility:hidden, which browsers already
  // exclude from the tab order on their own.
  function trapFocus(overlayEl) {
    overlayEl.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(
        overlayEl.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')
      ).filter(elm => !elm.disabled && elm.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });
  }

  function handleGlobalKeydown(e) {
    if (e.key === 'Escape') {
      closeAnyOpenDialog();
      return;
    }

    if (el('historyOverlay').classList.contains('open')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); navigateResultList(el('historyResults'), 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); navigateResultList(el('historyResults'), -1); }
      else if (e.key === 'Enter') { e.preventDefault(); activateSelectedResult(el('historyResults')); }
      return;
    }
    if (el('searchOverlay').classList.contains('open')) return; // search input handles its own arrow keys

    if (isTypingTarget(document.activeElement)) return;

    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === '/') { e.preventDefault(); openSearch(); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); }
    else if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleBlankScreen(); }
  }

  // Keeps a lightweight WebSocket open purely so this operator shows up as
  // "online" on the presenter picker, and to receive live viewer-count updates.
  function connectPresenceSocket() {
    updateConnStatus('connecting');
    api('/auth/ws-token').then(({ token }) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws?role=operator&token=${token}`);
      ws.addEventListener('open', () => updateConnStatus('connected'));
      ws.addEventListener('message', evt => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'viewerCount') updateViewerCountBadge(msg.count);
        } catch (err) { /* ignore malformed messages */ }
      });
      ws.addEventListener('close', () => {
        updateConnStatus('reconnecting');
        setTimeout(connectPresenceSocket, 3000);
      });
      ws.addEventListener('error', () => ws.close());
    }).catch(() => {
      updateConnStatus('reconnecting');
      setTimeout(connectPresenceSocket, 3000);
    });
  }

  function updateConnStatus(status) {
    const badge = el('connStatusBadge');
    if (!badge) return;
    badge.classList.remove('connected', 'reconnecting');
    if (status === 'connected') {
      badge.textContent = 'Connected';
      badge.classList.add('connected');
    } else if (status === 'reconnecting') {
      badge.textContent = 'Reconnecting…';
      badge.classList.add('reconnecting');
    } else {
      badge.textContent = 'Connecting…';
    }
  }

  function updateViewerCountBadge(count) {
    const badge = el('viewerCountBadge');
    if (!badge) return;
    badge.textContent = count === 1 ? '1 watching' : `${count} watching`;
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
        body: JSON.stringify({
          version, book, chapter, verse,
          background: state.current.background,
          safeMargin: state.current.safeMargin
        })
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
    await applyLocalPreviewOverride();
  }

  // ---------- Local Preview mode (operator-only, doesn't affect the broadcast) ----------
  async function applyLocalPreviewOverride() {
    if (state.previewMode.type !== 'manual' || !state.previewMode.version) return;
    const { book, chapter, verse } = state.current;
    try {
      const data = await api(`/verses?version=${encodeURIComponent(state.previewMode.version)}&book=${encodeURIComponent(book)}&chapter=${chapter}&verse=${verse}`);
      const versionInfo = state.versions.find(v => v.code === state.previewMode.version);
      el('stageVersion').textContent = (versionInfo ? versionInfo.displayName : state.previewMode.version) + ' (preview)';
      el('stageText').textContent = data.found
        ? data.text
        : `No text loaded for this preview version at ${book} ${chapter}:${verse}.`;
      fitText();
    } catch (err) {
      console.error('Could not load local preview version', err);
    }
  }

  async function step(dir) {
    pushHistory();
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
        pushHistory();
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

  // ---------- Emergency Blank Screen ----------
  async function toggleBlankScreen() {
    state.blank = !state.blank;
    el('blankScreenBtn').classList.toggle('blank-active', state.blank);
    el('blankScreenBtn').textContent = state.blank ? 'Unblank Screen' : 'Blank Screen';
    try {
      await api('/live-state/blank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blank: state.blank })
      });
      showToast(state.blank ? 'Presenter is now blank.' : 'Presenter restored.');
    } catch (err) {
      showToast('Could not update blank screen — is the server running?');
    }
  }

  // ---------- Copy Presenter Link ----------
  async function copyPresenterLink() {
    const link = `${location.origin}/present?locale=${encodeURIComponent(state.operator.locale)}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Presenter link copied.');
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = link;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showToast('Presenter link copied.');
      } catch (err2) {
        showToast('Could not copy — try selecting the link manually.');
      }
      textarea.remove();
    }
  }

  // ---------- Heartbeat (keeps this 1-hour temporary account alive while the panel is open) ----------
  function startHeartbeat() {
    setInterval(() => {
      api('/auth/heartbeat', { method: 'POST' }).catch(() => { /* next tick will retry */ });
    }, 2 * 60 * 1000);
  }

  // ---------- Copy Verse ----------
  async function copyVerseToClipboard() {
    const ref = el('stageRef').textContent.trim();
    const version = el('stageVersion').textContent.trim();
    const text = el('stageText').textContent.trim();
    const formatted = `${ref} (${version})\n${text}`;

    try {
      await navigator.clipboard.writeText(formatted);
      showToast('Verse copied to clipboard.');
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = formatted;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showToast('Verse copied to clipboard.');
      } catch (err2) {
        showToast('Could not copy — try selecting the text manually.');
      }
      textarea.remove();
    }
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

  // Arrow-key navigation shared by any results list rendered as
  // .search-result rows inside a container — used by both Search and History.
  function navigateResultList(containerEl, direction) {
    const items = Array.from(containerEl.querySelectorAll('.search-result'));
    if (!items.length) return;
    let index = items.findIndex(item => item.classList.contains('selected'));
    items.forEach(item => item.classList.remove('selected'));
    index = index === -1 ? (direction > 0 ? 0 : items.length - 1) : (index + direction + items.length) % items.length;
    items[index].classList.add('selected');
    items[index].scrollIntoView({ block: 'nearest' });
  }
  function activateSelectedResult(containerEl) {
    const selected = containerEl.querySelector('.search-result.selected') || containerEl.querySelector('.search-result');
    if (selected) selected.click();
  }

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
      : '';

    if (!data.results.length) {
      resultsEl.innerHTML = `<div class="empty-dialog-state">🔍<br>No matches for "${escapeHtml(query)}".</div>`;
      return;
    }

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
        pushHistory();
        state.current.book = m.bookKey;
        state.current.chapter = m.chapter;
        state.current.verse = m.verse;
        el('chapterJump').value = m.bookKey;
        render();
        closeSearch();
      });
    });
  }

  // ---------- History (H button) ----------
  function pushHistory() {
    const snap = { ...state.current };
    delete snap._meta;
    const last = state.history[state.history.length - 1];
    if (last && last.book === snap.book && last.chapter === snap.chapter &&
        last.verse === snap.verse && last.version === snap.version) {
      return; // don't record a no-op
    }
    state.history.push(snap);
    if (state.history.length > MAX_HISTORY) state.history.shift();
  }

  function openHistory() {
    const resultsEl = el('historyResults');
    const metaEl = el('historyMeta');
    const entries = state.history.slice().reverse(); // most recent first

    metaEl.textContent = entries.length
      ? `${entries.length} recent reference${entries.length === 1 ? '' : 's'} — click to go back.`
      : '';

    if (!entries.length) {
      resultsEl.innerHTML = `<div class="empty-dialog-state">🕘<br>Nothing shown yet this session.</div>`;
      el('historyOverlay').classList.add('open');
      return;
    }

    resultsEl.innerHTML = entries.map((entry, i) => {
      const ref = `${displayBookName(entry.book)} ${entry.chapter}:${entry.verse}`;
      const versionInfo = state.versions.find(v => v.code === entry.version);
      return `<div class="search-result" data-i="${i}">
        <div class="sr-ref">${ref}</div>
        <div class="sr-text">${versionInfo ? versionInfo.displayName : entry.version}</div>
      </div>`;
    }).join('');

    resultsEl.querySelectorAll('.search-result').forEach((rowEl, i) => {
      rowEl.addEventListener('click', () => {
        const entry = entries[i];
        state.current.book = entry.book;
        state.current.chapter = entry.chapter;
        state.current.verse = entry.verse;
        state.current.version = entry.version;
        el('chapterJump').value = entry.book;
        el('version').value = entry.version;
        render();
        closeHistory();
      });
    });

    el('historyOverlay').classList.add('open');
  }

  function closeHistory() {
    el('historyOverlay').classList.remove('open');
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
