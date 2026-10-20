// Pencere kodunu paketler ve WebAssembly kitaplıklarını kopyalar → src/renderer/gen/ (git'e girmez; "npm start" ve
// "npm run dist" önce bunu çalıştırır). Ayrıca kaldırıcının sileceği sağ tık kayıtlarını build/shell-exts.nsh olarak üretir.
//   gen/app.js            ana pencere (ES modülü; three.js, okuyucular, yazıcılar)
//   gen/engine-worker.js  çalışan iş parçacığı (OpenCascade, assimp, web-ifc, bağlantısız parça ayırma)
//   gen/vendor/           occt-import-js, assimpjs, web-ifc (+ .wasm) ve lisans metinleri
//   gen/rhino3dm/ gen/draco/ gen/basis/  three.js okuyucularının WASM kitaplıkları
'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { SHELL_EXTS } = require('../src/formats');

const ROOT = path.join(__dirname, '..');
const GEN = path.join(ROOT, 'src', 'renderer', 'gen');
const NM = path.join(ROOT, 'node_modules');
const watch = process.argv.includes('--watch');

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

async function main() {
  fs.rmSync(GEN, { recursive: true, force: true });
  fs.mkdirSync(GEN, { recursive: true });
  const common = { bundle: true, platform: 'browser', target: 'chrome128', logLevel: 'warning', legalComments: 'none', minify: !watch, sourcemap: false };
  const app = { ...common, entryPoints: [path.join(ROOT, 'src/renderer/app/main.mjs')], outfile: path.join(GEN, 'app.js'), format: 'esm' };
  // Çalışan iş parçacığı klasik betik (importScripts); import.meta yok
  const worker = { ...common, entryPoints: [path.join(ROOT, 'src/renderer/app/workers/engine.js')], outfile: path.join(GEN, 'engine-worker.js'), format: 'iife' };
  if (watch) {
    for (const o of [app, worker]) (await esbuild.context(o)).watch();
  } else {
    await esbuild.build(app);
    await esbuild.build(worker);
  }

  const V = path.join(GEN, 'vendor');
  for (const f of ['occt-import-js.js', 'occt-import-js.wasm', 'license.occt-import-js.txt', 'license.occt.txt']) copy(path.join(NM, 'occt-import-js/dist', f), path.join(V, f.startsWith('license') ? 'licenses/' + f : f));
  for (const f of ['assimpjs.js', 'assimpjs.wasm', 'license.assimpjs.txt', 'license.assimp.txt']) copy(path.join(NM, 'assimpjs/dist', f), path.join(V, f.startsWith('license') ? 'licenses/' + f : f));
  copy(path.join(NM, 'web-ifc/web-ifc-api-iife.js'), path.join(V, 'web-ifc-api-iife.js'));
  copy(path.join(NM, 'web-ifc/web-ifc.wasm'), path.join(V, 'web-ifc.wasm'));
  copy(path.join(NM, 'web-ifc/LICENSE.md'), path.join(V, 'licenses/license.web-ifc.md'));
  copy(path.join(NM, 'rhino3dm/rhino3dm.js'), path.join(GEN, 'rhino3dm/rhino3dm.js'));
  copy(path.join(NM, 'rhino3dm/rhino3dm.wasm'), path.join(GEN, 'rhino3dm/rhino3dm.wasm'));
  // Rhino3dmLoader iş parçacığını blob: adresinden açar; blob iş parçacığı pencerenin politikasını devralır ve embind
  // eval ister. Aynı içerik (rhino3dm.js + yükleyicinin Rhino3dmWorker gövdesi) burada dosya olarak üretilir ve
  // iş parçacığı politikasıyla (src/protocol.js › WORKER_CSP) sunulur; core/load.mjs yükleyiciyi bu adrese yönlendirir.
  const loaderSrc = fs.readFileSync(path.join(NM, 'three/examples/jsm/loaders/3DMLoader.js'), 'utf8');
  const at = loaderSrc.indexOf('function Rhino3dmWorker()');
  if (at < 0) throw new Error('Rhino3dmWorker bulunamadı (three sürümü değişti mi?)');
  let depth = 0, end = -1;
  for (let i = loaderSrc.indexOf('{', at); i < loaderSrc.length; i++) {
    if (loaderSrc[i] === '{') depth++;
    else if (loaderSrc[i] === '}' && --depth === 0) { end = i; break; }
  }
  const body = loaderSrc.slice(loaderSrc.indexOf('{', at) + 1, end);
  fs.writeFileSync(path.join(GEN, 'rhino3dm/rhino-worker.js'), ['/* rhino3dm.js */', fs.readFileSync(path.join(NM, 'rhino3dm/rhino3dm.js'), 'utf8'), '/* worker (three.js 3DMLoader) */', body].join('\n'));
  for (const f of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) copy(path.join(NM, 'three/examples/jsm/libs/draco/gltf', f), path.join(GEN, 'draco', f));
  for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) copy(path.join(NM, 'three/examples/jsm/libs/basis', f), path.join(GEN, 'basis', f));
  copy(path.join(NM, 'three/LICENSE'), path.join(V, 'licenses/license.three.txt'));

  // Kaldırıcı: kullanıcının sağ tık kayıtlarını siler (uygulama bunları src/shellmenu.js ile yazar)
  // (NSIS'in iç içe !include yolu derleme klasörüne göre çözülür; makro bu yüzden installer.nsh'nin içine yazılır)
  const nshPath = path.join(ROOT, 'build', 'installer.nsh');
  const macro = ['!macro m3ShellMenuDelete',
    ...SHELL_EXTS.map((e) => `  DeleteRegKey HKCU "Software\\Classes\\SystemFileAssociations\\.${e}\\shell\\MastertoolMaster3D"`),
    '  DeleteRegKey HKCU "Software\\Classes\\Applications\\Master 3D.exe"', '!macroend'].join('\n');
  const nsh = fs.readFileSync(nshPath, 'utf8');
  const re = /(; >>> m3ShellMenuDelete[^\n]*\n)[\s\S]*?(; <<< m3ShellMenuDelete)/;
  if (!re.test(nsh)) throw new Error('installer.nsh: m3ShellMenuDelete işaretleri yok');
  const next = nsh.replace(re, `$1${macro}\n$2`);
  if (next !== nsh) fs.writeFileSync(nshPath, next);

  const size = (p) => fs.statSync(p).size;
  console.log(`gen/app.js ${(size(path.join(GEN, 'app.js')) / 1024).toFixed(0)} KB · engine-worker.js ${(size(path.join(GEN, 'engine-worker.js')) / 1024).toFixed(0)} KB · ${SHELL_EXTS.length} uzantı`);
}

main().catch((e) => { console.error(e); process.exit(1); });
