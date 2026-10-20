// Autodesk FBX 7.4 ikili (.fbx) yazıcı. ASCII FBX'i Blender okumadığı için ikili biçim yazılır.
// Kapsam: düğüm hiyerarşisi (Model: Mesh / Null, yerel konum-dönüş-ölçek), üçgen ağlar (köşe, köşe başı normal, UV),
// çoklu malzeme (LayerElementMaterial) ve Phong malzemeleri. İskelet, animasyon ve dokular yazılmaz (bilinen sınır).
// Kayıt düzeni ve dosya sonu imzası Blender'ın FBX dışa aktarıcısıyla aynıdır (Autodesk FBX SDK ve Blender okur).

import * as THREE from 'three';
import { zlibSync } from 'fflate';
import { meshData, materialInfo } from './prepare.mjs';
import { isRenderable } from '../scene.mjs';

const VERSION = 7400;
const FILE_ID = [0x28, 0xb3, 0x2a, 0xeb, 0xb6, 0x24, 0xcc, 0xc2, 0xbf, 0xc8, 0xb0, 0x2a, 0xa9, 0x2b, 0xfc, 0xf1];
const FOOT_ID = [0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e];
const FOOT_MAGIC = [0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b];
const TIME_ID = '1970-01-01 10:00:00:000';
const CM_PER = { mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 };

// --- Özellik türleri ------------------------------------------------------------------------------------------------
const P = {
  I: (v) => ({ t: 'I', v }), L: (v) => ({ t: 'L', v: BigInt(v) }), D: (v) => ({ t: 'D', v }), F: (v) => ({ t: 'F', v }),
  C: (v) => ({ t: 'C', v: !!v }), S: (v) => ({ t: 'S', v: String(v) }), R: (v) => ({ t: 'R', v: Uint8Array.from(v) }),
  d: (v) => ({ t: 'd', v: v instanceof Float64Array ? v : Float64Array.from(v) }),
  i: (v) => ({ t: 'i', v: v instanceof Int32Array ? v : Int32Array.from(v) }),
};
// FBX nesne adı: "ad\x00\x01Sınıf"
const fbxName = (name, cls) => ({ t: 'S', v: `${name}\u0000\u0001${cls}` });

const N = (name, props = [], children = []) => ({ name, props, children });
// Properties70 > P kaydı
const P70 = (name, type, label, flags, ...vals) => N('P', [P.S(name), P.S(type), P.S(label), P.S(flags), ...vals]);

// --- İkili kodlayıcı ------------------------------------------------------------------------------------------------
class Writer {
  constructor() { this.buf = new Uint8Array(1 << 16); this.len = 0; this.dv = new DataView(this.buf.buffer); }
  ensure(n) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const b = new Uint8Array(cap); b.set(this.buf.subarray(0, this.len)); this.buf = b; this.dv = new DataView(b.buffer);
  }
  u8(v) { this.ensure(1); this.dv.setUint8(this.len, v); this.len += 1; }
  i16(v) { this.ensure(2); this.dv.setInt16(this.len, v, true); this.len += 2; }
  u32(v) { this.ensure(4); this.dv.setUint32(this.len, v >>> 0, true); this.len += 4; }
  i32(v) { this.ensure(4); this.dv.setInt32(this.len, v, true); this.len += 4; }
  i64(v) { this.ensure(8); this.dv.setBigInt64(this.len, v, true); this.len += 8; }
  f32(v) { this.ensure(4); this.dv.setFloat32(this.len, v, true); this.len += 4; }
  f64(v) { this.ensure(8); this.dv.setFloat64(this.len, v, true); this.len += 8; }
  bytes(a) { this.ensure(a.length); this.buf.set(a, this.len); this.len += a.length; }
  setU32(at, v) { this.dv.setUint32(at, v >>> 0, true); }
  result() { return this.buf.slice(0, this.len); }
}

const textEnc = new TextEncoder();

