// 3MF (3D Manufacturing Format, çekirdek belirtim 1.3): her parça ayrı bir <object>, renkler <basematerials> ile.
// Köşeler dünya koordinatlarında (milimetre, Z yukarı — hazırlıkta dönüştürülür); her nesne <build> içinde bir <item>.
// ZIP paketi: [Content_Types].xml, _rels/.rels, 3D/3dmodel.model

import { zipSync, strToU8 } from 'fflate';
import { renderables, meshData, materialInfo, xmlEsc, num } from './prepare.mjs';

const hex2 = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0').toUpperCase();

export function write3MF(root, { unit = 'millimeter', title = '' } = {}) {
  const mats = new Map(); // malzeme → index
  const matList = [];
  const objects = [];
  let id = 2; // 1 = basematerials
  for (const o of renderables(root)) {
    const p = meshData(o);
    if (!p.tri.length) continue;
    const pidx = [];
    for (const m of p.materials) {
      if (!mats.has(m)) { mats.set(m, matList.length); matList.push(materialInfo(m)); }
      pidx.push(mats.get(m));
    }
    // 3MF yinelenen köşeleri sevmez (bazı dilimleyiciler "manifold değil" der): aynı konumdakiler kaynaştırılır
    const map = new Map(); const verts = []; const remap = new Uint32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const k = `${p.pos[i * 3]},${p.pos[i * 3 + 1]},${p.pos[i * 3 + 2]}`;
      let v = map.get(k);
      if (v === undefined) { v = verts.length; map.set(k, v); verts.push(i); }
      remap[i] = v;
    }
    const tris = [];
    for (let t = 0; t < p.tri.length / 3; t++) {
      const a = remap[p.tri[t * 3]], b = remap[p.tri[t * 3 + 1]], c = remap[p.tri[t * 3 + 2]];
      if (a === b || b === c || a === c) continue; // dejenere üçgen
      tris.push(`<triangle v1="${a}" v2="${b}" v3="${c}" pid="1" p1="${pidx[p.mat[t]] || 0}"/>`);
    }
    if (!tris.length) continue;
    const vx = verts.map((i) => `<vertex x="${num(p.pos[i * 3])}" y="${num(p.pos[i * 3 + 1])}" z="${num(p.pos[i * 3 + 2])}"/>`);
    objects.push({ id: id++, name: p.name, xml: `<mesh><vertices>${vx.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh>`, pindex: pidx[0] || 0 });
  }
  if (!matList.length) matList.push({ name: 'default', color: [0.8, 0.8, 0.8], opacity: 1 });
  const base = matList.map((m) => `<base name="${xmlEsc(m.name || 'material')}" displaycolor="#${m.color.map(hex2).join('')}${m.opacity < 1 ? hex2(m.opacity) : ''}"/>`).join('');
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${unit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Application">Master 3D</metadata>${title ? `\n<metadata name="Title">${xmlEsc(title)}</metadata>` : ''}
<resources>
<basematerials id="1">${base}</basematerials>
${objects.map((o) => `<object id="${o.id}" type="model" name="${xmlEsc(o.name)}" pid="1" pindex="${o.pindex}">${o.xml}</object>`).join('\n')}
</resources>
<build>${objects.map((o) => `<item objectid="${o.id}"/>`).join('')}</build>
</model>
`;
  const types = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>
`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>
`;
  return zipSync({ '[Content_Types].xml': strToU8(types), '_rels/.rels': strToU8(rels), '3D/3dmodel.model': strToU8(model) }, { level: 6 });
}
