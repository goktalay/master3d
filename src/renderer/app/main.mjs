// Master 3D ana penceresi: hoş geldiniz ekranı (sürükle-bırak, son açılanlar, biçimler), dosya açma, parça ağacı,
// özellikler, denetçi (model bilgisi, görünüm, kesit, animasyon), sahne araç çubukları, patlatma çubuğu, dışa aktarma
// ve ayarlar. Ortak yardımcılar (t, icon, esc, h, toast, openModal, confirmBox, contextMenu) ui.js'ten gelir.
/* global t, icon, esc, h, toast, contextMenu, confirmBox, formatDate, mastertoolButton, LANG */

import * as THREE from 'three';
import FORMATS from '../../formats.js';
import { createViewer } from './viewer.mjs';
import { loadFile, cancelWorkers, runWorker } from './loader.mjs';
import { sceneStats, worldBox, collectParts, maxDepth, measureObject, isRenderable, isShown, triCount, hasRenderable } from '../../core/scene.mjs';
import { createExplode } from '../../core/explode.mjs';
import { openExportDialog } from './export-ui.mjs';
import { openSettings } from './settings-ui.mjs';
import { formatLength, formatDims, formatArea, formatVolume, formatBytes, formatInt, unitLabel } from './units.mjs';

const $ = (s) => document.querySelector(s);
const IS_RTL = document.documentElement.dir === 'rtl';
const GROUP_ICON = { general: 'cube', cad: 'cpu', print: 'layers', science: 'radar', other: 'tag' };
const GROUP_COLOR = { general: '#22d3ee', cad: '#6366f1', print: '#f97316', science: '#a855f7', other: '#34d399' };
const TREE_MAX_ROWS = 4000;

const state = {
  data: { settings: {}, recent: [], platform: 'win32' },
  acct: { loggedIn: false },
  doc: null,          // { file, result, root, parts, stats, warnings, srcUnit, explode, explodeAmount, partsLevel }
  selection: [],
  expanded: new Set(),
  query: '',
  loadingToken: 0,
};
window.M3 = state; // tanılama (geliştirici araçları) için

// --- Görüntüleyici ---------------------------------------------------------------------------------------------
const viewer = createViewer($('#vpHost'), {
  onPick: (obj, { event, button }) => {
    const part = obj ? ownerPart(obj) : null;
    if (button === 2) { if (part && !state.selection.includes(part)) setSelection([part]); showPartMenu(event.clientX, event.clientY, part); return; }
    if (!part) { setSelection([]); return; }
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      const s = new Set(state.selection);
      if (s.has(part)) s.delete(part); else s.add(part);
      setSelection([...s]);
    } else setSelection([part]);
    revealInTree(part);
  },
  onChange: (what, info) => {
    if (what === 'edgesLimit') toast(t('view.edgesLimit'), { type: 'err' });
    if (what === 'measure') toast(t('tool.measured', { d: fmtLen(info.distance) }), { type: 'ok', timeout: 2500 });
    if (what === 'time') paintAnimTime();
  },
});
$('#vpHost').addEventListener('contextmenu', (e) => e.preventDefault());
state.viewer = viewer;

// Seçimde tıklanan nesnenin parçası: ağaçta görünen en yakın parça (glTF primitive grubu bütün sayılır)
function ownerPart(o) {
  if (!state.doc) return o;
  const set = state.doc.partSet;
  for (let p = o; p; p = p.parent) if (set.has(p)) return p;
  return o;
}

// --- Başlangıç ---------------------------------------------------------------------------------------------------
$('.search-ico').innerHTML = icon('search');
$('#search').placeholder = t('app.searchPh');
$('#btnSettings').innerHTML = icon('gear');
$('#btnSettings').title = t('set.title');
$('#btnOpen').innerHTML = icon('folderOpen') + esc(t('app.open'));
$('#btnOpen').title = `${t('app.open')} (Ctrl+O)`;
$('#btnExport').innerHTML = icon('export') + esc(t('app.export'));
$('#btnExport').title = `${t('app.export')} (Ctrl+E)`;
$('#treeTitle').textContent = t('tree.title');
$('#btnShowAll').innerHTML = icon('eye');
$('#btnShowAll').title = t('tree.showAll');
$('#btnCollapse').innerHTML = icon('chevronUp');
$('#btnCollapse').title = t('tree.collapse');
$('.topbar').appendChild(mastertoolButton());

$('#btnSettings').onclick = () => openSettingsDialog();
$('#btnOpen').onclick = () => openDialog();
$('#btnExport').onclick = () => exportDialog();
$('#btnAccount').onclick = () => openSettingsDialog('account');
$('#btnShowAll').onclick = () => showAll();
$('#btnCollapse').onclick = () => { state.expanded.clear(); if (state.doc) state.expanded.add(state.doc.root.uuid); renderTree(); };
$('#search').addEventListener('input', (e) => { state.query = e.target.value.trim().toLowerCase(); renderTree(); });

const settings = () => state.data.settings || {};
const vset = () => settings().viewer || {};

window.api.getStore().then((d) => { state.data = d; applyViewerSettings(); renderWelcome(); });
window.api.onStoreChanged((d) => {
  const prev = JSON.stringify(state.data.settings.viewer || {});
  state.data = d;
  if (JSON.stringify(d.settings.viewer || {}) !== prev) { applyViewerSettings(); if (state.doc) { renderInspector(); renderToolbar(); } }
  if (!state.doc) renderWelcome();
});
window.api.pendingOpen().then((r) => r && handleOpenResult(r));
window.api.onOpenRequest((r) => handleOpenResult(r));

// --- Hesap ve güncelleme ----------------------------------------------------------------------------------------
function syncText(st) {
  if (!st.syncEnabled || st.state === 'off') return t('sync.off');
  if (st.state === 'syncing') return t('sync.syncing');
  if (st.state === 'offline') return t('sync.offline');
  if (st.state === 'error') {
    if (st.error === 'decrypt_failed') return t('sync.errDecrypt');
    if (st.error === 'too_large') return t('sync.errTooLarge');
    return t('sync.error', { msg: st.errorMessage || st.error });
  }
  return st.lastSyncAt ? t('acct.lastSync', { time: formatDate(st.lastSyncAt) }) : t('acct.never');
}
function paintAccount() {
  const b = $('#btnAccount');
  const a = state.acct;
  const email = (a.user && a.user.email) || a.email || '';
  const name = (a.user && a.user.name) || email;
  b.querySelector('.ac-avatar').textContent = (name || '?').trim().charAt(0).toUpperCase();
  const st = !a.syncEnabled ? 'off' : a.state || 'idle';
  b.className = `account-chip s-${st}`;
  b.querySelector('.ac-sync').innerHTML = st === 'syncing' ? '<span class="spin"></span>' : icon(st === 'off' || st === 'offline' ? 'cloudOff' : 'cloud');
  b.title = `${email}\n${syncText(a)}`;
  const el = $('#acct-status');
  if (el) el.textContent = syncText(a);
}
window.api.onAccountStatus((st) => { state.acct = st; paintAccount(); });
window.api.accountState().then((st) => { state.acct = st; paintAccount(); });

function showUpdate(info) {
  if (!info) return;
  const bar = $('#updateBar');
  bar.innerHTML = `${icon('bolt')}<span><b>${esc(t('update.available', { version: info.version }))}</b> — ${esc(t('update.hint'))}</span>
    <button class="btn sm" type="button">${icon('open')}${esc(t('update.open'))}</button>`;
  bar.querySelector('button').onclick = () => window.api.openWeb('account');
  bar.classList.remove('hidden');
}
window.api.onUpdateAvailable(showUpdate);
window.api.about().then((a) => showUpdate(a.update));

