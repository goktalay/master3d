// Biçim doğrulaması: samples/ altındaki gerçek örnek dosyaları (npm run samples) arayüzün kendi açma akışıyla tek tek
// açar; okuyucu, parça / üçgen sayısı, uyarılar ve süreyi docs/format-verification.md tablosuna yazar. --thumbs ile her
// model için küçük resim üretir (samples/_thumbs/, kontrol sayfası contact.png).
// Kullanım: npm run verify-formats [-- --thumbs] [-- ext1,ext2]
'use strict';

const fs = require('fs');
const path = require('path');
const H = require('./harness');
const FORMATS = require('../src/formats');

const SAMPLES = path.join(H.ROOT, 'samples');
const thumbs = process.argv.includes('--thumbs');
const only = (process.argv.find((a) => /^[\w,]+$/.test(a) && !a.startsWith('-') && a !== process.argv[1]) || '').split(',').filter(Boolean);

function listSamples() {
  const out = [];
  for (const dir of fs.readdirSync(SAMPLES)) {
    const d = path.join(SAMPLES, dir);
    if (!fs.statSync(d).isDirectory() || dir === '_thumbs') continue;
    for (const f of fs.readdirSync(d)) {
      const fmt = FORMATS.formatOf(f);
      if (!fmt) continue;
      if (only.length && !only.includes(FORMATS.extOf(f)) && !only.includes(fmt.id)) continue;
      out.push({ file: path.join(d, f), name: f, fmt });
    }
  }
  return out.sort((a, b) => FORMATS.IMPORT.indexOf(a.fmt) - FORMATS.IMPORT.indexOf(b.fmt) || a.name.localeCompare(b.name));
}

(async () => {
  const list = listSamples();
  if (!list.length) { console.error('samples/ boş: önce npm run samples'); process.exit(1); }
  const srv = await H.startServer();
  const browser = await H.launch();
  const page = await H.openApp(browser, srv, { theme: 'dark', width: 1280, height: 800 });
  const rows = [];
  const tdir = path.join(SAMPLES, '_thumbs');
  if (thumbs) fs.mkdirSync(tdir, { recursive: true });
  let i = 0;
  for (const s of list) {
    i++;
    let r;
    try { r = await H.openModel(page, s.file, { timeout: 180000 }); } catch (e) { r = { ok: false, error: e.message.split('\n')[0] }; }
    const size = fs.statSync(s.file).size;
    rows.push({ ...s, size, ...r });
    console.log(`${String(i).padStart(2)}/${list.length} ${r.ok ? '✓' : '×'} ${s.fmt.id.padEnd(6)} ${s.name.padEnd(30)} ${r.ok ? `${r.engine} · ${r.parts} parça · ${r.triangles} üçgen${r.points ? ` · ${r.points} nokta` : ''} · ${r.ms} ms${r.warnings.length ? ' · uyarı: ' + r.warnings.join(', ') : ''}` : r.error}`);
    if (thumbs && r.ok) {
      await page.waitForTimeout(400);
      const box = await page.locator('#stage').boundingBox();
      await page.screenshot({ path: path.join(tdir, `${String(i).padStart(2, '0')}-${s.fmt.id}-${s.name.replace(/[^\w.-]+/g, '_')}.png`), clip: box, timeout: 120000 });
    }
  }
  if (page.errors.length) console.log('sayfa hataları:', page.errors.slice(0, 20));
  // Tablo
  const ok = rows.filter((r) => r.ok).length;
  const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const md = [`# Biçim doğrulaması`, '', `scripts/verify-formats.js çıktısı (${new Date().toISOString().slice(0, 10)}). Örnekler: three.js, assimp ve occt-import-js depolarının test / örnek`,
    `modelleri (\`npm run samples\`). Her dosya arayüzün açma akışıyla (Chromium, WebGL) açıldı. Sonuç: **${ok} / ${rows.length}** dosya açıldı.`, '',
    '| Biçim | Dosya | Boyut | Okuyucu | Parça | Üçgen | Nokta | Süre | Not |', '|---|---|---|---|---:|---:|---:|---:|---|',
    ...rows.map((r) => `| ${r.fmt.name} | \`${r.name}\` | ${kb(r.size)} | ${r.ok ? r.engine : '—'} | ${r.ok ? r.parts : ''} | ${r.ok ? r.triangles.toLocaleString('tr-TR') : ''} | ${r.ok && r.points ? r.points.toLocaleString('tr-TR') : ''} | ${r.ok ? (r.ms / 1000).toFixed(1) + ' sn' : ''} | ${r.ok ? (r.warnings || []).join('; ') : '**açılamadı:** ' + String(r.error).replace(/\|/g, '/')} |`), ''];
  fs.writeFileSync(path.join(H.ROOT, 'docs', 'format-verification.md'), md.join('\n'));
  console.log(`\n${ok}/${rows.length} açıldı → docs/format-verification.md`);
  await browser.close();
  await srv.close();
  process.exitCode = ok === rows.length ? 0 : 1;
})().catch((e) => { console.error(e); process.exit(1); });
