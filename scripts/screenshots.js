// 1600×1000 ekran görüntüleri ve manifest.json üretir: Türkçe set docs/screenshots/, İngilizce set docs/screenshots/en/.
// Arayüz gerçek dosyalardan (src/renderer + gen) yüklenir, modeller samples/ altındaki gerçek örnek dosyalardır
// (npm run samples); window.api taklit edilir (scripts/harness.js) — gerçek hesap ya da kişisel veri yok.
// Kullanım: npm run screenshots   (Chromium yolu: CHROMIUM_PATH)
'use strict';

const fs = require('fs');
const path = require('path');
const H = require('./harness');
const FORMATS = require('../src/formats');
const NF = FORMATS.IMPORT.length;

const ROOT = H.ROOT;
const S = (p) => path.join(ROOT, 'samples', p);
const OUT_BASE = path.join(ROOT, 'docs', 'screenshots');
const NOW = Date.UTC(2026, 9, 20, 9, 30);

const T = {
  welcome: { tr: ['Sürükle-bırak ve son açılanlar', `${NF} biçim ailesi; dosyalar yalnız bu bilgisayarda açılır`], en: ['Drag and drop, recent files', `${NF} format families; files are opened only on this computer`] },
  step: { tr: ['STEP montajı: parça ağacı ve özellikler', 'OpenCascade ile; boyut, alan, hacim, B-rep yüzleri'], en: ['STEP assembly: part tree and properties', 'Powered by OpenCascade; size, area, volume, B-rep faces'] },
  explode: { tr: ['Patlatma: parçalar ortadan dışa açılır', 'Kaydırıcıyla %0–100; ortadan, X / Y / Z ya da montaj ağacına göre'], en: ['Exploded view from the center', 'Slider from 0 to 100%; center, X / Y / Z or by the assembly tree'] },
  tree: { tr: ['Montaj ağacına göre patlatma', 'Her alt montaj kendi ortasından; 3MF, STEP, glTF, FBX'], en: ['Exploded by the assembly tree', 'Each sub-assembly opens from its own center; 3MF, STEP, glTF, FBX'] },
  pbr: { tr: ['glTF / GLB: PBR malzeme ve dokular', 'Stüdyo ışığı, zemin gölgesi; FBX, OBJ, USDZ, COLLADA da açılır'], en: ['glTF / GLB: PBR materials and textures', 'Studio lighting, ground shadow; FBX, OBJ, USDZ, COLLADA open too'] },
  ifc: { tr: ['IFC (BIM): kat ve yapı elemanları', 'Duvar, döşeme, pencere, kapı; mekânsal yapıya göre ağaç'], en: ['IFC (BIM): storeys and building elements', 'Walls, slabs, windows, doors; tree by spatial structure'] },
  section: { tr: ['Kesit düzlemi', 'X / Y / Z ekseninde kaydırarak modelin içini görün'], en: ['Section plane', 'Slide along X / Y / Z to look inside the model'] },
  measure: { tr: ['Ölçüm ve sınır kutusu', 'İki nokta arası uzaklık; G × Y × D ölçüleri model biriminde'], en: ['Measuring and bounding box', 'Point-to-point distance; W × H × D in the model’s unit'] },
  wire: { tr: ['Gölgeli + kenarlar, tel kafes, X-ışını', 'Görünüm kipleri: W ile değiştirin'], en: ['Shaded + edges, wireframe, X-ray', 'Display modes: press W to switch'] },
  points: { tr: ['Nokta bulutu: PCD, PLY, XYZ', 'Milyonlarca nokta; renkli taramalar'], en: ['Point clouds: PCD, PLY, XYZ', 'Millions of points; coloured scans'] },
  export: { tr: ['Dışa aktar: 15 biçim', 'GLB, FBX, OBJ, STEP, STL, 3MF, USDZ…; seçili parça ya da her parça ayrı dosya'], en: ['Export: 15 formats', 'GLB, FBX, OBJ, STEP, STL, 3MF, USDZ…; selected part or each part to its own file'] },
  formats: { tr: ['Ayarlar › Biçimler', 'Hangi biçim hangi okuyucuyla açılır; bilinen sınırlar'], en: ['Settings › Formats', 'Which format opens with which reader; known limits'] },
  login: { tr: ['Mastertool hesabıyla giriş', 'Başka bir Mastertool uygulamasında giriş yapıldıysa şifresiz açılır'], en: ['Sign in with your Mastertool account', 'Opens without a password if you are signed in to another Mastertool app'] },
};