// --- Birimler ----------------------------------------------------------------------------------------------------
const srcUnit = () => (state.doc && state.doc.srcUnit) || null;
const dispUnit = () => (vset().units && vset().units !== 'auto' ? vset().units : null);
const fmtLen = (v) => formatLength(v, srcUnit(), dispUnit());

function applyViewerSettings() {
  const v = vset();
  const dark = !window.matchMedia('(prefers-color-scheme: light)').matches;
  $('#vpBg').className = `vp-bg bg-${v.background || 'gradient'}`;
  viewer.set({
    grid: v.grid !== false, axes: !!v.axes, shadows: v.shadows !== false, edges: !!v.edges, bbox: !!v.bbox, lighting: v.lighting || 'studio',
    projection: v.projection || 'perspective', autoRotate: !!v.autoRotate, invertZoom: !!v.invertZoom, theme: dark ? 'dark' : 'light',
    formatLength: fmtLen, axisNames: { x: 'X', y: 'Y', z: 'Z' },
  });
  $('#vpStats').classList.toggle('hidden', !state.doc || v.showStats === false);
}
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyViewerSettings());
const setViewer = (patch) => window.api.setSettings({ viewer: patch });

// --- Hoş geldiniz ---------------------------------------------------------------------------------------------------
function renderWelcome() {
  const w = $('#welcome');
  if (state.doc) { w.classList.add('hidden'); return; }
  w.classList.remove('hidden');
  $('#main').classList.add('no-model');
  $('#fileInfo').textContent = t('app.tagline');
  const recent = state.data.recent || [];
  const groups = FORMATS.GROUPS.map((g) => ({ g, list: FORMATS.IMPORT.filter((f) => f.group === g) }));
  w.innerHTML = `
    <div class="dropzone" id="dz">
      <div class="dz-ic">${icon('cube')}</div>
      <h2>${esc(t('welcome.title'))}</h2>
      <p>${esc(t('welcome.body'))}</p>
      <button class="btn primary" type="button" id="dzOpen">${icon('folderOpen')}${esc(t('app.openFile'))}</button>
    </div>
    ${recent.length ? `<div class="w-section"><h3>${icon('clock')}${esc(t('welcome.recent'))}<span class="spacer"></span>
      <button class="btn sm ghost" type="button" id="rcClear">${icon('trash')}${esc(t('welcome.clearRecent'))}</button></h3>
      <div class="recent">${recent.map((r, i) => {
        const f = FORMATS.formatOf(r.name);
        const c = f ? GROUP_COLOR[f.group] : '#94a3b8';
        return `<div class="rc ${r.exists ? '' : 'missing'}" data-i="${i}" title="${esc(r.path)}" style="--c:${c}">
          <div class="rc-ic">${esc(FORMATS.extOf(r.name).slice(0, 5))}</div>
          <div class="rc-t"><div class="rc-name ltr">${esc(r.name)}</div><div class="rc-sub">${esc(r.exists ? `${formatBytes(r.size)} · ${formatDate(r.openedAt)}` : t('welcome.missing'))}</div></div>
          <button class="icon-btn rc-x" type="button" title="${esc(t('welcome.removeRecent'))}">${icon('x')}</button></div>`;
      }).join('')}</div></div>` : ''}
    <div class="w-section"><h3>${icon('layers')}${esc(t('welcome.formats', { n: FORMATS.IMPORT.length }))}</h3>
      <div class="fmt-groups">${groups.map(({ g, list }) => `<div class="fg"><div class="fg-head"><span class="avatar" style="--c:${GROUP_COLOR[g]}">${icon(GROUP_ICON[g])}</span>${esc(t('fmt.group.' + g))}</div>
        <div class="chips">${list.map((f) => `<span class="chip" title="${esc(f.name)}${f.note ? ' — ' + esc(t('fmt.note.' + f.id)) : ''}">${esc(f.ext.map((e) => '.' + e).join(' '))}</span>`).join('')}</div></div>`).join('')}</div></div>
    <div class="w-privacy note">${icon('shield')}<span>${esc(t('privacy.note'))}</span></div>`;
  w.querySelector('#dz').onclick = (e) => { if (!e.target.closest('button') || e.target.closest('#dzOpen')) openDialog(); };
  const clr = w.querySelector('#rcClear');
  if (clr) clr.onclick = () => window.api.recentClear();
  w.querySelectorAll('.rc').forEach((el) => {
    const r = recent[Number(el.dataset.i)];
    el.onclick = (e) => {
      if (e.target.closest('.rc-x')) { window.api.recentRemove(r.path); return; }
      if (!r.exists) { toast(t('open.notFound'), { type: 'err', sub: r.path }); return; }
      window.api.openPath(r.path).then(handleOpenResult);
    };
    el.oncontextmenu = (e) => {
      e.preventDefault();
      contextMenu(e.clientX, e.clientY, [
        { label: t('app.open'), icon: 'folderOpen', disabled: !r.exists, action: () => window.api.openPath(r.path).then(handleOpenResult) },
        { label: t('ctx.showInFolder'), icon: 'folder', disabled: !r.exists, action: () => window.api.showInFolder(r.path) },
        '-',
        { label: t('welcome.removeRecent'), icon: 'x', action: () => window.api.recentRemove(r.path) },
      ]);
    };
  });
}

// --- Açma -------------------------------------------------------------------------------------------------------------
async function openDialog() {
  const r = await window.api.openDialog();
  if (r.code === 'canceled') return;
  handleOpenResult(r);
}
function handleOpenResult(r) {
  if (!r) return;
  if (!r.ok) {
    const msg = r.code === 'unsupported' ? t('open.unsupported', { ext: r.ext ? '.' + r.ext : '?' }) : r.code === 'not_found' ? t('open.notFound') : t('open.failed', { msg: r.message || r.code });
    toast(msg, { type: 'err', timeout: 6000 });
    return;
  }
  openDocument(r.file);
}

const STAGE_KEYS = { 'stage.cad': 'stage.cad', 'stage.ifc': 'stage.ifc', 'stage.assimp': 'stage.assimp' };
function showLoading(file) {
  const el = $('#loading');
  el.classList.remove('hidden');
  el.innerHTML = `<div class="ld-card">
    <div class="ld-head"><span class="ld-ic">${icon('cube')}</span><div style="min-width:0"><div class="ld-name ltr">${esc(file.name)}</div>
      <div class="ld-stage" id="ldStage">${esc(t('stage.read'))}</div></div></div>
    <div class="progress" id="ldBar"><div></div></div>
    <div class="ld-foot"><span id="ldBytes">${esc(formatBytes(file.size))}</span><span class="spacer"></span><button class="btn sm" type="button" id="ldCancel">${esc(t('common.cancel'))}</button></div></div>`;
  el.querySelector('#ldCancel').onclick = () => { state.loadingToken++; cancelWorkers(); hideLoading(); };
}
function hideLoading() { $('#loading').classList.add('hidden'); }
function loadingStage(key, indet = true) {
  const s = $('#ldStage'); if (s) s.textContent = t(key);
  const b = $('#ldBar'); if (b) b.classList.toggle('indet', indet);
}

