// 3B görüntüleyici: three.js sahnesi, kamera ve gezinme, ışık ortamı, zemin ızgarası ve gölge, görünüm kipleri
// (gölgeli · kenarlı · tel kafes · X-ışını · normaller), seçim vurgusu, sınır kutusu ve ölçüleri, iki nokta arası ölçüm,
// kesit düzlemi, animasyon oynatma ve ekran görüntüsü. Yalnız gerektiğinde çizer (hareket yokken GPU boşta).
//
// Model ağacı dokunulmadan "display" adlı bir sarmalayıcının içine konur: yukarı ekseni (Z → Y) ve zemine oturtma
// sarmalayıcıda yapılır; dışa aktarma modelin kendi koordinatlarını kullanır.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VertexNormalsHelper } from 'three/addons/helpers/VertexNormalsHelper.js';
import { worldBox, isRenderable, isShown, sceneStats } from '../../core/scene.mjs';

const ACCENT = new THREE.Color(0x22d3ee);
const EDGE_LIMIT_TRIS = 2_500_000;
const SHADOW_LIMIT_TRIS = 4_000_000;

export function createViewer(container, { onPick, onChange, onHover } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'viewport';
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', logarithmicDepthBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const persp = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
  let camera = persp;
  persp.position.set(3, 2, 4);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = true;

  // Işıklar
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.6);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  const head = new THREE.DirectionalLight(0xffffff, 1.2);
  const amb = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(hemi, key, key.target, amb);
  camera.add(head);
  scene.add(persp, ortho);
  head.position.set(0.3, 0.4, 1);

  // Zemin: ızgara + gölge alıcı
  const ground = new THREE.Group();
  ground.name = 'ground';
  scene.add(ground);
  let grid = null;
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22, depthWrite: false }));
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  shadowPlane.renderOrder = -1;
  ground.add(shadowPlane);
  const axes = new THREE.AxesHelper(1);
  axes.visible = false;
  scene.add(axes);

  const display = new THREE.Group();
  display.name = 'display';
  scene.add(display);
  const overlay = new THREE.Group(); // ölçüm çizgileri, sınır kutusu, normal yardımcıları
  overlay.name = 'overlay';
  scene.add(overlay);

  let model = null;           // dosyadan gelen içerik kökü
  let meta = {};
  let opts = { mode: 'shaded', grid: true, axes: false, shadows: true, edges: false, bbox: false, lighting: 'studio', projection: 'perspective', autoRotate: false, theme: 'dark', invertZoom: false };
  let size = new THREE.Vector3(1, 1, 1);
  let radius = 1;
  let dirty = true;
  let mixer = null, action = null, clock = new THREE.Clock(), playing = false;
  const selected = new Set();
  let ghostOthers = false;
  const matCache = new Map();
  const edgesBuilt = new WeakSet();
  let bboxHelper = null;
  let normalsHelpers = [];
  let clip = { axis: null, pos: 0.5, flip: false };
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  let measure = { active: false, points: [], group: new THREE.Group() };
  overlay.add(measure.group);
  const labels = [];          // { el, pos: Vector3 (dünya) } — ekran üstü HTML etiketleri
  const labelLayer = document.createElement('div');
  labelLayer.className = 'vp-labels';
  container.appendChild(labelLayer);

  const invalidate = () => { dirty = true; };
  controls.addEventListener('change', () => { invalidate(); onChange && onChange('camera'); });

  // --- Boyut ------------------------------------------------------------------------------------------------
  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
    fitOrtho();
    invalidate();
  }
  function fitOrtho() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    const d = camera === ortho ? ortho.userData.span || radius * 2.2 : radius * 2.2;
    ortho.left = (-d * w) / h / 2; ortho.right = (d * w) / h / 2; ortho.top = d / 2; ortho.bottom = -d / 2;
    ortho.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // --- Döngü ------------------------------------------------------------------------------------------------
  let raf = 0;
  const stats = { frames: 0, lastMs: 0 }; // tanılama: çizilen kare sayısı ve son karenin süresi
  function loop() {
    raf = requestAnimationFrame(loop);
    const moved = controls.update();
    if (playing && mixer) { mixer.update(clock.getDelta()); dirty = true; onChange && onChange('time'); }
    if (moved) dirty = true;
    if (!dirty) return;
    dirty = false;
    const t0 = performance.now();
    renderer.render(scene, camera);
    placeLabels();
    stats.frames++; stats.lastMs = performance.now() - t0;
  }
  loop();

  // --- Model ------------------------------------------------------------------------------------------------
  function clearModel() {
    stopAnimation();
    clearMeasure();
    clearNormals();
    if (bboxHelper) { overlay.remove(bboxHelper); bboxHelper = null; }
    if (model) {
      display.remove(model);
      disposeTree(model);
    }
    model = null;
    selected.clear();
    matCache.clear();
    display.rotation.set(0, 0, 0);
    display.position.set(0, 0, 0);
    setClip(null);
    invalidate();
  }

  function setModel(root, info = {}) {
    clearModel();
    model = root;
    meta = info;
    display.add(model);
    // Animasyonlu modellerde yerleşim ve kadraj ilk kareye göre (BVH gibi kök hareketi taşıyan kliplerde model
    // dinlenme pozundan uzakta olabilir)
    if (info.animations && info.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      action = mixer.clipAction(info.animations[0]);
      action.play();
      mixer.update(0);
      model.updateMatrixWorld(true);
    }
    applyUpAxis(info.upAxis || 'y');
    root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
      if (o.isPoints || o.isLine) o.castShadow = false;
    });
    const stats = sceneStats(root);
    key.castShadow = stats.triangles < SHADOW_LIMIT_TRIS;
    refreshMaterials();
    frame();
    invalidate();
    return stats;
  }

  // Yukarı ekseni ve zemine oturtma (sarmalayıcıda). Patlatma değiştikten sonra çağrılmaz (model zıplamasın).
  function applyUpAxis(up) {
    meta.upAxis = up;
    display.rotation.set(up === 'z' ? -Math.PI / 2 : 0, 0, 0);
    display.position.set(0, 0, 0);
    display.updateMatrixWorld(true);
    let box = worldBox(display);
    if (box.isEmpty()) box = worldBox(display, { onlyVisible: false });
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    display.position.set(-c.x, -box.min.y, -c.z);
    display.updateMatrixWorld(true);
    layoutGround();
    invalidate();
  }

  // Patlatmada parçalar zeminin altına inebilir: zemin (ızgara + gölge) görünen kutunun tabanını izler; kamera ve
  // ışık yerleşimi değişmez
  function followGround() {
    const box = worldBox(display);
    if (box.isEmpty()) return;
    ground.position.y = box.min.y - radius * 0.002;
    axes.position.y = ground.position.y;
    invalidate();
  }

  function layoutGround() {
    let box = worldBox(display);
    if (box.isEmpty()) box = worldBox(display, { onlyVisible: false });
    if (box.isEmpty()) return;
    box.getSize(size);
    radius = Math.max(size.length() / 2, 1e-6);
    // Izgara: modelin taban boyutunun iki katına yakın "güzel" bir sayı
    const span = Math.max(size.x, size.z, size.y * 0.5) * 2.2;
    const step = Math.pow(10, Math.floor(Math.log10(span / 10)));
    const cells = Math.max(10, Math.ceil(span / step / 2) * 2);
    if (grid) { ground.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    const dark = opts.theme !== 'light';
    grid = new THREE.GridHelper(cells * step, cells, dark ? 0x3a4a66 : 0xb7c3d4, dark ? 0x1f2a3d : 0xdbe2ec);
    grid.material.transparent = true;
    grid.material.opacity = 0.9;
    grid.material.depthWrite = false;
    grid.userData.step = step;
    grid.visible = opts.grid;
    ground.add(grid);
    shadowPlane.scale.set(cells * step, cells * step, 1);
    shadowPlane.visible = opts.shadows && key.castShadow;
    const c = box.getCenter(new THREE.Vector3());
    ground.position.set(c.x, box.min.y - radius * 0.002, c.z);
    axes.scale.setScalar(radius * 0.6);
    axes.position.copy(ground.position);
    // Gölge kamerası modeli kapsasın
    key.position.copy(c).add(new THREE.Vector3(radius * 1.2, radius * 2.2, radius * 1.6));
    key.target.position.copy(c);
    const sc = key.shadow.camera;
    sc.left = -radius * 1.6; sc.right = radius * 1.6; sc.top = radius * 1.6; sc.bottom = -radius * 1.6;
    sc.near = radius * 0.05; sc.far = radius * 8;
    sc.updateProjectionMatrix();
    persp.near = Math.max(radius / 1000, 1e-5);
    persp.far = radius * 200;
    persp.updateProjectionMatrix();
    controls.maxDistance = radius * 60;
    applyLighting();
  }

  // --- Kamera -----------------------------------------------------------------------------------------------
  const VIEWS = {
    front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0.0001], bottom: [0, -1, 0.0001], iso: [1, 0.8, 1.2],
  };
  function frame(view = 'iso', target = null, animate = false) {
    const box = target ? worldBox(target) : worldBox(display);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-6);
    const dir = new THREE.Vector3(...(VIEWS[view] || VIEWS.iso)).normalize();
    // Sınır küresi hem dikey hem yatay görüş açısına sığsın (kenarlarda pay bırakılır)
    const vfov = THREE.MathUtils.degToRad(persp.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * Math.max(persp.aspect, 1e-3));
    const dist = (r / Math.sin(Math.min(vfov, hfov) / 2)) * 1.12;
    const to = { pos: c.clone().addScaledVector(dir, dist), target: c };
    ortho.userData.span = (r * 2.3) / Math.min(1, Math.max(persp.aspect, 1e-3));
    if (animate) tweenCamera(to); else { camera.position.copy(to.pos); controls.target.copy(to.target); syncOrtho(); }
    fitOrtho();
    controls.update();
    invalidate();
  }
  let tween = null;
  function tweenCamera(to) {
    const from = { pos: camera.position.clone(), target: controls.target.clone() };
    const t0 = performance.now();
    cancelAnimationFrame(tween);
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 380);
      const e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(from.pos, to.pos, e);
      controls.target.lerpVectors(from.target, to.target, e);
      syncOrtho();
      controls.update();
      invalidate();
      if (k < 1) tween = requestAnimationFrame(step);
    };
    step();
  }
  function syncOrtho() {
    if (camera === ortho) { ortho.lookAt(controls.target); }
  }
  function setProjection(p) {
    opts.projection = p;
    const next = p === 'orthographic' ? ortho : persp;
    if (next === camera) return;
    next.position.copy(camera.position);
    next.quaternion.copy(camera.quaternion);
    if (next === ortho) {
      // Perspektifteki görünür yükseklik ortografik genişliğe çevrilir
      const dist = camera.position.distanceTo(controls.target);
      ortho.userData.span = 2 * dist * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
      ortho.zoom = 1;
    } else {
      const span = (ortho.userData.span || radius * 2) / ortho.zoom;
      const dist = span / 2 / Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
      const dir = camera.position.clone().sub(controls.target).normalize();
      next.position.copy(controls.target).addScaledVector(dir, dist);
    }
    camera.remove(head);
    camera = next;
    camera.add(head);
    controls.object = camera;
    fitOrtho();
    controls.update();
    invalidate();
  }

  // --- Işık ve görünüm ---------------------------------------------------------------------------------------
  function applyLighting() {
    const L = opts.lighting;
    scene.environment = L === 'headlight' ? null : envTex;
    scene.environmentIntensity = L === 'soft' ? 1.0 : L === 'studio' ? 0.45 : 0;
    hemi.intensity = L === 'soft' ? 0.8 : L === 'studio' ? 0.35 : 0.15;
    key.intensity = L === 'studio' ? 2.4 : L === 'soft' ? 0.6 : 0;
    key.visible = L !== 'headlight';
    head.intensity = L === 'headlight' ? 2.2 : 0;
    amb.intensity = L === 'headlight' ? 0.55 : 0.12;
    shadowPlane.visible = opts.shadows && key.castShadow && key.visible;
    invalidate();
  }

  function set(patch) {
    Object.assign(opts, patch);
    if ('grid' in patch && grid) grid.visible = opts.grid;
    if ('axes' in patch) axes.visible = opts.axes;
    if ('shadows' in patch || 'lighting' in patch) applyLighting();
    if ('theme' in patch) layoutGround();
    if ('projection' in patch) setProjection(opts.projection);
    if ('autoRotate' in patch) { controls.autoRotate = !!opts.autoRotate; controls.autoRotateSpeed = 1.2; }
    if ('invertZoom' in patch) controls.zoomSpeed = opts.invertZoom ? -1 : 1;
    if ('mode' in patch || 'edges' in patch) refreshMaterials();
    if ('bbox' in patch) refreshBBox();
    invalidate();
  }

  // --- Malzemeler: görünüm kipi + seçim + izole (diğerleri soluk) ---------------------------------------------
  function displayMaterial(orig, mode, sel, ghost) {
    const k = `${orig.uuid}|${mode}|${sel ? 1 : 0}|${ghost ? 1 : 0}`;
    let m = matCache.get(k);
    if (m) return m;
    if (mode === 'normals') m = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    else {
      m = orig.clone();
      if (mode === 'wireframe' && 'wireframe' in m) m.wireframe = true;
      if (mode === 'xray') { m.transparent = true; m.opacity = 0.22; m.depthWrite = false; }
      // Kenar çizgileri yüzeyle aynı derinlikte: yüzeyler biraz geri itilir ki çizgiler görünsün
      if (mode === 'edges') { m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1; }
    }
    if (ghost && !sel) { m.transparent = true; m.opacity = Math.min(m.opacity ?? 1, 0.12); m.depthWrite = false; }
    if (sel) {
      if (m.emissive) { m.emissive = ACCENT.clone(); m.emissiveIntensity = 0.45; }
      else if (m.color) m.color = m.color.clone().lerp(ACCENT, 0.5);
    }
    m.userData.m3display = true;
    matCache.set(k, m);
    return m;
  }

  function refreshMaterials() {
    if (!model) return;
    // Gölgeli kipte "Kenar çizgileri" açıksa malzemeler kenar kipindeki gibi
    const mode = opts.mode === 'shaded' && opts.edges ? 'edges' : opts.mode;
    const hasSel = selected.size > 0;
    const selMeshes = new Set();
    for (const s of selected) s.traverse((o) => selMeshes.add(o));
    model.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine) || o.userData.m3overlay || o.userData.m3helper) return;
      const orig = o.userData.m3mat || o.material;
      const sel = selMeshes.has(o);
      const ghost = ghostOthers && hasSel && !sel;
      const plain = mode === 'shaded' || !o.isMesh;
      if (plain && !sel && !ghost) {
        if (o.userData.m3mat) { o.material = o.userData.m3mat; delete o.userData.m3mat; }
      } else {
        o.userData.m3mat = orig;
        o.material = Array.isArray(orig) ? orig.map((m) => displayMaterial(m, o.isMesh ? mode : 'shaded', sel, ghost)) : displayMaterial(orig, o.isMesh ? mode : 'shaded', sel, ghost);
      }
      applyClipTo(o);
    });
    refreshEdges();
    invalidate();
  }

  // Kenar çizgileri: 25°'den keskin kenarlar (CAD görünümü); büyük modellerde sınırlı
  function refreshEdges() {
    if (!model) return;
    const want = opts.mode === 'edges' || opts.edges;
    let total = 0;
    if (want) model.traverse((o) => { if (o.isMesh && !o.userData.m3overlay) total += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3; });
    const allow = want && total <= EDGE_LIMIT_TRIS;
    model.traverse((o) => {
      if (!o.isMesh || o.userData.m3overlay || o.userData.m3helper) return;
      let e = o.children.find((c) => c.userData.m3overlay === 'edges');
      if (allow && !e && !edgesBuilt.has(o)) {
        edgesBuilt.add(o);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x0b0f17, transparent: true, opacity: 0.8, depthTest: true });
        e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), lineMat);
        e.userData.m3overlay = 'edges';
        e.raycast = () => {};
        o.add(e);
      }
      if (e) e.visible = allow;
    });
    if (want && !allow && onChange) onChange('edgesLimit');
    invalidate();
  }

  // --- Seçim ----------------------------------------------------------------------------------------------------
  function select(list, { ghost = false } = {}) {
    selected.clear();
    for (const o of list || []) if (o) selected.add(o);
    ghostOthers = ghost;
    refreshMaterials();
    refreshNormalsHelpers();
  }
  const getSelection = () => [...selected];

  // Tıklama ile seçim (sürükleme sayılmaz)
  const ray = new THREE.Raycaster();
  ray.params.Points.threshold = 0.01;
  ray.params.Line.threshold = 0.01;
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { down = null; return; }
    const b = down.b; down = null;
    const hit = pickAt(e.clientX, e.clientY);
    if (measure.active && b === 0) { if (hit) addMeasurePoint(hit.point); return; }
    onPick && onPick(hit ? hit.object : null, { event: e, button: b, point: hit ? hit.point : null });
  });
  canvas.addEventListener('dblclick', (e) => {
    const hit = pickAt(e.clientX, e.clientY);
    if (hit) frame(currentViewDir(), hit.object, true); else frame(currentViewDir(), null, true);
  });
  function pickAt(x, y) {
    if (!model) return null;
    const r = canvas.getBoundingClientRect();
    const p = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, camera);
    ray.params.Points.threshold = radius / 200;
    ray.params.Line.threshold = radius / 300;
    const hits = ray.intersectObject(model, true).filter((h) => isRenderable(h.object) && !h.object.userData.m3overlay && isShown(h.object) && passesClip(h.point));
    return hits[0] || null;
  }
  const passesClip = (p) => !clip.axis || clipPlane.distanceToPoint(p) >= 0;
  function currentViewDir() {
    const d = camera.position.clone().sub(controls.target).normalize();
    let best = 'iso', bd = -2;
    for (const [k, v] of Object.entries(VIEWS)) { const s = new THREE.Vector3(...v).normalize().dot(d); if (s > bd) { bd = s; best = k; } }
    return bd > 0.995 ? best : 'iso';
  }

  // --- Sınır kutusu ve ölçüler -------------------------------------------------------------------------------------
  function refreshBBox() {
    if (bboxHelper) { overlay.remove(bboxHelper); bboxHelper.geometry.dispose(); bboxHelper = null; }
    clearLabels('bbox');
    if (!opts.bbox || !model) { invalidate(); return; }
    const target = selected.size ? [...selected][0] : display;
    const box = worldBox(target);
    if (box.isEmpty()) return;
    bboxHelper = new THREE.Box3Helper(box, ACCENT);
    bboxHelper.userData.m3helper = true;
    overlay.add(bboxHelper);
    // Ölçü etiketleri: üç kenarın ortasında, model biriminde (sarmalayıcının ölçeği yok)
    const s = box.getSize(new THREE.Vector3());
    const local = boxInModelAxes(s);
    const fmt = (v) => (opts.formatLength ? opts.formatLength(v) : v.toFixed(3));
    addLabel('bbox', new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, box.max.z), `${opts.axisNames ? opts.axisNames.x : 'X'} ${fmt(local.x)}`);
    addLabel('bbox', new THREE.Vector3(box.max.x, (box.min.y + box.max.y) / 2, box.max.z), `${opts.axisNames ? opts.axisNames.y : 'Y'} ${fmt(local.y)}`);
    addLabel('bbox', new THREE.Vector3(box.max.x, box.min.y, (box.min.z + box.max.z) / 2), `${opts.axisNames ? opts.axisNames.z : 'Z'} ${fmt(local.z)}`);
    invalidate();
  }
  // Görüntüdeki (Y yukarı) kutu boyutu → dosyanın eksenleri (Z yukarı dosyada Y ile Z yer değiştirir)
  function boxInModelAxes(s) {
    return meta.upAxis === 'z' ? { x: s.x, y: s.z, z: s.y } : { x: s.x, y: s.y, z: s.z };
  }

  function addLabel(group, pos, text, cls = '') {
    const el = document.createElement('div');
    el.className = `vp-label ${cls}`;
    el.textContent = text;
    labelLayer.appendChild(el);
    labels.push({ el, pos: pos.clone(), group });
    invalidate();
    return el;
  }
  function clearLabels(group) {
    for (let i = labels.length - 1; i >= 0; i--) if (!group || labels[i].group === group) { labels[i].el.remove(); labels.splice(i, 1); }
  }
  const tmpV = new THREE.Vector3();
  function placeLabels() {
    if (!labels.length) return;
    const w = container.clientWidth, h = container.clientHeight;
    for (const l of labels) {
      tmpV.copy(l.pos).project(camera);
      const vis = tmpV.z < 1 && tmpV.z > -1;
      l.el.style.display = vis ? '' : 'none';
      l.el.style.transform = `translate(-50%, -50%) translate(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * h}px)`;
    }
  }

  // --- Ölçüm: iki nokta arası uzaklık ---------------------------------------------------------------------------
  function setMeasure(on) {
    measure.active = !!on;
    canvas.classList.toggle('measuring', measure.active);
    if (!on) clearMeasure();
  }
  function clearMeasure() {
    measure.points = [];
    for (const c of [...measure.group.children]) { measure.group.remove(c); c.geometry && c.geometry.dispose(); }
    clearLabels('measure');
    invalidate();
  }
  function addMeasurePoint(p) {
    if (measure.points.length >= 2) clearMeasure();
    measure.points.push(p.clone());
    const dot = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.008, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfbbf24, depthTest: false }));
    dot.position.copy(p);
    dot.renderOrder = 10;
    measure.group.add(dot);
    if (measure.points.length === 2) {
      const [a, b] = measure.points;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xfbbf24, depthTest: false }));
      line.renderOrder = 10;
      measure.group.add(line);
      const d = a.distanceTo(b) / worldScale();
      const fmt = (v) => (opts.formatLength ? opts.formatLength(v) : v.toFixed(3));
      addLabel('measure', a.clone().add(b).multiplyScalar(0.5), fmt(d), 'measure');
      onChange && onChange('measure', { distance: d });
    }
    invalidate();
  }
  // Sarmalayıcıda ölçek yok; dünya uzunluğu = model uzunluğu
  const worldScale = () => 1;

  // --- Normaller (seçili parça ya da küçük modelin tümü) -----------------------------------------------------------
  function clearNormals() {
    for (const hlp of normalsHelpers) { overlay.remove(hlp); hlp.geometry.dispose(); }
    normalsHelpers = [];
  }
  function refreshNormalsHelpers() {
    clearNormals();
    if (!opts.normalHelpers || !model) { invalidate(); return; }
    const targets = selected.size ? [...selected] : [model];
    let budget = 200000;
    for (const t of targets) t.traverse((o) => {
      if (!o.isMesh || !o.geometry.getAttribute('normal') || o.userData.m3overlay) return;
      const n = o.geometry.getAttribute('position').count;
      if (n > budget) return;
      budget -= n;
      const hlp = new VertexNormalsHelper(o, radius * 0.02, 0xa855f7);
      hlp.userData.m3helper = true;
      overlay.add(hlp);
      normalsHelpers.push(hlp);
    });
    invalidate();
  }
  function setNormalHelpers(on) { opts.normalHelpers = !!on; refreshNormalsHelpers(); }

  // --- Kesit düzlemi ------------------------------------------------------------------------------------------------
  function setClip(axis, pos = clip.pos, flip = clip.flip) {
    clip = { axis, pos, flip };
    if (axis) {
      const box = worldBox(display, { onlyVisible: false });
      const ax = { x: 0, y: 1, z: 2 }[axis];
      const n = new THREE.Vector3().setComponent(ax, flip ? 1 : -1);
      const v = box.min.getComponent(ax) + (box.max.getComponent(ax) - box.min.getComponent(ax)) * pos;
      clipPlane.normal.copy(n);
      clipPlane.constant = flip ? -v : v;
    }
    if (model) model.traverse(applyClipTo);
    invalidate();
  }
  function applyClipTo(o) {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { if (!m) continue; m.clippingPlanes = clip.axis ? [clipPlane] : null; m.needsUpdate = true; }
  }

  // --- Animasyon -------------------------------------------------------------------------------------------------
  function playAnimation(i = 0) {
    if (!mixer || !meta.animations || !meta.animations[i]) return false;
    if (action) action.stop();
    action = mixer.clipAction(meta.animations[i]);
    action.reset().play();
    playing = true;
    clock.getDelta();
    invalidate();
    return true;
  }
  function pauseAnimation() { playing = false; }
  function resumeAnimation() { if (action) { playing = true; clock.getDelta(); } }
  function stopAnimation() { playing = false; if (action) action.stop(); action = null; if (mixer) mixer.stopAllAction(); mixer = mixer && model ? mixer : null; invalidate(); }
  const animationState = () => ({ playing, time: action ? action.time : 0, duration: action ? action.getClip().duration : 0 });
  function seekAnimation(t) { if (!action) return; action.time = t; mixer.update(0); invalidate(); }

  // --- Ekran görüntüsü ---------------------------------------------------------------------------------------------
  // Arka plan CSS'te olduğu için görüntü ayrı bir 2B tuvalde birleştirilir. transparent: arka plansız PNG.
  async function screenshot({ scale = 2, background = null } = {}) {
    const w = container.clientWidth, h = container.clientHeight;
    const pr = renderer.getPixelRatio();
    renderer.setPixelRatio(scale);
    renderer.setSize(w, h, false);
    renderer.render(scene, camera);
    const out = document.createElement('canvas');
    out.width = Math.round(w * scale); out.height = Math.round(h * scale);
    const ctx = out.getContext('2d');
    if (background) background(ctx, out.width, out.height);
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    // Ekran üstü ölçü etiketleri de görüntüye
    for (const l of labels) {
      if (l.el.style.display === 'none') continue;
      tmpV.copy(l.pos).project(camera);
      const x = ((tmpV.x + 1) / 2) * out.width, y = ((1 - tmpV.y) / 2) * out.height;
      ctx.font = `600 ${12 * scale}px "Segoe UI", system-ui, sans-serif`;
      const tw = ctx.measureText(l.el.textContent).width + 14 * scale;
      ctx.fillStyle = l.group === 'measure' ? 'rgba(251,191,36,.95)' : 'rgba(11,15,23,.85)';
      roundRect(ctx, x - tw / 2, y - 11 * scale, tw, 22 * scale, 11 * scale);
      ctx.fillStyle = l.group === 'measure' ? '#1a1300' : '#e6edf6';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(l.el.textContent, x, y + scale * 0.5);
    }
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    invalidate();
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
  }

  function disposeTree(root) {
    const geos = new Set(), mats = new Set(), texs = new Set();
    root.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      const list = [].concat(o.material || [], o.userData.m3mat || []);
      for (const m of list) { mats.add(m); for (const k of Object.keys(m)) if (m[k] && m[k].isTexture) texs.add(m[k]); }
    });
    for (const m of matCache.values()) mats.add(m);
    geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose());
  }

  function dispose() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    clearModel();
    renderer.dispose();
    pmrem.dispose();
  }

  return {
    renderer, scene, get camera() { return camera; }, controls, display,
    get model() { return model; }, get meta() { return meta; }, get radius() { return radius; }, get gridStep() { return grid ? grid.userData.step : 0; },
    setModel, clearModel, applyUpAxis, layoutGround, followGround, frame, set, get opts() { return opts; },
    select, getSelection, refreshMaterials, refreshBBox, setMeasure, clearMeasure, setClip, get clip() { return clip; }, setNormalHelpers,
    playAnimation, pauseAnimation, resumeAnimation, stopAnimation, seekAnimation, animationState,
    screenshot, invalidate, pickAt, renderStats: stats, currentViewDir, dispose, worldBox: () => worldBox(display),
  };
}