const recent = (lang) => [
  ['step/as1-oc-214.stp', 2], ['gltf-helmet/DamagedHelmet.gltf', 5], ['3mf/truck.3mf', 26], ['ifc/AC14-FZK-Haus.ifc', 49], ['fbx/Samba Dancing.fbx', 75], ['stl/pr2_head_pan.stl', 130],
].map(([p, m]) => ({ path: S(p), name: path.basename(p), size: fs.statSync(S(p)).size, openedAt: NOW - m * 60000, exists: true, format: null }));

async function scene(page, fn) { await fn(page); await page.waitForTimeout(700); }
const click = (page, sel) => page.click(sel);
const setRange = (page, sel, v) => page.$eval(sel, (el, val) => { el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }, v);

// Modelin üzerinde iki nokta (ölçüm için): kanvasta ızgara taranır, isabet eden ilk ve son nokta
async function modelPoints(page) {
  return page.evaluate(() => {
    const v = window.M3.viewer;
    const c = document.querySelector('canvas.viewport').getBoundingClientRect();
    const hits = [];
    for (let y = 0.3; y <= 0.7; y += 0.04) for (let x = 0.25; x <= 0.75; x += 0.04) {
      const px = c.left + c.width * x, py = c.top + c.height * y;
      if (v.pickAt(px, py)) hits.push([px, py]);
    }
    return hits.length > 1 ? [hits[0], hits[hits.length - 1]] : null;
  });
}