async function openDocument(file) {
  const token = ++state.loadingToken;
  cancelWorkers();
  showLoading(file);
  const started = performance.now();
  try {
    const result = await loadFile(file, {
      renderer: viewer.renderer,
      cadQuality: vset().cadQuality || 'medium',
      onProgress: (got, total) => {
        if (token !== state.loadingToken) return;
        const bar = $('#ldBar > div');
        if (bar) bar.style.width = total ? `${Math.round((got / total) * 100)}%` : '60%';
        const b = $('#ldBytes'); if (b) b.textContent = total ? `${formatBytes(got)} / ${formatBytes(total)}` : formatBytes(got);
        if (total && got >= total) loadingStage(file.engine === 'three' ? 'stage.parse' : 'stage.prepare');
      },
      onStage: (k) => token === state.loadingToken && loadingStage(STAGE_KEYS[k] || k),
    });
    if (token !== state.loadingToken) { disposeResult(result); return; }
    loadingStage('stage.scene');
    await new Promise((r) => requestAnimationFrame(() => r()));
    setDocument(file, result);
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    toast(t('open.done', { name: file.name }), { type: 'ok', sub: t('open.doneSub', { n: formatInt(state.doc.stats.triangles), parts: state.doc.parts.length, s: secs }), timeout: 3500 });
  } catch (e) {
    if (token !== state.loadingToken) return;
    console.error(e);
    const code = e.code || 'parse_failed';
    const msg = code === 'blend_new' ? t('open.blendNew', { v: e.detail }) : code === 'zip_no_model' ? t('open.zipNoModel') : code === 'unsupported' ? t('open.unsupported', { ext: e.detail })
      : t('open.parseFailed', { msg: e.detail || e.message || code });
    toast(t('open.failedTitle', { name: file.name }), { type: 'err', sub: msg, timeout: 9000 });
  } finally {
    if (token === state.loadingToken) hideLoading();
  }
}

function disposeResult(r) { try { r.root && r.root.traverse((o) => o.geometry && o.geometry.dispose()); r.dispose && r.dispose(); } catch { /* yok */ } }

function setDocument(file, result) {
  if (state.doc && state.doc.result.dispose) state.doc.result.dispose();
  if (state.doc && state.doc.explode) state.doc.explode.reset();
  const v = vset();
  const up = v.upAxis && v.upAxis !== 'auto' ? v.upAxis : result.upAxis;
  const stats = viewer.setModel(result.root, { upAxis: up, animations: result.animations });
  state.doc = {
    file, result, root: result.root, stats, warnings: result.warnings || [], srcUnit: result.units || null, unitGuessed: !result.units,
    upAxis: up, explode: null, explodeAmount: 0, explodeMode: v.explodeMode || 'radial', partsLevel: 0, parts: [], partSet: new Set(), anim: 0,
  };
  if (!state.doc.srcUnit && ['obj', 'ply', 'off', 'dxf', '3dm', 'x', 'blend'].includes(result.format)) state.doc.srcUnit = null;
  rebuildParts();
  state.selection = [];
  state.expanded = new Set([result.root.uuid]);
  // Küçük ağaçlar bir düzey daha açık başlar
  if (result.root.children.length <= 12) for (const c of result.root.children) if (c.children.length) state.expanded.add(c.uuid);
  state.query = '';
  $('#search').value = '';
  $('#search').disabled = false;
  $('#btnExport').disabled = false;
  $('#main').classList.remove('no-model');
  $('#welcome').classList.add('hidden');
  const fmt = FORMATS.formatOf(file.name);
  $('#fileInfo').textContent = `${file.name} · ${fmt ? fmt.name : ''}`;
  $('#fileInfo').title = file.path;
  document.title = `${file.name} — Master 3D`;
  applyViewerSettings();
  renderAll();
  if (result.animations && result.animations.length) {
    viewer.playAnimation(0);
    renderInspector();
  }
}

function rebuildParts() {
  const d = state.doc;
  d.parts = collectParts(d.root, d.partsLevel);
  d.partSet = new Set(d.parts);
  // Ağaçta yaprak düzeyinde de seçim yapılabilsin: tüm çizilebilirlerin sahibi bir parçadır
  d.depth = maxDepth(d.root);
}

function renderAll() {
  renderTree();
  renderProps();
  renderInspector();
  renderToolbar();
  renderViews();
  renderExplode();
  renderStats();
}

// --- Parça ağacı --------------------------------------------------------------------------------------------------
// Adsız düğümler kardeşleri arasındaki sırasıyla: "Grup 3", "Ağ 2" (aynı türden tek düğümse numarasız)
function nodeLabel(o) {
  if (o.name) return o.name;
  if (o.userData.m3index) return t('tree.unnamedN', { n: o.userData.m3index });
  const kind = isRenderable(o) ? (o.isPoints ? 'tree.points' : o.isLine ? 'tree.lines' : 'tree.mesh') : 'tree.group';
  const sib = o.parent ? o.parent.children.filter((c) => !c.name && isRenderable(c) === isRenderable(o) && !c.userData.m3overlay && !c.userData.m3helper) : [o];
  return sib.length > 1 ? `${t(kind)} ${sib.indexOf(o) + 1}` : t(kind);
}
function nodeKind(o) { return o.isMesh ? 'mesh' : o.isPoints ? 'points' : o.isLine ? 'line' : 'group'; }
function nodeIcon(o) { return o.isMesh ? 'cube' : o.isPoints ? 'radar' : o.isLine ? 'link' : 'folder'; }
function swatch(o) {
  const m = o.userData.m3mat || o.material;
  const mm = Array.isArray(m) ? m[0] : m;
  return mm && mm.color ? '#' + mm.color.getHexString(THREE.SRGBColorSpace) : null;
}
// Ağaçta gösterilen çocuklar: yardımcı ve kaplama (kenar çizgisi) nesneleri hariç
const treeKids = (o) => o.children.filter((c) => !c.userData.m3overlay && !c.userData.m3helper && (hasRenderable(c) || c.children.length));
const countTris = new WeakMap();
function trisOf(o) {
  if (countTris.has(o)) return countTris.get(o);
  let n = 0;
  o.traverse((x) => { if (x.isMesh && !x.userData.m3overlay) n += triCount(x); });
  countTris.set(o, n);
  return n;
}

function renderTree() {
  const host = $('#tree');
  const d = state.doc;
  if (!d) { host.innerHTML = ''; $('#treeCount').textContent = ''; return; }
  $('#treeCount').textContent = formatInt(d.parts.length);
  const q = state.query;
  // Arama: eşleşen düğümler ve üst düğümleri
  let keep = null;
  if (q) {
    keep = new Set();
    d.root.traverse((o) => {
      if (o.userData.m3overlay || o.userData.m3helper) return;
      if ((o.name || '').toLowerCase().includes(q)) for (let p = o; p; p = p.parent) { keep.add(p); if (p === d.root) break; }
    });
  }
  const sel = new Set(state.selection);
  const rows = [];
  let more = 0;
  const walk = (o, depth) => {
    if (keep && !keep.has(o)) return;
    if (rows.length >= TREE_MAX_ROWS) { more++; return; }
    const kids = treeKids(o);
    const open = !!(keep || state.expanded.has(o.uuid));
    rows.push({ o, depth, kids: kids.length, open });
    if (open) for (const c of kids) walk(c, depth + 1);
  };
  walk(d.root, 0);
  const hl = (s) => {
    const e = esc(s);
    if (!q) return e;
    const i = s.toLowerCase().indexOf(q);
    return i < 0 ? e : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
  };
  host.innerHTML = rows.map(({ o, depth, kids, open }) => {
    const sw = isRenderable(o) ? swatch(o) : null;
    const tc = kids ? formatInt(kids) : (o.isMesh ? formatInt(triCount(o)) + ' ▵' : '');
    return `<div class="tn ${sel.has(o) ? 'sel' : ''} ${open ? 'open' : ''} ${o.visible ? '' : 'hidden-node'}" data-id="${o.uuid}" style="padding-inline-start:${4 + depth * 14}px">
      <span class="tw">${kids ? icon('chevronRight') : ''}</span>
      <span class="ti k-${nodeKind(o)}">${icon(nodeIcon(o))}</span>
      <span class="tl ${o.name ? '' : 'muted'}">${hl(nodeLabel(o))}</span>
      ${sw ? `<span class="sw" style="background:${sw}"></span>` : ''}
      <span class="tc">${tc}</span>
      <span class="eye" title="${esc(t(o.visible ? 'tree.hide' : 'tree.show'))}">${icon(o.visible ? 'eye' : 'eyeOff')}</span></div>`;
  }).join('') + (more ? `<div class="tree-more">${esc(t('tree.more', { n: formatInt(more) }))}</div>` : '');
}
const byUuid = (id) => (state.doc ? state.doc.root.getObjectByProperty('uuid', id) || (state.doc.root.uuid === id ? state.doc.root : null) : null);