function writeProp(w, p) {
  w.u8(p.t.charCodeAt(0));
  switch (p.t) {
    case 'C': w.u8(p.v ? 1 : 0); break;
    case 'Y': w.i16(p.v); break;
    case 'I': w.i32(p.v); break;
    case 'L': w.i64(p.v); break;
    case 'F': w.f32(p.v); break;
    case 'D': w.f64(p.v); break;
    case 'S': { const b = textEnc.encode(p.v); w.u32(b.length); w.bytes(b); break; }
    case 'R': w.u32(p.v.length); w.bytes(p.v); break;
    case 'd': case 'i': {
      const raw = new Uint8Array(p.v.buffer, p.v.byteOffset, p.v.byteLength);
      // Büyük diziler zlib ile sıkıştırılır (kodlama 1)
      const z = raw.length > 128 ? zlibSync(raw, { level: 6 }) : null;
      w.u32(p.v.length); w.u32(z ? 1 : 0); w.u32(z ? z.length : raw.length); w.bytes(z || raw);
      break;
    }
    default: throw new Error('fbx prop ' + p.t);
  }
}

function writeNode(w, node) {
  const start = w.len;
  w.u32(0); w.u32(node.props.length); w.u32(0);
  const nameB = textEnc.encode(node.name);
  w.u8(nameB.length); w.bytes(nameB);
  const pStart = w.len;
  for (const p of node.props) writeProp(w, p);
  w.setU32(start + 8, w.len - pStart);
  if (node.children.length || !node.props.length) {
    for (const c of node.children) writeNode(w, c);
    w.bytes(new Uint8Array(13)); // iç liste sonu
  }
  w.setU32(start, w.len);
}

