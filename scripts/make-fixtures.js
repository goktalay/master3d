// İndirilebilir gerçek örneği olmayan biçimler için örnek üretir → samples/_gen/ (npm run samples sonrası):
//   VTK legacy ASCII (polydata), VTP (XML, ASCII), USDA (USDZ dışa aktarımının içindeki metin USD), ZIP (glTF + .bin +
//   dokular tek arşivde), OBJ ZIP (OBJ + MTL + doku).
'use strict';

const fs = require('fs');
const path = require('path');
const { zipSync, unzipSync } = require('fflate');

const ROOT = path.join(__dirname, '..');
const S = path.join(ROOT, 'samples');
const OUT = path.join(S, '_gen');
fs.mkdirSync(OUT, { recursive: true });

// Küçük bir "L" profil gövdesi (kapalı, 12 üçgen kutu + ayrık ikinci kutu)
function boxes() {
  const v = [], f = [];
  const box = (x0, y0, z0, x1, y1, z1) => {
    const b = v.length;
    for (const [x, y, z] of [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]) v.push([x, y, z]);
    for (const q of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) f.push(q.map((i) => i + b));
  };
  box(0, 0, 0, 40, 10, 20);
  box(0, 10, 0, 10, 40, 20);
  box(60, 0, 0, 80, 20, 20);
  return { v, f };
}

const { v, f } = boxes();
fs.writeFileSync(path.join(OUT, 'boxes.vtk'), ['# vtk DataFile Version 3.0', 'Master 3D fixture', 'ASCII', 'DATASET POLYDATA', `POINTS ${v.length} float`,
  ...v.map((p) => p.join(' ')), `POLYGONS ${f.length} ${f.length * 5}`, ...f.map((q) => `4 ${q.join(' ')}`), ''].join('\n'));
fs.writeFileSync(path.join(OUT, 'boxes.vtp'), `<?xml version="1.0"?>
<VTKFile type="PolyData" version="0.1" byte_order="LittleEndian">
  <PolyData>
    <Piece NumberOfPoints="${v.length}" NumberOfVerts="0" NumberOfLines="0" NumberOfStrips="0" NumberOfPolys="${f.length}">
      <Points><DataArray type="Float32" NumberOfComponents="3" format="ascii">${v.map((p) => p.join(' ')).join(' ')}</DataArray></Points>
      <Polys>
        <DataArray type="Int32" Name="connectivity" format="ascii">${f.map((q) => q.join(' ')).join(' ')}</DataArray>
        <DataArray type="Int32" Name="offsets" format="ascii">${f.map((_, i) => (i + 1) * 4).join(' ')}</DataArray>
      </Polys>
    </Piece>
  </PolyData>
</VTKFile>
`);

// ZIP: glTF + .bin + dokular (DamagedHelmet) ve OBJ + MTL + dokular (male02), alt klasörde
const pack = (dir, prefix) => Object.fromEntries(fs.readdirSync(path.join(S, dir)).map((n) => [prefix + n, fs.readFileSync(path.join(S, dir, n))]));
if (fs.existsSync(path.join(S, 'gltf-helmet'))) fs.writeFileSync(path.join(OUT, 'helmet-gltf.zip'), zipSync(pack('gltf-helmet', 'DamagedHelmet/'), { level: 1 }));
if (fs.existsSync(path.join(S, 'obj-male'))) fs.writeFileSync(path.join(OUT, 'male-obj.zip'), zipSync(pack('obj-male', ''), { level: 1 }));

// USDA: three.js örneğindeki USDZ arşivinin içindeki metin USD (saeukkang.usdz)
const usdz = path.join(S, 'usd', 'saeukkang.usdz');
if (fs.existsSync(usdz)) {
  const files = unzipSync(fs.readFileSync(usdz));
  const name = Object.keys(files).find((n) => n.endsWith('.usda'));
  if (name) {
    fs.writeFileSync(path.join(OUT, 'saeukkang.usda'), files[name]);
    for (const [n, b] of Object.entries(files)) if (n !== name && !n.endsWith('/')) { fs.mkdirSync(path.join(OUT, path.dirname(n)), { recursive: true }); fs.writeFileSync(path.join(OUT, n), b); }
  }
}
console.log('samples/_gen:', fs.readdirSync(OUT).join(', '));
