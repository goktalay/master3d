// Düzlemsel yüz birleştirme (STEP): kutu 6 yüz, delikli plaka tek yüz + iç sınır, eğri yüzeylerde komşu yüzlerin ortak
// kenarları her iki tarafta aynı köşelerle (dosya "dikilebilir" kalır), OpenCascade ile geri okuma.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { mergePlanar, mergeTolerance } from '../src/core/export/planar.mjs';
import { exportModel } from '../src/core/export/index.mjs';

const require = createRequire(import.meta.url);

// Geometri → kaynaştırılmış köşeler + üçgenler
function weld(g) {
  const pos = g.getAttribute('position');
  const idx = g.index;
  const map = new Map(); const P = []; const T = [];
  const vid = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4) + 0},${Math.round(pos.getY(i) * 1e4) + 0},${Math.round(pos.getZ(i) * 1e4) + 0}`;
    let v = map.get(k);
    if (v === undefined) { v = P.length / 3; map.set(k, v); P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    vid.push(v);
  }
  const n = idx ? idx.count : pos.count;
  for (let i = 0; i < n; i += 3) {
    const a = vid[idx ? idx.getX(i) : i], b = vid[idx ? idx.getX(i + 1) : i + 1], c = vid[idx ? idx.getX(i + 2) : i + 2];
    if (a !== b && b !== c && a !== c) T.push(a, b, c);
  }
  return { P: Float64Array.from(P), T: Uint32Array.from(T) };
}

// Kapalı ağda her yönlü sınır kenarının (a,b) başka bir yüzde tersi (b,a) bulunmalı
function assertWatertight(faces) {
  const e = new Map();
  for (const f of faces) for (const l of f.loops) for (let i = 0; i < l.length; i++) {
    const k = `${l[i]}_${l[(i + 1) % l.length]}`;
    e.set(k, (e.get(k) || 0) + 1);
  }
  for (const [k, c] of e) {
    const [a, b] = k.split('_');
    assert.equal(c, 1, `kenar iki kez: ${k}`);
    assert.equal(e.get(`${b}_${a}`), 1, `ikizsiz kenar: ${k}`);
  }
}

const loopArea = (P, l, n) => {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < l.length; i++) {
    const a = l[i] * 3, b = l[(i + 1) % l.length] * 3;
    x += (P[a + 1] - P[b + 1]) * (P[a + 2] + P[b + 2]); y += (P[a + 2] - P[b + 2]) * (P[a] + P[b]); z += (P[a] - P[b]) * (P[a + 1] + P[b + 1]);
  }
  return (x * n[0] + y * n[1] + z * n[2]) / 2;
};

test('bölünmüş kutu: 6 dörtgen yüz, alan korunur', () => {
  const { P, T } = weld(new THREE.BoxGeometry(20, 10, 6, 5, 3, 2));
  const faces = mergePlanar(P, T, { angle: 0.5, dist: 1e-4 });
  assert.equal(faces.length, 6);
  for (const f of faces) { assert.equal(f.loops.length, 1); assert.equal(f.loops[0].length, 4, 'doğrusal ara köşeler atılır'); }
  const area = faces.reduce((a, f) => a + loopArea(P, f.loops[0], f.normal), 0);
  assert.ok(Math.abs(area - 2 * (20 * 10 + 20 * 6 + 10 * 6)) < 1e-6, `alan ${area}`);
  assertWatertight(faces);
});

test('delikli plaka: üst yüz tek yüz, delik iç sınır; yan yüzler birleşmez', () => {
  const sq = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(40, 0), new THREE.Vector2(40, 30), new THREE.Vector2(0, 30)]);
  const hole = new THREE.Path(); hole.absarc(20, 15, 6, 0, Math.PI * 2, true); sq.holes.push(hole);
  const { P, T } = weld(new THREE.ExtrudeGeometry(sq, { depth: 5, bevelEnabled: false, curveSegments: 16 }));
  const faces = mergePlanar(P, T, { angle: 0.5, dist: 1e-4 });
  const caps = faces.filter((f) => Math.abs(f.normal[2]) > 0.99);
  assert.equal(caps.length, 2);
  for (const c of caps) {
    assert.equal(c.loops.length, 2, 'dış sınır + delik');
    assert.ok(loopArea(P, c.loops[0], c.normal) > 0 && loopArea(P, c.loops[1], c.normal) < 0, 'delik ters yönde');
    assert.equal(c.loops[0].length, 4);
  }
  // 2 kapak + 4 dış yan + deliğin silindir yüzü (komşu dilimler 0,5° toleransla birleşmez)
  assert.equal(faces.length, 2 + 4 + (faces.length - 6));
  assert.ok(faces.length - 6 >= 16);
  assertWatertight(faces);
});

test('eğri yüzeyler ve yüksek tolerans: ortak kenarlar iki tarafta aynı (su geçirmez)', () => {
  for (const g of [new THREE.IcosahedronGeometry(10, 4), new THREE.TorusGeometry(10, 3, 24, 48), new THREE.CylinderGeometry(5, 8, 12, 40, 6)]) {
    const { P, T } = weld(g);
    for (const p of [5, 40, 100]) {
      const faces = mergePlanar(P, T, mergeTolerance(p, 30));
      assert.ok(faces.length > 0 && faces.length <= T.length / 3);
      assertWatertight(faces);
    }
  }
});

test('mergeTolerance: 0 kapalı, yüzdeyle artar', () => {
  assert.equal(mergeTolerance(0, 100), null);
  const a = mergeTolerance(10, 100), b = mergeTolerance(60, 100), c = mergeTolerance(100, 100);
  assert.ok(a.angle < b.angle && b.angle < c.angle && a.dist < b.dist && b.dist < c.dist);
  assert.equal(c.angle, 20);
});

test('STEP: birleştirme açık / kapalı, OpenCascade geri okur (yüz sayısı, alan)', async () => {
  const occt = await require('occt-import-js')();
  const root = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 6, 4, 4, 4), new THREE.MeshStandardMaterial({ color: 0x888888 }));
  m.name = 'Kutu'; root.add(m);
  const read = (u8) => {
    const r = occt.ReadStepFile(u8, null);
    assert.ok(r.success);
    let faces = 0, area = 0;
    for (const mm of r.meshes) {
      faces += mm.brep_faces.length;
      const p = mm.attributes.position.array, ix = mm.index.array;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < ix.length; i += 3) { a.fromArray(p, ix[i] * 3); b.fromArray(p, ix[i + 1] * 3); c.fromArray(p, ix[i + 2] * 3); area += b.sub(a).cross(c.sub(a)).length() / 2; }
    }
    return { faces, area };
  };
  const off = read((await exportModel(root, 'step', { src: { up: 'z', unit: 'mm' }, stepMerge: 0 })).files[0].data);
  const on = read((await exportModel(root, 'step', { src: { up: 'z', unit: 'mm' }, stepMerge: 20 })).files[0].data);
  assert.equal(off.faces, 6 * 16 * 2);
  assert.equal(on.faces, 6);
  assert.ok(Math.abs(on.area - 2 * (200 + 120 + 60)) < 1e-3, `alan ${on.area}`);
});