$('#tree').addEventListener('click', (e) => {
  const row = e.target.closest('.tn');
  if (!row) return;
  const o = byUuid(row.dataset.id);
  if (!o) return;
  if (e.target.closest('.tw')) { toggleExpand(o); return; }
  if (e.target.closest('.eye')) { setVisible([o], !o.visible); return; }
  if (e.ctrlKey || e.metaKey) {
    const s = new Set(state.selection);
    if (s.has(o)) s.delete(o); else s.add(o);
    setSelection([...s]);
  } else setSelection([o]);
});
$('#tree').addEventListener('dblclick', (e) => {
  const row = e.target.closest('.tn');
  if (!row || e.target.closest('.eye') || e.target.closest('.tw')) return;
  const o = byUuid(row.dataset.id);
  if (o) viewer.frame(viewer.currentViewDir(), o, true);
});
$('#tree').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const row = e.target.closest('.tn');
  const o = row && byUuid(row.dataset.id);
  if (!o) return;
  if (!state.selection.includes(o)) setSelection([o]);
  showPartMenu(e.clientX, e.clientY, o);
});
function toggleExpand(o) {
  if (state.expanded.has(o.uuid)) state.expanded.delete(o.uuid); else state.expanded.add(o.uuid);
  renderTree();
}
function revealInTree(o) {
  if (!state.doc) return;
  for (let p = o.parent; p; p = p.parent) { state.expanded.add(p.uuid); if (p === state.doc.root) break; }
  renderTree();
  const el = $(`#tree .tn[data-id="${o.uuid}"]`);
  if (el) el.scrollIntoView({ block: 'nearest' });
}

// --- Seçim, görünürlük, izole -----------------------------------------------------------------------------------
function setSelection(list, { ghost = false } = {}) {
  state.selection = list.filter(Boolean);
  viewer.select(state.selection, { ghost });
  renderTree();
  renderProps();
  if (vset().bbox) viewer.refreshBBox();
}
function setVisible(list, vis) {
  for (const o of list) o.visible = vis;
  afterVisibility();
}
function afterVisibility() {
  viewer.invalidate();
  if (vset().bbox) viewer.refreshBBox();
  renderTree();
  renderStats();
}
function showAll() {
  if (!state.doc) return;
  state.doc.root.traverse((o) => { if (!o.userData.m3helper) o.visible = true; });
  viewer.select(state.selection, { ghost: false });
  afterVisibility();
}
function isolate(list) {
  if (!state.doc || !list.length) return;
  const keep = new Set();
  for (const o of list) { o.traverse((x) => keep.add(x)); for (let p = o; p; p = p.parent) keep.add(p); }
  state.doc.root.traverse((o) => { if (!o.userData.m3overlay && !o.userData.m3helper) o.visible = keep.has(o); });
  afterVisibility();
  viewer.frame(viewer.currentViewDir(), null, true);
}
function hideSelected() { if (state.selection.length) setVisible(state.selection, false); }

function showPartMenu(x, y, o) {
  const sel = state.selection.length ? state.selection : (o ? [o] : []);
  const has = sel.length > 0;
  contextMenu(x, y, [
    { label: t('ctx.focus'), icon: 'focus', kbd: 'F', disabled: !has, action: () => viewer.frame(viewer.currentViewDir(), sel[0], true) },
    { label: t('ctx.isolate'), icon: 'isolate', kbd: 'I', disabled: !has, action: () => isolate(sel) },
    { label: t('ctx.ghost'), icon: 'xray', disabled: !has, action: () => viewer.select(sel, { ghost: true }) },
    { label: t('ctx.hide'), icon: 'eyeOff', kbd: 'H', disabled: !has, action: () => setVisible(sel, false) },
    { label: t('tree.showAll'), icon: 'eye', kbd: 'Alt+H', action: () => showAll() },
    '-',
    { label: t('ctx.exportSel', { n: sel.length }), icon: 'export', disabled: !has, action: () => exportDialog({ scope: 'selected' }) },
    { label: t('ctx.split'), icon: 'split', disabled: !has || !sel.some((s) => s.isMesh), action: () => splitParts(sel) },
    '-',
    { label: t('ctx.copyName'), icon: 'copy', disabled: !has || !sel[0].name, action: () => navigator.clipboard.writeText(sel.map((s) => s.name).join('\n')).then(() => toast(t('ctx.copied'), { timeout: 1500 })) },
  ]);
}

// --- Özellikler ---------------------------------------------------------------------------------------------------
function renderProps() {
  const host = $('#props');
  const d = state.doc;
  if (!d) { host.innerHTML = ''; return; }
  const sel = state.selection;
  if (!sel.length) { host.innerHTML = `<h3>${icon('info')}${esc(t('props.title'))}</h3><div class="muted" style="font-size:12px;line-height:1.5">${esc(t('props.hint'))}</div>`; return; }
  const o = sel[0];
  const box = worldBox(o, { onlyVisible: false });
  const s = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  const dims = d.upAxis === 'z' ? [s.x, s.z, s.y] : [s.x, s.y, s.z];
  const st = sceneStats(o);
  const meas = st.triangles <= 3_000_000 ? measureObject(o) : null;
  const mats = new Map();
  o.traverse((x) => { if (!isRenderable(x)) return; for (const m of [].concat(x.userData.m3mat || x.material)) if (m) mats.set(m.uuid, m); });
  // Malzemeler: aynı ad + renk bir kez; adsız malzemede renk kodu gösterilir
  const chipMap = new Map();
  for (const m of mats.values()) {
    const hex = m.color ? '#' + m.color.getHexString(THREE.SRGBColorSpace) : '#888888';
    chipMap.set(`${m.name}|${hex}`, [hex, m.name || '']);
  }
  const chips = [...chipMap.values()];
  const rows = [];
  const add = (k, v) => rows.push(`<span>${esc(k)}</span><span title="${esc(v)}">${esc(v)}</span>`);
  if (sel.length > 1) add(t('props.selected'), formatInt(sel.length));
  add(t('props.type'), t('tree.' + (o.isMesh ? 'mesh' : o.isPoints ? 'points' : o.isLine ? 'lines' : 'group')));
  if (st.triangles) add(t('props.triangles'), formatInt(st.triangles));
  if (st.vertices) add(t('props.vertices'), formatInt(st.vertices));
  if (st.pointCount) add(t('props.points'), formatInt(st.pointCount));
  if (!o.isMesh && st.meshes) add(t('props.meshes'), formatInt(st.meshes));
  add(t('props.size'), formatDims(dims, srcUnit(), dispUnit()));
  if (meas) {
    add(t('props.area'), formatArea(meas.area, srcUnit(), dispUnit()));
    add(t('props.volume'), meas.volume != null ? formatVolume(meas.volume, srcUnit(), dispUnit()) : t('props.openMesh'));
  }
  if (o.userData.m3faces) add(t('props.brepFaces'), formatInt(o.userData.m3faces));
  if (o.userData.ifc) { add('IFC', String(o.userData.ifc.type || '')); if (o.userData.ifc.guid) add('GUID', o.userData.ifc.guid); }
  host.innerHTML = `<h3>${icon('info')}${esc(t('props.title'))}</h3>
    <div class="p-name"><span class="ti k-${nodeKind(o)}" style="display:inline-grid">${icon(nodeIcon(o))}</span><span class="ltr">${esc(nodeLabel(o))}</span></div>
    <div class="kv">${rows.join('')}</div>
    ${chips.length ? `<div class="mats">${chips.slice(0, 12).map(([hex, name]) => `<span class="mat-chip"><span class="sw" style="background:${hex}"></span><span class="ltr">${esc(name || hex)}</span></span>`).join('')}${chips.length > 12 ? `<span class="mat-chip">+${chips.length - 12}</span>` : ''}</div>` : ''}
    <div class="p-actions">
      <button class="btn sm" type="button" data-a="focus">${icon('focus')}${esc(t('ctx.focus'))}</button>
      <button class="btn sm" type="button" data-a="isolate">${icon('isolate')}${esc(t('ctx.isolate'))}</button>
      <button class="btn sm" type="button" data-a="export">${icon('export')}${esc(t('props.export'))}</button>
    </div>`;
  host.querySelector('[data-a=focus]').onclick = () => viewer.frame(viewer.currentViewDir(), o, true);
  host.querySelector('[data-a=isolate]').onclick = () => isolate(sel);
  host.querySelector('[data-a=export]').onclick = () => exportDialog({ scope: 'selected' });
}

