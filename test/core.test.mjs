// Çekirdek: yükleme hattı (gerçek motorlarla: three.js, OpenCascade, assimp — iş parçacığı yerine doğrudan çağrılır),
// patlatma, bağlantısız parça bulma, ölçüm ve parça seçimi. Üçüncü taraf örnek dosya yok; girdiler burada üretilir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { loadModel, pickZipEntry, normalizeZipPath, blendVersion } from '../src/core/load.mjs';
import { createExplode } from '../src/core/explode.mjs';
import { componentsOf } from '../src/core/split.mjs';
import { collectParts, measureMesh, worldBox, sceneStats, isPrimitiveGroup, maxDepth } from '../src/core/scene.mjs';
import { writeSTEP } from '../src/core/export/step.mjs';
import { writeOFF } from '../src/core/export/mesh-formats.mjs';
import { x3dToVrml, parseXml } from '../src/core/engines/x3d.mjs';
import { ifcToScene } from '../src/core/engines/ifc.mjs';

const require = createRequire(import.meta.url);
const fixture = (n) => new URL('./fixtures/' + n, import.meta.url);
const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const src = (name, bytes) => ({ name, url: '', baseUrl: '', bytes: async () => ab(bytes), sidecars: async () => [] });

// İş parçacığı yerine motorları Node'da çalıştıran bağlam (loader.mjs'deki runWorker ile aynı sözleşme)
let occt, assimp;
const ctx = {
  runWorker: async (kind, payload) => {
    if (kind === 'occt') {
      occt ??= await require('occt-import-js')();
      const fn = payload.format === 'iges' ? 'ReadIgesFile' : payload.format === 'brep' ? 'ReadBrepFile' : 'ReadStepFile';
      return occt[fn](new Uint8Array(payload.bytes), null);
    }
    if (kind === 'assimp') {
      assimp ??= await require('assimpjs')();
      const fl = new assimp.FileList();
      for (const f of payload.files) fl.AddFile(f.name, new Uint8Array(f.bytes));
      const r = assimp.ConvertFileList(fl, 'glb2');
      return r.IsSuccess() ? { ok: true, glb: ab(new Uint8Array(r.GetFile(0).GetContent())) } : { ok: false, error: r.GetErrorCode() };
    }
    throw new Error(kind);
  },
};

function assembly() {
  const root = new THREE.Group(); root.name = 'Montaj';
  const mat = new THREE.MeshStandardMaterial({ color: 0x3366cc, name: 'Çelik' });
  const add = (name, x, parent = root) => { const m = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), mat); m.name = name; m.position.set(x, 5, 0); parent.add(m); return m; };
  add('Sol', -30); add('Orta', 0);
  const sub = new THREE.Group(); sub.name = 'Alt montaj'; sub.position.set(30, 0, 0); root.add(sub);
  add('Sağ 1', 0, sub); add('Sağ 2', 15, sub);
  root.updateMatrixWorld(true);
  return root;
}

test('STEP (kendi yazdığımız montaj) OpenCascade hattından ağaç ve adlarla geri gelir', async () => {
  const step = writeSTEP(assembly(), { name: 'Montaj' });
  const r = await loadModel(src('montaj.step', step), ctx);
  assert.equal(r.engine, 'occt');
  assert.equal(r.units, 'mm');
  assert.equal(r.upAxis, 'z');
  const names = []; r.root.traverse((o) => o.isMesh && names.push(o.name));
  assert.deepEqual(names.sort(), ['Orta', 'Sağ 1', 'Sağ 2', 'Sol']);
  assert.equal(sceneStats(r.root).triangles, 48);
});

test('assimp hattı (OFF) ve yedek motor: three.js okuyamazsa assimp', async () => {
  const off = writeOFF(assembly());
  const r = await loadModel(src('kutular.off', off), ctx);
  assert.equal(r.engine, 'assimp');
  assert.equal(sceneStats(r.root).triangles, 48);
  // Bozuk FBX → three.js FBXLoader düşer → assimp da açamaz → anlaşılır hata
  await assert.rejects(loadModel(src('bozuk.fbx', new TextEncoder().encode('Kaydara FBX Binary  \0garbage')), ctx), (e) => e.code === 'parse_failed');
});

