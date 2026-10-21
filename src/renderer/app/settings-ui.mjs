// Ayarlar penceresi (Mastertool ortak iskeleti: solda sekmeler) — Genel · Hesap · Görüntüleyici · Dışa aktarma · Biçimler ·
// Hakkında.
/* global t, icon, esc, h, toast, openModal, confirmBox, I18N, LANG */

import FORMATS from '../../formats.js';
import { stepMergeField, bindStepMerge } from './export-ui.mjs';

const OSS = [
  ['Master 3D', 'MIT'], ['three.js', 'MIT'], ['OpenCascade (occt-import-js)', 'LGPL-2.1'], ['Open Asset Import Library (assimpjs)', 'BSD-3-Clause / MIT'],
  ['web-ifc (That Open Company)', 'MPL-2.0'], ['rhino3dm (McNeel)', 'MIT'], ['Draco (Google)', 'Apache-2.0'], ['Basis Universal', 'Apache-2.0'],
  ['meshoptimizer', 'MIT'], ['fflate', 'MIT'], ['chevrotain', 'Apache-2.0'], ['Electron', 'MIT'], ['Chromium', 'BSD-3-Clause +'], ['Node.js', 'MIT'], ['@napi-rs/keyring', 'MIT'],
];

export async function openSettings({ tab = 'general', data, acct, syncText }) {
  const s = data.settings || {};
  const v = s.viewer || {};
  let appTheme = s.appTheme || 'system';
  const about = await window.api.about();
  const shell = data.platform === 'win32' ? await window.api.shellStatus() : { supported: false };
  const a = acct();
  const email = (a.user && a.user.email) || a.email || '';
  const langOptions = Object.entries(I18N.LANGUAGES).map(([code, l]) => `<option value="${code}" ${code === LANG ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  const tabs = [['general', 'gear', t('set.general')], ['account', 'user', t('set.account')], ['viewer', 'cube', t('set.viewer')], ['export', 'export', t('set.export')], ['formats', 'layers', t('set.formats')], ['about', 'bolt', t('set.about')]];
  const opt = (name, list, cur, label) => `<select class="input" id="${name}">${list.map((x) => `<option value="${x}" ${cur === x ? 'selected' : ''}>${esc(label(x))}</option>`).join('')}</select>`;
  const shellState = !shell.supported ? '' : shell.registered ? (shell.pointsHere ? t('shell.stateOk') : t('shell.stateOther')) : t('shell.stateOff');

  const body = h(`<div class="set-wrap">
    <nav class="set-nav">${tabs.map(([k, ic, label]) => `<button type="button" data-tab="${k}">${icon(ic)}<span>${esc(label)}</span></button>`).join('')}</nav>
    <div class="set-pages">
      <section data-page="general">
        <div class="field"><label>${esc(t('set.language'))}</label><select class="input" id="s-lang">${langOptions}</select>
          <small class="set-hint">${esc(t('set.languageHint'))}</small></div>
        <div class="field"><label>${esc(t('set.theme'))}</label>
          <div class="seg" id="s-theme">
            <button type="button" data-v="dark">${icon('moon')}${esc(t('set.themeDark'))}</button>
            <button type="button" data-v="light">${icon('sun')}${esc(t('set.themeLight'))}</button>
            <button type="button" data-v="system">${icon('monitor')}${esc(t('set.themeSystem'))}</button>
          </div></div>
        ${data.platform === 'win32' ? `<div class="section-title">${esc(t('set.explorer'))}</div>
        <label class="check"><input type="checkbox" id="s-shell" ${s.shellMenu !== false ? 'checked' : ''} ${shell.supported ? '' : 'disabled'}>
          <span>${esc(t('set.shellMenu'))}<small>${esc(t('set.shellMenuHint'))}${shellState ? ` — ${esc(shellState)}` : ''}</small></span></label>` : ''}
        <div class="section-title">${esc(t('set.updates'))}</div>
        <label class="check"><input type="checkbox" id="s-upd" ${s.checkUpdates !== false ? 'checked' : ''}>
          <span>${esc(t('set.checkUpdates'))}<small>${esc(t('set.checkUpdatesHint'))}</small></span></label>
      </section>

      <section data-page="account">
        <div class="acct-box">
          <div class="acct-who">${icon('user')}<span>${esc(t('acct.signedInAs', { email }))}</span></div>
          <label class="check"><input type="checkbox" id="s-sync" ${a.syncEnabled ? 'checked' : ''}>
            <span>${esc(t('acct.syncToggle'))}<small>${esc(t('acct.syncHint'))}</small></span></label>
          <div class="acct-status">${icon('cloud')}<span id="acct-status">${esc(syncText(a))}</span></div>
          <div class="acct-actions">
            <button class="btn sm" type="button" id="s-syncnow">${icon('refresh')}${esc(t('acct.syncNow'))}</button>
            <button class="btn sm" type="button" id="s-delremote">${icon('trash')}${esc(t('acct.deleteRemote'))}</button>
          </div>
          <div class="acct-actions">
            <button class="btn sm" type="button" id="s-web">${icon('open')}${esc(t('acct.myAccount'))}</button>
            <span style="flex:1"></span>
            <button class="btn sm danger" type="button" id="s-logout">${icon('logout')}${esc(t('acct.logout'))}</button>
          </div>
        </div>
        <div class="note">${icon('shield')}<span>${esc(t('privacy.note'))}</span></div>
      </section>

      <section data-page="viewer">
        <div class="row c-1-1">
          <div class="field"><label>${esc(t('set.units'))}</label>${opt('s-units', ['auto', 'mm', 'cm', 'm', 'in', 'ft'], v.units || 'auto', (x) => (x === 'auto' ? t('set.unitsAuto') : x))}
            <small class="hint">${esc(t('set.unitsHint'))}</small></div>
          <div class="field"><label>${esc(t('set.upAxis'))}</label>${opt('s-up', ['auto', 'y', 'z'], v.upAxis || 'auto', (x) => (x === 'auto' ? t('set.upAuto') : t('set.up', { a: x.toUpperCase() })))}
            <small class="hint">${esc(t('set.upHint'))}</small></div>
        </div>
        <div class="row c-1-1">
          <div class="field"><label>${esc(t('set.cadQuality'))}</label>${opt('s-cad', ['low', 'medium', 'high'], v.cadQuality || 'medium', (x) => t('set.cadQ.' + x))}
            <small class="hint">${esc(t('set.cadQualityHint'))}</small></div>
          <div class="field"><label>${esc(t('set.projection'))}</label>${opt('s-proj', ['perspective', 'orthographic'], v.projection || 'perspective', (x) => t(x === 'perspective' ? 'view.persp' : 'view.ortho'))}</div>
        </div>
        <div class="row c-1-1">
          <div class="field"><label>${esc(t('insp.background'))}</label>${opt('s-bg', ['gradient', 'solid', 'dark', 'light', 'transparent'], v.background || 'gradient', (x) => t('bg.' + x))}</div>
          <div class="field"><label>${esc(t('insp.lighting'))}</label>${opt('s-light', ['studio', 'soft', 'headlight'], v.lighting || 'studio', (x) => t('light.' + x))}</div>
        </div>
        <label class="check"><input type="checkbox" id="s-zoom" ${v.invertZoom ? 'checked' : ''}><span>${esc(t('set.invertZoom'))}</span></label>
        <label class="check"><input type="checkbox" id="s-stats" ${v.showStats !== false ? 'checked' : ''}><span>${esc(t('set.showStats'))}</span></label>
        <div class="note">${icon('info')}<span>${esc(t('set.viewerNote'))}</span></div>
      </section>

      <section data-page="export">
        <div class="set-hint">${esc(t('set.exportIntro'))}</div>
        <div class="section-title">${esc(t('set.stepTitle'))}</div>
        ${stepMergeField('s-stepmerge', (s.exportPrefs || {}).stepMerge ?? 20)}
        <div class="note">${icon('info')}<span>${esc(t('exp.note.step'))}</span></div>
      </section>

      <section data-page="formats">
        <div class="set-hint">${esc(t('set.formatsIntro', { n: FORMATS.IMPORT.length, m: FORMATS.EXPORT.length }))}</div>
        <div class="section-title">${esc(t('set.formatsRead'))}</div>
        <table class="fmt-table"><tbody>${FORMATS.IMPORT.map((f) => `<tr><td>${esc(f.name)}${f.note ? `<div class="muted" style="font-weight:400;white-space:normal;font-size:11px;margin-top:2px">${esc(t('fmt.note.' + f.id))}</div>` : ''}</td>
          <td>${esc(f.ext.map((e) => '.' + e).join(' '))}</td><td>${esc(t('engine.' + f.engine))}</td></tr>`).join('')}</tbody></table>
        <div class="section-title">${esc(t('set.formatsWrite'))}</div>
        <table class="fmt-table"><tbody>${FORMATS.EXPORT.map((f) => `<tr><td>${esc(f.name)}</td><td>.${esc(f.ext)}</td><td style="white-space:normal">${esc(t('exp.desc.' + f.id))}</td></tr>`).join('')}</tbody></table>
        <div class="note">${icon('alert')}<span>${esc(t('set.formatsClosed'))}</span></div>
      </section>

      <section data-page="about">
        <div class="about-head">
          <img src="../../build/icon.png" alt="">
          <div><div class="about-name">Master 3D</div>
            <div class="about-ver">${esc(t('about.version', { version: about.version }))}${about.portable ? ` · ${esc(t('about.portable'))}` : ''}</div></div>
        </div>
        <div class="set-hint">${esc(t('about.family'))}</div>
        <div class="acct-actions">
          <button class="btn sm" type="button" id="s-update">${icon('refresh')}${esc(t('about.checkUpdate'))}</button>
          <button class="btn sm" type="button" id="s-tool">${icon('globe')}${esc(t('about.toolPage'))}</button>
          <span class="about-update" id="s-update-result"></span>
        </div>
        <div class="section-title">${esc(t('about.licenses'))}</div>
        <div class="set-hint">${esc(t('about.licensesIntro'))}</div>
        <ul class="oss">${OSS.map(([n, l]) => `<li><span>${esc(n)}</span><span>${esc(l)}</span></li>`).join('')}</ul>
        <div class="acct-actions">
          <button class="btn sm" type="button" id="s-licenses">${icon('file')}${esc(t('about.chromium'))}</button>
          <span class="set-hint">Electron ${esc(about.electron)} · Chromium ${esc(about.chrome)}</span>
        </div>
      </section>
    </div>
  </div>`);

  const q = (sel) => body.querySelector(sel);
  const showTab = (k) => {
    body.querySelectorAll('.set-nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
    body.querySelectorAll('.set-pages section').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== k));
  };
  body.querySelectorAll('.set-nav button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  showTab(tabs.some(([k]) => k === tab) ? tab : 'general');
  const stepMerge = bindStepMerge(body, 's-stepmerge');

  const originalTheme = appTheme;
  const setTheme = (val) => {
    appTheme = val;
    body.querySelectorAll('#s-theme button').forEach((b) => b.classList.toggle('on', b.dataset.v === val));
    window.api.setSettings({ appTheme: val });
  };
  body.querySelectorAll('#s-theme button').forEach((b) => (b.onclick = () => setTheme(b.dataset.v)));
  body.querySelectorAll('#s-theme button').forEach((b) => b.classList.toggle('on', b.dataset.v === appTheme));

  q('#s-sync').onchange = async (e) => {
    const on = e.target.checked;
    const r = await window.api.setSyncEnabled(on);
    if (!r.ok) { e.target.checked = !on; toast(t('sync.error', { msg: r.code }), { type: 'err' }); }
  };
  q('#s-syncnow').onclick = () => window.api.syncNow();
  q('#s-delremote').onclick = async () => {
    const ok = await confirmBox(t('acct.deleteRemote'), esc(t('acct.deleteRemoteMsg')));
    if (!ok) return;
    const r = await window.api.deleteRemoteLibrary();
    if (r.ok) { q('#s-sync').checked = false; toast(t('acct.deleteRemoteDone'), { type: 'ok' }); } else toast(t('sync.error', { msg: r.code }), { type: 'err' });
  };
  q('#s-web').onclick = () => window.api.openWeb('account');
  q('#s-logout').onclick = async () => {
    const ok = await confirmBox(t('acct.logout'), esc(t('acct.logoutMsg')), { okText: t('acct.logout') });
    if (ok) window.api.logout();
  };
  q('#s-update').onclick = async () => {
    const out = q('#s-update-result');
    out.className = 'about-update';
    out.textContent = t('about.checking');
    const r = await window.api.checkUpdate();
    if (!r.ok) { out.classList.add('err'); out.textContent = t('about.checkFailed', { msg: r.message || r.code }); return; }
    if (r.newer) { out.classList.add('new'); out.textContent = `${t('update.available', { version: r.latest })} — ${t('update.hint')}`; } else { out.classList.add('ok'); out.textContent = t('about.upToDate'); }
  };
  q('#s-tool').onclick = () => window.api.openWeb('tool');
  q('#s-licenses').onclick = () => window.api.openLicenses();

  const res = await openModal({
    title: t('set.title'), iconName: 'gear', width: 820, body,
    buttons: [
      { label: t('common.cancel'), value: null },
      {
        label: t('common.save'), cls: 'primary', onClick: (m) => ({
          appTheme,
          language: m.querySelector('#s-lang').value,
          checkUpdates: m.querySelector('#s-upd').checked,
          exportPrefs: { stepMerge: stepMerge() },
          ...(m.querySelector('#s-shell') && !m.querySelector('#s-shell').disabled ? { shellMenu: m.querySelector('#s-shell').checked } : {}),
          viewer: {
            units: m.querySelector('#s-units').value, upAxis: m.querySelector('#s-up').value, cadQuality: m.querySelector('#s-cad').value,
            projection: m.querySelector('#s-proj').value, background: m.querySelector('#s-bg').value, lighting: m.querySelector('#s-light').value,
            invertZoom: m.querySelector('#s-zoom').checked, showStats: m.querySelector('#s-stats').checked,
          },
        }),
      },
    ],
  });
  if (!res) {
    if (appTheme !== originalTheme) window.api.setSettings({ appTheme: originalTheme });
    return;
  }
  const langChanged = res.language !== LANG;
  if (!langChanged) delete res.language;
  await window.api.setSettings(res);
  if (!langChanged) toast(t('set.saved'), { type: 'ok' });
}
