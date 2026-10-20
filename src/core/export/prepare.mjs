// Dışa aktarma hazırlığı: dışa aktarılacak sahnenin bağımsız bir kopyası (geometri ve malzemeler paylaşılır).
// - Kapsam: tüm model, seçili parçalar ya da yalnız görünenler. Seçili parça modeldeki dünya konumuyla taşınır.
// - Görüntüleyicinin geçici değişiklikleri (tel kafes / X-ışını malzemeleri, kenar çizgileri, yardımcılar) alınmaz.
// - Birim ve eksen: hedef biçimin sözleşmesi varsa (glTF / USDZ / VRML / X3D: Y yukarı, metre; 3MF / STEP: Z yukarı,
//   milimetre) kaynak birim ve eksenden dönüştürülür. Sözleşmesi olmayanlarda (STL, OBJ, PLY, OFF) sayılar olduğu gibi.

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { isRenderable, isShown } from '../scene.mjs';

export const UNIT_M = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

// Hedef sözleşmeleri: up (yukarı eksen) ve unit (null = dönüştürme yok)
export const TARGET = {
  glb: { up: 'y', unit: 'm' }, gltf: { up: 'y', unit: 'm' }, usdz: { up: 'y', unit: 'm' }, wrl: { up: 'y', unit: 'm' }, x3d: { up: 'y', unit: 'm' },
  '3mf': { up: 'z', unit: 'mm' }, step: { up: 'z', unit: 'mm' },
  fbx: { up: 'y', unit: null }, dae: { up: null, unit: null },
  stl: { up: null, unit: null }, 'stl-ascii': { up: null, unit: null }, ply: { up: null, unit: null }, 'ply-ascii': { up: null, unit: null },
  obj: { up: null, unit: null }, off: { up: null, unit: null },
};

// Kaynak → hedef dönüşüm matrisi
export function conversionMatrix(src, dst) {
  const m = new THREE.Matrix4();
  if (dst.up && src.up && dst.up !== src.up) {
    // Z yukarı → Y yukarı: X ekseni etrafında −90°; tersi +90°
    m.makeRotationX(src.up === 'z' ? -Math.PI / 2 : Math.PI / 2);
  }
  if (dst.unit && src.unit && UNIT_M[src.unit] && UNIT_M[dst.unit] && src.unit !== dst.unit) {
    m.premultiply(new THREE.Matrix4().makeScale(...Array(3).fill(UNIT_M[src.unit] / UNIT_M[dst.unit])));
  }
  return m;
}

// model: içerik kökü (dosyadan yüklenen ağaç). selection: parça dizisi ya da null (tümü).
export function prepareExport(model, { selection = null, onlyVisible = false, src = {}, target = 'glb', convert = true } = {}) {
  model.updateWorldMatrix(true, true);
  const out = new THREE.Group();
  out.name = model.name || 'model';
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const roots = selection && selection.length ? topMost(selection) : model.children.slice();
  for (const o of roots) {
    if (onlyVisible && !isShown(o)) continue;
    const c = cleanClone(o, onlyVisible);
    if (!c) continue;
    // Seçili parça: modeldeki konumu (üst düğümlerin dönüşümü dahil) korunur
    if (selection && selection.length) new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(c.position, c.quaternion, c.scale);
    out.add(c);
  }
  if (convert) {
    const m = conversionMatrix(src, TARGET[target] || {});
    if (!isIdentity(m)) for (const c of out.children) c.applyMatrix4(m);
  }
  out.updateMatrixWorld(true);
  return out;
}

const isIdentity = (m) => m.elements.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-12);

// Seçimde biri diğerinin içindeyse yalnız üstteki alınır
function topMost(list) {
  const set = new Set(list);
  return list.filter((o) => { for (let p = o.parent; p; p = p.parent) if (set.has(p)) return false; return true; });
}

function cleanClone(o, onlyVisible) {
  const c = skeletonClone(o);
  const drop = [];
  const pairs = [];
  // Özgün nesne ile kopya aynı sırayla gezilir: görüntüleyici malzemesi yerine özgün malzeme konur
  const a = [], b = [];
  o.traverse((x) => a.push(x));
  c.traverse((x) => b.push(x));
  for (let i = 0; i < a.length && i < b.length; i++) pairs.push([a[i], b[i]]);
  for (const [src, dst] of pairs) {
    if (src.userData.m3helper || src.userData.m3overlay || (onlyVisible && !src.visible)) { drop.push(dst); continue; }
    if (src.userData.m3mat) dst.material = src.userData.m3mat;
    dst.visible = true;
    dst.userData = { ...src.userData };
    delete dst.userData.m3mat; delete dst.userData.m3explode;
  }
  for (const d of drop) if (d.parent) d.parent.remove(d);
  if (drop.includes(c)) return null;
  let any = false;
  c.traverse((x) => { if (isRenderable(x)) any = true; });
  return any ? c : null;
}

// --- Yazıcıların ortak yardımcıları -------------------------------------------------------------------------------

