// X3D (XML kodlaması) okuyucu. X3D, VRML 2.0'ın XML biçimidir: düğümler ve alanlar aynıdır. Belge burada VRML 2.0
// metnine çevrilir ve three.js VRMLLoader ile okunur. X3D'ye özgü üçgen kümeleri (IndexedTriangleSet, TriangleSet,
// IndexedQuadSet) IndexedFaceSet'e çevrilir; algılayıcılar, yorumlayıcılar, ROUTE ve betikler (görüntüye etkisi
// olmayan düğümler) atlanır. Inline (dış dosya) desteklenmez.

import { VRMLLoader } from 'three/addons/loaders/VRMLLoader.js';

// --- Küçük XML ayrıştırıcı (öğe, öznitelik; yorum / CDATA / işlem talimatı / DOCTYPE atlanır) ---------------------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unesc = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m));

export function parseXml(src) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>|<\/\s*([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  const attrRe = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) {
      // Kapanış etiketi: eşleşen açılışa kadar yığından çık
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].name === m[1]) { stack.length = i; break; }
      continue;
    }
    if (!m[2]) continue;
    const el = { name: m[2], attrs: {}, children: [] };
    let a;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(m[3] || ''))) el.attrs[a[1]] = unesc(a[3] !== undefined ? a[3] : a[4]);
    stack[stack.length - 1].children.push(el);
    if (!m[4]) stack.push(el);
  }
  return root;
}

// --- X3D → VRML 2.0 ----------------------------------------------------------------------------------------------
const GROUPING = new Set(['Transform', 'Group', 'StaticGroup', 'Collision', 'Anchor', 'Billboard', 'Switch', 'LOD', 'CADAssembly', 'CADLayer', 'CADPart', 'CADFace']);
const GROUP_AS = { StaticGroup: 'Group', Collision: 'Group', Anchor: 'Group', Billboard: 'Group', Switch: 'Group', LOD: 'Group', CADAssembly: 'Group', CADLayer: 'Group', CADFace: 'Group', CADPart: 'Transform' };
const GEOMETRY = new Set(['IndexedFaceSet', 'IndexedLineSet', 'PointSet', 'Box', 'Sphere', 'Cylinder', 'Cone', 'Extrusion', 'ElevationGrid', 'IndexedTriangleSet', 'TriangleSet', 'IndexedQuadSet', 'LineSet']);
const KEEP = new Set([...GROUPING, ...GEOMETRY, 'Shape', 'Appearance', 'Material', 'ImageTexture', 'TextureTransform', 'Coordinate', 'Normal', 'TextureCoordinate', 'Color', 'ColorRGBA']);
const CONTAINER = { Appearance: 'appearance', Material: 'material', ImageTexture: 'texture', TextureTransform: 'textureTransform', Coordinate: 'coord', Normal: 'normal', Color: 'color', ColorRGBA: 'color', TextureCoordinate: 'texCoord' };
for (const g of GEOMETRY) CONTAINER[g] = 'geometry';
// Çok değerli (MF) alanlar köşeli parantez ister
const MF = {
  Coordinate: ['point'], Normal: ['vector'], TextureCoordinate: ['point'], Color: ['color'], ColorRGBA: ['color'],
  IndexedFaceSet: ['coordIndex', 'normalIndex', 'texCoordIndex', 'colorIndex'], IndexedLineSet: ['coordIndex', 'colorIndex'],
  Extrusion: ['crossSection', 'spine', 'scale', 'orientation'], ElevationGrid: ['height'], ImageTexture: ['url'],
  Group: ['children'], Transform: ['children'],
};
const BOOL = new Set(['true', 'false', 'TRUE', 'FALSE']);
const SKIP_ATTR = new Set(['DEF', 'USE', 'containerField', 'class', 'id', 'style', 'visible', 'bboxDisplay', 'whichChoice', 'range', 'level',
  'name', 'description', 'url' /* yalnız ImageTexture'da yazılır */, 'index', 'vertexCount', 'normalPerVertex' /* aşağıda ayrıca */]);
const IDENT = /^[A-Za-z_][\w-]*$/;

function mfString(v) {
  const t = v.trim();
  if (t.startsWith('"')) return `[ ${t} ]`;
  return `[ "${t.replace(/"/g, '\\"')}" ]`;
}

function fieldValue(node, key, v) {
  if (BOOL.has(v.trim())) return v.trim().toUpperCase();
  const mf = (MF[node] || []).includes(key);
  const clean = v.replace(/,/g, ' ').trim();
  return mf ? `[ ${clean} ]` : clean;
}

