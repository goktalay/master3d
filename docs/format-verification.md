# Biçim doğrulaması

scripts/verify-formats.js çıktısı (2026-10-20). Örnekler: three.js, assimp ve occt-import-js depolarının test / örnek
modelleri (`npm run samples`). Her dosya arayüzün açma akışıyla (Chromium, WebGL) açıldı. Sonuç: **62 / 62** dosya açıldı.

| Biçim | Dosya | Boyut | Okuyucu | Parça | Üçgen | Nokta | Süre | Not |
|---|---|---|---|---:|---:|---:|---:|---|
| glTF / GLB | `DamagedHelmet.gltf` | 4 KB | three | 1 | 15.452 |  | 0.5 sn |  |
| glTF / GLB | `LittlestTokyo.glb` | 3.9 MB | three | 71 | 141.802 |  | 1.3 sn |  |
| glTF / GLB | `Soldier.glb` | 2.1 MB | three | 2 | 11.376 |  | 16.8 sn |  |
| Autodesk FBX | `box.fbx` | 17 KB | assimp | 1 | 12 |  | 1.7 sn | warn.fallback |
| Autodesk FBX | `cubes_with_names.fbx` | 86 KB | three | 4 | 420 |  | 0.7 sn |  |
| Autodesk FBX | `Samba Dancing.fbx` | 3.5 MB | three | 2 | 55.320 |  | 2.7 sn |  |
| Wavefront OBJ | `male02.obj` | 454 KB | three | 14 | 5.004 |  | 1.6 sn |  |
| COLLADA (DAE) | `stormtrooper.dae` | 2.1 MB | three | 1 | 6.518 |  | 1.4 sn |  |
| Pixar USD / USDZ | `MotionCaptureROM.usdc` | 130 KB | three | 24 | 2.000 |  | 1.8 sn |  |
| Pixar USD / USDZ | `saeukkang.usda` | 1.8 MB | three | 1 | 25.000 |  | 0.9 sn |  |
| Pixar USD / USDZ | `saeukkang.usdz` | 3.7 MB | three | 1 | 25.000 |  | 0.6 sn |  |
| Autodesk 3DS | `portalgun.3ds` | 116 KB | three | 1 | 4.117 |  | 1.0 sn |  |
| Blender | `BlenderDefault_276.blend` | 443 KB | assimp | 1 | 12 |  | 2.0 sn |  |
| Blender | `CubeHierarchy_248.blend` | 153 KB | assimp | 8 | 86 |  | 0.6 sn |  |
| DirectX X | `test_cube_binary.x` | 3 KB | assimp | 1 | 12 |  | 0.9 sn |  |
| DirectX X | `test.x` | 8 KB | assimp | 1 | 12 |  | 1.2 sn | warn.missingFile:.\test.png |
| STEP (AP203 / AP214 / AP242) | `as1-oc-214.stp` | 423 KB | occt | 18 | 5.040 |  | 2.5 sn |  |
| STEP (AP203 / AP214 / AP242) | `cube-in.step` | 18 KB | occt | 1 | 12 |  | 1.4 sn |  |
| STEP (AP203 / AP214 / AP242) | `cube.stp` | 8 KB | occt | 1 | 12 |  | 0.9 sn |  |
| STEP (AP203 / AP214 / AP242) | `dm1-id-214.stp` | 84 KB | occt | 7 | 1.576 |  | 2.4 sn |  |
| STEP (AP203 / AP214 / AP242) | `rounded-cube.step` | 20 KB | occt | 1 | 84 |  | 1.7 sn |  |
| IGES | `Cube 10x10.igs` | 11 KB | occt | 1 | 12 |  | 1.4 sn |  |
| OpenCascade BREP | `as1_pe_203.brep` | 38 KB | occt | 18 | 3.848 |  | 1.6 sn |  |
| Rhino 3DM | `Rhino_Logo.3dm` | 5.4 MB | three | 231 | 131.948 | 848 | 1.7 sn |  |
| IFC (BIM) | `AC14-FZK-Haus.ifc` | 3.9 MB | ifc | 110 | 35.792 |  | 2.2 sn |  |
| AutoCAD DXF | `PinkEggFromLW.dxf` | 47 KB | assimp | 1 | 576 |  | 2.1 sn |  |
| STL | `colored.stl` | 105 KB | three | 1 | 2.156 |  | 0.6 sn |  |
| STL | `pr2_head_pan.stl` | 49 KB | three | 1 | 1.000 |  | 0.6 sn |  |
| STL | `slotted_disk.stl` | 79 KB | three | 1 | 288 |  | 0.6 sn |  |
| 3MF | `cube_gears.3mf` | 223 KB | three | 17 | 25.692 |  | 0.6 sn |  |
| 3MF | `truck.3mf` | 2.5 MB | three | 40 | 205.310 |  | 5.1 sn |  |
| AMF | `rook.amf` | 48 KB | three | 1 | 3.682 |  | 2.3 sn |  |
| G-code | `benchy.gcode` | 1.9 MB | three | 244 | 0 |  | 0.3 sn |  |
| OFF | `Wuson.off` | 146 KB | assimp | 1 | 3.732 |  | 0.7 sn |  |
| Stanford PLY | `dolphins.ply` | 44 KB | three | 1 | 1.689 |  | 1.1 sn |  |
| Stanford PLY | `Lucy100k.ply` | 1.8 MB | three | 1 | 100.000 |  | 0.3 sn |  |
| Point Cloud Data (PCD) | `Zaghetto.pcd` | 704 KB | three | 1 | 0 | 59.750 | 1.1 sn |  |
| XYZ | `helix_201.xyz` | 9 KB | three | 1 | 0 | 201 | 0.3 sn |  |
| VTK (legacy / VTP) | `boxes.vtk` | 1 KB | three | 1 | 36 |  | 0.7 sn |  |
| VTK (legacy / VTP) | `boxes.vtp` | 1 KB | three | 1 | 36 |  | 0.5 sn |  |
| Protein Data Bank (PDB) | `caffeine.pdb` | 3 KB | three | 5 | 4.720 |  | 0.7 sn |  |
| VRML 2.0 | `house.wrl` | 93 KB | three | 216 | 4.532 |  | 0.3 sn |  |
| X3D | `ComputerKeyboard.x3d` | 9 KB | x3d | 100 | 2.020 |  | 1.1 sn |  |
| LightWave LWO | `hierarchy.lwo` | 13 KB | assimp | 4 | 564 |  | 1.4 sn | warn.fallback |
| LightWave LWO | `uvtest.lwo` | 7 KB | three | 1 | 32 |  | 0.1 sn |  |
| MagicaVoxel VOX | `monu10.vox` | 618 KB | three | 1 | 11.048 |  | 1.2 sn |  |
| Google Earth KMZ | `Box.kmz` | 2 KB | three | 1 | 12 |  | 0.1 sn |  |
| Quake II MD2 | `ratamahatta.md2` | 296 KB | three | 1 | 666 |  | 1.2 sn |  |
| Doom 3 MD5 | `SimpleCube.md5mesh` | 2 KB | assimp | 1 | 12 |  | 0.8 sn |  |
| MilkShape 3D | `jeep1.ms3d` | 161 KB | assimp | 7 | 2.032 |  | 0.9 sn |  |
| Blitz3D B3D | `WusonBlitz.b3d` | 85 KB | assimp | 1 | 3.732 |  | 1.7 sn |  |
| AC3D | `SphereWithLight.ac` | 18 KB | assimp | 1 | 17.664 |  | 0.4 sn | warn.missingFile:earthSpherical.jpg |
| 3ds Max ASE | `ThreeCubesGreen.ASE` | 9 KB | assimp | 3 | 36 |  | 0.9 sn |  |
| Caligari trueSpace COB | `molecule.cob` | 36 KB | assimp | 4 | 896 |  | 1.0 sn |  |
| Neutral File Format (NFF) | `spheres.nff` | 1 KB | assimp | 4 | 15.380 |  | 0.5 sn | warn.missingFile:earthCylindric.jpg |
| OpenGEX | `Example.ogex` | 4 KB | assimp | 2 | 24 |  | 1.0 sn |  |
| Quick3D | `earth.q3o` | 104 KB | assimp | 2 | 2.937 |  | 0.8 sn |  |
| Valve SMD | `triangle.smd` | 1 KB | assimp | 1 | 1 |  | 1.1 sn | warn.missingFile:none.quak |
| XGL / ZGL | `sample_official.xgl` | 3 KB | assimp | 2 | 24 |  | 1.2 sn |  |
| BioVision BVH | `pirouette.bvh` | 746 KB | three | 1 | 0 |  | 0.4 sn |  |
| ZIP | `helmet-gltf.zip` | 3.2 MB | three | 1 | 15.452 |  | 1.0 sn |  |
| ZIP | `male-obj.zip` | 337 KB | three | 14 | 5.004 |  | 0.2 sn |  |
