// Biçim doğrulaması için gerçek örnek dosyaları indirir: samples/ (git'e girmez). Kaynaklar açık kaynak projelerin
// test/örnek modelleridir (three.js, assimp, occt-import-js); lisansları kendi depolarındadır.
// Kullanım: npm run samples   → ardından: npm run verify-formats
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'samples');
const T = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/';
const A = 'https://raw.githubusercontent.com/assimp/assimp/master/test/models/';
const O = 'https://raw.githubusercontent.com/kovacsv/occt-import-js/main/test/testfiles/';

// [klasör, dosya adı, adres] — aynı klasördeki dosyalar birbirine başvurabilir (MTL, doku, .bin)
const LIST = [
  ['gltf-helmet', 'DamagedHelmet.gltf', T + 'gltf/DamagedHelmet/glTF/DamagedHelmet.gltf'],
  ['gltf-helmet', 'DamagedHelmet.bin', T + 'gltf/DamagedHelmet/glTF/DamagedHelmet.bin'],
  ['gltf-helmet', 'Default_albedo.jpg', T + 'gltf/DamagedHelmet/glTF/Default_albedo.jpg'],
  ['gltf-helmet', 'Default_AO.jpg', T + 'gltf/DamagedHelmet/glTF/Default_AO.jpg'],
  ['gltf-helmet', 'Default_emissive.jpg', T + 'gltf/DamagedHelmet/glTF/Default_emissive.jpg'],
  ['gltf-helmet', 'Default_metalRoughness.jpg', T + 'gltf/DamagedHelmet/glTF/Default_metalRoughness.jpg'],
  ['gltf-helmet', 'Default_normal.jpg', T + 'gltf/DamagedHelmet/glTF/Default_normal.jpg'],
  ['glb', 'LittlestTokyo.glb', T + 'gltf/LittlestTokyo.glb'],
  ['glb', 'Soldier.glb', T + 'gltf/Soldier.glb'],
  ['fbx', 'Samba Dancing.fbx', T + 'fbx/Samba Dancing.fbx'],
  ['fbx', 'box.fbx', A + 'FBX/box.fbx'],
  ['fbx', 'cubes_with_names.fbx', A + 'FBX/cubes_with_names.fbx'],
  ['obj-male', 'male02.obj', T + 'obj/male02/male02.obj'],
  ['obj-male', 'male02.mtl', T + 'obj/male02/male02.mtl'],
  ['obj-male', '01_-_Default1noCulling.JPG', T + 'obj/male02/01_-_Default1noCulling.JPG'],
  ['obj-male', 'male-02-1noCulling.JPG', T + 'obj/male02/male-02-1noCulling.JPG'],
  ['obj-male', 'orig_02_-_Defaul1noCulling.JPG', T + 'obj/male02/orig_02_-_Defaul1noCulling.JPG'],
  ['stl', 'slotted_disk.stl', T + 'stl/ascii/slotted_disk.stl'],
  ['stl', 'pr2_head_pan.stl', T + 'stl/binary/pr2_head_pan.stl'],
  ['stl', 'colored.stl', T + 'stl/binary/colored.stl'],
  ['ply', 'dolphins.ply', T + 'ply/ascii/dolphins.ply'],
  ['ply', 'Lucy100k.ply', T + 'ply/binary/Lucy100k.ply'],
  ['3mf', 'cube_gears.3mf', T + '3mf/cube_gears.3mf'],
  ['3mf', 'truck.3mf', T + '3mf/truck.3mf'],
  ['amf', 'rook.amf', T + 'amf/rook.amf'],
  ['dae', 'stormtrooper.dae', T + 'collada/stormtrooper/stormtrooper.dae'],
  ['dae', 'Stormtrooper_D.jpg', T + 'collada/stormtrooper/Stormtrooper_D.jpg'],
  ['3ds', 'portalgun.3ds', T + '3ds/portalgun/portalgun.3ds'],
  ['usd', 'saeukkang.usdz', T + 'usdz/saeukkang.usdz'],
  ['usd', 'MotionCaptureROM.usdc', A + 'USD/MotionCaptureROM.usdc'],
  ['wrl', 'house.wrl', T + 'vrml/house.wrl'],
  ['lwo', 'hierarchy.lwo', A + 'LWO/LWO2/hierarchy.lwo'],
  ['lwo', 'uvtest.lwo', A + 'LWO/LWO2/uvtest.lwo'],
  ['lwo', 'uvtest.png', A + 'LWO/LWO2/uvtest.png'],
  ['vox', 'monu10.vox', T + 'vox/monu10.vox'],
  ['3dm', 'Rhino_Logo.3dm', T + '3dm/Rhino_Logo.3dm'],
  ['pcd', 'Zaghetto.pcd', T + 'pcd/binary/Zaghetto.pcd'],
  ['xyz', 'helix_201.xyz', T + 'xyz/helix_201.xyz'],
  ['gcode', 'benchy.gcode', T + 'gcode/benchy.gcode'],
  ['kmz', 'Box.kmz', T + 'kmz/Box.kmz'],
  ['md2', 'ratamahatta.md2', T + 'md2/ratamahatta/ratamahatta.md2'],
  ['pdb', 'caffeine.pdb', T + 'pdb/caffeine.pdb'],
  ['bvh', 'pirouette.bvh', T + 'bvh/pirouette.bvh'],
  ['step', 'as1-oc-214.stp', O + 'cax-if/as1-oc-214.stp'],
  ['step', 'dm1-id-214.stp', O + 'cax-if/dm1-id-214.stp'],
  ['step', 'cube.stp', O + 'simple-basic-cube/cube.stp'],
  ['iges', 'Cube 10x10.igs', O + 'cube-10x10mm/Cube 10x10.igs'],
  ['step', 'cube-in.step', O + 'cube-units/cube-in.step'],
  ['step', 'rounded-cube.step', O + 'rounded-cube/rounded-cube.step'],
  ['brep', 'as1_pe_203.brep', O + 'cax-if-brep/as1_pe_203.brep'],
  ['blend', 'BlenderDefault_276.blend', A + 'BLEND/BlenderDefault_276.blend'],
  ['blend', 'CubeHierarchy_248.blend', A + 'BLEND/CubeHierarchy_248.blend'],
  ['x', 'test.x', A + 'X/test.x'],
  ['x', 'test_cube_binary.x', A + 'X/test_cube_binary.x'],
  ['off', 'Wuson.off', A + 'OFF/Wuson.off'],
  ['dxf', 'PinkEggFromLW.dxf', A + 'DXF/PinkEggFromLW.dxf'],
  ['ms3d', 'jeep1.ms3d', A + 'MS3D/jeep1.ms3d'],
  ['ms3d', 'jeep1.jpg', A + 'MS3D/jeep1.jpg'],
  ['ase', 'ThreeCubesGreen.ASE', A + 'ASE/ThreeCubesGreen.ASE'],
  ['ac', 'SphereWithLight.ac', A + 'AC/SphereWithLight.ac'],
  ['b3d', 'WusonBlitz.b3d', A + 'B3D/WusonBlitz.b3d'],
  ['x3d', 'ComputerKeyboard.x3d', A + 'X3D/ComputerKeyboard.x3d'],
  ['smd', 'triangle.smd', A + 'SMD/triangle.smd'],
  ['cob', 'molecule.cob', A + 'COB/molecule.cob'],
  ['ifc', 'AC14-FZK-Haus.ifc', A + 'IFC/AC14-FZK-Haus.ifc'],
  ['q3d', 'earth.q3o', A + 'Q3D/earth.q3o'],
  ['ogex', 'Example.ogex', A + 'OpenGEX/Example.ogex'],
  ['nff', 'spheres.nff', A + 'NFF/spheres.nff'],
  ['xgl', 'sample_official.xgl', A + 'XGL/sample_official.xgl'],
  ['md5', 'SimpleCube.md5mesh', A + 'MD5/SimpleCube.md5mesh'],
  ['irrmesh', 'spider.irrmesh', A + 'IRRMesh/spider.irrmesh'],
  ['3d', 'box_a.3d', A + '3D/box_a.3d'],
  ['3d', 'box_d.3d', A + '3D/box_d.3d'],
  ['3d', 'box.uc', A + '3D/box.uc'],
];

function get(url, file, redirects = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'master3d-samples' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && redirects) { res.resume(); return resolve(get(res.headers.location, file, redirects - 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const out = fs.createWriteStream(file);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  let ok = 0, fail = 0;
  for (const [dir, name, url] of LIST) {
    const file = path.join(OUT, dir, name);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) { ok++; continue; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try { await get(encodeURI(url), file); ok++; } catch (e) { fail++; console.error(`× ${dir}/${name}: ${e.message}`); try { fs.unlinkSync(file); } catch { /* yok */ } }
  }
  console.log(`${ok} dosya hazır, ${fail} hata → ${path.relative(process.cwd(), OUT) || OUT}`);
})();