// --- Denetçi ------------------------------------------------------------------------------------------------------
function renderInspector() {
  const host = $('#inspector');
  const d = state.doc;
  if (!d) { host.innerHTML = ''; return; }
  const v = vset();
  const r = d.result;
  const fmt = FORMATS.formatOf(d.file.name);
  const box = viewer.worldBox();
  const s = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  const dims = d.upAxis === 'z' ? [s.x, s.z, s.y] : [s.x, s.y, s.z];
  const kv = [];
  const add = (k, val) => kv.push(`<span>${esc(k)}</span><span title="${esc(val)}">${esc(val)}</span>`);
  add(t('insp.file'), formatBytes(d.file.size));
  add(t('insp.engine'), t('engine.' + r.engine));
  if (r.archiveEntry) add(t('insp.entry'), r.archiveEntry);
  add(t('props.triangles'), formatInt(d.stats.triangles));
  if (d.stats.pointCount) add(t('props.points'), formatInt(d.stats.pointCount));
  add(t('insp.parts'), formatInt(d.parts.length));
  add(t('insp.materials'), formatInt(d.stats.materials));
  if (d.stats.textures) add(t('insp.textures'), formatInt(d.stats.textures));
  add(t('props.size'), formatDims(dims, srcUnit(), dispUnit()));
  add(t('insp.loadTime'), `${(r.loadMs / 1000).toFixed(2)} s`);
  const unitOpts = ['', 'mm', 'cm', 'm', 'in', 'ft'].map((u) => `<option value="${u}" ${(d.srcUnit || '') === u ? 'selected' : ''}>${esc(u ? unitLabel(u) : t('insp.unitUnknown'))}</option>`).join('');
  const anims = r.animations || [];
  const warns = d.warnings || [];
  host.innerHTML = `
    <section class="insp"><h3>${icon('cube')}${esc(t('insp.model'))}<span style="flex:1"></span><span class="fmt-badge">${esc(fmt ? fmt.ext[0].toUpperCase() : '')}</span></h3>
      <div class="kv">${kv.join('')}</div>
      <div class="row2">
        <div class="field"><label>${esc(t('insp.srcUnit'))}</label><select class="input" id="iUnit">${unitOpts}</select></div>
        <div class="field"><label>${esc(t('insp.upAxis'))}</label><div class="seg" id="iUp"><button type="button" data-v="y">Y</button><button type="button" data-v="z">Z</button></div></div>
      </div>
      ${d.unitGuessed && !d.srcUnit ? `<small class="set-hint">${esc(t('insp.unitHint'))}</small>` : ''}
      ${warns.length ? `<div class="warns">${warns.slice(0, 6).map((w) => `<div class="warn">${icon('alert')}<span>${esc(t(w.key, w.vars))}</span></div>`).join('')}${warns.length > 6 ? `<div class="muted" style="font-size:11px">+${warns.length - 6}</div>` : ''}</div>` : ''}
    </section>
    <section class="insp"><h3>${icon('palette')}${esc(t('insp.view'))}</h3>
      <div class="field"><label>${esc(t('insp.background'))}</label><select class="input" id="iBg">
        ${['gradient', 'solid', 'dark', 'light', 'transparent'].map((b) => `<option value="${b}" ${v.background === b ? 'selected' : ''}>${esc(t('bg.' + b))}</option>`).join('')}</select></div>
      <div class="field"><label>${esc(t('insp.lighting'))}</label><div class="seg" id="iLight">
        ${['studio', 'soft', 'headlight'].map((l) => `<button type="button" data-v="${l}">${esc(t('light.' + l))}</button>`).join('')}</div></div>
      <label class="check"><input type="checkbox" id="iShadow" ${v.shadows !== false ? 'checked' : ''}><span>${esc(t('view.shadows'))}</span></label>
      <label class="check"><input type="checkbox" id="iEdges" ${v.edges ? 'checked' : ''}><span>${esc(t('view.edgesOverlay'))}</span></label>
      <label class="check"><input type="checkbox" id="iNormals"><span>${esc(t('view.normalHelpers'))}<small>${esc(t('view.normalHelpersHint'))}</small></span></label>
      <label class="check"><input type="checkbox" id="iRotate" ${v.autoRotate ? 'checked' : ''}><span>${esc(t('view.autoRotate'))}</span></label>
    </section>
    ${anims.length ? `<section class="insp"><h3>${icon('film')}${esc(t('anim.title'))}</h3>
      <div class="anim-row"><button class="btn sm icon-only" type="button" id="aPlay">${icon('pause')}</button>
        <select class="input" id="aClip">${anims.map((a, i) => `<option value="${i}">${esc(a.name || t('anim.clip', { n: i + 1 }))} · ${a.duration.toFixed(1)} s</option>`).join('')}</select></div>
      <input type="range" id="aTime" min="0" max="1000" value="0"></section>` : ''}
    <section class="insp"><h3>${icon('bolt')}${esc(t('keys.title'))}</h3>
      <div class="kv keys">${[['F', 'keys.fit'], ['1–7', 'keys.views'], ['W', 'keys.mode'], ['E', 'keys.explode'], ['H / Alt+H', 'keys.hide'], ['I', 'keys.isolate'], ['M', 'keys.measure'], ['Ctrl+E', 'keys.export'], ['P', 'keys.shot']]
        .map(([k, l]) => `<span>${esc(t(l))}</span><span>${esc(k)}</span>`).join('')}</div></section>`;
  const q = (s2) => host.querySelector(s2);
  q('#iUnit').onchange = (e) => { d.srcUnit = e.target.value || null; d.unitGuessed = false; viewer.set({ formatLength: fmtLen }); viewer.refreshBBox(); renderInspector(); renderProps(); };
  host.querySelectorAll('#iUp button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === d.upAxis);
    b.onclick = () => {
      d.upAxis = b.dataset.v;
      if (d.explode) { d.explode.reset(); d.explode = null; d.explodeAmount = 0; }
      viewer.applyUpAxis(d.upAxis);
      viewer.frame('iso');
      renderInspector(); renderProps(); renderExplode();
    };
  });
  q('#iBg').onchange = (e) => setViewer({ background: e.target.value });
  host.querySelectorAll('#iLight button').forEach((b) => { b.classList.toggle('on', b.dataset.v === (v.lighting || 'studio')); b.onclick = () => setViewer({ lighting: b.dataset.v }); });
  q('#iShadow').onchange = (e) => setViewer({ shadows: e.target.checked });
  q('#iEdges').onchange = (e) => setViewer({ edges: e.target.checked });
  q('#iNormals').checked = !!viewer.opts.normalHelpers;
  q('#iNormals').onchange = (e) => viewer.setNormalHelpers(e.target.checked);
  q('#iRotate').onchange = (e) => setViewer({ autoRotate: e.target.checked });
  if (anims.length) {
    q('#aClip').value = String(d.anim || 0);
    q('#aClip').onchange = (e) => { d.anim = Number(e.target.value); viewer.playAnimation(d.anim); paintAnimButton(); };
    q('#aPlay').onclick = () => toggleAnimation();
    q('#aTime').oninput = (e) => { const st = viewer.animationState(); viewer.pauseAnimation(); viewer.seekAnimation((Number(e.target.value) / 1000) * st.duration); paintAnimButton(); };
    paintAnimButton();
  }
}
function toggleAnimation() {
  const st = viewer.animationState();
  if (!state.doc || !(state.doc.result.animations || []).length) return;
  if (st.playing) viewer.pauseAnimation(); else if (st.duration) viewer.resumeAnimation(); else viewer.playAnimation(state.doc.anim || 0);
  paintAnimButton();
}
function paintAnimButton() {
  const b = $('#aPlay');
  if (b) b.innerHTML = icon(viewer.animationState().playing ? 'pause' : 'play');
}
let lastAnimPaint = 0;
function paintAnimTime() {
  const now = performance.now();
  if (now - lastAnimPaint < 100) return;
  lastAnimPaint = now;
  const el = $('#aTime');
  const st = viewer.animationState();
  if (el && st.duration) el.value = String(Math.round(((st.time % st.duration) / st.duration) * 1000));
}

