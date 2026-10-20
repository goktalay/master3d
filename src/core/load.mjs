// Model yükleme: biçim kaydına (formats.js) göre doğru motoru seçer ve her şeyi tek bir three.js sahne ağacına çevirir.
// Motorlar: three (three.js okuyucuları, bu iş parçacığında), occt / assimp / ifc (WebAssembly, çalışan iş parçacığında —
// ctx.runWorker ile), x3d (yerleşik), zip (arşivdeki modeli bulur, yan dosyaları bellekten verir).
//
// Kaynak (src): { name, ext, url, baseUrl, bytes(): Promise<ArrayBuffer>, sidecars(): Promise<[{ name, bytes }]> }
//   url/baseUrl yalnız göreli başvurular için (doku, .mtl, .bin); dosyanın kendisi bytes() ile okunur.
// Bağlam (ctx): { libPath, renderer?, runWorker?(kind, payload, transfer), onStage?(key), manager? }
// Dönüş: { root: Group, animations, engine, format, units, upAxis, warnings }
//
// Dosyalar yalnız bu bilgisayarda işlenir: hiçbir okuyucu ağa çıkmaz (pencerenin içerik güvenlik politikası da izin vermez).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { AMFLoader } from 'three/addons/loaders/AMFLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js';
import { USDLoader } from 'three/addons/loaders/USDLoader.js';
import { VRMLLoader } from 'three/addons/loaders/VRMLLoader.js';
import { LWOLoader } from 'three/addons/loaders/LWOLoader.js';
import { VOXLoader } from 'three/addons/loaders/VOXLoader.js';
import { Rhino3dmLoader } from 'three/addons/loaders/3DMLoader.js';
import { KMZLoader } from 'three/addons/loaders/KMZLoader.js';
import { MD2Loader } from 'three/addons/loaders/MD2Loader.js';
import { PCDLoader } from 'three/addons/loaders/PCDLoader.js';
import { XYZLoader } from 'three/addons/loaders/XYZLoader.js';
import { VTKLoader } from 'three/addons/loaders/VTKLoader.js';
import { GCodeLoader } from 'three/addons/loaders/GCodeLoader.js';
import { PDBLoader } from 'three/addons/loaders/PDBLoader.js';
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';
import { unzipSync } from 'fflate';
import FORMATS from '../formats.js';
import { occtToScene } from './engines/cad.mjs';
import { ifcToScene } from './engines/ifc.mjs';
import { parseX3D } from './engines/x3d.mjs';

const { formatOf, extOf, SIDECAR_EXTS } = FORMATS;

// Kaynak birimi ve yukarı ekseni (biçimin sözleşmesi ya da yaygın kullanımı). null = bilinmiyor.
const UNITS = { gltf: 'm', usd: 'm', ifc: 'm', wrl: 'm', x3d: 'm', kmz: 'm', step: 'mm', iges: 'mm', brep: 'mm', stl: 'mm', '3mf': 'mm', amf: 'mm', gcode: 'mm', fbx: 'cm', '3dm': null };
// PLY / XYZ / PCD taramaları çoğunlukla Y yukarı (Stanford örnekleri); yanlışsa denetçiden bir tıkla değişir
const Z_UP = new Set(['stl', '3mf', 'amf', 'step', 'iges', 'brep', '3dm', 'off', 'dxf', 'gcode', 'vox', 'blend']);

export class LoadError extends Error {
  constructor(code, detail) { super(detail ? `${code}: ${detail}` : code); this.code = code; this.detail = detail || ''; }
}

const decoder = new TextDecoder();
const text = (buf) => decoder.decode(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf);
const toAB = (u8) => (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));

// Blender başlığı: "BLENDER-v276" ya da yeni (5.x) "BLENDER17-01v0500". Assimp yalnız 2.4–2.7x kayıtlarını okur.
export function blendVersion(buf) {
  const s = text(new Uint8Array(buf, 0, Math.min(32, buf.byteLength)));
  let m = /^BLENDER[-_][vV](\d)(\d\d)/.exec(s);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  m = /^BLENDER\d\d-\d\d[vV](\d\d)(\d\d)/.exec(s);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  return null;
}

function staticLoaders(ctx) {
  const manager = ctx.manager || new THREE.LoadingManager();
  return { manager };
}