// Üçgen/dörtgen kümeleri → IndexedFaceSet koordinat indeksleri
function faceIndex(el) {
  const n = el.name;
  const ints = (s) => (s || '').replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean).map(Number);
  if (n === 'IndexedTriangleSet' || n === 'IndexedQuadSet') {
    const k = n === 'IndexedQuadSet' ? 4 : 3;
    const idx = ints(el.attrs.index);
    const out = [];
    for (let i = 0; i + k <= idx.length; i += k) out.push(...idx.slice(i, i + k), -1);
    return out;
  }
  if (n === 'TriangleSet') {
    const coord = el.children.find((c) => c.name === 'Coordinate');
    const count = coord ? ints(coord.attrs.point).length / 3 : 0;
    const out = [];
    for (let i = 0; i + 3 <= count; i += 3) out.push(i, i + 1, i + 2, -1);
    return out;
  }
  return null;
}

function emit(el, depth = 0) {
  if (!KEEP.has(el.name)) return '';
  const pad = '  '.repeat(depth);
  const def = el.attrs.DEF && IDENT.test(el.attrs.DEF) ? `DEF ${el.attrs.DEF} ` : '';
  if (el.attrs.USE && IDENT.test(el.attrs.USE)) return `USE ${el.attrs.USE}`;
  let type = GROUP_AS[el.name] || el.name;
  let children = el.children;
  // Switch / LOD: yalnız gösterilen (Switch: whichChoice) ya da en ayrıntılı (LOD: ilk) seviye
  if (el.name === 'Switch') {
    const w = Number(el.attrs.whichChoice ?? -1);
    children = w >= 0 ? children.filter((c) => KEEP.has(c.name)).slice(w, w + 1) : [];
  } else if (el.name === 'LOD') children = children.filter((c) => KEEP.has(c.name)).slice(0, 1);
  const fields = [];
  const idx = faceIndex(el);
  if (idx) {
    type = 'IndexedFaceSet';
    fields.push(`coordIndex [ ${idx.join(' ')} ]`);
    for (const k of ['solid', 'ccw', 'creaseAngle', 'colorPerVertex']) if (el.attrs[k] != null) fields.push(`${k} ${fieldValue(type, k, el.attrs[k])}`);
    if (el.attrs.normalPerVertex != null) fields.push(`normalPerVertex ${fieldValue(type, 'normalPerVertex', el.attrs.normalPerVertex)}`);
  } else {
    for (const [k, v] of Object.entries(el.attrs)) {
      if (SKIP_ATTR.has(k) || k.includes(':')) continue;
      if (GROUP_AS[el.name] === 'Group' && !['bboxCenter', 'bboxSize'].includes(k)) continue;
      fields.push(`${k} ${fieldValue(type, k, v)}`);
    }
    if (el.name === 'ImageTexture' && el.attrs.url) fields.push(`url ${mfString(el.attrs.url)}`);
    if (el.attrs.normalPerVertex != null && type === 'IndexedFaceSet') fields.push(`normalPerVertex ${fieldValue(type, 'normalPerVertex', el.attrs.normalPerVertex)}`);
  }
  // ColorRGBA → Color (saydamlık atılır)
  if (el.name === 'ColorRGBA') {
    type = 'Color';
    const nums = (el.attrs.color || '').replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean);
    const rgb = [];
    for (let i = 0; i + 3 < nums.length + 1 && i + 2 < nums.length; i += 4) rgb.push(nums[i], nums[i + 1], nums[i + 2]);
    fields.length = 0;
    fields.push(`color [ ${rgb.join(' ')} ]`);
  }
  const kids = { children: [] };
  for (const c of children) {
    if (!KEEP.has(c.name)) continue;
    const s = emit(c, depth + 2);
    if (!s) continue;
    const slot = c.attrs.containerField && c.attrs.containerField !== 'children' ? c.attrs.containerField : (CONTAINER[c.name] || 'children');
    // VRMLLoader, bir alt liste USE ile bitince listedeki DEF'leri kaydetmiyor (alan türü son değerden belirleniyor);
    // children içindeki her USE tek elemanlı bir Group'a sarılır
    (kids[slot] = kids[slot] || []).push(slot === 'children' && s.startsWith('USE ') ? `Group { children [ ${s} ] }` : s);
  }
  for (const [slot, list] of Object.entries(kids)) {
    if (!list.length) continue;
    if (slot === 'children') fields.push(`children [\n${pad}    ${list.join(`\n${pad}    `)}\n${pad}  ]`);
    else fields.push(`${slot} ${list[0]}`);
  }
  return `${def}${type} {\n${pad}  ${fields.join(`\n${pad}  `)}\n${pad}}`;
}

export function x3dToVrml(src) {
  const doc = parseXml(src);
  const x3d = doc.children.find((c) => c.name === 'X3D') || doc;
  const scene = x3d.children.find((c) => c.name === 'Scene') || x3d;
  const body = scene.children.map((c) => emit(c, 0)).filter(Boolean).join('\n');
  return `#VRML V2.0 utf8\n${body}\n`;
}

export function parseX3D(src, { name = '', baseUrl = '', manager } = {}) {
  const root = new VRMLLoader(manager).parse(x3dToVrml(src), baseUrl);
  root.name = name;
  return root;
}