// Dışa aktarılacak çizilebilir nesneler (dünya matrisiyle). kinds: 'mesh' | 'points' | 'line'
export function renderables(root, kinds = ['mesh']) {
  const out = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!isRenderable(o)) return;
    if ((o.isMesh && kinds.includes('mesh')) || (o.isPoints && kinds.includes('points')) || (o.isLine && kinds.includes('line'))) out.push(o);
  });
  return out;
}

// Bir ağın üçgenleri: { pos: Float32Array (dünya), nor?: Float32Array (dünya), uv?, color?, tri: Uint32Array, mat: Uint16Array (üçgen → malzeme), materials }
// SkinnedMesh / morph hedefleri o anki duruşla değil bağlama duruşuyla yazılır.
export function meshData(o, { world = true } = {}) {
  const g = o.geometry;
  const P = g.getAttribute('position');
  const N = g.getAttribute('normal');
  const UV = g.getAttribute('uv');
  const C = g.getAttribute('color');
  const n = P.count;
  const m = world ? o.matrixWorld : new THREE.Matrix4();
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const v = new THREE.Vector3();
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
  let nor = null;
  if (N) {
    nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z; }
  }
  let uv = null;
  if (UV) { uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uv[i * 2] = UV.getX(i); uv[i * 2 + 1] = UV.getY(i); } }
  let color = null;
  if (C) { color = new Float32Array(n * 3); for (let i = 0; i < n; i++) { color[i * 3] = C.getX(i); color[i * 3 + 1] = C.getY(i); color[i * 3 + 2] = C.getZ(i); } }
  const idx = g.index;
  const start = Math.max(0, g.drawRange.start || 0);
  const total = idx ? idx.count : n;
  const end = Math.min(total, Number.isFinite(g.drawRange.count) ? start + g.drawRange.count : total);
  const triN = Math.floor((end - start) / 3);
  const tri = new Uint32Array(triN * 3);
  for (let i = 0; i < triN * 3; i++) tri[i] = idx ? idx.getX(start + i) : start + i;
  const materials = Array.isArray(o.material) ? o.material : [o.material];
  const mat = new Uint16Array(triN);
  if (Array.isArray(o.material) && g.groups.length) {
    for (const gr of g.groups) {
      const a = Math.max(0, Math.floor((gr.start - start) / 3)), b = Math.min(triN, Math.floor((gr.start + gr.count - start) / 3));
      for (let t = a; t < b; t++) mat[t] = Math.min(gr.materialIndex || 0, materials.length - 1);
    }
  }
  // Ayna dönüşümünde (negatif ölçek) üçgen yönü ters çevrilir ki normaller dışarı baksın
  if (world && m.determinant() < 0) for (let t = 0; t < triN; t++) { const a = tri[t * 3 + 1]; tri[t * 3 + 1] = tri[t * 3 + 2]; tri[t * 3 + 2] = a; }
  return { name: o.name || '', pos, nor, uv, color, tri, mat, materials, count: n };
}

// Malzemenin temel rengi ve saydamlığı (her malzeme türü için)
// Renkler sRGB (dosya biçimlerinin çoğu görüntü rengini sRGB saklar; three.js içeride doğrusal tutar). glTF hariç:
// GLTFExporter kendi dönüşümünü yapar.
const _srgb = { r: 0, g: 0, b: 0 };
export function materialInfo(m) {
  const c = m && m.color ? m.color.getRGB(_srgb, THREE.SRGBColorSpace) : { r: 0.8, g: 0.8, b: 0.8 };
  const e = m && m.emissive ? m.emissive.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace) : { r: 0, g: 0, b: 0 };
  return {
    name: (m && m.name) || '',
    // Doğrusal ↔ sRGB gidiş-dönüşündeki kayan nokta artığı atılır (0xcc → 0.8, 0.8000029 değil)
    color: [c.r, c.g, c.b].map((x) => Math.round(x * 1e4) / 1e4),
    opacity: m && m.transparent ? (m.opacity ?? 1) : 1,
    metalness: m && m.metalness != null ? m.metalness : 0,
    roughness: m && m.roughness != null ? m.roughness : (m && m.shininess != null ? Math.max(0, 1 - m.shininess / 100) : 0.6),
    emissive: [e.r, e.g, e.b].map((x) => Math.round(x * 1e4) / 1e4),
    map: m && m.map && m.map.image ? m.map : null,
  };
}

// Dosya adı ve kimlik güvenliği: biçimlerin çoğunda boşluk / özel karakter sorun çıkarır
export function safeId(s, used, prefix = 'n') {
  let base = String(s || '').replace(/ı/g, 'i').replace(/İ/g, 'I').normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || prefix;
  if (/^\d/.test(base)) base = prefix + '_' + base;
  let id = base, i = 1;
  while (used.has(id)) id = `${base}_${++i}`;
  used.add(id);
  return id;
}

export const enc = (s) => new TextEncoder().encode(s);
export const xmlEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
// Sayılar: gereksiz sıfırlar olmadan, en çok 6 anlamlı basamak (dosya boyutu ve okunabilirlik)
export const num = (x) => { if (!Number.isFinite(x)) return '0'; const r = Math.abs(x) < 1e-12 ? 0 : x; return String(+r.toPrecision(7)); };