// --- three.js motoru ------------------------------------------------------------------------------------------
async function loadThree(fmt, src, ctx, warnings) {
  const { manager } = staticLoaders(ctx);
  const base = src.baseUrl || '';
  const buf = await src.bytes();
  const lib = ctx.libPath || '';
  const group = (name, ...children) => { const g = new THREE.Group(); g.name = name || ''; for (const c of children) if (c) g.add(c); return g; };
  const meshOf = (geo, name, extra = {}) => {
    const hasColor = !!geo.getAttribute('color');
    const mat = new THREE.MeshStandardMaterial({ color: hasColor ? 0xffffff : 0xb8c2cf, metalness: 0.1, roughness: 0.65, vertexColors: hasColor, ...extra });
    if (geo.alpha && geo.alpha < 1) { mat.transparent = true; mat.opacity = geo.alpha; }
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.name = name; return m;
  };
  const pointsOf = (geo, name) => {
    const hasColor = !!geo.getAttribute('color');
    geo.computeBoundingBox();
    const size = geo.boundingBox.getSize(new THREE.Vector3()).length() || 1;
    // Nokta boyutu yoğunluğa göre: az noktalı bulutlarda iri, milyonlarca noktada ince
    const n = geo.getAttribute('position').count;
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ size: size / (60 + Math.sqrt(n)), color: hasColor ? 0xffffff : 0x22d3ee, vertexColors: hasColor, sizeAttenuation: true }));
    p.name = name; return p;
  };
  const stem = src.name.replace(/\.[^.]+$/, '');

  switch (fmt.id) {
    case 'gltf': {
      const loader = new GLTFLoader(manager);
      const draco = new DRACOLoader(manager).setDecoderPath(lib + 'draco/');
      loader.setDRACOLoader(draco);
      if (ctx.renderer) loader.setKTX2Loader(new KTX2Loader(manager).setTranscoderPath(lib + 'basis/').detectSupport(ctx.renderer));
      loader.setMeshoptDecoder(MeshoptDecoder);
      const r = await loader.parseAsync(buf, base);
      draco.dispose();
      const root = r.scene || r.scenes?.[0] || group(stem);
      return { root, animations: r.animations || [] };
    }
    case 'fbx': {
      const obj = new FBXLoader(manager).parse(buf, base);
      return { root: obj, animations: obj.animations || [] };
    }
    case 'obj': {
      const src_ = text(buf);
      const loader = new OBJLoader(manager);
      const libs = [...src_.matchAll(/^\s*mtllib\s+(.+?)\s*$/gm)].map((m) => m[1]);
      let creator = null;
      for (const name of libs) {
        try {
          const mtlText = await fetchText(manager.resolveURL(base + name));
          const c = new MTLLoader(manager).parse(mtlText, base);
          if (!creator) creator = c; else creator.setMaterials({ ...creator.materialsInfo, ...c.materialsInfo });
        } catch { warnings.push({ key: 'warn.missingFile', vars: { name } }); }
      }
      if (creator) { creator.preload(); loader.setMaterials(creator); }
      return { root: loader.parse(src_) };
    }
    case 'stl': {
      const geo = new STLLoader(manager).parse(buf);
      return { root: group(stem, meshOf(geo, stem)) };
    }
    case 'ply': {
      const geo = new PLYLoader(manager).parse(buf);
      const isPoints = !geo.index && !/element\s+face\s+[1-9]/.test(text(new Uint8Array(buf, 0, Math.min(4096, buf.byteLength))));
      return { root: group(stem, isPoints ? pointsOf(geo, stem) : meshOf(geo, stem)) };
    }
    case '3mf': return { root: new ThreeMFLoader(manager).parse(buf) };
    case 'amf': return { root: new AMFLoader(manager).parse(buf) };
    case 'dae': {
      const r = new ColladaLoader(manager).parse(text(buf), base);
      if (!r || !r.scene) throw new LoadError('parse_failed');
      return { root: r.scene, animations: r.scene.animations || r.animations || [] };
    }
    case '3ds': return { root: new TDSLoader(manager).parse(buf, base) };
    case 'usd': {
      const loader = new USDLoader(manager);
      const root = await new Promise((resolve, reject) => {
        try { loader.parse(buf, base, resolve, reject); } catch (e) { reject(e); }
      });
      return { root };
    }
    case 'wrl': return { root: dropVrmlBackground(new VRMLLoader(manager).parse(text(buf), base)) };
    case 'lwo': {
      const r = new LWOLoader(manager).parse(buf, base, stem);
      return { root: group(stem, ...r.meshes) };
    }
    case 'vox': {
      const r = new VOXLoader(manager).parse(buf);
      if (!r || !r.scene) throw new LoadError('parse_failed');
      return { root: r.scene };
    }
    case '3dm': {
      const loader = new Rhino3dmLoader(manager).setLibraryPath(lib + 'rhino3dm/');
      // İş parçacığı blob: yerine hazır dosyadan (scripts/build.js üretir; iş parçacığı politikasıyla sunulur)
      loader._initLibrary = function () {
        if (!this.libraryPending) {
          this.libraryPending = fetch(lib + 'rhino3dm/rhino3dm.wasm').then((r) => r.arrayBuffer()).then((bin) => {
            this.libraryConfig.wasmBinary = bin;
            this.workerSourceURL = lib + 'rhino3dm/rhino-worker.js';
          });
        }
        return this.libraryPending;
      };
      const root = await loader.parseAsync(buf);
      for (const w of root.userData.warnings || []) if (w && w.message) warnings.push({ key: 'warn.engine', vars: { msg: `${w.type || ''} ${w.message}`.trim() } });
      loader.dispose();
      return { root };
    }
    case 'kmz': {
      const r = new KMZLoader(manager).parse(buf);
      return { root: r.scene };
    }
    case 'md2': {
      const geo = new MD2Loader(manager).parse(buf);
      const mesh = meshOf(geo, stem, { flatShading: false });
      return { root: group(stem, mesh), animations: geo.animations || [] };
    }
    case 'pcd': {
      const p = new PCDLoader(manager).parse(buf);
      p.name = stem;
      if (!p.geometry.getAttribute('color')) p.material.color.set(0x22d3ee);
      p.geometry.computeBoundingBox();
      p.material.size = p.geometry.boundingBox.getSize(new THREE.Vector3()).length() / (60 + Math.sqrt(p.geometry.getAttribute('position').count));
      return { root: group(stem, p) };
    }
    case 'xyz': return { root: group(stem, pointsOf(new XYZLoader(manager).parse(text(buf)), stem)) };
    case 'vtk': {
      const geo = new VTKLoader(manager).parse(buf, base);
      return { root: group(stem, geo.index || geo.getAttribute('position').count % 3 === 0 ? meshOf(geo, stem) : pointsOf(geo, stem)) };
    }
    case 'gcode': {
      // Her katman ayrı parça (Z ekseninde patlatma katmanları ayırır); boş gezinme çizgileri gizli başlar
      const loader = new GCodeLoader(manager);
      loader.splitLayer = true;
      const obj = loader.parse(text(buf));
      obj.name = stem;
      let k = 0;
      for (const c of obj.children) {
        const travel = c.material && c.material.name === 'path';
        if (!travel) k++;
        c.name = travel ? `travel ${k}` : `layer ${k}`;
        if (travel) c.visible = false;
      }
      for (const c of [...obj.children]) if (!c.geometry.getAttribute('position').count) obj.remove(c);
      return { root: obj };
    }
    case 'pdb': return { root: pdbToScene(new PDBLoader(manager).parse(text(buf)), stem) };
    case 'bvh': {
      const r = new BVHLoader(manager).parse(text(buf));
      const root = group(stem);
      const bones = r.skeleton.bones[0];
      root.add(bones);
      // İskelet çizgi olarak görünür; sınır kutusu kemik konumlarından (scene.mjs › worldBox)
      const helper = new THREE.SkeletonHelper(bones);
      helper.name = 'skeleton';
      helper.material.linewidth = 2;
      helper.material.color = new THREE.Color(0x5eead4);
      helper.material.depthTest = false;
      helper.renderOrder = 5;
      root.add(helper);
      return { root, animations: [r.clip] };
    }
    default: throw new LoadError('unsupported', fmt.id);
  }
}

