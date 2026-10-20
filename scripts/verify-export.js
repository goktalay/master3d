// Uygulama içi dışa aktarma doğrulaması: bir modeli arayüzün Dışa aktar penceresiyle her biçime yazar, yazılan dosyayı
// yine arayüzde açar ve üçgen / parça sayısını karşılaştırır. Kullanım: npm run verify-export [-- <model yolu>]
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./harness');
const FORMATS = require('../src/formats');

const model = process.argv[2] || path.join(H.ROOT, 'samples', 'step', 'as1-oc-214.stp');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'm3-export-'));

(async () => {
  const srv = await H.startServer();
  const browser = await H.launch();
  const page = await H.openApp(browser, srv, { theme: 'dark', width: 1280, height: 800, saveDir: OUT });
  const base = await H.openModel(page, model);
  if (!base.ok) throw new Error('model açılamadı: ' + base.error);
  console.log(`kaynak: ${path.basename(model)} · ${base.parts} parça · ${base.triangles} üçgen`);
  const rows = [];
  for (const f of FORMATS.EXPORT) {
    await H.openModel(page, model);
    for (const n of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, n), { recursive: true });
    await page.click('#btnExport');
    await page.waitForSelector('.exp-grid');
    await page.click(`.exp-card[data-id="${f.id}"]`);
    await page.click('.modal footer .btn.primary');
    await page.waitForSelector('.modal-backdrop', { state: 'detached', timeout: 120000 });
    const files = fs.readdirSync(OUT);
    const main = files.find((n) => n.toLowerCase().endsWith('.' + f.ext));
    if (!main) { rows.push({ f, ok: false, error: 'dosya yazılmadı' }); console.log(`× ${f.id}: dosya yazılmadı`); continue; }
    const size = fs.statSync(path.join(OUT, main)).size;
    const r = await H.openModel(page, path.join(OUT, main), { timeout: 180000 });
    const same = r.ok && r.triangles === base.triangles;
    rows.push({ f, size, files, ...r, same });
    console.log(`${r.ok ? (same ? '✓' : '≈') : '×'} ${f.id.padEnd(10)} ${files.join(', ').padEnd(34)} ${(size / 1024).toFixed(0).padStart(6)} KB → ${r.ok ? `${r.engine} · ${r.parts} parça · ${r.triangles} üçgen` : r.error}`);
  }
  const ok = rows.filter((r) => r.ok).length;
  const same = rows.filter((r) => r.same).length;
  const md = ['# Dışa aktarma doğrulaması', '', `scripts/verify-export.js çıktısı (${new Date().toISOString().slice(0, 10)}). Kaynak: \`${path.basename(model)}\` (${base.parts} parça, ${base.triangles} üçgen).`,
    `Her biçim arayüzün Dışa aktar penceresiyle yazıldı ve yazılan dosya yine Master 3D'de açıldı: **${ok} / ${rows.length}** açıldı, **${same}** dosyada üçgen sayısı birebir aynı.`, '',
    '| Biçim | Yazılan dosyalar | Boyut | Geri okuyan | Parça | Üçgen |', '|---|---|---:|---|---:|---:|',
    ...rows.map((r) => `| ${r.f.name} | ${(r.files || []).map((n) => '`' + n + '`').join(' ')} | ${r.size ? (r.size / 1024).toFixed(0) + ' KB' : ''} | ${r.ok ? r.engine : '**' + r.error + '**'} | ${r.ok ? r.parts : ''} | ${r.ok ? r.triangles : ''} |`), ''];
  fs.writeFileSync(path.join(H.ROOT, 'docs', 'export-verification.md'), md.join('\n'));
  console.log(`\n${ok}/${rows.length} açıldı, ${same} birebir → docs/export-verification.md`);
  if (page.errors.length) console.log('sayfa hataları:', page.errors.slice(0, 10));
  await browser.close();
  await srv.close();
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exitCode = ok === rows.length ? 0 : 1;
})().catch((e) => { console.error(e); process.exit(1); });
