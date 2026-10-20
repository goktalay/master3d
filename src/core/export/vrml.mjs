// VRML 2.0 (.wrl) ve X3D (.x3d, XML): aynı sahne yapısı — Transform hiyerarşisi (konum, eksen-açı dönüş, ölçek),
// her ağ malzeme başına bir Shape (Material + IndexedFaceSet). Birim metre, Y yukarı (hazırlıkta dönüştürülür).

import * as THREE from 'three';
import { meshData, materialInfo, xmlEsc, num, enc } from './prepare.mjs';
import { isRenderable } from '../scene.mjs';

const tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();

function transformOf(o) {
  o.matrix.decompose(tmpP, tmpQ, tmpS);
  const angle = 2 * Math.acos(Math.min(1, Math.max(-1, tmpQ.w)));
  const s = Math.sqrt(1 - tmpQ.w * tmpQ.w);
  const axis = s < 1e-8 ? [0, 0, 1] : [tmpQ.x / s, tmpQ.y / s, tmpQ.z / s];
  return { t: [tmpP.x, tmpP.y, tmpP.z], r: [...axis, angle], s: [tmpS.x, tmpS.y, tmpS.z] };
}

// Ağ → malzeme başına { info, coord, normal, uv, index } (her Shape kendi köşe dizisini taşır)
function shapesOf(o) {
  const p = meshData(o, { world: false });
  const groups = new Map();
  for (let t = 0; t < p.tri.length / 3; t++) {
    if (!groups.has(p.mat[t])) groups.set(p.mat[t], []);
    groups.get(p.mat[t]).push(p.tri[t * 3], p.tri[t * 3 + 1], p.tri[t * 3 + 2]);
  }
  const out = [];
  for (const [k, list] of groups) {
    // Kullanılan köşeler sıkıştırılır
    const remap = new Map(); const used = [];
    const idx = list.map((i) => { let v = remap.get(i); if (v === undefined) { v = used.length; remap.set(i, v); used.push(i); } return v; });
    const pick = (arr, n) => (arr ? used.flatMap((i) => Array.from(arr.subarray(i * n, i * n + n))) : null);
    out.push({ info: materialInfo(p.materials[k]), coord: pick(p.pos, 3), normal: pick(p.nor, 3), uv: pick(p.uv, 2), color: pick(p.color, 3), index: idx });
  }
  return out;
}

const list = (a) => a.map(num).join(' ');
const faces = (idx) => { const o = []; for (let i = 0; i < idx.length; i += 3) o.push(idx[i], idx[i + 1], idx[i + 2], -1); return o.join(' '); };

export function writeVRML(root) {
  const lines = ['#VRML V2.0 utf8', '# Master 3D'];
  const node = (o, pad) => {
    const { t, r, s } = transformOf(o);
    const name = o.name ? `# ${o.name.replace(/[\r\n]/g, ' ')}` : '';
    const body = [];
    if (isRenderable(o) && o.isMesh) {
      for (const sh of shapesOf(o)) {
        const m = sh.info;
        body.push(`${pad}  Shape {
${pad}    appearance Appearance { material Material { diffuseColor ${list(m.color)} emissiveColor ${list(m.emissive)} shininess ${num(Math.max(0, 1 - m.roughness))} transparency ${num(1 - m.opacity)} } }
${pad}    geometry IndexedFaceSet {
${pad}      solid FALSE
${pad}      creaseAngle 0.5
${pad}      coord Coordinate { point [ ${list(sh.coord)} ] }${sh.normal ? `\n${pad}      normal Normal { vector [ ${list(sh.normal)} ] }` : ''}${sh.uv ? `\n${pad}      texCoord TextureCoordinate { point [ ${list(sh.uv)} ] }` : ''}${sh.color ? `\n${pad}      color Color { color [ ${list(sh.color)} ] }` : ''}
${pad}      coordIndex [ ${faces(sh.index)} ]
${pad}    }
${pad}  }`);
      }
    }
    for (const c of o.children) if (!c.userData.m3helper) body.push(node(c, pad + '  '));
    return `${pad}Transform { ${name}
${pad}  translation ${list(t)} rotation ${list(r)} scale ${list(s)}
${pad}  children [
${body.join('\n')}
${pad}  ]
${pad}}`;
  };
  root.updateMatrixWorld(true);
  for (const c of root.children) lines.push(node(c, ''));
  return enc(lines.join('\n') + '\n');
}

export function writeX3D(root, { title = '' } = {}) {
  const node = (o, pad) => {
    const { t, r, s } = transformOf(o);
    const kids = [];
    if (isRenderable(o) && o.isMesh) {
      for (const sh of shapesOf(o)) {
        const m = sh.info;
        kids.push(`${pad}  <Shape>
${pad}    <Appearance><Material diffuseColor='${list(m.color)}' emissiveColor='${list(m.emissive)}' shininess='${num(Math.max(0, 1 - m.roughness))}' transparency='${num(1 - m.opacity)}'/></Appearance>
${pad}    <IndexedFaceSet solid='false' creaseAngle='0.5' coordIndex='${faces(sh.index)}'>
${pad}      <Coordinate point='${list(sh.coord)}'/>${sh.normal ? `\n${pad}      <Normal vector='${list(sh.normal)}'/>` : ''}${sh.uv ? `\n${pad}      <TextureCoordinate point='${list(sh.uv)}'/>` : ''}${sh.color ? `\n${pad}      <Color color='${list(sh.color)}'/>` : ''}
${pad}    </IndexedFaceSet>
${pad}  </Shape>`);
      }
    }
    for (const c of o.children) if (!c.userData.m3helper) kids.push(node(c, pad + '  '));
    const name = o.name ? ` class='${xmlEsc(o.name)}'` : '';
    return `${pad}<Transform${name} translation='${list(t)}' rotation='${list(r)}' scale='${list(s)}'>
${kids.join('\n')}
${pad}</Transform>`;
  };
  root.updateMatrixWorld(true);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE X3D PUBLIC "ISO//Web3D//DTD X3D 3.3//EN" "http://www.web3d.org/specifications/x3d-3.3.dtd">
<X3D profile='Interchange' version='3.3'>
  <head><meta name='generator' content='Master 3D'/>${title ? `<meta name='title' content='${xmlEsc(title)}'/>` : ''}</head>
  <Scene>
${root.children.map((c) => node(c, '    ')).join('\n')}
  </Scene>
</X3D>
`;
  return enc(xml);
}