// VRML Background düğümü (gökyüzü / zemin küreleri) sahneyi örter; Master 3D kendi arka planını kullanır
function dropVrmlBackground(root) {
  const drop = [];
  root.traverse((o) => { if (o !== root && o.renderOrder === -Infinity) drop.push(o); });
  for (const o of drop) if (o.parent) o.parent.remove(o);
  return root;
}

// PDB molekülü: atomlar elemente göre birleşik küreler (her element bir parça), bağlar tek parça
function pdbToScene(pdb, name) {
  const root = new THREE.Group(); root.name = name;
  const pos = pdb.geometryAtoms.getAttribute('position');
  const col = pdb.geometryAtoms.getAttribute('color');
  const byEl = new Map();
  for (let i = 0; i < pos.count; i++) {
    const el = (pdb.json.atoms[i] && pdb.json.atoms[i][4]) || '?';
    if (!byEl.has(el)) byEl.set(el, { idx: [], color: new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)) });
    byEl.get(el).idx.push(i);
  }
  // Ölçek: molekül Ångström; en yakın komşu ~1–1.5 Å → küre yarıçapı 0.35
  const sphere = new THREE.IcosahedronGeometry(0.35, 2);
  for (const [el, { idx, color }] of byEl) {
    const parts = idx.map((i) => sphere.clone().translate(pos.getX(i), pos.getY(i), pos.getZ(i)));
    const geo = mergeSimple(parts);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.05 }));
    m.name = el;
    root.add(m);
  }
  const bp = pdb.geometryBonds.getAttribute('position');
  if (bp && bp.count >= 2) {
    const cyl = new THREE.CylinderGeometry(0.1, 0.1, 1, 8, 1, true);
    const parts = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
    for (let i = 0; i + 1 < bp.count; i += 2) {
      a.fromBufferAttribute(bp, i); b.fromBufferAttribute(bp, i + 1);
      const len = a.distanceTo(b);
      if (!len) continue;
      q.setFromUnitVectors(up, b.clone().sub(a).normalize());
      const g = cyl.clone().scale(1, len, 1).applyQuaternion(q).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      parts.push(g);
    }
    if (parts.length) {
      const m = new THREE.Mesh(mergeSimple(parts), new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.5 }));
      m.name = 'bonds';
      root.add(m);
    }
  }
  return root;
}

