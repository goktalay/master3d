// IFC (BIM) sonucunu three.js ağacına çevirir. Çalışan iş parçacığı (workers/ifc) web-ifc ile her yapı elemanının
// üçgen ağını ve mekânsal yapıyı (Proje › Arsa › Bina › Kat › Mekân › eleman) gönderir; ağaç bu yapıyla kurulur, böylece
// patlatma ve parça listesi katlara göre çalışır. Hiçbir mekânsal düğüme bağlı olmayan elemanlar "?" grubunda toplanır.

import * as THREE from 'three';

const f32 = (a) => (a instanceof Float32Array ? a : Float32Array.from(a || []));
const u32 = (a) => (a instanceof Uint32Array ? a : Uint32Array.from(a || []));
const nice = (type) => String(type || '').replace(/^IFC/i, '').replace(/STANDARDCASE$/i, '');

function elementObject(el, mats) {
  const parts = [];
  for (const g of el.meshes || []) {
    // web-ifc köşe verisi iç içe: x y z nx ny nz
    const v = f32(g.vertices);
    const n = v.length / 6;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = v[i * 6]; pos[i * 3 + 1] = v[i * 6 + 1]; pos[i * 3 + 2] = v[i * 6 + 2];
      nor[i * 3] = v[i * 6 + 3]; nor[i * 3 + 1] = v[i * 6 + 4]; nor[i * 3 + 2] = v[i * 6 + 5];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(u32(g.index), 1));
    if (g.matrix) geo.applyMatrix4(new THREE.Matrix4().fromArray(g.matrix));
    const c = g.color || [0.75, 0.78, 0.82, 1];
    const key = c.map((x) => Math.round(x * 255)).join(',');
    if (!mats.has(key)) {
      mats.set(key, new THREE.MeshStandardMaterial({
        color: new THREE.Color(c[0], c[1], c[2]), opacity: c[3], transparent: c[3] < 1, depthWrite: c[3] >= 1,
        roughness: 0.75, metalness: 0.02, side: THREE.DoubleSide,
      }));
    }
    const m = new THREE.Mesh(geo, mats.get(key));
    parts.push(m);
  }
  if (!parts.length) return null;
  const name = el.name || `${nice(el.type)} #${el.id}`;
  let obj;
  if (parts.length === 1) obj = parts[0];
  else { obj = new THREE.Group(); for (const p of parts) { p.name = name; obj.add(p); } }
  obj.name = name;
  obj.userData.ifc = { id: el.id, type: el.type, guid: el.guid || null };
  return obj;
}

export function ifcToScene(res, fileName) {
  const mats = new Map();
  const byId = new Map();
  for (const el of res.elements || []) {
    const o = elementObject(el, mats);
    if (o) byId.set(el.id, o);
  }
  const placed = new Set();
  // Her mekânsal düğüm (Proje › Arsa › Bina › Kat › Mekân) bir grup; düğümün kendi geometrisi (ör. IfcSite arazisi) grubun
  // içinde. Yalnız geometriden oluşan yaprak eleman grup açmadan doğrudan eklenir.
  const build = (node) => {
    const own = byId.get(node.id);
    const kids = node.children || [];
    if (own && !kids.length) { placed.add(node.id); return own; }
    const g = new THREE.Group();
    g.name = node.name || nice(node.type) || '';
    g.userData.ifc = { id: node.id, type: node.type };
    if (own && !placed.has(node.id)) { placed.add(node.id); g.add(own); }
    for (const c of kids) {
      if (placed.has(c.id)) continue;
      const sub = build(c);
      if (sub && (sub.isMesh || sub.children.length || byId.has(c.id))) g.add(sub);
    }
    return g;
  };
  const root = res.tree ? build(res.tree) : new THREE.Group();
  root.name = root.name || fileName;
  const rest = [...byId.entries()].filter(([id]) => !placed.has(id));
  if (rest.length) {
    const other = new THREE.Group();
    other.name = '?';
    for (const [, o] of rest) other.add(o);
    root.add(other);
  }
  return root;
}
