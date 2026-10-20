// Dışa aktarma gidiş-dönüş testi: küçük bir montaj (kapalı kutu, alt düğümdeki dönmüş silindir, açık düzlem) her
// biçime yazılır, sonra BAĞIMSIZ bir okuyucuyla geri okunur: three.js okuyucuları, assimp (WASM) ve OpenCascade
// (occt-import-js, STEP). Üçgen sayısı, parça adları ve sınır kutusu (birim / eksen dönüşümü hesaba katılarak) denetlenir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { VRMLLoader } from 'three/addons/loaders/VRMLLoader.js';
import { USDLoader } from 'three/addons/loaders/USDLoader.js';
import { exportModel, exportEach } from '../src/core/export/index.mjs';
import { parseX3D } from '../src/core/engines/x3d.mjs';
import { occtToScene } from '../src/core/engines/cad.mjs';
import { sceneStats, worldBox } from '../src/core/scene.mjs';

const require = createRequire(import.meta.url);

// GLTFExporter ikili çıktıda FileReader kullanır (Node'da yok)
globalThis.FileReader ??= class {
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend && this.onloadend(); this.onload && this.onload(); }); }
  readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend && this.onloadend(); this.onload && this.onload(); }); }
};

function sampleModel() {
  const root = new THREE.Group(); root.name = 'Montaj';
  const red = new THREE.MeshStandardMaterial({ color: 0xcc2222, name: 'Kırmızı' });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2255cc, name: 'Mavi' });
  const box = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 6), red); box.name = 'Kutu'; box.position.set(0, 5, 0);
  const sub = new THREE.Group(); sub.name = 'Alt grup'; sub.position.set(30, 0, 0); sub.rotation.set(0, 0, Math.PI / 6);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 12, 24), blue); cyl.name = 'Silindir'; cyl.position.set(0, 6, 0);
  sub.add(cyl);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), red); plane.name = 'Düzlem'; plane.position.set(-25, 0, 0); plane.rotation.x = -Math.PI / 2;
  root.add(box, sub, plane);
  root.updateMatrixWorld(true);
  return root;
}