// Aynı öznitelik kümesine sahip indeksli geometrileri birleştirir (konum + normal)
export function mergeSimple(geos) {
  let vCount = 0, iCount = 0;
  for (const g of geos) { vCount += g.getAttribute('position').count; iCount += g.index ? g.index.count : g.getAttribute('position').count; }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    pos.set(p.array, vo * 3);
    if (n) nor.set(n.array, vo * 3);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) idx[io++] = i + vo;
    vo += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

// --- WebAssembly motorları (çalışan iş parçacığında) --------------------------------------------------------------
async function loadWorker(engine, fmt, src, ctx) {
  if (!ctx.runWorker) throw new LoadError('no_worker', engine);
  const buf = await src.bytes();
  if (engine === 'occt') {
    ctx.onStage && ctx.onStage('stage.cad');
    const res = await ctx.runWorker('occt', { format: fmt.id, bytes: buf }, [buf]);
    return { root: occtToScene(res, src.name.replace(/\.[^.]+$/, '')) };
  }
  if (engine === 'ifc') {
    ctx.onStage && ctx.onStage('stage.ifc');
    const res = await ctx.runWorker('ifc', { bytes: buf }, [buf]);
    return { root: ifcToScene(res, src.name.replace(/\.[^.]+$/, '')) };
  }
  if (engine === 'assimp') {
    if (fmt.id === 'blend') {
      const v = blendVersion(buf);
      if (v != null && v >= 280) throw new LoadError('blend_new', String(v / 100));
    }
    ctx.onStage && ctx.onStage('stage.assimp');
    const files = [{ name: src.name, bytes: buf }];
    if (src.sidecars) for (const s of await src.sidecars()) files.push(s);
    const res = await ctx.runWorker('assimp', { files }, files.map((f) => f.bytes));
    if (!res.ok) throw new LoadError('parse_failed', res.error);
    const loader = new GLTFLoader(ctx.manager || new THREE.LoadingManager());
    // assimp dış dokuları göreli adla bırakır: modelin klasörüne göre çözülür
    const r = await loader.parseAsync(res.glb, src.baseUrl || '');
    const root = r.scene;
    // assimp kökü "ROOT" adlı tek düğüm ekler; dosya adıyla değiştir
    if (root.children.length === 1 && /^(root|assimp|<.*>)?$/i.test(root.children[0].name || '')) root.children[0].name = src.name.replace(/\.[^.]+$/, '');
    return { root, animations: r.animations || [] };
  }
  throw new LoadError('unsupported', engine);
}