test('VTK (legacy ASCII), X3D ve VRML three.js hattı', async () => {
  const vtk = await loadModel(src('boxes.vtk', fs.readFileSync(fixture('boxes.vtk'))), ctx);
  assert.equal(sceneStats(vtk.root).triangles, 36);
  const x3d = `<?xml version="1.0"?><X3D><Scene><Transform DEF='T' translation='1 0 0'><Shape><Appearance><Material diffuseColor='1 0 0'/></Appearance>
    <IndexedTriangleSet index='0 1 2 0 2 3'><Coordinate point='0 0 0 1 0 0 1 1 0 0 1 0'/></IndexedTriangleSet></Shape></Transform>
    <Group><Transform USE='T'/></Group><TouchSensor/><ROUTE fromNode='a' toNode='b'/></Scene></X3D>`;
  const r = await loadModel(src('kare.x3d', new TextEncoder().encode(x3d)), ctx);
  assert.equal(r.engine, 'x3d');
  assert.equal(sceneStats(r.root).triangles, 4); // DEF + USE
  assert.match(x3dToVrml(x3d), /^#VRML V2.0 utf8/);
  assert.equal(parseXml('<a x="1&amp;2"><b/></a>').children[0].attrs.x, '1&2');
});

test('ZIP: birincil model seçimi ve yol normalleştirme; Blender sürümü', () => {
  assert.equal(pickZipEntry(['tex/a.png', 'm/scene.bin', 'm/scene.gltf', 'm/extra.obj', '__MACOSX/m/._scene.gltf']), 'm/scene.gltf');
  assert.equal(pickZipEntry(['readme.txt']), null);
  assert.equal(normalizeZipPath('a/./b/../c.png'), 'a/c.png');
  const enc = (s) => ab(new TextEncoder().encode(s.padEnd(40, ' ')));
  assert.equal(blendVersion(enc('BLENDER-v276RENDH')), 276);
  assert.equal(blendVersion(enc('BLENDER_v293')), 293);
  assert.equal(blendVersion(enc('BLENDER17-01v0500')), 500);
  assert.equal(blendVersion(enc('PK..')), null);
});

test('patlatma: merkezden uzaklaşır, 0 tam geri koyar, eksen kipinde yalnız o eksen, montaj kipi', () => {
  const root = assembly();
  const before = new Map(); root.traverse((o) => before.set(o, o.position.clone()));
  const center = worldBox(root).getCenter(new THREE.Vector3());
  const ex = createExplode(root, { mode: 'radial' });
  const sol = root.getObjectByName('Sol');
  const d0 = worldBox(sol).getCenter(new THREE.Vector3()).distanceTo(center);
  ex.apply(1);
  assert.ok(worldBox(sol).getCenter(new THREE.Vector3()).distanceTo(center) > d0 * 2);
  ex.apply(0);
  root.traverse((o) => assert.ok(o.position.distanceTo(before.get(o)) < 1e-9, o.name));
  const ey = createExplode(root, { mode: 'y' });
  ey.apply(1);
  assert.ok(Math.abs(sol.position.x - before.get(sol).x) < 1e-9, 'y kipinde x değişmez');
  ey.reset();
  const et = createExplode(root, { mode: 'tree' });
  et.apply(1);
  // Alt montajın iki parçası birbirinden de ayrılır (kendi merkezinden)
  const s1 = root.getObjectByName('Sağ 1'), s2 = root.getObjectByName('Sağ 2');
  assert.ok(s2.position.x - s1.position.x > 15);
  et.reset();
  assert.equal(collectParts(root, 0).length, 4);
  assert.equal(collectParts(root, 1).length, 3); // Sol, Orta, Alt montaj
  assert.equal(maxDepth(root), 2);
});

test('glTF çok malzemeli ağ grubu tek parça sayılır', () => {
  const g = new THREE.Group(); g.name = 'Teker';
  for (const n of ['Teker', 'Teker_1']) { const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); m.name = n; g.add(m); }
  const root = new THREE.Group(); root.add(g);
  assert.ok(isPrimitiveGroup(g));
  assert.deepEqual(collectParts(root, 0), [g]);
});

test('bağlantısız parçalar: kaynaştırma ile dokunan kutular tek, ayrık kutu ayrı', () => {
  const v = [], idx = [];
  const box = (x) => {
    const g = new THREE.BoxGeometry(1, 1, 1).translate(x, 0, 0).toNonIndexed(); // kutu başına 36 ayrı köşe
    const b = v.length / 3;
    v.push(...g.getAttribute('position').array);
    for (let i = 0; i < 36; i++) idx.push(b + i);
  };
  box(0); box(1); box(5); // ilk ikisi yüzeyden dokunur (ortak köşeler), üçüncüsü ayrık
  const r = componentsOf(Float32Array.from(v), Uint32Array.from(idx), 1e-6);
  assert.equal(r.count, 2);
  assert.deepEqual(r.sizes, [24, 12]);
  assert.equal(componentsOf(Float32Array.from(v), null, 0).count, 2);
});

test('ölçüm: kapalı kutunun alanı ve hacmi, açık düzlemde hacim yok', () => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4));
  m.scale.set(2, 1, 1); m.updateMatrixWorld(true);
  const r = measureMesh(m);
  assert.ok(Math.abs(r.volume - 48) < 1e-6, r.volume);
  assert.ok(Math.abs(r.area - 2 * (4 * 3 + 4 * 4 + 3 * 4)) < 1e-6, r.area);
  assert.equal(r.closed, true);
  assert.equal(measureMesh(new THREE.Mesh(new THREE.PlaneGeometry(1, 1))).closed, false);
});

test('IFC sonucu mekânsal yapıya göre ağaç olur', () => {
  const quad = { vertices: Float32Array.from([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1]), index: Uint32Array.from([0, 1, 2]), color: [1, 0, 0, 1], matrix: new THREE.Matrix4().toArray() };
  const res = {
    elements: [{ id: 10, type: 'IFCWALL', name: 'Duvar 1', meshes: [quad] }, { id: 11, type: 'IFCSLAB', name: '', meshes: [quad] }, { id: 99, type: 'IFCDOOR', name: 'Kapı', meshes: [quad] }],
    tree: { id: 1, type: 'IFCPROJECT', name: 'Proje', children: [{ id: 2, type: 'IFCBUILDINGSTOREY', name: 'Zemin kat', children: [{ id: 10, children: [] }, { id: 11, children: [] }] }] },
  };
  const root = ifcToScene(res, 'ev');
  assert.equal(root.name, 'Proje');
  const kat = root.getObjectByName('Zemin kat');
  assert.deepEqual(kat.children.map((c) => c.name), ['Duvar 1', 'SLAB #11']);
  assert.equal(root.getObjectByName('?').children[0].name, 'Kapı');
});
