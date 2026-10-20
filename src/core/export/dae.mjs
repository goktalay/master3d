// COLLADA 1.4.1 (.dae): düğüm hiyerarşisi (yerel matrislerle), her ağ bir <geometry>, malzemeler Phong efektleri.
// Birim ve yukarı eksen <asset> içinde kaynak modelinkiyle yazılır (dönüştürme yapılmaz; okuyucu uygular).

import { meshData, materialInfo, safeId, xmlEsc, num, enc } from './prepare.mjs';
import { isRenderable } from '../scene.mjs';

const UNIT_METER = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

export function writeDAE(root, { unit = null, up = 'y', title = '' } = {}) {
  const used = new Set();
  const effects = [], materials = [], geometries = [];
  const matIds = new Map();
  const matId = (m) => {
    if (matIds.has(m)) return matIds.get(m);
    const info = materialInfo(m);
    const id = safeId(info.name || 'material', used, 'mat');
    matIds.set(m, id);
    const c = info.color.map(num).join(' ');
    effects.push(`<effect id="${id}-fx"><profile_COMMON><technique sid="common"><phong>
<emission><color>${info.emissive.map(num).join(' ')} 1</color></emission><diffuse><color>${c} 1</color></diffuse>
<specular><color>${num(0.5 * (1 - info.roughness))} ${num(0.5 * (1 - info.roughness))} ${num(0.5 * (1 - info.roughness))} 1</color></specular>
<shininess><float>${num(Math.max(1, (1 - info.roughness) * 100))}</float></shininess>
<transparency><float>${num(info.opacity)}</float></transparency></phong></technique></profile_COMMON></effect>`);
    materials.push(`<material id="${id}" name="${xmlEsc(info.name || id)}"><instance_effect url="#${id}-fx"/></material>`);
    return id;
  };
  const geom = (o) => {
    const p = meshData(o, { world: false });
    const gid = safeId((o.name || 'mesh') + '-mesh', used, 'mesh');
    const src = (sid, arr, stride, names) => `<source id="${gid}-${sid}"><float_array id="${gid}-${sid}-a" count="${arr.length}">${Array.from(arr, num).join(' ')}</float_array>
<technique_common><accessor source="#${gid}-${sid}-a" count="${arr.length / stride}" stride="${stride}">${names.map((n) => `<param name="${n}" type="float"/>`).join('')}</accessor></technique_common></source>`;
    const parts = [src('pos', p.pos, 3, ['X', 'Y', 'Z'])];
    if (p.nor) parts.push(src('nor', p.nor, 3, ['X', 'Y', 'Z']));
    if (p.uv) parts.push(src('uv', p.uv, 2, ['S', 'T']));
    const inputs = [`<input semantic="VERTEX" source="#${gid}-vtx" offset="0"/>`];
    if (p.nor) inputs.push(`<input semantic="NORMAL" source="#${gid}-nor" offset="0"/>`);
    if (p.uv) inputs.push(`<input semantic="TEXCOORD" source="#${gid}-uv" offset="0" set="0"/>`);
    const byMat = new Map();
    for (let t = 0; t < p.tri.length / 3; t++) {
      const k = p.mat[t];
      if (!byMat.has(k)) byMat.set(k, []);
      byMat.get(k).push(p.tri[t * 3], p.tri[t * 3 + 1], p.tri[t * 3 + 2]);
    }
    const symbols = [];
    const tris = [...byMat.entries()].map(([k, list]) => {
      const mid = matId(p.materials[k]);
      const sym = `${mid}-sym`;
      symbols.push([sym, mid]);
      return `<triangles material="${sym}" count="${list.length / 3}">${inputs.join('')}<p>${list.join(' ')}</p></triangles>`;
    });
    geometries.push(`<geometry id="${gid}" name="${xmlEsc(o.name)}"><mesh>${parts.join('\n')}
<vertices id="${gid}-vtx"><input semantic="POSITION" source="#${gid}-pos"/></vertices>
${tris.join('\n')}</mesh></geometry>`);
    return { gid, symbols };
  };
  const node = (o, depth) => {
    const id = safeId(o.name || 'node', used, 'node');
    // COLLADA matrisi satır öncelikli yazılır; three.js elements sütun öncelikli
    const e = o.matrix.elements;
    const rows = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => num(e[c * 4 + r])).join(' ')).join(' ');
    let inner = `<matrix sid="transform">${rows}</matrix>`;
    if (isRenderable(o) && o.isMesh) {
      const { gid, symbols } = geom(o);
      inner += `<instance_geometry url="#${gid}"><bind_material><technique_common>${symbols.map(([s, m]) => `<instance_material symbol="${s}" target="#${m}"/>`).join('')}</technique_common></bind_material></instance_geometry>`;
    }
    for (const c of o.children) if (!c.userData.m3helper) inner += node(c, depth + 1);
    return `<node id="${id}" name="${xmlEsc(o.name || id)}" type="NODE">${inner}</node>`;
  };
  root.updateMatrixWorld(true);
  const nodes = root.children.map((c) => node(c, 0)).join('\n');
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><contributor><authoring_tool>Master 3D</authoring_tool></contributor><created>${now}</created><modified>${now}</modified>${title ? `<title>${xmlEsc(title)}</title>` : ''}
<unit name="${unit || 'meter'}" meter="${UNIT_METER[unit] || 1}"/><up_axis>${up === 'z' ? 'Z_UP' : 'Y_UP'}</up_axis></asset>
<library_effects>${effects.join('\n')}</library_effects>
<library_materials>${materials.join('\n')}</library_materials>
<library_geometries>${geometries.join('\n')}</library_geometries>
<library_visual_scenes><visual_scene id="scene" name="${xmlEsc(root.name || 'scene')}">${nodes}</visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>
`;
  return enc(xml);
}
