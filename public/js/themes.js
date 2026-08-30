// Background themes for the presentation card. "default" uses your own
// photo at /img/background.jpg. Solid/gradient themes are kept dark on
// purpose — the verse text color (white/yellow) is hardcoded for
// readability against dark backgrounds, so a light theme would make text
// hard to read; if you want a light theme later, the text color rules in
// style.css would need a per-theme override too.
//
// To add more (e.g. a themed background for a special event), add an entry
// here with type:'image' and a src pointing to a file you've placed under
// /img/backgrounds/, then it'll show up in both the operator's dropdown and
// on the viewer side automatically — nothing else to wire up.
const BACKGROUND_THEMES = [
  { key: 'default', label: 'Default', type: 'image', src: '/img/background.jpg' },
  { key: 'black', label: 'Black', type: 'color', value: '#000000' },
  { key: 'chroma', label: 'Chroma (Green Screen)', type: 'color', value: '#00b140' },
  { key: 'navy', label: 'Navy', type: 'color', value: '#0a1a4a' },
  { key: 'classic', label: 'Classic Bible', type: 'gradient',
    value: 'radial-gradient(140% 120% at 50% 0%, rgba(224,168,60,0.14), transparent 60%), linear-gradient(165deg, #2b1810 0%, #1a0f08 55%, #0d0704 100%)' }
];

function applyBackgroundTheme(cardEl, themeKey) {
  const theme = BACKGROUND_THEMES.find(t => t.key === themeKey) || BACKGROUND_THEMES[0];
  if (theme.type === 'image') {
    cardEl.style.backgroundColor = '#081226';
    cardEl.style.backgroundImage = `url('${theme.src}')`;
  } else if (theme.type === 'gradient') {
    cardEl.style.backgroundImage = theme.value;
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
