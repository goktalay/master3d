// Sahne yardımcıları: istatistik, parça listesi, sınır kutusu, alan / hacim. Saf işlevler (testte Node'da da çalışır).

import * as THREE from 'three';

export const isRenderable = (o) => !!(o && (o.isMesh || o.isPoints || o.isLine) && o.geometry && !o.userData.m3helper);

// Görünürlük üst düğümlerden de etkilenir
export function isShown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

export function triCount(o) {
  const g = o.geometry;
  if (!g || !o.isMesh) return 0;
  const n = g.index ? g.index.count : (g.getAttribute('position') ? g.getAttribute('position').count : 0);
  return Math.floor(Math.min(n, Number.isFinite(g.drawRange.count) ? g.drawRange.count : n) / 3) * (o.isInstancedMesh ? o.count : 1);
}

export function sceneStats(root, { onlyVisible = false } = {}) {
  const s = { meshes: 0, points: 0, lines: 0, triangles: 0, vertices: 0, pointCount: 0, materials: 0, textures: 0, nodes: 0 };
  const mats = new Set(), tex = new Set();
  root.traverse((o) => {
    s.nodes++;
    if (!isRenderable(o) || (onlyVisible && !isShown(o))) return;
    const pos = o.geometry.getAttribute('position');
    if (o.isMesh) { s.meshes++; s.triangles += triCount(o); s.vertices += pos ? pos.count : 0; }
    else if (o.isPoints) { s.points++; s.pointCount += pos ? pos.count : 0; }
    else if (o.isLine) s.lines++;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      mats.add(m);
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'specularMap']) if (m[k]) tex.add(m[k]);
    }
  });
  s.materials = mats.size;
  s.textures = tex.size;
  return s;
}

// Dünya koordinatlarında sınır kutusu (yalnız görünen, yardımcı olmayan nesneler)
export function worldBox(obj, { onlyVisible = true } = {}) {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  obj.updateWorldMatrix(true, true);
  obj.traverse((o) => {
    if (o.isSkeletonHelper && (!onlyVisible || isShown(o))) {
      // İskelet: kemiklerin dünya konumları (yardımcının geometrisi her karede yeniden yazılır)
      for (const bone of o.bones) box.expandByPoint(new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld));
      return;
    }
    if (!isRenderable(o) || (onlyVisible && !isShown(o))) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (o.isSkinnedMesh) { o.computeBoundingBox(); tmp.copy(o.boundingBox).applyMatrix4(o.matrixWorld); }
    else tmp.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    if (!tmp.isEmpty()) box.union(tmp);
  });
  return box;
}

// Parça: patlatmada birlikte hareket eden, listede seçilen birim.
// level 0 (otomatik): her çizilebilir nesne bir parça; yalnız çok malzemeli tek ağın (glTF primitive'leri, adları
// "ad", "ad_1"…) grubu tek parça sayılır. level n: kökten n. derinlikteki düğümler (daha sığdaki çizilebilirler kendileri).
export function collectParts(root, level = 0) {
  const parts = [];
  if (level > 0) {
    const walk = (o, d) => {
      if (o.userData.m3helper) return;
      if (d === level || (isRenderable(o) && d < level)) { if (hasRenderable(o)) parts.push(o); return; }
      for (const c of o.children) walk(c, d + 1);
    };
    for (const c of root.children) walk(c, 1);
    return parts;
  }
  const seen = new Set();
  root.traverse((o) => {
    if (!isRenderable(o)) return;
    const p = o.parent;
    const owner = p && p !== root && isPrimitiveGroup(p) ? p : o;
    if (!seen.has(owner)) { seen.add(owner); parts.push(owner); }
  });
  return parts;
}

const baseName = (n) => String(n || '').replace(/_\d+$/, '');
export function isPrimitiveGroup(g) {
  if (!g || !g.isGroup || g.children.length < 2) return false;
  if (!g.children.every((c) => c.isMesh && !c.children.length)) return false;
  const b = baseName(g.children[0].name);
  return !!b && g.children.every((c) => baseName(c.name) === b);
}

export function hasRenderable(o) {
  let found = false;
  o.traverse((x) => { if (!found && isRenderable(x)) found = true; });
  return found;
}

export function maxDepth(root) {
  let max = 0;
  const walk = (o, d) => { if (d > max && hasRenderable(o)) max = d; for (const c of o.children) walk(c, d + 1); };
  for (const c of root.children) walk(c, 1);
  return max;
}

// Alan (dünya ölçeğinde) ve kapalı ağlar için işaretli hacim (tetrahedron toplamı). Açık ağda hacim anlamsızdır;
// closed: her kenar tam iki üçgende mi (köşeler konuma göre kaynaştırılarak)
export function measureMesh(o) {
  const g = o.geometry;
  const pos = g.getAttribute('position');
  if (!o.isMesh || !pos) return null;
  o.updateWorldMatrix(true, false);
  const m = o.matrixWorld;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  let area = 0, vol = 0;
  const key = (i) => `${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}`;
  const edges = new Map();
  const ids = new Map();
  const vid = (i) => { const k = key(i); let v = ids.get(k); if (v === undefined) { v = ids.size; ids.set(k, v); } return v; };
  for (let i = 0; i + 2 < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(m);
    b.fromBufferAttribute(pos, i1).applyMatrix4(m);
    c.fromBufferAttribute(pos, i2).applyMatrix4(m);
    area += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
    vol += a.dot(ab.crossVectors(b, c)) / 6;
    if (n <= 3e6) {
      const v = [vid(i0), vid(i1), vid(i2)];
      for (let k = 0; k < 3; k++) {
        const e = v[k] < v[(k + 1) % 3] ? `${v[k]}_${v[(k + 1) % 3]}` : `${v[(k + 1) % 3]}_${v[k]}`;
        edges.set(e, (edges.get(e) || 0) + 1);
      }
    }
  }
  let closed = null;
  if (edges.size) { closed = true; for (const cnt of edges.values()) if (cnt !== 2) { closed = false; break; } }
  return { area, volume: Math.abs(vol), closed };
}

export function measureObject(obj) {
  let area = 0, volume = 0, closed = true, any = false;
  obj.traverse((o) => {
    if (!o.isMesh || !isRenderable(o)) return;
    const r = measureMesh(o);
    if (!r) return;
    any = true;
    area += r.area; volume += r.volume;
    if (!r.closed) closed = false;
  });
  return any ? { area, volume: closed ? volume : null, closed } : null;
}

// Nesnenin kökten yolu (ad dizisi) — seçim geri yüklemesi ve testler için
export function pathOf(o, root) {
  const out = [];
  for (let p = o; p && p !== root; p = p.parent) out.unshift(p.parent ? p.parent.children.indexOf(p) : 0);
  return out;
}
export function byPath(root, path) {
  let o = root;
  for (const i of path || []) { o = o && o.children[i]; if (!o) return null; }
  return o;
}