// --- Sahne araç çubukları ------------------------------------------------------------------------------------------
const MODES = [['shaded', 'shaded'], ['edges', 'edgesMode'], ['wireframe', 'wire'], ['xray', 'xray'], ['normals', 'normals']];
function renderToolbar() {
  const tb = $('#vpToolbar');
  if (!state.doc) { tb.classList.add('hidden'); return; }
  tb.classList.remove('hidden');
  const v = vset();
  const mode = viewer.opts.mode;
  const clip = viewer.clip;
  tb.innerHTML = `
    <div class="pill">${MODES.map(([m, ic]) => `<button class="tb ${mode === m ? 'on' : ''}" data-mode="${m}" title="${esc(t('mode.' + m))}">${icon(ic)}</button>`).join('')}</div>
    <div class="pill">
      <button class="tb ${v.grid !== false ? 'on' : ''}" data-t="grid" title="${esc(t('view.grid'))}">${icon('grid')}</button>
      <button class="tb ${v.axes ? 'on' : ''}" data-t="axes" title="${esc(t('view.axes'))}">${icon('axes')}</button>
      <button class="tb ${v.bbox ? 'on' : ''}" data-t="bbox" title="${esc(t('view.bbox'))}">${icon('bbox')}</button>
      <span class="sep"></span>
      <button class="tb ${viewer.measuring ? 'on' : ''}" data-a="measure" title="${esc(t('tool.measure'))} (M)">${icon('ruler')}</button>
      <button class="tb ${clip.axis ? 'on' : ''}" data-a="section" title="${esc(t('tool.section'))}">${icon('section')}</button>
      <button class="tb" data-a="shot" title="${esc(t('tool.screenshot'))} (P)">${icon('camera')}</button>
    </div>`;
  tb.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  tb.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => setViewer({ [b.dataset.t]: !(b.dataset.t === 'grid' ? v.grid !== false : v[b.dataset.t]) })));
  tb.querySelector('[data-a=measure]').onclick = () => toggleMeasure();
  tb.querySelector('[data-a=section]').onclick = () => toggleSection();
  tb.querySelector('[data-a=shot]').onclick = (e) => screenshotMenu(e.currentTarget);
}
function setMode(m) { viewer.set({ mode: m }); renderToolbar(); }

let measuring = false;
function toggleMeasure(force) {
  measuring = force ?? !measuring;
  viewer.setMeasure(measuring);
  viewer.measuring = measuring;
  if (measuring && viewer.clip.axis) viewer.setClip(null);
  renderHint();
  renderToolbar();
}
function toggleSection() {
  const c = viewer.clip;
  if (c.axis) viewer.setClip(null); else { if (measuring) toggleMeasure(false); viewer.setClip('y', 0.5, false); }
  renderHint();
  renderToolbar();
}
function renderHint() {
  const el = $('#vpHint');
  const c = viewer.clip;
  if (measuring) {
    el.innerHTML = `${icon('ruler')}<span>${esc(t('tool.measureHint'))}</span><button class="btn sm" type="button" id="hClear">${esc(t('tool.clear'))}</button><button class="icon-btn" id="hClose">${icon('x')}</button>`;
    el.querySelector('#hClear').onclick = () => viewer.clearMeasure();
    el.querySelector('#hClose').onclick = () => toggleMeasure(false);
    el.classList.remove('hidden');
  } else if (c.axis) {
    el.innerHTML = `${icon('section')}<span>${esc(t('tool.section'))}</span>
      <div class="seg" id="hAxis">${['x', 'y', 'z'].map((a) => `<button type="button" data-v="${a}" class="${c.axis === a ? 'on' : ''}">${a.toUpperCase()}</button>`).join('')}</div>
      <input type="range" id="hPos" min="0" max="1000" value="${Math.round(c.pos * 1000)}">
      <button class="btn sm" type="button" id="hFlip">${icon('refresh')}${esc(t('tool.flip'))}</button><button class="icon-btn" id="hClose">${icon('x')}</button>`;
    el.querySelectorAll('#hAxis button').forEach((b) => (b.onclick = () => { viewer.setClip(b.dataset.v, viewer.clip.pos, viewer.clip.flip); renderHint(); }));
    el.querySelector('#hPos').oninput = (e) => viewer.setClip(viewer.clip.axis, Number(e.target.value) / 1000, viewer.clip.flip);
    el.querySelector('#hFlip').onclick = () => viewer.setClip(viewer.clip.axis, viewer.clip.pos, !viewer.clip.flip);
    el.querySelector('#hClose').onclick = () => toggleSection();
    el.classList.remove('hidden');
  } else el.classList.add('hidden');
}

function renderViews() {
  const el = $('#vpViews');
  if (!state.doc) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const p = vset().projection || 'perspective';
  el.innerHTML = `<div class="pill">
    ${[['front', '1'], ['top', '2'], ['right', '3'], ['iso', '7']].map(([k, n]) => `<button class="tb" data-view="${k}" title="${esc(t('viewDir.' + k))} (${n})">${esc(t('viewDir.' + k + 'Short'))}</button>`).join('')}
    <button class="tb" data-a="more" title="${esc(t('viewDir.more'))}">${icon('chevronDown')}</button>
    <span class="sep"></span>
    <button class="tb ${p === 'orthographic' ? 'on' : ''}" data-a="proj" title="${esc(t(p === 'orthographic' ? 'view.ortho' : 'view.persp'))}">${icon(p === 'orthographic' ? 'ortho' : 'perspective')}</button>
    <button class="tb" data-a="fit" title="${esc(t('view.fit'))} (F)">${icon('focus')}</button>
    <span class="sep"></span>
    <button class="tb" data-a="side" title="${esc(t('view.panels'))}">${icon('sliders')}</button></div>`;
  el.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => viewer.frame(b.dataset.view, null, true)));
  el.querySelector('[data-a=more]').onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    contextMenu(r.left, r.bottom + 4, [['front', '1'], ['back', '4'], ['left', '5'], ['right', '3'], ['top', '2'], ['bottom', '6'], ['iso', '7']]
      .map(([k, n]) => ({ label: t('viewDir.' + k), kbd: n, icon: 'cube', action: () => viewer.frame(k, null, true) })));
  };
  el.querySelector('[data-a=proj]').onclick = () => setViewer({ projection: p === 'orthographic' ? 'perspective' : 'orthographic' });
  el.querySelector('[data-a=fit]').onclick = () => viewer.frame(viewer.currentViewDir(), null, true);
  el.querySelector('[data-a=side]').onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = $('#main');
    contextMenu(r.left, r.bottom + 4, [
      { label: t('view.toggleTree'), icon: 'list', action: () => m.classList.toggle('hide-side') },
      { label: t('view.toggleInspector'), icon: 'sliders', action: () => m.classList.toggle('hide-inspector') },
      { label: t('view.toggleStats'), icon: 'info', action: () => setViewer({ showStats: vset().showStats === false }) },
    ]);
  };
}