const SRC = { up: 'y', unit: 'mm' };
const model = sampleModel();
const base = sceneStats(model);
const baseBox = worldBox(model);
const names = (root) => { const s = new Set(); root.traverse((o) => { if (o.isMesh && o.name) s.add(o.name); }); return s; };
const sizeOf = (root) => worldBox(root).getSize(new THREE.Vector3());
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} ≈ ${b}`);
const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const text = (u8) => new TextDecoder().decode(u8);

let assimp, occt;
test.before(async () => {
  assimp = await require('assimpjs')();
  occt = await require('occt-import-js')();
});
function viaAssimp(name, u8, extra = []) {
  const fl = new assimp.FileList();
  fl.AddFile(name, u8);
  for (const f of extra) fl.AddFile(f.name, f.data);
  const r = assimp.ConvertFileList(fl, 'assjson');
  assert.ok(r.IsSuccess(), `assimp ${name}: ${r.GetErrorCode()}`);
  const json = JSON.parse(text(r.GetFile(0).GetContent()));
  return { tris: json.meshes.reduce((a, m) => a + m.faces.length, 0), json };
}

test('GLB: three.js GLTFLoader ile geri okunur (hiyerarşi, adlar, metre/Y)', async () => {
  const { files } = await exportModel(model, 'glb', { src: SRC, baseName: 'montaj' });
  assert.equal(files[0].name, 'montaj.glb');
  const r = await new GLTFLoader().parseAsync(ab(files[0].data), '');
  assert.equal(sceneStats(r.scene).triangles, base.triangles);
  for (const n of ['Kutu', 'Silindir', 'Düzlem']) assert.ok(names(r.scene).has(n), n);
  // mm → m: 1000 kat küçük
  const s = sizeOf(r.scene), s0 = baseBox.getSize(new THREE.Vector3());
  close(s.x * 1000, s0.x, 1e-3, 'x');
  const gltf = await exportModel(model, 'gltf', { src: SRC });
  assert.ok(JSON.parse(text(gltf.files[0].data)).asset.version === '2.0');
});

test('FBX ikili: three.js FBXLoader ve assimp okur, adlar ve konumlar korunur', async () => {
  const { files } = await exportModel(model, 'fbx', { src: SRC });
  const u8 = files[0].data;
  assert.equal(text(u8.subarray(0, 20)), 'Kaydara FBX Binary  ');
  const obj = new FBXLoader().parse(ab(u8), '');
  assert.equal(sceneStats(obj).triangles, base.triangles);
  for (const n of ['Kutu', 'Silindir', 'Düzlem']) assert.ok(names(obj).has(n), n);
  const s = sizeOf(obj), s0 = baseBox.getSize(new THREE.Vector3());
  close(s.x, s0.x, 1e-3, 'fbx x'); close(s.y, s0.y, 1e-3, 'fbx y'); close(s.z, s0.z, 1e-3, 'fbx z');
  const a = viaAssimp('m.fbx', u8);
  assert.equal(a.tris, base.triangles);
});

test('OBJ + MTL: OBJLoader okur; malzeme renkleri .mtl dosyasında', async () => {
  const { files } = await exportModel(model, 'obj', { src: SRC, baseName: 'parca' });
  assert.deepEqual(files.map((f) => f.name), ['parca.obj', 'parca.mtl']);
  const obj = new OBJLoader().parse(text(files[0].data));
  assert.equal(sceneStats(obj).triangles, base.triangles);
  assert.match(text(files[1].data), /newmtl Kirmizi[\s\S]*Kd 0\.8 0\.1333 0\.1333/);
  const a = viaAssimp('parca.obj', files[0].data, [files[1]]);
  assert.equal(a.tris, base.triangles);
});

test('STL ikili / ASCII ve PLY ikili / ASCII: three.js okuyucularıyla aynı üçgen sayısı', async () => {
  for (const id of ['stl', 'stl-ascii']) {
    const { files } = await exportModel(model, id, { src: SRC });
    const g = new STLLoader().parse(ab(files[0].data));
    assert.equal(g.getAttribute('position').count / 3, base.triangles, id);
  }
  for (const id of ['ply', 'ply-ascii']) {
    const { files } = await exportModel(model, id, { src: SRC });
    const g = new PLYLoader().parse(ab(files[0].data));
    assert.equal(g.index.count / 3, base.triangles, id);
  }
});

test('3MF: assimp okur; Z yukarı milimetre (Y yukarı kaynak döndürülür)', async () => {
  const { files } = await exportModel(model, '3mf', { src: SRC });
  const a = viaAssimp('m.3mf', files[0].data);
  assert.equal(a.tris, base.triangles - 0); // dejenere üçgen yok
  const xml = text(require('fflate').unzipSync(files[0].data)['3D/3dmodel.model']);
  assert.match(xml, /unit="millimeter"/);
  assert.equal((xml.match(/<object /g) || []).length, 3);
});

test('COLLADA: assimp okur, hiyerarşi ve adlar', async () => {
  const { files } = await exportModel(model, 'dae', { src: SRC });
  const a = viaAssimp('m.dae', files[0].data);
  assert.equal(a.tris, base.triangles);
  const s = JSON.stringify(a.json.rootnode);
  for (const n of ['Kutu', 'Silindir', 'Alt']) assert.ok(s.includes(n), n);
});

test('VRML ve X3D: VRMLLoader ve yerleşik X3D okuyucusu okur', async () => {
  const w = await exportModel(model, 'wrl', { src: SRC });
  const r1 = new VRMLLoader().parse(text(w.files[0].data), '');
  assert.equal(sceneStats(r1).triangles, base.triangles);
  const x = await exportModel(model, 'x3d', { src: SRC });
  const r2 = parseX3D(text(x.files[0].data));
  assert.equal(sceneStats(r2).triangles, base.triangles);
  close(sizeOf(r2).x * 1000, baseBox.getSize(new THREE.Vector3()).x, 1e-3, 'x3d x');
});

test('OFF: assimp okur', async () => {
  const { files } = await exportModel(model, 'off', { src: SRC });
  assert.equal(viaAssimp('m.off', files[0].data).tris, base.triangles);
});

test('USDZ: three.js USDLoader okur', async () => {
  const { files } = await exportModel(model, 'usdz', { src: SRC });
  const root = await new Promise((res, rej) => new USDLoader().parse(ab(files[0].data), '', res, rej));
  assert.equal(sceneStats(root).triangles, base.triangles);
});

test('STEP: OpenCascade okur; parçalar ayrı ürün, adlar ve renkler korunur, kapalı gövde katı', async () => {
  const { files } = await exportModel(model, 'step', { src: SRC, baseName: 'Montaj' });
  const s = text(files[0].data);
  assert.match(s, /^ISO-10303-21;/);
  assert.match(s, /FACETED_BREP\('Kutu'/);
  assert.match(s, /SHELL_BASED_SURFACE_MODEL\('D\\X2\\00FC\\X0\\zlem'/); // açık ağ → yüzey modeli
  const r = occt.ReadStepFile(files[0].data, null);
  assert.ok(r.success);
  const root = occtToScene(r, 'Montaj');
  assert.equal(sceneStats(root).triangles, base.triangles);
  const nm = JSON.stringify(r.root);
  for (const n of ['Kutu', 'Silindir']) assert.ok(nm.includes(n), n);
  // Renk korunur (kutu kırmızı)
  const kutu = r.meshes.find((m) => m.name === 'Kutu') || r.meshes[0];
  assert.ok(kutu.color && kutu.color[0] > 0.5 && kutu.color[2] < 0.3, JSON.stringify(kutu.color));
  // Z yukarı: kaynakta Y'deki kutu yüksekliği (10) STEP'te Z'de
  const sz = sizeOf(root);
  close(sz.z, baseBox.getSize(new THREE.Vector3()).y, 1e-3, 'step z');
});

test('Seçili parça ve her parça ayrı dosya: dünya konumu korunur', async () => {
  const cyl = model.getObjectByName('Silindir');
  const { files } = await exportModel(model, 'stl', { selection: [cyl], src: SRC, baseName: 'silindir' });
  const g = new STLLoader().parse(ab(files[0].data));
  g.computeBoundingBox();
  const want = worldBox(cyl);
  close(g.boundingBox.min.x, want.min.x, 1e-4, 'min x');
  close(g.boundingBox.max.y, want.max.y, 1e-4, 'max y');
  const each = await exportEach(model, 'stl', [model.getObjectByName('Kutu'), cyl], { src: SRC });
  assert.deepEqual(each.map((f) => f.name), ['Kutu.stl', 'Silindir.stl']);
});

test('Yalnız görünenler: gizli parça dışa aktarılmaz', async () => {
  const m = sampleModel();
  m.getObjectByName('Düzlem').visible = false;
  const { stats } = await exportModel(m, 'stl', { onlyVisible: true, src: SRC });
  assert.equal(stats.triangles, base.triangles - 2);
});
