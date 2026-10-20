// Üçgen ağ biçimleri: STL (ikili / ASCII), PLY (ikili / ASCII), OBJ + MTL, OFF.
// Hepsi dünya koordinatlarına "pişirilmiş" köşelerle yazılır (bu biçimlerde hiyerarşi yoktur; OBJ'de parça adları
// "o" / "g" kayıtlarında korunur).

import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { PLYExporter } from 'three/addons/exporters/PLYExporter.js';
import { renderables, meshData, materialInfo, safeId, enc, num } from './prepare.mjs';

export function writeSTL(root, { binary = true } = {}) {
  const out = new STLExporter().parse(root, { binary });
  return binary ? new Uint8Array(out.buffer, out.byteOffset, out.byteLength) : enc(out);
}

export async function writePLY(root, { binary = true } = {}) {
  // onDone verilmezse PLYExporter sonucu doğrudan döndürür (geri çağırma requestAnimationFrame ister)
  const res = new PLYExporter().parse(root, null, { binary, littleEndian: true });
  return res instanceof ArrayBuffer ? new Uint8Array(res) : enc(res);
}

export function writeOFF(root) {
  const parts = renderables(root).map((o) => meshData(o));
  const vTotal = parts.reduce((a, p) => a + p.count, 0);
  const fTotal = parts.reduce((a, p) => a + p.tri.length / 3, 0);
  const lines = ['OFF', `${vTotal} ${fTotal} 0`];
  for (const p of parts) for (let i = 0; i < p.count; i++) lines.push(`${num(p.pos[i * 3])} ${num(p.pos[i * 3 + 1])} ${num(p.pos[i * 3 + 2])}`);
  let base = 0;
  for (const p of parts) {
    for (let t = 0; t < p.tri.length; t += 3) lines.push(`3 ${p.tri[t] + base} ${p.tri[t + 1] + base} ${p.tri[t + 2] + base}`);
    base += p.count;
  }
  return enc(lines.join('\n') + '\n');
}

// OBJ + MTL. encodeImage(texture) → { name, data } verilirse renk dokuları PNG olarak yanına yazılır (map_Kd).
export async function writeOBJ(root, { baseName = 'model', encodeImage = null } = {}) {
  const mtlName = `${baseName}.mtl`;
  const objLines = ['# Master 3D', `mtllib ${mtlName}`];
  const mtlLines = ['# Master 3D'];
  const files = [];
  const matIds = new Map();
  const usedMat = new Set();
  const usedObj = new Set();
  const texDone = new Map();
  let vBase = 1, tBase = 1, nBase = 1;
  async function matId(m) {
    if (matIds.has(m)) return matIds.get(m);
    const info = materialInfo(m);
    const id = safeId(info.name || 'material', usedMat, 'mat');
    matIds.set(m, id);
    const [r, g, b] = info.color;
    mtlLines.push('', `newmtl ${id}`, `Kd ${num(r)} ${num(g)} ${num(b)}`, `Ka 0 0 0`, `Ks ${num(0.5 * (1 - info.roughness))} ${num(0.5 * (1 - info.roughness))} ${num(0.5 * (1 - info.roughness))}`,
      `Ns ${num(Math.max(1, (1 - info.roughness) * 200))}`, `d ${num(info.opacity)}`, 'illum 2');
    if (info.emissive.some((x) => x > 0)) mtlLines.push(`Ke ${info.emissive.map(num).join(' ')}`);
    if (info.map && encodeImage) {
      let tex = texDone.get(info.map);
      if (tex === undefined) {
        tex = null;
        try { const img = await encodeImage(info.map, `${baseName}_${id}`); if (img) { files.push(img); tex = img.name; } } catch { /* doku yazılamadı: renk yeter */ }
        texDone.set(info.map, tex);
      }
      if (tex) mtlLines.push(`map_Kd ${tex}`);
    }
    return id;
  }
  for (const o of renderables(root)) {
    const p = meshData(o);
    objLines.push('', `o ${safeId(p.name || 'part', usedObj, 'part')}`);
    for (let i = 0; i < p.count; i++) objLines.push(`v ${num(p.pos[i * 3])} ${num(p.pos[i * 3 + 1])} ${num(p.pos[i * 3 + 2])}`);
    if (p.uv) for (let i = 0; i < p.count; i++) objLines.push(`vt ${num(p.uv[i * 2])} ${num(p.uv[i * 2 + 1])}`);
    if (p.nor) for (let i = 0; i < p.count; i++) objLines.push(`vn ${num(p.nor[i * 3])} ${num(p.nor[i * 3 + 1])} ${num(p.nor[i * 3 + 2])}`);
    const ref = (i) => {
      const v = i + vBase;
      if (p.uv && p.nor) return `${v}/${i + tBase}/${i + nBase}`;
      if (p.uv) return `${v}/${i + tBase}`;
      if (p.nor) return `${v}//${i + nBase}`;
      return String(v);
    };
    let cur = -1;
    for (let t = 0; t < p.tri.length / 3; t++) {
      if (p.mat[t] !== cur) { cur = p.mat[t]; objLines.push(`usemtl ${await matId(p.materials[cur])}`); }
      objLines.push(`f ${ref(p.tri[t * 3])} ${ref(p.tri[t * 3 + 1])} ${ref(p.tri[t * 3 + 2])}`);
    }
    vBase += p.count; if (p.uv) tBase += p.count; if (p.nor) nBase += p.count;
  }
  return [{ name: `${baseName}.obj`, data: enc(objLines.join('\n') + '\n') }, { name: mtlName, data: enc(mtlLines.join('\n') + '\n') }, ...files];
}
