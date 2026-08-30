// Background themes for the presentation card. "default" uses your own
// photo at /img/background.jpg. "black" and "chroma" are solid colors —
// chroma is a standard green-screen green, for compositing the card into a
// live production (OBS, vMix, etc.) with the background keyed out.
//
// To add more (e.g. a themed background for a special event), add an entry
// here with type:'image' and a src pointing to a file you've placed under
// /img/backgrounds/, then it'll show up in both the operator's dropdown and
// on the viewer side automatically — nothing else to wire up.
const BACKGROUND_THEMES = [
  { key: 'default', label: 'Default', type: 'image', src: '/img/background.jpg' },
  { key: 'black', label: 'Black', type: 'color', value: '#000000' },
  { key: 'chroma', label: 'Chroma (Green Screen)', type: 'color', value: '#00b140' }
];

function applyBackgroundTheme(cardEl, themeKey) {
  const theme = BACKGROUND_THEMES.find(t => t.key === themeKey) || BACKGROUND_THEMES[0];
  if (theme.type === 'image') {
    cardEl.style.backgroundColor = '#081226';
    cardEl.style.backgroundImage = `url('${theme.src}')`;
  } else {
    cardEl.style.backgroundImage = 'none';
    cardEl.style.backgroundColor = theme.value;
  }
  cardEl.dataset.theme = theme.key;
}

// Safe Margin — broadcast-safe padding so text doesn't sit right at the edge
// when this card gets captured by a camera or composited into a TV/stream
// output. Values (0/300/400/500) are pixel amounts at the 1920px reference
// width the rest of the display sizing already uses, then scaled down to
// whatever size the card actually is on screen.
const SAFE_MARGIN_OPTIONS = [0, 300, 400, 500];
const SAFE_MARGIN_DESIGN_WIDTH = 1920;

function applySafeMargin(cardInnerEl, marginPx, cardWidthPx) {
  const scale = Math.max(0.2, Math.min((cardWidthPx || SAFE_MARGIN_DESIGN_WIDTH) / SAFE_MARGIN_DESIGN_WIDTH, 3));
  const scaled = Math.round((marginPx || 0) * scale);
  cardInnerEl.style.setProperty('--safe-margin', scaled + 'px');
}