// --- Sahne → FBX ağacı ----------------------------------------------------------------------------------------------
export function writeFBX(root, { unit = null, title = '' } = {}) {
  let nextId = 1000000;
  const id = () => nextId++;
  const objects = [], connections = [];
  const matIds = new Map();
  let nModel = 0, nGeo = 0, nMat = 0;
  const q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), eul = new THREE.Euler();
  const deg = THREE.MathUtils.RAD2DEG;

  const material = (m) => {
    if (matIds.has(m)) return matIds.get(m);
    const info = materialInfo(m);
    const mid = id();
    matIds.set(m, mid); nMat++;
    const spec = 0.5 * (1 - info.roughness);
    objects.push(N('Material', [P.L(mid), fbxName(info.name || `Material${nMat}`, 'Material'), P.S('')], [
      N('Version', [P.I(102)]), N('ShadingModel', [P.S('phong')]), N('MultiLayer', [P.I(0)]),
      N('Properties70', [], [
        P70('AmbientColor', 'Color', '', 'A', P.D(0), P.D(0), P.D(0)),
        P70('DiffuseColor', 'Color', '', 'A', ...info.color.map(P.D)),
        P70('DiffuseFactor', 'Number', '', 'A', P.D(1)),
        P70('EmissiveColor', 'Color', '', 'A', ...info.emissive.map(P.D)),
        P70('SpecularColor', 'Color', '', 'A', P.D(spec), P.D(spec), P.D(spec)),
        P70('Shininess', 'Number', '', 'A', P.D(Math.max(1, (1 - info.roughness) * 100))),
        P70('ShininessExponent', 'Number', '', 'A', P.D(Math.max(1, (1 - info.roughness) * 100))),
        P70('TransparencyFactor', 'Number', '', 'A', P.D(1 - info.opacity)),
        P70('Opacity', 'double', 'Number', '', P.D(info.opacity)),
      ]),
    ]));
    return mid;
  };

  const geometry = (o, modelId) => {
    const p = meshData(o, { world: false });
    const gid = id(); nGeo++;
    const triN = p.tri.length / 3;
    const pvi = new Int32Array(p.tri.length);
    for (let t = 0; t < triN; t++) { pvi[t * 3] = p.tri[t * 3]; pvi[t * 3 + 1] = p.tri[t * 3 + 1]; pvi[t * 3 + 2] = -p.tri[t * 3 + 2] - 1; }
    const kids = [N('Properties70'), N('GeometryVersion', [P.I(124)]), N('Vertices', [P.d(p.pos)]), N('PolygonVertexIndex', [P.i(pvi)])];
    const layer = [N('Version', [P.I(100)])];
    if (p.nor) {
      const nrm = new Float64Array(p.tri.length * 3);
      for (let k = 0; k < p.tri.length; k++) { const v = p.tri[k]; nrm[k * 3] = p.nor[v * 3]; nrm[k * 3 + 1] = p.nor[v * 3 + 1]; nrm[k * 3 + 2] = p.nor[v * 3 + 2]; }
      kids.push(N('LayerElementNormal', [P.I(0)], [N('Version', [P.I(101)]), N('Name', [P.S('')]), N('MappingInformationType', [P.S('ByPolygonVertex')]),
        N('ReferenceInformationType', [P.S('Direct')]), N('Normals', [P.d(nrm)])]));
      layer.push(N('LayerElement', [], [N('Type', [P.S('LayerElementNormal')]), N('TypedIndex', [P.I(0)])]));
    }
    if (p.uv) {
      kids.push(N('LayerElementUV', [P.I(0)], [N('Version', [P.I(101)]), N('Name', [P.S('UVMap')]), N('MappingInformationType', [P.S('ByPolygonVertex')]),
        N('ReferenceInformationType', [P.S('IndexToDirect')]), N('UV', [P.d(p.uv)]), N('UVIndex', [P.i(Int32Array.from(p.tri))])]));
      layer.push(N('LayerElement', [], [N('Type', [P.S('LayerElementUV')]), N('TypedIndex', [P.I(0)])]));
    }
    const mids = p.materials.map((m) => material(m));
    const single = mids.length === 1 || p.mat.every((x) => x === p.mat[0]);
    kids.push(N('LayerElementMaterial', [P.I(0)], [N('Version', [P.I(101)]), N('Name', [P.S('')]),
      N('MappingInformationType', [P.S(single ? 'AllSame' : 'ByPolygon')]), N('ReferenceInformationType', [P.S('IndexToDirect')]),
      N('Materials', [P.i(single ? [p.mat[0] || 0] : Int32Array.from(p.mat))])]));
    layer.push(N('LayerElement', [], [N('Type', [P.S('LayerElementMaterial')]), N('TypedIndex', [P.I(0)])]));
    kids.push(N('Layer', [P.I(0)], layer));
    objects.push(N('Geometry', [P.L(gid), fbxName(o.name || `Mesh${nGeo}`, 'Geometry'), P.S('Mesh')], kids));
    connections.push([gid, modelId]);
    // Malzemeler modele bağlanır; sıra = LayerElementMaterial indeksleri
    for (const mid of mids) connections.push([mid, modelId]);
  };

  const model = (o, parentId) => {
    const mid = id(); nModel++;
    o.matrix.decompose(pos, q, scl);
    eul.setFromQuaternion(q, 'ZYX'); // FBX eEulerXYZ = three.js 'ZYX'
    const isMesh = isRenderable(o) && o.isMesh;
    objects.push(N('Model', [P.L(mid), fbxName(o.name || `Node${nModel}`, 'Model'), P.S(isMesh ? 'Mesh' : 'Null')], [
      N('Version', [P.I(232)]),
      N('Properties70', [], [
        P70('Lcl Translation', 'Lcl Translation', '', 'A', P.D(pos.x), P.D(pos.y), P.D(pos.z)),
        P70('Lcl Rotation', 'Lcl Rotation', '', 'A', P.D(eul.x * deg), P.D(eul.y * deg), P.D(eul.z * deg)),
        P70('Lcl Scaling', 'Lcl Scaling', '', 'A', P.D(scl.x), P.D(scl.y), P.D(scl.z)),
        P70('DefaultAttributeIndex', 'int', 'Integer', '', P.I(0)),
        P70('InheritType', 'enum', '', '', P.I(1)),
      ]),
      N('MultiLayer', [P.I(0)]), N('MultiTake', [P.I(0)]), N('Shading', [P.C(true)]), N('Culling', [P.S('CullingOff')]),
    ]));
    connections.push([mid, parentId]);
    if (isMesh) geometry(o, mid);
    for (const c of o.children) if (!c.userData.m3helper) model(c, mid);
  };

  root.updateMatrixWorld(true);
  for (const c of root.children) model(c, 0);

  const now = new Date();
  const scale = CM_PER[unit] || 1;
  const tree = [
    N('FBXHeaderExtension', [], [
      N('FBXHeaderVersion', [P.I(1003)]), N('FBXVersion', [P.I(VERSION)]), N('EncryptionType', [P.I(0)]),
      N('CreationTimeStamp', [], [N('Version', [P.I(1000)]), N('Year', [P.I(now.getFullYear())]), N('Month', [P.I(now.getMonth() + 1)]), N('Day', [P.I(now.getDate())]),
        N('Hour', [P.I(now.getHours())]), N('Minute', [P.I(now.getMinutes())]), N('Second', [P.I(now.getSeconds())]), N('Millisecond', [P.I(0)])]),
      N('Creator', [P.S('Master 3D')]),
      N('SceneInfo', [fbxName('GlobalInfo', 'SceneInfo'), P.S('UserData')], [
        N('Type', [P.S('UserData')]), N('Version', [P.I(100)]),
        N('MetaData', [], [N('Version', [P.I(100)]), N('Title', [P.S(title)]), N('Subject', [P.S('')]), N('Author', [P.S('')]), N('Keywords', [P.S('')]), N('Revision', [P.S('')]), N('Comment', [P.S('')])]),
        N('Properties70', [], [P70('ApplicationVendor', 'KString', '', '', P.S('Mastertool')), P70('ApplicationName', 'KString', '', '', P.S('Master 3D'))]),
      ]),
    ]),
    N('FileId', [P.R(FILE_ID)]),
    N('CreationTime', [P.S(TIME_ID)]),
    N('Creator', [P.S('Master 3D')]),
    N('GlobalSettings', [], [N('Version', [P.I(1000)]), N('Properties70', [], [
      P70('UpAxis', 'int', 'Integer', '', P.I(1)), P70('UpAxisSign', 'int', 'Integer', '', P.I(1)),
      P70('FrontAxis', 'int', 'Integer', '', P.I(2)), P70('FrontAxisSign', 'int', 'Integer', '', P.I(1)),
      P70('CoordAxis', 'int', 'Integer', '', P.I(0)), P70('CoordAxisSign', 'int', 'Integer', '', P.I(1)),
      P70('OriginalUpAxis', 'int', 'Integer', '', P.I(1)), P70('OriginalUpAxisSign', 'int', 'Integer', '', P.I(1)),
      P70('UnitScaleFactor', 'double', 'Number', '', P.D(scale)), P70('OriginalUnitScaleFactor', 'double', 'Number', '', P.D(scale)),
      P70('AmbientColor', 'ColorRGB', 'Color', '', P.D(0), P.D(0), P.D(0)),
      P70('DefaultCamera', 'KString', '', '', P.S('Producer Perspective')),
      P70('TimeMode', 'enum', '', '', P.I(11)),
      P70('TimeSpanStart', 'KTime', 'Time', '', P.L(0)), P70('TimeSpanStop', 'KTime', 'Time', '', P.L(46186158000)),
      P70('CustomFrameRate', 'double', 'Number', '', P.D(24)),
    ])]),
    N('Documents', [], [N('Count', [P.I(1)]), N('Document', [P.L(id()), P.S('Scene'), P.S('Scene')], [
      N('Properties70', [], [P70('SourceObject', 'object', '', ''), P70('ActiveAnimStackName', 'KString', '', '', P.S(''))]),
      N('RootNode', [P.L(0)]),
    ])]),
    N('References'),
    N('Definitions', [], [
      N('Version', [P.I(100)]), N('Count', [P.I(1 + nModel + nGeo + nMat)]),
      N('ObjectType', [P.S('GlobalSettings')], [N('Count', [P.I(1)])]),
      N('ObjectType', [P.S('Model')], [N('Count', [P.I(nModel)])]),
      N('ObjectType', [P.S('Geometry')], [N('Count', [P.I(nGeo)])]),
      N('ObjectType', [P.S('Material')], [N('Count', [P.I(nMat)])]),
    ]),
    N('Objects', [], objects),
    N('Connections', [], connections.map(([c, p]) => N('C', [P.S('OO'), P.L(c), P.L(p)]))),
    N('Takes', [], [N('Current', [P.S('')])]),
  ];

  const w = new Writer();
  w.bytes(textEnc.encode('Kaydara FBX Binary  ')); w.u8(0); w.u8(0x1a); w.u8(0); w.u32(VERSION);
  for (const n of tree) writeNode(w, n);
  w.bytes(new Uint8Array(13)); // kök liste sonu
  w.bytes(Uint8Array.from(FOOT_ID));
  w.bytes(new Uint8Array(4));
  let pad = ((w.len + 15) & ~15) - w.len;
  if (pad === 0) pad = 16;
  w.bytes(new Uint8Array(pad));
  w.u32(VERSION);
  w.bytes(new Uint8Array(120));
  w.bytes(Uint8Array.from(FOOT_MAGIC));
  return w.result();
}
