// STEP AP214 (ISO 10303-21) yazıcı — üçgen yüzeyli katı (faceted B-rep). Her parça ayrı bir ürün (PRODUCT) olarak
// bir montajın altına yerleşir; parça adları ve renkleri (STYLED_ITEM) korunur. Kapalı ağlar FACETED_BREP (katı),
// açık ağlar SHELL_BASED_SURFACE_MODEL (yüzey) olarak yazılır. Birim milimetre (hazırlıkta dönüştürülür), Z yukarı.
// Parametrik CAD verisi (silindir, NURBS yüzeyi, unsur geçmişi) üçgen ağdan geri üretilemez: dosya CAD programlarında
// "mesh / faceted body" olarak açılır (bilinen sınır, tanıtımda belirtilir).
// merge (0–100, ayar yüzdesi): aynı düzlemdeki komşu üçgenler tek çokgen yüze birleştirilir (planar.mjs) — CAD'de düz
// yüzeyler üçgen üçgen değil tek yüz olarak görünür. 0: her üçgen ayrı yüz.

import { renderables, meshData, materialInfo, enc } from './prepare.mjs';
import { mergePlanar, mergeTolerance } from './planar.mjs';

const str = (s) => `'${String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]/g, (c) => `\\X2\\${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\`)}'`;
// STEP gerçek sayıları her zaman nokta içerir: 1. / 0.5 / -1.5E-07
const real = (x) => {
  if (!Number.isFinite(x)) return '0.';
  const r = Math.abs(x) < 1e-12 ? 0 : +x.toPrecision(10);
  const s = String(r).toUpperCase();
  if (s.includes('E')) { const [m, e] = s.split('E'); return (m.includes('.') ? m : m + '.') + 'E' + e; }
  return s.includes('.') ? s : s + '.';
};

export function writeSTEP(root, { name = 'model', timestamp = new Date(), merge = 0 } = {}) {
  const lines = [];
  let n = 0;
  const add = (body) => { n++; lines.push(`#${n}=${body};`); return `#${n}`; };

  const ctxApp = add(`APPLICATION_CONTEXT('automotive design')`);
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${ctxApp})`);
  const ctxProd = add(`PRODUCT_CONTEXT('',${ctxApp},'mechanical')`);
  const ctxPD = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${ctxApp},'design')`);
  const uLen = add(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`);
  const uAng = add(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`);
  const uSol = add(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`);
  const unc = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${uLen},'distance_accuracy_value','confusion accuracy')`);
  const ctx = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${uLen},${uAng},${uSol}))REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'))`);
  const dirZ = add(`DIRECTION('',(0.,0.,1.))`);
  const dirX = add(`DIRECTION('',(1.,0.,0.))`);
  const origin = add(`CARTESIAN_POINT('',(0.,0.,0.))`);
  const axis = () => add(`AXIS2_PLACEMENT_3D('',${origin},${dirZ},${dirX})`);

  const product = (pname) => {
    const p = add(`PRODUCT(${str(pname)},${str(pname)},'',(${ctxProd}))`);
    const pdf = add(`PRODUCT_DEFINITION_FORMATION('','',${p})`);
    const pd = add(`PRODUCT_DEFINITION('design','',${pdf},${ctxPD})`);
    const pds = add(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
    return { p, pd, pds };
  };

  const top = product(name);
  const topAxis = axis();
  const children = [];
  const styled = [];
  const colorCache = new Map();
  const styleFor = (rgb) => {
    const key = rgb.map((c) => c.toFixed(4)).join(',');
    if (colorCache.has(key)) return colorCache.get(key);
    const col = add(`COLOUR_RGB('',${real(rgb[0])},${real(rgb[1])},${real(rgb[2])})`);
    const fasc = add(`FILL_AREA_STYLE_COLOUR('',${col})`);
    const fas = add(`FILL_AREA_STYLE('',(${fasc}))`);
    const ssfa = add(`SURFACE_STYLE_FILL_AREA(${fas})`);
    const sss = add(`SURFACE_SIDE_STYLE('',(${ssfa}))`);
    const ssu = add(`SURFACE_STYLE_USAGE(.BOTH.,${sss})`);
    const psa = add(`PRESENTATION_STYLE_ASSIGNMENT((${ssu}))`);
    colorCache.set(key, psa);
    return psa;
  };

  const usedNames = new Map();
  let partNo = 0;
  for (const o of renderables(root)) {
    const d = meshData(o);
    if (!d.tri.length) continue;
    partNo++;
    let pname = d.name || `Part ${partNo}`;
    const k = (usedNames.get(pname) || 0) + 1; usedNames.set(pname, k);
    if (k > 1) pname = `${pname} (${k})`;
    // Köşeler konuma göre kaynaştırılır: kapalılık denetimi ve ortak CARTESIAN_POINT
    const map = new Map(); const vid = new Uint32Array(d.count); const pts = [];
    for (let i = 0; i < d.count; i++) {
      const key = `${d.pos[i * 3]},${d.pos[i * 3 + 1]},${d.pos[i * 3 + 2]}`;
      let v = map.get(key);
      if (v === undefined) { v = pts.length; map.set(key, v); pts.push(i); }
      vid[i] = v;
    }
    const tris = [];
    const edges = new Map();
    for (let t = 0; t < d.tri.length; t += 3) {
      const a = vid[d.tri[t]], b = vid[d.tri[t + 1]], c = vid[d.tri[t + 2]];
      if (a === b || b === c || a === c) continue;
      tris.push([a, b, c]);
      for (const [x, y] of [[a, b], [b, c], [c, a]]) { const e = x < y ? `${x}_${y}` : `${y}_${x}`; edges.set(e, (edges.get(e) || 0) + 1); }
    }
    if (!tris.length) continue;
    const closed = [...edges.values()].every((c) => c === 2);
    const cp = pts.map((i) => add(`CARTESIAN_POINT('',(${real(d.pos[i * 3])},${real(d.pos[i * 3 + 1])},${real(d.pos[i * 3 + 2])}))`));
    const P = (i) => [d.pos[pts[i] * 3], d.pos[pts[i] * 3 + 1], d.pos[pts[i] * 3 + 2]];
    const faces = [];
    // Düzlem: yüzün ilk köşesinde, normal n, referans yönü ilk kenarın düzleme izdüşümü
    const planeAt = (a, n, b, at = null) => {
      const A = P(a), B = P(b);
      let u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const k = u[0] * n[0] + u[1] * n[1] + u[2] * n[2];
      u = [u[0] - k * n[0], u[1] - k * n[1], u[2] - k * n[2]];
      let ul = Math.hypot(u[0], u[1], u[2]);
      if (ul < 1e-14) { u = Math.abs(n[0]) < 0.9 ? [0, -n[2], n[1]] : [n[2], 0, -n[0]]; ul = Math.hypot(u[0], u[1], u[2]); }
      const nd = add(`DIRECTION('',(${real(n[0])},${real(n[1])},${real(n[2])}))`);
      const rd = add(`DIRECTION('',(${real(u[0] / ul)},${real(u[1] / ul)},${real(u[2] / ul)}))`);
      const loc = at ? add(`CARTESIAN_POINT('',(${real(at[0])},${real(at[1])},${real(at[2])}))`) : cp[a];
      return add(`PLANE('',${add(`AXIS2_PLACEMENT_3D('',${loc},${nd},${rd})`)})`);
    };
    let tol = null;
    if (merge > 0) {
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (const i of pts) for (let k = 0; k < 3; k++) { const x = d.pos[i * 3 + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
      tol = mergeTolerance(merge, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]));
    }
    if (tol) {
      // Aynı düzlemdeki üçgenler tek yüz: dış sınır FACE_OUTER_BOUND, delikler FACE_BOUND
      const PP = new Float64Array(pts.length * 3);
      pts.forEach((i, j) => { PP[j * 3] = d.pos[i * 3]; PP[j * 3 + 1] = d.pos[i * 3 + 1]; PP[j * 3 + 2] = d.pos[i * 3 + 2]; });
      const flat = new Uint32Array(tris.length * 3);
      tris.forEach((tr, j) => flat.set(tr, j * 3));
      for (const f of mergePlanar(PP, flat, tol)) {
        const [outer, ...holes] = f.loops;
        const bounds = [add(`FACE_OUTER_BOUND('',${add(`POLY_LOOP('',(${outer.map((v) => cp[v]).join(',')}))`)},.T.)`)];
        for (const hl of holes) bounds.push(add(`FACE_BOUND('',${add(`POLY_LOOP('',(${hl.map((v) => cp[v]).join(',')}))`)},.T.)`));
        faces.push(add(`FACE_SURFACE('',(${bounds.join(',')}),${planeAt(outer[0], f.normal, outer[1], f.deviation > 0 ? f.origin : null)},.T.)`));
      }
    } else {
      // Her üçgen bir düzlemsel yüz: FACE_SURFACE (PLANE) + POLY_LOOP. Yalın FACE kayıtlarını OpenCascade üçgenlemez.
      for (const [a, b, c] of tris) {
        const A = P(a), B = P(b), C = P(c);
        const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
        const nl = Math.hypot(nx, ny, nz), ul = Math.hypot(u[0], u[1], u[2]);
        if (nl < 1e-14 || ul < 1e-14) continue; // alansız üçgen
        const plane = planeAt(a, [nx / nl, ny / nl, nz / nl], b);
        const loop = add(`POLY_LOOP('',(${cp[a]},${cp[b]},${cp[c]}))`);
        const bound = add(`FACE_OUTER_BOUND('',${loop},.T.)`);
        faces.push(add(`FACE_SURFACE('',(${bound}),${plane},.T.)`));
      }
    }
    if (!faces.length) continue;
    let item, rep;
    const ax = axis();
    if (closed) {
      const shell = add(`CLOSED_SHELL('',(${faces.join(',')}))`);
      item = add(`FACETED_BREP(${str(pname)},${shell})`);
      rep = add(`FACETED_BREP_SHAPE_REPRESENTATION(${str(pname)},(${item},${ax}),${ctx})`);
    } else {
      const shell = add(`OPEN_SHELL('',(${faces.join(',')}))`);
      item = add(`SHELL_BASED_SURFACE_MODEL(${str(pname)},(${shell}))`);
      rep = add(`MANIFOLD_SURFACE_SHAPE_REPRESENTATION(${str(pname)},(${item},${ax}),${ctx})`);
    }
    const prod = product(pname);
    add(`SHAPE_DEFINITION_REPRESENTATION(${prod.pds},${rep})`);
    const info = materialInfo(d.materials[0]);
    styled.push(add(`STYLED_ITEM('color',(${styleFor(info.color)}),${item})`));
    children.push({ prod, rep, ax, pname });
  }

  // Montaj: kök ürünün şekli tüm parçaların yerleşimlerini taşır; her parça birim dönüşümle bağlanır
  const childAx = children.map(() => axis());
  const topRep = add(`SHAPE_REPRESENTATION(${str(name)},(${[topAxis, ...childAx].join(',')}),${ctx})`);
  add(`SHAPE_DEFINITION_REPRESENTATION(${top.pds},${topRep})`);
  children.forEach((c, i) => {
    const nauo = add(`NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO${i + 1}',${str(c.pname)},'',${top.pd},${c.prod.pd},$)`);
    const pds = add(`PRODUCT_DEFINITION_SHAPE('','',${nauo})`);
    const idt = add(`ITEM_DEFINED_TRANSFORMATION('','',${c.ax},${childAx[i]})`);
    const rel = add(`(REPRESENTATION_RELATIONSHIP('','',${c.rep},${topRep})REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(${idt})SHAPE_REPRESENTATION_RELATIONSHIP())`);
    add(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(${rel},${pds})`);
  });
  add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${[top.p, ...children.map((c) => c.prod.p)].join(',')}))`);
  if (styled.length) add(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled.join(',')}),${ctx})`);

  const ts = timestamp.toISOString().replace(/\.\d+Z$/, '');
  const head = ['ISO-10303-21;', 'HEADER;', `FILE_DESCRIPTION(('Master 3D faceted export'),'2;1');`,
    `FILE_NAME(${str(name + '.step')},'${ts}',(''),(''),'Master 3D','Master 3D','');`,
    `FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));`, 'ENDSEC;', 'DATA;'];
  return enc([...head, ...lines, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n'));
}
