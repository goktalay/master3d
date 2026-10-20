// WebAssembly motorları için çalışan iş parçacığı (klasik worker; kütüphaneler importScripts ile yüklenir).
// İş başına bir worker açılır ve iş bitince kapatılır: WASM belleği (OpenCascade yüzlerce MB'a çıkabilir) geri verilir.
// İleti: { kind: 'occt' | 'ifc' | 'assimp' | 'split', payload, vendor: '<gen/vendor/ adresi>' }
// Yanıt: { type: 'done', result } | { type: 'error', message } | { type: 'stage', key }
/* eslint-env worker */
/* global occtimportjs, assimpjs, WebIFC */
'use strict';

import { componentsOf } from '../../../core/split.mjs';

const post = (msg, transfer) => self.postMessage(msg, transfer || []);
const copyF32 = (a) => new Float32Array(a);
const copyU32 = (a) => new Uint32Array(a);

async function runOcct({ format, bytes, quality }, vendor) {
  importScripts(vendor + 'occt-import-js.js');
  const occt = await occtimportjs({ locateFile: (f) => vendor + f });
  // Üçgenleme hassasiyeti: model köşegenine oranla (düşük → kaba ve hızlı, yüksek → ince)
  const ratio = { low: 0.004, medium: 0.001, high: 0.0003 }[quality] || 0.001;
  const params = { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: ratio, angularDeflection: quality === 'high' ? 0.25 : 0.5 };
  const data = new Uint8Array(bytes);
  const r = format === 'iges' ? occt.ReadIgesFile(data, params) : format === 'brep' ? occt.ReadBrepFile(data, params) : occt.ReadStepFile(data, params);
  if (!r || !r.success) throw new Error('occt_failed');
  const transfer = [];
  const meshes = r.meshes.map((m) => {
    const out = {
      name: m.name || '', color: m.color || null, brep_faces: m.brep_faces || [],
      attributes: { position: { array: copyF32(m.attributes.position.array) } }, index: { array: copyU32(m.index.array) },
    };
    if (m.attributes.normal) out.attributes.normal = { array: copyF32(m.attributes.normal.array) };
    transfer.push(out.attributes.position.array.buffer, out.index.array.buffer);
    if (out.attributes.normal) transfer.push(out.attributes.normal.array.buffer);
    return out;
  });
  return { result: { success: true, root: r.root, meshes }, transfer };
}

async function runAssimp({ files }, vendor) {
  importScripts(vendor + 'assimpjs.js');
  const ajs = await assimpjs({ locateFile: (f) => vendor + f });
  const list = new ajs.FileList();
  for (const f of files) list.AddFile(f.name, new Uint8Array(f.bytes));
  const res = ajs.ConvertFileList(list, 'glb2');
  if (!res.IsSuccess() || res.FileCount() === 0) return { result: { ok: false, error: res.GetErrorCode() }, transfer: [] };
  const glb = new Uint8Array(res.GetFile(0).GetContent()).buffer.slice(0);
  return { result: { ok: true, glb }, transfer: [glb] };
}

async function runIfc({ bytes }, vendor) {
  importScripts(vendor + 'web-ifc-api-iife.js');
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath(vendor, true);
  await api.Init();
  // Uzak koordinatlı (ülke koordinat sistemi) modeller başlangıç noktasına taşınır; aksi halde float hassasiyeti bozulur
  const id = api.OpenModel(new Uint8Array(bytes), { COORDINATE_TO_ORIGIN: true });
  const transfer = [];
  const elements = [];
  const str = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v) || '';
  const typeName = (code) => { try { return api.GetNameFromTypeCode(code); } catch { return String(code); } };
  api.StreamAllMeshes(id, (mesh) => {
    let line = null;
    try { line = api.GetLine(id, mesh.expressID); } catch { /* bozuk kayıt */ }
    const el = { id: mesh.expressID, type: line ? typeName(line.type) : '', name: line ? str(line.Name) : '', guid: line ? str(line.GlobalId) : '', meshes: [] };
    const geos = mesh.geometries;
    for (let i = 0; i < geos.size(); i++) {
      const pg = geos.get(i);
      const g = api.GetGeometry(id, pg.geometryExpressID);
      const vertices = copyF32(api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()));
      const index = copyU32(api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize()));
      if (g.delete) g.delete();
      if (!index.length) continue;
      el.meshes.push({ vertices, index, color: [pg.color.x, pg.color.y, pg.color.z, pg.color.w], matrix: Array.from(pg.flatTransformation) });
      transfer.push(vertices.buffer, index.buffer);
    }
    if (el.meshes.length) elements.push(el);
  });
  let tree = null;
  try {
    tree = await api.properties.getSpatialStructure(id, false);
    const nameOf = (node) => {
      try { const l = api.GetLine(id, node.expressID); node.name = str(l.LongName) || str(l.Name); } catch { node.name = ''; }
      node.id = node.expressID;
      for (const c of node.children || []) nameOf(c);
    };
    nameOf(tree);
  } catch { tree = null; }
  api.CloseModel(id);
  return { result: { elements, tree }, transfer };
}

function runSplit({ position, index, eps }) {
  const r = componentsOf(new Float32Array(position), index ? new Uint32Array(index) : null, eps);
  return { result: r, transfer: [r.tri.buffer] };
}

self.onmessage = async (e) => {
  const { kind, payload, vendor } = e.data || {};
  try {
    const fn = { occt: runOcct, assimp: runAssimp, ifc: runIfc, split: runSplit }[kind];
    if (!fn) throw new Error('unknown_kind');
    const { result, transfer } = await fn(payload, vendor);
    post({ type: 'done', result }, transfer);
  } catch (err) {
    post({ type: 'error', message: (err && err.message) || String(err) });
  }
};