// --- ZIP: arşivdeki birincil modeli bulur; yan dosyalar bellekten (blob:) verilir ---------------------------------
const ZIP_PRIORITY = ['gltf', 'glb', 'fbx', 'obj', 'dae', 'usdz', 'usda', 'usdc', 'usd', 'step', 'stp', 'iges', 'igs', 'brep', '3dm', 'ifc', '3mf', 'stl', 'ply', 'wrl', 'x3d', '3ds', 'blend'];
export function pickZipEntry(names) {
  const models = names.filter((n) => !/(^|\/)(__MACOSX|\.)/.test(n) && formatOf(n) && formatOf(n).id !== 'zip');
  if (!models.length) return null;
  const rank = (n) => { const i = ZIP_PRIORITY.indexOf(extOf(n)); return i < 0 ? 99 : i; };
  return models.sort((a, b) => rank(a) - rank(b) || a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
}

async function loadZip(src, ctx, warnings) {
  const buf = await src.bytes();
  let files;
  try { files = unzipSync(new Uint8Array(buf)); } catch (e) { throw new LoadError('zip_failed', e.message); }
  const names = Object.keys(files).filter((n) => !n.endsWith('/'));
  const main = pickZipEntry(names);
  if (!main) throw new LoadError('zip_no_model');
  const dir = main.includes('/') ? main.slice(0, main.lastIndexOf('/') + 1) : '';
  const urls = new Map();
  const canBlob = typeof URL !== 'undefined' && typeof Blob !== 'undefined' && URL.createObjectURL;
  if (canBlob) for (const n of names) urls.set(n, URL.createObjectURL(new Blob([files[n]])));
  // Göreli adresler arşiv içi yollara eşlenir: "zip:/<yol>"
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (!url.startsWith('zip:/')) return url;
    const rel = decodeURIComponent(url.slice(5)).replace(/\\/g, '/');
    const norm = normalizeZipPath(rel);
    const hit = urls.get(norm) || urls.get(names.find((n) => n.toLowerCase() === norm.toLowerCase()) || '') || urls.get(names.find((n) => n.split('/').pop().toLowerCase() === norm.split('/').pop().toLowerCase()) || '');
    return hit || url;
  });
  const sub = {
    name: main.split('/').pop(), ext: extOf(main), url: 'zip:/' + main, baseUrl: 'zip:/' + dir,
    bytes: async () => toAB(files[main]),
    sidecars: async () => names.filter((n) => n !== main && SIDECAR_EXTS.includes(extOf(n))).map((n) => ({ name: n.slice(dir.length) || n, bytes: toAB(files[n]) })),
  };
  try {
    const r = await loadModel(sub, { ...ctx, manager }, warnings);
    r.archiveEntry = main;
    r.dispose = () => { for (const u of urls.values()) URL.revokeObjectURL(u); };
    return r;
  } catch (e) {
    for (const u of urls.values()) URL.revokeObjectURL(u);
    throw e;
  }
}

export function normalizeZipPath(p) {
  const out = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop(); else out.push(seg);
  }
  return out.join('/');
}

// --- Giriş noktası -------------------------------------------------------------------------------------------------
export async function loadModel(src, ctx = {}, warnings = []) {
  const fmt = formatOf(src.name);
  if (!fmt) throw new LoadError('unsupported', extOf(src.name));
  if (fmt.engine === 'zip') return loadZip(src, ctx, warnings);
  let r, engine = fmt.engine;
  try {
    if (fmt.engine === 'three') r = await loadThree(fmt, src, ctx, warnings);
    else if (fmt.engine === 'x3d') r = { root: dropVrmlBackground(parseX3D(text(await src.bytes()), { name: src.name.replace(/\.[^.]+$/, ''), baseUrl: src.baseUrl, manager: ctx.manager })) };
    else r = await loadWorker(fmt.engine, fmt, src, ctx);
  } catch (e) {
    if (!fmt.fallback || e.code === 'blend_new') throw e instanceof LoadError ? e : new LoadError('parse_failed', e && e.message);
    engine = fmt.fallback;
    warnings.push({ key: 'warn.fallback', vars: { engine: engine } });
    r = await loadWorker(fmt.fallback, fmt, src, ctx);
  }
  const root = r.root;
  if (!root) throw new LoadError('parse_failed');
  if (!root.name) root.name = src.name.replace(/\.[^.]+$/, '');
  normalize(root, fmt);
  return {
    root, animations: (r.animations || []).filter(Boolean), engine, format: fmt.id,
    units: UNITS[fmt.id] ?? null, upAxis: Z_UP.has(fmt.id) ? 'z' : 'y', warnings,
  };
}

// Görüntüleme için ortak düzeltmeler: normaller, çift yüzlü malzemeler (açık kabuklu CAD/STL ağları), boş adlar
function normalize(root, fmt) {
  root.traverse((o) => {
    if (o.isMesh) {
      const g = o.geometry;
      if (g && !g.getAttribute('normal') && g.getAttribute('position')) g.computeVertexNormals();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      // glTF'te yüz yönü belirtimde (doubleSided); diğerlerinde açık kabuklar ve ters normaller görünsün diye çift yüzlü
      for (const m of mats) if (m && fmt.id !== 'gltf' && m.side !== THREE.DoubleSide) m.side = THREE.DoubleSide;
    }
  });
}
