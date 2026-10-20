// OpenCascade (occt-import-js) sonucunu three.js ağacına çevirir. STEP / IGES / BREP montaj ağacı korunur: her düğüm bir
// Group, düğümün gövdeleri Mesh. Yüz renkleri (STEP'te yüze atanmış renk) geometri grupları + malzeme dizisiyle taşınır.
// Çalışan iş parçacığı (workers/occt) dizileri Float32Array / Uint32Array olarak gönderir; testte düz diziler de olur.

import * as THREE from 'three';

const DEFAULT_COLOR = 0xb8c2cf;
const f32 = (a) => (a instanceof Float32Array ? a : Float32Array.from(a || []));
const u32 = (a) => (a instanceof Uint32Array ? a : Uint32Array.from(a || []));
const colorKey = (c) => (c ? c.map((x) => Math.round(x * 255)).join(',') : '');

// Tam siyah (çoğu IGES'te "renk yok" anlamında 0) ışıkta biçimsiz görünür: koyu griye kaldırılır
const visible = (c) => (c && c[0] < 0.02 && c[1] < 0.02 && c[2] < 0.02 ? [0.16, 0.17, 0.19] : c);
function material(color) {
  const c = visible(color);
  return new THREE.MeshStandardMaterial({
    color: c ? new THREE.Color(c[0], c[1], c[2]) : DEFAULT_COLOR,
    metalness: 0.15, roughness: 0.55, side: THREE.DoubleSide,
  });
}

export function occtMesh(m, i) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(f32(m.attributes.position.array), 3));
  if (m.attributes.normal) geo.setAttribute('normal', new THREE.BufferAttribute(f32(m.attributes.normal.array), 3));
  geo.setIndex(new THREE.BufferAttribute(u32(m.index.array), 1));
  if (!m.attributes.normal) geo.computeVertexNormals();
  // Yüz renkleri: ardışık aynı renkteki yüzler tek grup. Hepsi gövde rengiyle aynıysa tek malzeme.
  const faces = (m.brep_faces || []).filter((f) => f && f.last >= f.first);
  const distinct = new Set(faces.map((f) => colorKey(f.color || m.color)));
  let mat;
  if (faces.length && distinct.size > 1) {
    const mats = [];
    const idxOf = new Map();
    let cur = null;
    for (const f of faces) {
      const key = colorKey(f.color || m.color);
      if (!idxOf.has(key)) { idxOf.set(key, mats.length); mats.push(material(f.color || m.color)); }
      const mi = idxOf.get(key);
      const start = f.first * 3, count = (f.last - f.first + 1) * 3;
      if (cur && cur.materialIndex === mi && cur.start + cur.count === start) cur.count += count;
      else { cur = { start, count, materialIndex: mi }; geo.groups.push(cur); }
    }
    mat = mats;
  } else mat = material(m.color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = m.name || '';
  mesh.userData.m3faces = faces.length || undefined; // B-rep yüz sayısı (özellikler panelinde)
  if (!mesh.name) mesh.userData.m3index = i + 1;
  return mesh;
}

export function occtToScene(res, fileName) {
  if (!res || !res.success) throw Object.assign(new Error('parse_failed'), { code: 'parse_failed' });
  const meshes = (res.meshes || []).map(occtMesh);
  const used = new Set();
  const build = (node) => {
    const g = new THREE.Group();
    g.name = node.name || '';
    for (const mi of node.meshes || []) {
      const src = meshes[mi];
      if (!src) continue;
      // Aynı gövde birden çok düğümde (örnekleme) kullanılırsa geometri paylaşılır, nesne kopyalanır
      const m = used.has(mi) ? new THREE.Mesh(src.geometry, src.material) : src;
      if (m !== src) { m.name = src.name; m.userData = { ...src.userData }; }
      used.add(mi);
      // Tek gövdeli düğümde gövdenin adı yoksa düğüm adını alır
      if (!m.name && (node.meshes || []).length === 1) m.name = g.name;
      g.add(m);
    }
    for (const c of node.children || []) g.add(build(c));
    return g;
  };
  let root = build(res.root || { meshes: meshes.map((_, i) => i), children: [] });
  // Adsız tek çocuklu kökler (occt kök düğümü) atlanır
  while (!root.name && root.children.length === 1 && root.children[0].isGroup) root = root.children[0];
  if (!root.name) root.name = fileName;
  return root;
}
