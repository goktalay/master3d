// Dışa aktarma penceresi: biçim kartları (formats.js › EXPORT), kapsam (tümü · seçili · görünen), patlatılmış konum,
// birim / eksen dönüşümü, her parçayı ayrı dosyaya. Yazım core/export/*, kaydetme ana süreçte (kaydet iletişim kutusu).
/* global t, icon, esc, h, toast, openModal */

import FORMATS from '../../formats.js';
import { exportModel, exportEach } from '../../core/export/index.mjs';
import { TARGET } from '../../core/export/prepare.mjs';
import { mergeTolerance } from '../../core/export/planar.mjs';
import { isShown } from '../../core/scene.mjs';
import { formatBytes } from './units.mjs';

// Doku → PNG (OBJ + MTL dokuları için)
async function encodeImage(tex, base) {
  const img = tex.image;
  if (!img || !img.width) return null;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  if (tex.flipY === false) { ctx.translate(0, c.height); ctx.scale(1, -1); }
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return blob ? { name: `${base}.png`, data: new Uint8Array(await blob.arrayBuffer()) } : null;
}

function targetHint(id) {
  const tg = TARGET[id] || {};
  if (!tg.up && !tg.unit) return t('exp.convNone');
  return t('exp.convTo', { unit: tg.unit || t('exp.unitSame'), up: (tg.up || '?').toUpperCase() });
}

const pct = (v) => (v / 100).toLocaleString(document.documentElement.lang || undefined, { style: 'percent' });

// STEP düzlemsel yüz birleştirme alanı (Dışa aktar penceresi ve Ayarlar › Dışa aktarma ortak)
export function stepMergeField(id, value) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return `<div class="field step-merge"><label for="${id}">${esc(t('exp.stepMerge'))}</label>
    <div class="sm-row"><input type="range" id="${id}" min="0" max="100" step="1" value="${v}"><b class="sm-val" data-for="${id}">${pct(v)}</b></div>
    <small class="hint sm-tol" data-for="${id}"></small>
    <small class="hint">${esc(t('exp.stepMergeHint'))}</small></div>`;
}
export function bindStepMerge(root, id) {
  const r = root.querySelector('#' + id);
  const upd = () => {
    const p = Number(r.value);
    root.querySelector(`.sm-val[data-for="${id}"]`).textContent = pct(p);
    const tol = mergeTolerance(p, 100);
    const nf = (x, d) => x.toLocaleString(document.documentElement.lang || undefined, { maximumFractionDigits: d });
    root.querySelector(`.sm-tol[data-for="${id}"]`).textContent = tol ? t('exp.stepMergeTol', { a: nf(tol.angle, 1), d: nf(tol.dist, 3) }) : t('exp.stepMergeOff');
  };
  r.addEventListener('input', upd);
  upd();
  return () => Number(r.value);
}