async function main() {
  const srv = await H.startServer();
  const browser = await H.launch();
  for (const lang of ['tr', 'en']) {
    const OUT = lang === 'tr' ? OUT_BASE : path.join(OUT_BASE, 'en');
    fs.mkdirSync(OUT, { recursive: true });
    for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
    const manifest = [];
    const errors = [];
    const shot = async (file, theme, key, setup, opts = {}) => {
      const page = await H.openApp(browser, srv, { lang, theme, recent: recent(lang), ...opts });
      await setup(page);
      await page.waitForTimeout(900);
      await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
      await page.screenshot({ path: path.join(OUT, file), timeout: 120000 });
      errors.push(...page.errors.filter((e) => !/PropertyBinding|Failed to load resource|Couldn't load texture/.test(e)));
      await page.context().close();
      manifest.push({ file, theme, title: T[key][lang][0], caption: T[key][lang][1] });
      console.log(lang, file);
    };
    const open = (p) => async (page) => { const r = await H.openModel(page, S(p)); if (!r.ok) throw new Error(p + ': ' + r.error); };

    await shot('01-hos-geldiniz-gece.png', 'dark', 'welcome', async () => {});
    await shot('02-step-montaj-gece.png', 'dark', 'step', async (p) => {
      await open('step/as1-oc-214.stp')(p);
      // "rod" satırı (ağaçta görünür olana kadar bekle; tıklama kararlı olsun)
      await p.waitForFunction(() => [...document.querySelectorAll('#tree .tn .tl')].some((e) => e.textContent.trim() === 'rod'));
      await p.evaluate(() => [...document.querySelectorAll('#tree .tn')].find((r) => r.querySelector('.tl').textContent.trim() === 'rod').click());
    });
    await shot('03-patlatma-gece.png', 'dark', 'explode', async (p) => {
      await open('step/as1-oc-214.stp')(p);
      await setRange(p, '#exAmt', 75);
      await p.waitForTimeout(900);
    });
    await shot('04-patlatma-montaj-gunduz.png', 'light', 'tree', async (p) => {
      await open('3mf/truck.3mf')(p);
      await click(p, '#exMode button[data-v="tree"]');
      await setRange(p, '#exAmt', 60);
      await p.waitForTimeout(900);
    });
    await shot('05-gltf-pbr-gece.png', 'dark', 'pbr', open('gltf-helmet/DamagedHelmet.gltf'));
    await shot('06-ifc-bim-gunduz.png', 'light', 'ifc', async (p) => {
      await open('ifc/AC14-FZK-Haus.ifc')(p);
      await p.evaluate(() => window.M3.viewer.frame('iso'));
    });
    await shot('07-kesit-gece.png', 'dark', 'section', async (p) => {
      await open('glb/LittlestTokyo.glb')(p);
      await click(p, '#vpToolbar [data-a=section]');
      await click(p, '#hAxis button[data-v="x"]');
      await setRange(p, '#hPos', 520);
    });
    await shot('08-olcum-gunduz.png', 'light', 'measure', async (p) => {
      await open('3mf/cube_gears.3mf')(p);
      await click(p, '#vpToolbar [data-t=bbox]');
      await p.waitForTimeout(400);
      await p.keyboard.press('m');
      const pts = await modelPoints(p);
      if (pts) for (const [x, y] of pts) await p.mouse.click(x, y);
    });
    await shot('09-tel-kafes-gece.png', 'dark', 'wire', async (p) => {
      await open('step/dm1-id-214.stp')(p);
      await click(p, '#vpToolbar [data-mode="edges"]');
    });
    await shot('10-nokta-bulutu-gece.png', 'dark', 'points', open('pcd/Zaghetto.pcd'));
    await shot('11-disa-aktar-gunduz.png', 'light', 'export', async (p) => {
      await open('step/dm1-id-214.stp')(p);
      const row = await p.$$('#tree .tn');
      await row[2].click();
      await click(p, '#btnExport');
      await p.waitForSelector('.exp-grid');
      await click(p, '.exp-card[data-id="step"]');
    });
    await shot('12-ayarlar-bicimler-gece.png', 'dark', 'formats', async (p) => {
      await open('fbx/Samba Dancing.fbx')(p);
      await click(p, '#btnSettings');
      await p.waitForSelector('.set-wrap');
      await click(p, '.set-nav [data-tab="formats"]');
    });
    // Giriş penceresi 440×640; masaüstü zemini üzerinde ortalanır
    await shot('13-giris-gunduz.png', 'light', 'login', async (p) => {
      const lp = await p.context().newPage();
      await lp.setViewportSize({ width: 440, height: 640 });
      await lp.addInitScript(H.stubScript({ lang }));
      await lp.addInitScript(() => { const a = window.api.accountState; window.api.accountState = async () => ({ ...(await a()), loggedIn: false }); });
      await lp.goto(`${srv.base}/app/src/renderer/login.html`);
      await lp.waitForTimeout(400);
      await lp.evaluate(() => { document.querySelector('#password').value = 'ornek-sifre'; document.activeElement.blur(); });
      const png = (await lp.screenshot()).toString('base64');
      await lp.close();
      const ic = fs.readFileSync(path.join(ROOT, 'build', 'icon.svg')).toString('base64');
      await p.setContent(`<body style="margin:0;height:100vh;display:grid;place-items:center;background:radial-gradient(900px 600px at 80% 0%, #dbe4ff, transparent), radial-gradient(800px 600px at 0% 100%, #d5f5fb, transparent), #eef2f7">
        <div style="border-radius:10px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.08)">
          <div style="height:32px;background:#f3f3f3;display:flex;align-items:center;gap:8px;padding:0 12px;font:12px 'Segoe UI',system-ui;color:#333">
            <img src="data:image/svg+xml;base64,${ic}" style="width:16px;height:16px;border-radius:4px">Master 3D</div>
          <img src="data:image/png;base64,${png}" style="display:block;width:440px;height:640px"></div></body>`);
    });
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`${manifest.length} görüntü → ${path.relative(ROOT, OUT)}`);
    if (errors.length) { console.error('Sayfa hataları:\n' + [...new Set(errors)].join('\n')); process.exitCode = 1; }
  }
  await browser.close();
  await srv.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