function renderStats() {
  const el = $('#vpStats');
  const d = state.doc;
  if (!d || vset().showStats === false) { el.classList.add('hidden'); return; }
  const vis = sceneStats(d.root, { onlyVisible: true });
  el.classList.remove('hidden');
  el.innerHTML = `${esc(t('stats.tris', { n: formatInt(vis.triangles) }))} · ${esc(t('stats.parts', { n: formatInt(d.parts.length) }))}${vis.pointCount ? ` · ${esc(t('stats.points', { n: formatInt(vis.pointCount) }))}` : ''}`;
}

// --- Patlatma ---------------------------------------------------------------------------------------------------
function renderExplode() {
  const el = $('#vpExplode');
  const d = state.doc;
  if (!d) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const pct = Math.round((d.explodeAmount || 0) * 100);
  const levels = Array.from({ length: Math.min(d.depth || 1, 8) }, (_, i) => i + 1);
  const single = d.parts.length < 2;
  el.innerHTML = `<div class="ex-title" title="${esc(t('explode.title'))}"><span class="ex-ic">${icon('explode')}</span><span class="ex-tx">${esc(t('explode.title'))}</span></div>
    <input type="range" id="exAmt" min="0" max="100" value="${pct}" ${single ? 'disabled' : ''} title="${esc(t('explode.amount'))} (E)">
    <span class="ex-val">${pct}%</span>
    <div class="seg" id="exMode">${['radial', 'x', 'y', 'z', 'tree'].map((m) => `<button type="button" data-v="${m}" class="${d.explodeMode === m ? 'on' : ''}" title="${esc(t('explode.mode.' + m + 'Hint'))}">${esc(t('explode.mode.' + m))}</button>`).join('')}</div>
    <select class="input" id="exLevel" title="${esc(t('explode.level'))}" ${d.explodeMode === 'tree' ? 'disabled' : ''}>
      <option value="0">${esc(t('explode.levelAuto'))}</option>${levels.map((l) => `<option value="${l}" ${d.partsLevel === l ? 'selected' : ''}>${esc(t('explode.levelN', { n: l }))}</option>`).join('')}</select>
    <button class="btn sm" type="button" id="exAnim" ${single ? 'disabled' : ''} title="${esc(t('explode.animate'))} (E)">${icon('play')}<span class="bt">${esc(t('explode.animate'))}</span></button>
    <button class="btn sm" type="button" id="exSplit" title="${esc(t('explode.splitHint'))}">${icon('split')}<span class="bt">${esc(t('explode.split'))}</span></button>`;
  const amt = el.querySelector('#exAmt');
  amt.oninput = () => setExplode(Number(amt.value) / 100);
  amt.onchange = () => fitIfOutside();
  el.querySelectorAll('#exMode button').forEach((b) => (b.onclick = () => {
    d.explodeMode = b.dataset.v;
    resetExplode();
    setExplode(d.explodeAmount || 0.5);
    setViewer({ explodeMode: d.explodeMode });
    renderExplode();
  }));
  el.querySelector('#exLevel').onchange = (e) => {
    resetExplode();
    d.partsLevel = Number(e.target.value);
    rebuildParts();
    setExplode(d.explodeAmount || 0.5);
    renderTree(); renderInspector(); renderStats(); renderExplode();
  };
  el.querySelector('#exAnim').onclick = () => animateExplode();
  el.querySelector('#exSplit').onclick = () => splitParts(state.selection.length ? state.selection : d.parts);
  if (single && !d.splitHintShown) { d.splitHintShown = true; toast(t('explode.singleHint'), { timeout: 6000 }); }
}
function resetExplode() {
  const d = state.doc;
  if (d.explode) { d.explode.reset(); d.explode = null; }
}
function setExplode(a) {
  const d = state.doc;
  if (!d) return;
  if (!d.explode) d.explode = createExplode(d.root, { mode: d.explodeMode, level: d.partsLevel });
  d.explodeAmount = a;
  d.explode.apply(a);
  viewer.followGround();
  if (vset().bbox) viewer.refreshBBox();
  const v = $('#vpExplode .ex-val'); if (v) v.textContent = `${Math.round(a * 100)}%`;
  const r = $('#exAmt'); if (r && Number(r.value) !== Math.round(a * 100)) r.value = String(Math.round(a * 100));
}
let explodeAnim = 0;
function animateExplode() {
  const d = state.doc;
  if (!d) return;
  cancelAnimationFrame(explodeAnim);
  const from = d.explodeAmount || 0, to = from > 0.5 ? 0 : 1;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 900);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    setExplode(from + (to - from) * e);
    if (k < 1) explodeAnim = requestAnimationFrame(step); else fitIfOutside();
  };
  step();
}
// Patlatılmış model görüş alanından taşıyorsa kamera aynı yönden yeniden sığdırılır
function fitIfOutside() {
  const box = viewer.worldBox();
  if (box.isEmpty()) return;
  const cam = viewer.camera;
  cam.updateMatrixWorld();
  const pts = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z).project(cam));
  if (pts.some((p) => Math.abs(p.x) > 0.98 || Math.abs(p.y) > 0.98 || p.z > 1)) viewer.frame(viewer.currentViewDir(), null, true);
}

// Bağlantısız parçalara ayırma: seçili ağlardaki birbirine dokunmayan gövdeler ayrı ağlar olur (çalışan iş parçacığında)
async function splitParts(list) {
  const d = state.doc;
  if (!d) return;
  const meshes = [];
  for (const o of list) o.traverse((x) => { if (x.isMesh && !x.userData.m3overlay && !x.isSkinnedMesh) meshes.push(x); });
  if (!meshes.length) return;
  resetExplode();
  const busy = toast(t('explode.splitting'), { timeout: 0 });
  let made = 0, touched = 0;
  try {
    for (const m of meshes) {
      const g = m.geometry;
      const pos = g.getAttribute('position');
      if (!pos || pos.count < 6) continue;
      g.computeBoundingBox();
      const eps = g.boundingBox.getSize(new THREE.Vector3()).length() * 1e-6;
      const p = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { p[i * 3] = pos.getX(i); p[i * 3 + 1] = pos.getY(i); p[i * 3 + 2] = pos.getZ(i); }
      const idx = g.index ? Uint32Array.from(g.index.array) : null;
      const r = await runWorker('split', { position: p.buffer, index: idx ? idx.buffer : null, eps }, [p.buffer, ...(idx ? [idx.buffer] : [])]);
      if (r.count < 2) continue;
      touched++;
      const groupObj = new THREE.Group();
      groupObj.name = m.name;
      groupObj.position.copy(m.position); groupObj.quaternion.copy(m.quaternion); groupObj.scale.copy(m.scale);
      const parts = splitGeometry(g, r.tri, r.count);
      parts.forEach((geo, i) => {
        const mm = new THREE.Mesh(geo, m.userData.m3mat || m.material);
        mm.name = `${m.name || t('tree.mesh')} · ${i + 1}`;
        mm.castShadow = true;
        groupObj.add(mm);
      });
      made += parts.length;
      const parent = m.parent;
      parent.add(groupObj);
      parent.remove(m);
      g.dispose();
    }
  } catch (e) {
    toast(t('explode.splitFailed', { msg: e.message }), { type: 'err' });
  } finally { busy.remove(); }
  if (!touched) { toast(t('explode.splitNone'), { timeout: 4000 }); return; }
  rebuildParts();
  state.selection = [];
  viewer.select([]);
  viewer.refreshMaterials();
  d.stats = sceneStats(d.root);
  renderAll();
  toast(t('explode.splitDone', { n: made }), { type: 'ok' });
}

