// Biçim kaydı: hangi uzantı hangi motorla açılır, hangi biçimlere dışa aktarılır. Ana süreçte (require), pencerede
// (<script>) ve testlerde aynı tablo kullanılır; tanıtım sayfasındaki ve docs/site-teknik.md'deki listeler de buradan
// üretilir. Yeni biçim eklerken gerçek bir örnek dosyayla doğrulayın (scripts/verify-formats.js) — doğrulanmayan biçim
// listeye girmez.
(function (root) {
  'use strict';

  // engine: three (three.js okuyucusu) · occt (OpenCascade, WASM) · assimp (Open Asset Import, WASM) · ifc (web-ifc, WASM)
  //         · x3d (yerleşik okuyucu) · zip (arşivdeki modeli bulur)
  // fallback: birincil motor başarısız olursa denenecek motor
  // group: welcome ekranı ve tanıtım sayfasındaki öbek
  // multi: dosya yanındaki başka dosyalara başvurabilir (doku, malzeme, .bin)
  // note: bilinen sınır (i18n anahtarı: fmt.note.<id>)
  const IMPORT = [
    { id: 'gltf', name: 'glTF / GLB', ext: ['gltf', 'glb'], engine: 'three', group: 'general', multi: true, anim: true },
    { id: 'fbx', name: 'Autodesk FBX', ext: ['fbx'], engine: 'three', fallback: 'assimp', group: 'general', multi: true, anim: true },
    { id: 'obj', name: 'Wavefront OBJ', ext: ['obj'], engine: 'three', group: 'general', multi: true },
    { id: 'dae', name: 'COLLADA (DAE)', ext: ['dae'], engine: 'three', fallback: 'assimp', group: 'general', multi: true, anim: true },
    { id: 'usd', name: 'Pixar USD / USDZ', ext: ['usdz', 'usda', 'usdc', 'usd'], engine: 'three', group: 'general', multi: true, note: true },
    { id: '3ds', name: 'Autodesk 3DS', ext: ['3ds'], engine: 'three', fallback: 'assimp', group: 'general', multi: true },
    { id: 'blend', name: 'Blender', ext: ['blend'], engine: 'assimp', group: 'general', note: true },
    { id: 'x', name: 'DirectX X', ext: ['x'], engine: 'assimp', group: 'general', multi: true, anim: true },
    { id: 'step', name: 'STEP (AP203 / AP214 / AP242)', ext: ['step', 'stp', 'p21'], engine: 'occt', group: 'cad' },
    { id: 'iges', name: 'IGES', ext: ['iges', 'igs'], engine: 'occt', group: 'cad' },
    { id: 'brep', name: 'OpenCascade BREP', ext: ['brep', 'brp'], engine: 'occt', group: 'cad' },
    { id: '3dm', name: 'Rhino 3DM', ext: ['3dm'], engine: 'three', group: 'cad', note: true },
    { id: 'ifc', name: 'IFC (BIM)', ext: ['ifc'], engine: 'ifc', group: 'cad' },
    { id: 'dxf', name: 'AutoCAD DXF', ext: ['dxf'], engine: 'assimp', group: 'cad', note: true },
    { id: 'stl', name: 'STL', ext: ['stl'], engine: 'three', group: 'print' },
    { id: '3mf', name: '3MF', ext: ['3mf'], engine: 'three', fallback: 'assimp', group: 'print' },
    { id: 'amf', name: 'AMF', ext: ['amf'], engine: 'three', group: 'print' },
    { id: 'gcode', name: 'G-code', ext: ['gcode', 'gco'], engine: 'three', group: 'print', note: true },
    { id: 'off', name: 'OFF', ext: ['off'], engine: 'assimp', group: 'print' },
    { id: 'ply', name: 'Stanford PLY', ext: ['ply'], engine: 'three', group: 'science' },
    { id: 'pcd', name: 'Point Cloud Data (PCD)', ext: ['pcd'], engine: 'three', group: 'science' },
    { id: 'xyz', name: 'XYZ', ext: ['xyz'], engine: 'three', group: 'science' },
    { id: 'vtk', name: 'VTK (legacy / VTP)', ext: ['vtk', 'vtp'], engine: 'three', group: 'science' },
    { id: 'pdb', name: 'Protein Data Bank (PDB)', ext: ['pdb'], engine: 'three', group: 'science' },
    { id: 'wrl', name: 'VRML 2.0', ext: ['wrl', 'vrml'], engine: 'three', group: 'other', multi: true },
    { id: 'x3d', name: 'X3D', ext: ['x3d'], engine: 'x3d', group: 'other', multi: true },
    { id: 'lwo', name: 'LightWave LWO', ext: ['lwo'], engine: 'three', fallback: 'assimp', group: 'other', multi: true },
    { id: 'vox', name: 'MagicaVoxel VOX', ext: ['vox'], engine: 'three', group: 'other' },
    { id: 'kmz', name: 'Google Earth KMZ', ext: ['kmz'], engine: 'three', group: 'other' },
    { id: 'md2', name: 'Quake II MD2', ext: ['md2'], engine: 'three', group: 'other', anim: true },
    { id: 'md5', name: 'Doom 3 MD5', ext: ['md5mesh'], engine: 'assimp', group: 'other' },
    { id: 'ms3d', name: 'MilkShape 3D', ext: ['ms3d'], engine: 'assimp', group: 'other', multi: true },
    { id: 'b3d', name: 'Blitz3D B3D', ext: ['b3d'], engine: 'assimp', group: 'other', multi: true },
    { id: 'ac', name: 'AC3D', ext: ['ac', 'ac3d'], engine: 'assimp', group: 'other', multi: true },
    { id: 'ase', name: '3ds Max ASE', ext: ['ase', 'ask'], engine: 'assimp', group: 'other', multi: true },
    { id: 'cob', name: 'Caligari trueSpace COB', ext: ['cob', 'scn'], engine: 'assimp', group: 'other', multi: true },
    { id: 'nff', name: 'Neutral File Format (NFF)', ext: ['nff'], engine: 'assimp', group: 'other' },
    { id: 'ogex', name: 'OpenGEX', ext: ['ogex'], engine: 'assimp', group: 'other', multi: true },
    { id: 'q3d', name: 'Quick3D', ext: ['q3o', 'q3s'], engine: 'assimp', group: 'other' },
    { id: 'smd', name: 'Valve SMD', ext: ['smd', 'vta'], engine: 'assimp', group: 'other' },
    { id: 'xgl', name: 'XGL / ZGL', ext: ['xgl', 'zgl'], engine: 'assimp', group: 'other' },
    { id: 'bvh', name: 'BioVision BVH', ext: ['bvh'], engine: 'three', group: 'other', anim: true },
    { id: 'zip', name: 'ZIP', ext: ['zip'], engine: 'zip', group: 'other' },
  ];

  // Dışa aktarma (açıklamalar i18n'de: exp.desc.<id>). kind: mesh (üçgen ağ) · scene (hiyerarşi + malzeme) · cad (STEP: üçgen yüzeyli katı)
  // files: yanına yazılan ek dosyalar (OBJ → .mtl)
  const EXPORT = [
    { id: 'glb', name: 'GLB', ext: 'glb', kind: 'scene', anim: true, rec: true },
    { id: 'gltf', name: 'glTF', ext: 'gltf', kind: 'scene', anim: true },
    { id: 'fbx', name: 'FBX', ext: 'fbx', kind: 'scene' },
    { id: 'obj', name: 'OBJ + MTL', ext: 'obj', kind: 'scene', files: ['mtl'] },
    { id: 'dae', name: 'COLLADA (DAE)', ext: 'dae', kind: 'scene' },
    { id: 'usdz', name: 'USDZ', ext: 'usdz', kind: 'scene' },
    { id: 'step', name: 'STEP', ext: 'step', kind: 'cad' },
    { id: 'stl', name: 'STL', ext: 'stl', kind: 'mesh', rec: true },
    { id: 'stl-ascii', name: 'STL ASCII', ext: 'stl', kind: 'mesh' },
    { id: '3mf', name: '3MF', ext: '3mf', kind: 'scene' },
    { id: 'ply', name: 'PLY', ext: 'ply', kind: 'mesh' },
    { id: 'ply-ascii', name: 'PLY ASCII', ext: 'ply', kind: 'mesh' },
    { id: 'wrl', name: 'VRML 2.0', ext: 'wrl', kind: 'scene' },
    { id: 'x3d', name: 'X3D', ext: 'x3d', kind: 'scene' },
    { id: 'off', name: 'OFF', ext: 'off', kind: 'mesh' },
  ];

  const GROUPS = ['general', 'cad', 'print', 'science', 'other'];

  // Gezgin'de "Master 3D ile aç" yazılan uzantılar (ZIP hariç: her ZIP bir model değildir)
  const BY_EXT = {};
  for (const f of IMPORT) for (const e of f.ext) BY_EXT[e] = f;
  const SHELL_EXTS = IMPORT.filter((f) => f.id !== 'zip').flatMap((f) => f.ext);

  // Bir modelin yanındaki dosyalardan başvurulabilecekler (doku, malzeme, ikili ara bellek)
  const SIDECAR_EXTS = ['mtl', 'bin', 'png', 'jpg', 'jpeg', 'jfif', 'bmp', 'tga', 'gif', 'webp', 'ktx2', 'dds', 'tif', 'tiff', 'hdr', 'exr', 'psd'];

  function extOf(name) {
    const m = /\.([^./\\]+)$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }
  const formatOf = (name) => BY_EXT[extOf(name)] || null;
  const exportById = (id) => EXPORT.find((f) => f.id === id) || null;

  // Açık dosya iletişim kutusu süzgeci: önce tümü, sonra öbekler
  function dialogFilters(t) {
    const all = { name: t ? t('open.allSupported') : 'All 3D files', extensions: IMPORT.flatMap((f) => f.ext) };
    return [all, ...GROUPS.map((g) => ({ name: t ? t('fmt.group.' + g) : g, extensions: IMPORT.filter((f) => f.group === g).flatMap((f) => f.ext) }))];
  }

  const api = { IMPORT, EXPORT, GROUPS, BY_EXT, SHELL_EXTS, SIDECAR_EXTS, extOf, formatOf, exportById, dialogFilters };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.M3FORMATS = api;
})(typeof self !== 'undefined' ? self : this);
