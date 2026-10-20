'use strict';

// Ortak arayüz yardımcıları (giriş ve ana pencere) — Mastertool ailesiyle ortak; 3B simgeleri Master 3D'ye özgü

// --- Dil ------------------------------------------------------------------------
const LANG = window.api.lang || 'en';
const t = I18N.createT(LANG);
document.documentElement.lang = LANG;
document.documentElement.dir = (I18N.LANGUAGES[LANG] || {}).dir || 'ltr';

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  move: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  play: '<path d="M7 5v14l11-7z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  home: '<path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  export: '<path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
  bolt: '<path d="M13 3 4 14h7l-1 7 9-11h-7z"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  cloud: '<path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
  cloudOff: '<path d="M3 3l18 18M8.5 5.4A6 6 0 0 1 18 9a4.5 4.5 0 0 1 2.4 8.3M15 18H7a5 5 0 0 1-1.6-9.7"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  radar: '<circle cx="12" cy="12" r="2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7"/><path d="M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/><path d="m12 12 2.5-2.5"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  router: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M11 16.5h.01M12 13V8M8.5 5.5a5 5 0 0 1 7 0"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20"/>',
  printer: '<path d="M6 9V4h12v5M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
  camera: '<path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><path d="M7.5 8h.01"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  sortAsc: '<path d="M6 4v16M3 7l3-3 3 3M12 8h8M12 12h6M12 16h4"/>',
  sortDesc: '<path d="M6 4v16M3 17l3 3 3-3M12 8h4M12 12h6M12 16h8"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  csv: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8 13h8M8 17h8M8 9h2"/>',
  json: '<path d="M8 4a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2M16 4a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2"/>',
  power: '<path d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  folderOpen: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1"/><path d="M3 7v10a2 2 0 0 0 2 2h12.5a2 2 0 0 0 1.9-1.4L21.5 12H7.2a2 2 0 0 0-1.9 1.4L3 19"/>',
  fileCode: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M10 12l-2 2 2 2M14 12l2 2-2 2"/>',
  fileText: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 16v-4h1.2a1.2 1.2 0 0 1 0 2.4H8.5M12.5 16v-4h1a2 2 0 0 1 0 4zM17 12h-1.6v4M15.4 14h1.3"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
  slides: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4M8 21h8"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
  markdown: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M6 15V9l2.5 3L11 9v6M15.5 9v6M13.5 13l2 2 2-2"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
  fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  actual: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8.5 9.5 10 8.5V15.5M14 9.5l1.5-1V15.5M12 11h.01M12 14h.01"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  reveal: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="2.2"/><path d="m13.6 14.6 2 2"/>',
  wrap: '<path d="M3 6h18M3 12h15a3 3 0 0 1 0 6h-4M3 18h7M16 16l-2 2 2 2"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
  tray: '<path d="M4 13h4l1.5 3h5L16 13h4"/><path d="M4 13 6.5 5h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  explode: '<rect x="9" y="9" width="6" height="6" rx="1"/><path d="M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3"/><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/>',
  grid: '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
  axes: '<path d="M5 19V4M5 19h15M5 19l9-9"/><path d="m3 6 2-2 2 2M18 17l2 2-2 2"/>',
  bbox: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="m12 7 5 2.8v5.4L12 18l-5-2.8V9.8z"/>',
  ruler: '<path d="m3 17 14-14 4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  section: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" opacity=".45"/><path d="M2 13.5h20"/><path d="m4 13.5 8 4.5 8-4.5"/>',
  shaded: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" opacity=".35" stroke="none"/>',
  wire: '<circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="3.5" ry="8"/><path d="M4 12h16M5.5 7.5h13M5.5 16.5h13"/>',
  edgesMode: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" fill="currentColor" fill-opacity=".18"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  xray: '<circle cx="12" cy="12" r="8" stroke-dasharray="2.5 2.5"/><circle cx="12" cy="12" r="3.5"/>',
  normals: '<path d="M3 18h18"/><path d="M7 18V9M7 9l-2 2M7 9l2 2M12 18V6M12 6l-2 2M12 6l2 2M17 18V9M17 9l-2 2M17 9l2 2"/>',
  shadow: '<circle cx="12" cy="9" r="5"/><ellipse cx="12" cy="19.5" rx="7" ry="1.5" fill="currentColor" opacity=".35" stroke="none"/>',
  focus: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3"/>',
  perspective: '<path d="M4 6l16-3v18L4 18z"/><path d="M4 12h16"/>',
  ortho: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h16M12 4v16"/>',
  split: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M8 7 4 12l4 5M16 7l4 5-4 5"/>',
  isolate: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  rotate3d: '<path d="M21 12a9 3.5 0 1 1-9-3.5"/><path d="m9.5 6 2.5 2.5L9.5 11"/><path d="M12 3v18" opacity=".5"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.6 1.7-1.6H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="7" r="1" fill="currentColor"/>',
  light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
};

function icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(LANG, { dateStyle: 'short', timeStyle: 'short' });
}

// Soldan sağa kalması gereken kısa değerler (IP, MAC, ms) sağdan sola dillerde ters görünmesin
const ltr = (s) => `⁦${s}⁩`;

function h(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

// --- Bağlam menüsü ------------------------------------------------------------
let activeCtx = null;
function closeContextMenu() {
  if (activeCtx) { activeCtx.remove(); activeCtx = null; }
}
function contextMenu(x, y, items) {
  closeContextMenu();
  const menu = h('<div class="ctx"></div>');
  for (const it of items) {
    if (it === '-') { menu.appendChild(h('<hr>')); continue; }
    if (!it) continue;
    const b = h(`<button class="${it.danger ? 'danger' : ''}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span>${it.kbd ? `<span class="kbd">${esc(it.kbd)}</span>` : ''}</button>`);
    if (it.disabled) b.disabled = true;
    b.addEventListener('click', () => { closeContextMenu(); it.action(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
  menu.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
  activeCtx = menu;
}
window.addEventListener('mousedown', (e) => { if (activeCtx && !activeCtx.contains(e.target)) closeContextMenu(); }, true);
window.addEventListener('blur', closeContextMenu);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeContextMenu(); });

// --- Bildirimler --------------------------------------------------------------
function toastHost() {
  let el = document.querySelector('.toasts');
  if (!el) { el = h('<div class="toasts"></div>'); document.body.appendChild(el); }
  return el;
}
function toast(title, { type = '', sub = '', timeout = 3500 } = {}) {
  const el = h(`<div class="toast ${type}"><div class="t-body"><div class="t-title">${esc(title)}</div>${sub ? `<div class="t-sub">${esc(sub)}</div>` : ''}</div></div>`);
  toastHost().appendChild(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

// --- Modal --------------------------------------------------------------------
function openModal({ title, iconName, body, buttons = [], width, onMount, closable = true }) {
  return new Promise((resolve) => {
    const back = h('<div class="modal-backdrop"></div>');
    const modal = h(`<div class="modal">
      <header>${iconName ? `<span style="color:var(--accent)">${icon(iconName)}</span>` : ''}<h2>${esc(title)}</h2></header>
      <div class="body"></div><footer><span class="spacer"></span></footer></div>`);
    if (width) modal.style.width = `min(${width}px, calc(100vw - 32px))`;
    const bodyEl = modal.querySelector('.body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    const footer = modal.querySelector('footer');
    const close = (val) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    for (const b of buttons) {
      const btn = h(`<button class="btn ${b.cls || ''}">${b.icon ? icon(b.icon) : ''}${esc(b.label)}</button>`);
      btn.addEventListener('click', async () => {
        if (b.onClick) {
          const r = await b.onClick(modal, btn);
          if (r === false) return;
          close(r === undefined ? b.value : r);
        } else close(b.value);
      });
      if (b.left) footer.insertBefore(btn, footer.querySelector('.spacer')); else footer.appendChild(btn);
    }
    const onKey = (e) => {
      if (e.key === 'Escape' && closable) close(null);
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        const primary = [...footer.querySelectorAll('.btn.primary')].pop();
        if (primary) { e.preventDefault(); primary.click(); }
      }
    };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back && closable) close(null); });
    back.appendChild(modal);
    document.body.appendChild(back);
    if (onMount) onMount(modal, close);
    const first = modal.querySelector('input:not([type=checkbox]),textarea,select');
    if (first) setTimeout(() => first.focus(), 30);
  });
}

async function confirmBox(title, message, { okText = t('common.delete'), danger = true } = {}) {
  return openModal({
    title, iconName: danger ? 'trash' : 'check',
    body: `<div style="color:var(--text-2);line-height:1.5">${message}</div>`,
    buttons: [
      { label: t('common.giveUp'), value: false },
      { label: okText, cls: danger ? 'primary danger-primary' : 'primary', value: true },
    ],
  });
}