// Öbek numarasına göre üçgenleri ayrı geometrilere böler (tüm öznitelikler taşınır, köşeler yeniden numaralanır)
function splitGeometry(g, tri, count) {
  const idx = g.index;
  const attrs = Object.entries(g.attributes);
  const buckets = Array.from({ length: count }, () => []);
  const triN = tri.length;
  for (let t2 = 0; t2 < triN; t2++) buckets[tri[t2]].push(t2);
  return buckets.map((list) => {
    const remap = new Map();
    const order = [];
    const ix = new Uint32Array(list.length * 3);
    let k = 0;
    for (const t2 of list) for (let j = 0; j < 3; j++) {
      const v = idx ? idx.getX(t2 * 3 + j) : t2 * 3 + j;
      let n = remap.get(v);
      if (n === undefined) { n = order.length; remap.set(v, n); order.push(v); }
      ix[k++] = n;
    }
    const geo = new THREE.BufferGeometry();
    for (const [name, a] of attrs) {
      const out = new a.array.constructor(order.length * a.itemSize);
      for (let i = 0; i < order.length; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.array[order[i] * a.itemSize + c];
      geo.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize, a.normalized));
    }
    geo.setIndex(new THREE.BufferAttribute(order.length > 65535 ? ix : Uint16Array.from(ix), 1));
    return geo;
  });
}

// --- Ekran görüntüsü --------------------------------------------------------------------------------------------
function paintBackground(ctx, w, h) {
  const bg = vset().background || 'gradient';
  const light = window.matchMedia('(prefers-color-scheme: light)').matches;
  if (bg === 'transparent') return;
  if (bg === 'gradient') {
    const g = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, Math.max(w, h) * 0.75);
    if (light) { g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#edf1f7'); g.addColorStop(1, '#dfe5ee'); }
    else { g.addColorStop(0, '#1d2740'); g.addColorStop(0.55, '#111827'); g.addColorStop(1, '#0b0f17'); }
    ctx.fillStyle = g;
  } else ctx.fillStyle = bg === 'dark' ? '#121212' : bg === 'light' ? '#f4f6fa' : (light ? '#eef2f7' : '#0b0f17');
  ctx.fillRect(0, 0, w, h);
}
function screenshotMenu(anchor) {
  const r = anchor.getBoundingClientRect();
  contextMenu(r.left, r.bottom + 4, [
    { label: t('shot.save'), icon: 'download', kbd: 'P', action: () => takeScreenshot('save') },
    { label: t('shot.copy'), icon: 'copy', action: () => takeScreenshot('copy') },
    { label: t('shot.transparent'), icon: 'image', action: () => takeScreenshot('save', true) },
  ]);
}
async function takeScreenshot(kind = 'save', transparent = false) {
  if (!state.doc) return;
  const png = await viewer.screenshot({ scale: 2, background: transparent ? null : paintBackground });
  if (kind === 'copy') {
    const r = await window.api.copyImage(png);
    toast(r.ok ? t('shot.copied') : t('shot.failed'), { type: r.ok ? 'ok' : 'err', timeout: 2000 });
    return;
  }
  const base = state.doc.file.name.replace(/\.[^.]+$/, '');
  const r = await window.api.saveExport([{ name: `${base}.png`, data: png }], 'PNG');
  if (r.ok) toast(t('shot.saved'), { type: 'ok', sub: r.name });
  else if (r.code !== 'canceled') toast(t('shot.failed'), { type: 'err', sub: r.message || r.code });
}

// --- Dışa aktarma ve ayarlar -----------------------------------------------------------------------------------------
function exportDialog(extra = {}) {
  const d = state.doc;
  if (!d) return;
  openExportDialog({
    doc: d, viewer, selection: state.selection, prefs: settings().exportPrefs || {}, ...extra,
    savePrefs: (p) => window.api.setSettings({ exportPrefs: p }),
  });
}
function openSettingsDialog(tab) {
  openSettings({ tab, data: state.data, acct: () => state.acct, syncText, onSaved: () => {} });
}

// --- Sürükle-bırak ----------------------------------------------------------------------------------------------------
let dragDepth = 0;
const dropEl = $('#drop');
dropEl.innerHTML = `<div>${icon('download')}<span>${esc(t('drop.title'))}</span></div>`;
window.addEventListener('dragenter', (e) => { if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); dragDepth++; dropEl.classList.remove('hidden'); });
window.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropEl.classList.add('hidden'); });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropEl.classList.add('hidden');
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  const p = window.api.pathForFile(f);
  if (!p) { toast(t('open.failed', { msg: 'path' }), { type: 'err' }); return; }
  window.api.openPath(p).then(handleOpenResult);
});

// --- Kısayollar ----------------------------------------------------------------------------------------------------
const VIEW_KEYS = { 1: 'front', 2: 'top', 3: 'right', 4: 'back', 5: 'left', 6: 'bottom', 7: 'iso' };
document.addEventListener('keydown', (e) => {
  if (document.querySelector('.modal-backdrop')) return;
  const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  const k = e.key.toLowerCase();
  if (e.ctrlKey && k === 'o') { e.preventDefault(); openDialog(); return; }
  if (e.ctrlKey && k === 'e') { e.preventDefault(); exportDialog(); return; }
  if (e.ctrlKey && k === 'f' && state.doc) { e.preventDefault(); $('#search').focus(); $('#search').select(); return; }
  if (e.key === 'Escape') {
    if (document.activeElement === $('#search')) { $('#search').value = ''; state.query = ''; renderTree(); $('#search').blur(); return; }
    if (!$('#loading').classList.contains('hidden')) { $('#ldCancel').click(); return; }
    if (measuring) { toggleMeasure(false); return; }
    if (state.selection.length) setSelection([]);
    return;
  }
  if (inInput || !state.doc || e.ctrlKey || e.metaKey) return;
  if (VIEW_KEYS[e.key]) { viewer.frame(VIEW_KEYS[e.key], null, true); return; }
  if (k === 'f') viewer.frame(viewer.currentViewDir(), state.selection[0] || null, true);
  else if (k === 'h' && e.altKey) { e.preventDefault(); showAll(); }
  else if (k === 'h') hideSelected();
  else if (k === 'i') isolate(state.selection);
  else if (k === 'w') { const i = MODES.findIndex(([m]) => m === viewer.opts.mode); setMode(MODES[(i + 1) % MODES.length][0]); }
  else if (k === 'e') animateExplode();
  else if (k === 'm') toggleMeasure();
  else if (k === 'p') takeScreenshot('save');
  else if (k === 'g') setViewer({ grid: vset().grid === false });
  else if (k === 'b') setViewer({ bbox: !vset().bbox });
  else if (e.key === ' ') { e.preventDefault(); toggleAnimation(); }
});

// İlk çizim (hoş geldiniz ekranı, depo gelmeden de görünsün)
renderWelcome();
