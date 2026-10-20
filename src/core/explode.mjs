// Patlatma (exploded view): parçaları modelin merkezinden dışarı doğru, bir eksen boyunca ya da montaj hiyerarşisine
// göre (her düğümün çocukları o düğümün merkezinden) uzaklaştırır. Konumlar yerel uzayda saklanır; amount = 0 her
// şeyi dosyadaki yerine geri koyar. Saf hesap: three.js nesneleri üzerinde, görüntüleyiciden bağımsız (test edilir).
//
// Kullanım:  const ex = createExplode(root, { mode: 'radial' | 'x' | 'y' | 'z' | 'tree', level: 0 }); ex.apply(0.5); ex.reset();

import * as THREE from 'three';
import { collectParts, worldBox, hasRenderable, isRenderable } from './scene.mjs';

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
// amount = 1'de uzaklık: parça merkezinin model merkezine uzaklığının SCALE katı (oransal patlatma düzeni korur)
const SCALE = 1.6;

function centerOf(o) {
  const b = worldBox(o, { onlyVisible: false });
  return b.isEmpty() ? new THREE.Vector3().setFromMatrixPosition(o.matrixWorld) : b.getCenter(new THREE.Vector3());
}

// Dünya uzayındaki bir yer değiştirmeyi nesnenin üst düğümünün yerel uzayına çevirir
function toParentLocal(o, worldOffset) {
  const parent = o.parent;
  if (!parent) return worldOffset.clone();
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const p0 = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  const p1 = p0.clone().add(worldOffset);
  return p1.applyMatrix4(inv).sub(p0.applyMatrix4(inv));
}

// Merkezden / eksen boyunca: tek düzeydeki parçalar
function flatOffsets(root, parts, mode) {
  const box = worldBox(root, { onlyVisible: false });
  const center = box.getCenter(new THREE.Vector3());
  const diag = box.getSize(new THREE.Vector3()).length() || 1;
  const offs = parts.map((p) => centerOf(p).sub(center));
  if (mode in AXES) {
    const ax = AXES[mode];
    for (const v of offs) v.copy(ax).multiplyScalar(v.dot(ax));
    // Hepsi eksen üzerinde aynı yerdeyse (iç içe halkalar, eş merkezli gövdeler) sırayla dizilir
    const spread = offs.reduce((m, v) => Math.max(m, v.length()), 0);
    if (spread < diag * 1e-3 && parts.length > 1) {
      const order = parts.map((p, i) => [i, worldBox(p, { onlyVisible: false }).getSize(new THREE.Vector3()).length()]).sort((a, b) => b[1] - a[1]);
      order.forEach(([i], k) => offs[i].copy(ax).multiplyScalar((k - (parts.length - 1) / 2) * diag / parts.length));
    }
  } else {
    // Merkezdeki (çekirdek) parçalar yerinde kalır; aynı merkezdeki parçalar boyutlarına göre birbirinden ayrılmaz
    for (const v of offs) if (v.length() < diag * 1e-4) v.set(0, 0, 0);
  }
  return offs.map((v) => v.multiplyScalar(SCALE));
}

export function createExplode(root, { mode = 'radial', level = 0 } = {}) {
  root.updateWorldMatrix(true, true);
  const entries = []; // { obj, base: Vector3 (yerel), off: Vector3 (yerel, amount=1) }
  if (mode === 'tree') {
    // Hiyerarşik: her düğümün çizilebilir içerikli çocukları, o düğümün merkezinden; derinlik arttıkça etki azalır
    const walk = (node, depth) => {
      const kids = node.children.filter((c) => !c.userData.m3helper && hasRenderable(c));
      if (kids.length >= 2) {
        const c0 = centerOf(node);
        for (const k of kids) {
          const w = centerOf(k).sub(c0).multiplyScalar(SCALE / (1 + depth * 0.35));
          if (w.lengthSq() > 0) entries.push({ obj: k, base: k.position.clone(), off: toParentLocal(k, w) });
        }
      }
      for (const k of kids) if (!isRenderable(k) || k.children.length) walk(k, depth + (kids.length >= 2 ? 1 : 0));
    };
    walk(root, 0);
  } else {
    const parts = collectParts(root, level);
    const offs = flatOffsets(root, parts, mode);
    parts.forEach((p, i) => { if (offs[i].lengthSq() > 0) entries.push({ obj: p, base: p.position.clone(), off: toParentLocal(p, offs[i]) }); });
  }
  let amount = 0;
  return {
    mode, level, count: entries.length,
    get amount() { return amount; },
    apply(t) {
      amount = Math.max(0, Math.min(1, Number(t) || 0));
      for (const e of entries) e.obj.position.copy(e.base).addScaledVector(e.off, amount);
      root.updateWorldMatrix(false, true);
    },
    reset() { this.apply(0); },
    // Patlatılmış hâli kalıcı yapar (dışa aktarma "patlatılmış konumla"): taban konumları günceller
    bake() { for (const e of entries) e.base.copy(e.obj.position); amount = 0; },
    objects: () => entries.map((e) => e.obj),
  };
}
