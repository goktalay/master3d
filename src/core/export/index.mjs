// Dışa aktarma giriş noktası: biçim kaydındaki (formats.js › EXPORT) her biçim için yazıcıyı çağırır.
// Dönüş: { files: [{ name, data: Uint8Array }], warnings: [{ key, vars }] } — ilk dosya ana dosyadır; diğerleri (OBJ'nin
// .mtl'si, dokular) aynı klasöre yazılır.

import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import FORMATS from '../../formats.js';
import { prepareExport, TARGET, renderables } from './prepare.mjs';
import { writeSTL, writePLY, writeOBJ, writeOFF } from './mesh-formats.mjs';
import { write3MF } from './threemf.mjs';
import { writeDAE } from './dae.mjs';
import { writeVRML, writeX3D } from './vrml.mjs';
import { writeFBX } from './fbx.mjs';
import { writeSTEP } from './step.mjs';
import { sceneStats } from '../scene.mjs';

const STEP_TRI_WARN = 300000;

export async function exportModel(model, id, opts = {}) {
  const fmt = FORMATS.exportById(id);
  if (!fmt) throw new Error('unknown_format');
  const baseName = (opts.baseName || model.name || 'model').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'model';
  const src = opts.src || {};
  const root = prepareExport(model, { selection: opts.selection, onlyVisible: !!opts.onlyVisible, src, target: id, convert: opts.convert !== false });
  const warnings = [];
  const stats = sceneStats(root);
  if (!stats.meshes && !(['glb', 'gltf', 'ply', 'ply-ascii'].includes(id) && stats.points)) throw Object.assign(new Error('nothing_to_export'), { code: 'nothing_to_export' });
  if (stats.points && !['glb', 'gltf', 'ply', 'ply-ascii'].includes(id)) warnings.push({ key: 'exp.warn.points' });
  if (stats.lines && !['glb', 'gltf'].includes(id)) warnings.push({ key: 'exp.warn.lines' });
  // Dönüşüm sonrası kaynak birim/eksen: sözleşmesi olan biçimde hedefinki, olmayanda kaynağınki
  const t = TARGET[id] || {};
  const unit = opts.convert === false ? src.unit : (t.unit || src.unit);
  const up = opts.convert === false ? src.up : (t.up || src.up);
  const file = (data, ext = fmt.ext) => ({ name: `${baseName}.${ext}`, data });
  let files;
  switch (id) {
    case 'glb':
    case 'gltf': {
      const anims = opts.animations && !opts.selection ? opts.animations : [];
      const out = await new GLTFExporter().parseAsync(root, { binary: id === 'glb', animations: anims, onlyVisible: false, embedImages: true, includeCustomExtensions: false });
      files = [file(id === 'glb' ? new Uint8Array(out) : new TextEncoder().encode(JSON.stringify(out)))];
      break;
    }
    case 'usdz': {
      const out = await new USDZExporter().parseAsync(root, { quickLookCompatible: false });
      files = [file(new Uint8Array(out))];
      break;
    }
    case 'fbx': files = [file(writeFBX(root, { unit, title: baseName }))]; if (opts.animations && opts.animations.length) warnings.push({ key: 'exp.warn.noAnim' }); break;
    case 'obj': files = await writeOBJ(root, { baseName, encodeImage: opts.encodeImage }); break;
    case 'dae': files = [file(writeDAE(root, { unit, up, title: baseName }))]; break;
    case 'step':
      if (stats.triangles > STEP_TRI_WARN) warnings.push({ key: 'exp.warn.stepLarge', vars: { n: stats.triangles } });
      files = [file(writeSTEP(root, { name: baseName, merge: opts.stepMerge || 0 }))];
      break;
    case 'stl': files = [file(writeSTL(root, { binary: true }))]; break;
    case 'stl-ascii': files = [file(writeSTL(root, { binary: false }))]; break;
    case '3mf': files = [file(write3MF(root, { unit: 'millimeter', title: baseName }))]; break;
    case 'ply': files = [file(await writePLY(root, { binary: true }))]; break;
    case 'ply-ascii': files = [file(await writePLY(root, { binary: false }))]; break;
    case 'wrl': files = [file(writeVRML(root))]; break;
    case 'x3d': files = [file(writeX3D(root, { title: baseName }))]; break;
    case 'off': files = [file(writeOFF(root))]; break;
    default: throw new Error('unknown_format');
  }
  return { files, warnings, stats: { ...stats, parts: renderables(root).length } };
}

// "Her parçayı ayrı dosyaya": seçili (ya da tüm) parçalar için ayrı ayrı; dosya adları parça adlarından
export async function exportEach(model, id, parts, opts = {}) {
  const out = [];
  const used = new Set();
  for (const p of parts) {
    let name = (p.name || 'part').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'part';
    let k = 1; const base = name;
    while (used.has(name.toLowerCase())) name = `${base} (${++k})`;
    used.add(name.toLowerCase());
    const r = await exportModel(model, id, { ...opts, selection: [p], baseName: name });
    out.push(...r.files);
  }
  return out;
}