export async function openExportDialog({ doc, viewer, selection, prefs, scope: forceScope, savePrefs }) {
  let fmtId = FORMATS.exportById(prefs.format) ? prefs.format : 'glb';
  const hasSel = selection.length > 0;
  let scope = forceScope || (prefs.scope === 'selected' && !hasSel ? 'all' : prefs.scope || 'all');
  if (scope === 'selected' && !hasSel) scope = 'all';
  const exploded = (doc.explodeAmount || 0) > 0;
  const body = h(`<div class="exp-opts">
    <div class="exp-grid">${FORMATS.EXPORT.map((f) => `<div class="exp-card ${f.id === fmtId ? 'on' : ''}" data-id="${f.id}" tabindex="0">
      ${f.rec ? `<span class="rec">${esc(t('exp.recommended'))}</span>` : ''}
      <b>${esc(f.name)}<span class="ext">.${esc(f.ext)}</span></b><small>${esc(t('exp.desc.' + f.id))}</small></div>`).join('')}</div>
    <div class="field"><label>${esc(t('exp.scope'))}</label>
      <div class="seg" id="eScope">
        <button type="button" data-v="all">${icon('cube')}${esc(t('exp.scopeAll'))}</button>
        <button type="button" data-v="selected" ${hasSel ? '' : 'disabled'}>${icon('check')}${esc(t('exp.scopeSel', { n: selection.length }))}</button>
        <button type="button" data-v="visible">${icon('eye')}${esc(t('exp.scopeVisible'))}</button>
      </div></div>
    <label class="check"><input type="checkbox" id="eConv" ${prefs.convert !== false ? 'checked' : ''}><span>${esc(t('exp.convert'))}<small id="eConvHint"></small></span></label>
    <label class="check ${exploded ? '' : 'hidden'}"><input type="checkbox" id="eExpl" ${prefs.exploded ? 'checked' : ''}><span>${esc(t('exp.exploded'))}<small>${esc(t('exp.explodedHint'))}</small></span></label>
    <label class="check"><input type="checkbox" id="eEach" ${prefs.each ? 'checked' : ''}><span>${esc(t('exp.each'))}<small>${esc(t('exp.eachHint'))}</small></span></label>
    <div id="eStepBox">${stepMergeField('eStep', prefs.stepMerge ?? 20)}</div>
    <div class="exp-note" id="eNote"></div>
  </div>`);
  const q = (s) => body.querySelector(s);
  const stepMerge = bindStepMerge(body, 'eStep');
  const paint = () => {
    q('#eStepBox').classList.toggle('hidden', fmtId !== 'step');
    body.querySelectorAll('.exp-card').forEach((c) => c.classList.toggle('on', c.dataset.id === fmtId));
    body.querySelectorAll('#eScope button').forEach((b) => b.classList.toggle('on', b.dataset.v === scope));
    q('#eConvHint').textContent = targetHint(fmtId);
    const note = t('exp.note.' + fmtId);
    q('#eNote').innerHTML = note !== 'exp.note.' + fmtId ? `${icon('info')}<span>${esc(note)}</span>` : '';
  };
  body.querySelectorAll('.exp-card').forEach((c) => {
    c.onclick = () => { fmtId = c.dataset.id; paint(); };
    c.ondblclick = () => { fmtId = c.dataset.id; paint(); body.closest('.modal').querySelector('footer .btn.primary').click(); };
  });
  body.querySelectorAll('#eScope button').forEach((b) => (b.onclick = () => { if (!b.disabled) { scope = b.dataset.v; paint(); } }));
  paint();

  await openModal({
    title: t('exp.title'), iconName: 'export', width: 820, body,
    buttons: [
      { label: t('common.cancel'), value: null },
      {
        label: t('exp.go'), cls: 'primary', icon: 'export',
        onClick: async (modal, btn) => {
          const fmt = FORMATS.exportById(fmtId);
          const opts = { convert: q('#eConv').checked, exploded: exploded && q('#eExpl').checked, each: q('#eEach').checked, stepMerge: stepMerge() };
          savePrefs({ format: fmtId, scope, ...opts });
          btn.disabled = true;
          btn.innerHTML = `<span class="spin"></span>${esc(t('exp.working'))}`;
          await new Promise((r) => setTimeout(r, 30)); // düğme durumu çizilsin
          // Patlatılmış konum istenmiyorsa geçici olarak toplanır
          const amount = doc.explodeAmount || 0;
          if (doc.explode && amount && !opts.exploded) doc.explode.apply(0);
          try {
            const sel = scope === 'selected' ? selection : null;
            const common = {
              baseName: doc.file.name.replace(/\.[^.]+$/, ''),
              src: { up: doc.upAxis, unit: doc.srcUnit }, convert: opts.convert, onlyVisible: scope === 'visible',
              animations: doc.result.animations || [], encodeImage, stepMerge: opts.stepMerge,
            };
            let res;
            if (opts.each) {
              const parts = (sel || doc.parts).filter((p) => scope !== 'visible' || isShown(p));
              const files = await exportEach(doc.root, fmtId, parts, common);
              res = await window.api.saveExportFolder(files);
              if (res.ok) toast(t('exp.doneEach', { n: res.count }), { type: 'ok', sub: res.path });
            } else {
              const out = await exportModel(doc.root, fmtId, { ...common, selection: sel });
              for (const w of out.warnings) toast(t(w.key, w.vars), { timeout: 6000 });
              const size = out.files.reduce((a, f) => a + f.data.byteLength, 0);
              res = await window.api.saveExport(out.files, fmt.name);
              if (res.ok) {
                const el = toast(t('exp.done', { name: res.name }), { type: 'ok', sub: formatBytes(size), timeout: 6000 });
                const b = h(`<button class="btn sm" type="button">${icon('folder')}${esc(t('ctx.showInFolder'))}</button>`);
                b.onclick = () => window.api.showExported(res.path);
                el.appendChild(b);
              }
            }
            if (!res.ok && res.code !== 'canceled') toast(t('exp.failed', { msg: res.message || res.code }), { type: 'err' });
            if (!res.ok && res.code === 'canceled') return false;
            return true;
          } catch (e) {
            console.error(e);
            toast(t('exp.failed', { msg: e.code === 'nothing_to_export' ? t('exp.nothing') : e.message }), { type: 'err', timeout: 7000 });
            return false;
          } finally {
            if (doc.explode && amount && !opts.exploded) doc.explode.apply(amount);
            viewer.invalidate();
            btn.disabled = false;
            btn.innerHTML = `${icon('export')}${esc(t('exp.go'))}`;
          }
        },
      },
    ],
  });
}
