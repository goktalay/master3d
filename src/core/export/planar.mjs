// Düzlemsel yüz birleştirme (STEP dışa aktarımı için). Üçgen ağdaki aynı düzlemdeki (açı ve uzaklık toleransı içinde)
// komşu üçgenler tek bir çokgen yüzde toplanır; yüzün dış sınırı ve delikleri (iç sınırlar) çıkarılır, sınırlar üzerindeki
// doğrusal ara köşeler atılır. Böylece CAD programında düz bir yüzey yüzlerce üçgen yerine tek bir yüz olarak açılır.
//
// Tutarlılık kuralları (dosyanın CAD'de "dikilebilir" kalması için):
// - İki yüzün ortak kenar zinciri her iki tarafta da AYNI köşelerle sadeleştirilir: zincir köşe kimliklerine göre tek bir
//   kanonik yönde sadeleştirilir (Douglas-Peucker), sonra her yüze kendi yönünde geri verilir.
// - Köşe noktaları (üç ya da daha çok yüzün buluştuğu, açık kenarın başladığı, tek noktada değen) hiç atılmaz.
// - Köşeler yerinden oynatılmaz; yalnız atılır. Yüzün düzlemi alan ağırlıklı ortalama normaldir.
//
// Girdi: P (Float64Array, köşe koordinatları x,y,z), tris (Uint32Array, kaynaştırılmış köşe kimlikleri, 3'er),
//        { angle: derece, dist: uzunluk birimi }
// Çıktı: [{ normal: [x,y,z], origin: düzlem noktası, deviation: köşelerin düzlemden en büyük uzaklığı,
//          loops: [[köşe kimlikleri…] (dış, saat yönü tersine), [delik…] …] }]

export function mergePlanar(P, tris, { angle = 1, dist = 1e-6 } = {}) {
  const T = tris.length / 3;
  const nv = P.length / 3;
  const cosA = Math.cos((Math.max(0, angle) * Math.PI) / 180);
  // Üçgen normalleri ve alanları
  const N = new Float64Array(T * 3);
  const area = new Float64Array(T);
  for (let t = 0; t < T; t++) {
    const a = tris[t * 3] * 3, b = tris[t * 3 + 1] * 3, c = tris[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    area[t] = l / 2;
    if (l > 0) { N[t * 3] = nx / l; N[t * 3 + 1] = ny / l; N[t * 3 + 2] = nz / l; }
  }
  // Yönlü kenar → yarım kenar (t*3+k). Aynı yönlü kenar iki kez görülürse (manifold olmayan) ikisi de ikizsiz sayılır.
  const key = (a, b) => a * nv + b;
  const dir = new Map();
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < 3; k++) {
      const kk = key(tris[t * 3 + k], tris[t * 3 + ((k + 1) % 3)]);
      dir.set(kk, dir.has(kk) ? -1 : t * 3 + k);
    }
  }
  // İkiz yarım kenar (yoksa -1). Bir kenarı ikiden çok üçgen paylaşıyorsa ikiz yok sayılır.
  const undirected = new Map();
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tris[t * 3 + k], b = tris[t * 3 + ((k + 1) % 3)];
      const u = a < b ? key(a, b) : key(b, a);
      undirected.set(u, (undirected.get(u) || 0) + 1);
    }
  }
  const twin = new Int32Array(T * 3).fill(-1);
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tris[t * 3 + k], b = tris[t * 3 + ((k + 1) % 3)];
      if (undirected.get(a < b ? key(a, b) : key(b, a)) !== 2) continue;
      const h = dir.get(key(b, a));
      if (h !== undefined && h >= 0 && dir.get(key(a, b)) >= 0) twin[t * 3 + k] = h;
    }
  }

  // Bölge büyütme: büyük üçgenler önce tohum olur (geniş düz yüzün düzlemi en güvenilir üçgenden alınır)
  const region = new Int32Array(T).fill(-1);
  const order = Array.from({ length: T }, (_, i) => i).sort((x, y) => area[y] - area[x]);
  const regions = [];
  const stack = [];
  const fits = (t, nx, ny, nz, px, py, pz) => {
    if (N[t * 3] * nx + N[t * 3 + 1] * ny + N[t * 3 + 2] * nz < cosA) return false;
    for (let k = 0; k < 3; k++) {
      const v = tris[t * 3 + k] * 3;
      if (Math.abs((P[v] - px) * nx + (P[v + 1] - py) * ny + (P[v + 2] - pz) * nz) > dist) return false;
    }
    return true;
  };
  for (const s of order) {
    if (region[s] >= 0) continue;
    const r = regions.length;
    const nx = N[s * 3], ny = N[s * 3 + 1], nz = N[s * 3 + 2];
    const p0 = tris[s * 3] * 3;
    const px = P[p0], py = P[p0 + 1], pz = P[p0 + 2];
    const list = [s];
    region[s] = r;
    // Alansız üçgen (normal yok) kendi başına kalır
    if (area[s] > 0) {
      stack.length = 0; stack.push(s);
      while (stack.length) {
        const t = stack.pop();
        for (let k = 0; k < 3; k++) {
          const h = twin[t * 3 + k];
          if (h < 0) continue;
          const u = (h / 3) | 0;
          if (region[u] >= 0 || area[u] <= 0 || !fits(u, nx, ny, nz, px, py, pz)) continue;
          region[u] = r; list.push(u); stack.push(u);
        }
      }
    }
    regions.push(list);
  }

  // Her köşenin değdiği bölgeler (köşe noktası tespiti için)
  const vregA = new Int32Array(nv).fill(-1), vregB = new Int32Array(nv).fill(-1), vregMany = new Uint8Array(nv);
  for (let t = 0; t < T; t++) {
    const r = region[t];
    for (let k = 0; k < 3; k++) {
      const v = tris[t * 3 + k];
      if (vregA[v] === -1 || vregA[v] === r) vregA[v] = r;
      else if (vregB[v] === -1 || vregB[v] === r) vregB[v] = r;
      else vregMany[v] = 1;
    }
  }
  const otherOf = (h) => (twin[h] < 0 ? -1 : region[(twin[h] / 3) | 0]);

  // Bölge sınır döngüleri (iç taraf solda). Bir köşeden birden çok sınır kenarı çıkıyorsa (tek noktada değme) gelen
  // kenarın tersinden saat yönünde ilk kenar seçilir: her döngü basit kalır.
  const faces = [];
  const chainCache = new Map();
  const loopsOf = (r) => {
    const out = new Map(); // başlangıç köşesi → yarım kenarlar
    let any = false;
    for (const t of regions[r]) {
      for (let k = 0; k < 3; k++) {
        const h = t * 3 + k;
        if (twin[h] >= 0 && region[(twin[h] / 3) | 0] === r) continue;
        const a = tris[h];
        if (!out.has(a)) out.set(a, []);
        out.get(a).push(h);
        any = true;
      }
    }
    if (!any) return { loops: [], out };
    const used = new Set();
    const loops = [];
    const nr = regionNormal(r);
    for (const list of out.values()) {
      for (const h0 of list) {
        if (used.has(h0)) continue;
        const loop = [];
        let h = h0;
        let guard = 0;
        while (h !== undefined && !used.has(h) && guard++ < 1e7) {
          used.add(h);
          loop.push(h);
          const t = (h / 3) | 0, k = h % 3;
          const a = tris[h], b = tris[t * 3 + ((k + 1) % 3)];
          const cand = (out.get(b) || []).filter((x) => !used.has(x) || x === h0);
          if (!cand.length) break;
          if (cand.length === 1) { h = cand[0] === h0 ? undefined : cand[0]; continue; }
          // -gelen yön; adaylar arasında saat yönünde en küçük açı
          const ix = P[a * 3] - P[b * 3], iy = P[a * 3 + 1] - P[b * 3 + 1], iz = P[a * 3 + 2] - P[b * 3 + 2];
          let best = null, bestAng = Infinity;
          for (const c of cand) {
            const ct = (c / 3) | 0, ck = c % 3;
            const e = tris[ct * 3 + ((ck + 1) % 3)];
            const wx = P[e * 3] - P[b * 3], wy = P[e * 3 + 1] - P[b * 3 + 1], wz = P[e * 3 + 2] - P[b * 3 + 2];
            const cx = iy * wz - iz * wy, cy = iz * wx - ix * wz, cz = ix * wy - iy * wx;
            const ccw = Math.atan2(cx * nr[0] + cy * nr[1] + cz * nr[2], ix * wx + iy * wy + iz * wz);
            let cw = -ccw; if (cw <= 1e-12) cw += 2 * Math.PI;
            if (cw < bestAng) { bestAng = cw; best = c; }
          }
          h = best === h0 ? undefined : best;
        }
        if (loop.length >= 3) loops.push(loop);
      }
    }
    return { loops, out };
  };
  const nCache = new Map();
  function regionNormal(r) {
    if (nCache.has(r)) return nCache.get(r);
    let x = 0, y = 0, z = 0;
    for (const t of regions[r]) { x += N[t * 3] * area[t]; y += N[t * 3 + 1] * area[t]; z += N[t * 3 + 2] * area[t]; }
    const l = Math.hypot(x, y, z) || 1;
    const n = [x / l, y / l, z / l];
    nCache.set(r, n);
    return n;
  }

  // Zincir sadeleştirme (Douglas-Peucker, kanonik yönde) — iki komşu yüz aynı sonucu alır
  const segDist = (v, a, b) => {
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const dx = P[b * 3] - ax, dy = P[b * 3 + 1] - ay, dz = P[b * 3 + 2] - az;
    const px = P[v * 3] - ax, py = P[v * 3 + 1] - ay, pz = P[v * 3 + 2] - az;
    const L = dx * dx + dy * dy + dz * dz;
    let s = L > 0 ? (px * dx + py * dy + pz * dz) / L : 0;
    s = Math.max(0, Math.min(1, s));
    return Math.hypot(px - s * dx, py - s * dy, pz - s * dz);
  };
  const dp = (seq, i0, i1, keep) => {
    if (i1 - i0 < 2) return;
    let best = -1, bd = -1;
    for (let i = i0 + 1; i < i1; i++) { const d = segDist(seq[i], seq[i0], seq[i1]); if (d > bd) { bd = d; best = i; } }
    if (bd > dist) { keep[best] = 1; dp(seq, i0, best, keep); dp(seq, best, i1, keep); }
  };
  const simplifyOpen = (seq) => {
    const rev = seq[0] > seq[seq.length - 1] || (seq[0] === seq[seq.length - 1] && seq.length > 2 && seq[1] > seq[seq.length - 2]);
    const s = rev ? seq.slice().reverse() : seq;
    const ck = s.join(',');
    let res = chainCache.get(ck);
    if (!res) {
      const keep = new Uint8Array(s.length); keep[0] = 1; keep[s.length - 1] = 1;
      if (s[0] === s[s.length - 1]) {
        // Uçları aynı zincir: en uzak nokta da tutulur
        let f = 1, fd = -1;
        for (let i = 1; i < s.length - 1; i++) { const d = segDist(s[i], s[0], s[0]); if (d > fd) { fd = d; f = i; } }
        keep[f] = 1; dp(s, 0, f, keep); dp(s, f, s.length - 1, keep);
      } else dp(s, 0, s.length - 1, keep);
      res = s.filter((_, i) => keep[i]);
      chainCache.set(ck, res);
    }
    return rev ? res.slice().reverse() : res;
  };

  for (let r = 0; r < regions.length; r++) {
    const { loops, out } = loopsOf(r);
    if (!loops.length) continue;
    const n = regionNormal(r);
    const simple = [];
    for (const loop of loops) {
      const L = loop.length;
      const vs = loop.map((h) => tris[h]);
      // Köşe noktası: gelen/giden kenarın karşı bölgesi farklı, köşe başka bir bölgeye de değiyor ya da tek noktada değme
      const corner = new Uint8Array(L);
      let nc = 0;
      for (let i = 0; i < L; i++) {
        const hin = loop[(i - 1 + L) % L], hout = loop[i];
        const oi = otherOf(hin), oo = otherOf(hout);
        const v = vs[i];
        let c = oi !== oo || vregMany[v] || (out.get(v) || []).length > 1;
        if (!c) {
          const A = vregA[v], B = vregB[v];
          const okSet = (x) => x === -1 || x === r || (oo >= 0 && x === oo);
          if (!okSet(A) || !okSet(B)) c = true;
          // Açık kenar (karşı bölge yok) üzerindeki köşe yalnız bu bölgeye değiyorsa atılabilir
          if (oo < 0 && ((A !== -1 && A !== r) || (B !== -1 && B !== r))) c = true;
        }
        if (c) { corner[i] = 1; nc++; }
      }
      let res;
      if (!nc) {
        // Köşesiz kapalı döngü (ör. düz yüzdeki dairesel delik): en küçük kimlikten, kanonik yönde
        let m = 0;
        for (let i = 1; i < L; i++) if (vs[i] < vs[m]) m = i;
        const fwd = vs[(m + 1) % L] < vs[(m - 1 + L) % L];
        const seq = [];
        for (let i = 0; i <= L; i++) seq.push(vs[(m + (fwd ? i : -i) + L * 2) % L]);
        let s = simplifyOpen(seq);
        if (s.length < 4) {
          // En az üçgen kalsın: üçte birlik noktalar zorla tutulur (iki tarafta da aynı)
          const k1 = seq[Math.floor(L / 3)], k2 = seq[Math.floor((2 * L) / 3)];
          s = seq.filter((v, i) => i === 0 || i === L || v === k1 || v === k2 || s.includes(v));
        }
        s = s.slice(0, -1);
        res = fwd ? s : [s[0], ...s.slice(1).reverse()];
      } else {
        // Köşeden başlat, köşeler arası zincirleri sadeleştir
        let st = 0; while (!corner[st]) st++;
        res = [];
        let i = st;
        do {
          let j = (i + 1) % L;
          const seq = [vs[i]];
          while (!corner[j]) { seq.push(vs[j]); j = (j + 1) % L; }
          seq.push(vs[j]);
          const s = simplifyOpen(seq);
          for (let q = 0; q < s.length - 1; q++) res.push(s[q]);
          i = j;
        } while (i !== st);
      }
      if (res.length >= 3) simple.push(res);
    }
    if (!simple.length) continue;
    // Dış ve iç sınırlar: normale göre işaretli alan (artı = dış)
    const sArea = (loop) => {
      let x = 0, y = 0, z = 0;
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i] * 3, b = loop[(i + 1) % loop.length] * 3;
        x += (P[a + 1] - P[b + 1]) * (P[a + 2] + P[b + 2]);
        y += (P[a + 2] - P[b + 2]) * (P[a] + P[b]);
        z += (P[a] - P[b]) * (P[a + 1] + P[b + 1]);
      }
      return (x * n[0] + y * n[1] + z * n[2]) / 2;
    };
    const outer = [], holes = [];
    for (const l of simple) (sArea(l) > 0 ? outer : holes).push(l);
    if (!outer.length) {
      // Normal ile döngü yönü uyuşmuyor (çok kıvrık bölge): her döngü tek başına yüz olur
      for (const l of simple) faces.push({ normal: n, loops: [l] });
      continue;
    }
    if (outer.length === 1) { faces.push({ normal: n, loops: [outer[0], ...holes] }); continue; }
    // Birden çok dış sınır: her delik onu içeren dış sınıra
    const groups = outer.map((o) => ({ normal: n, loops: [o] }));
    const proj = projector(n);
    for (const hl of holes) {
      const p = proj(hl[0]);
      const g = groups.find((gr) => inPoly(p, gr.loops[0].map(proj))) || groups[0];
      g.loops.push(hl);
    }
    faces.push(...groups);
  }
  // Düzlemin konumu: köşelerin normal boyunca en küçük ve en büyük uzaklığının ortası (en büyük sapma yarıya iner)
  for (const f of faces) {
    const n = f.normal, v0 = f.loops[0][0] * 3;
    let lo = Infinity, hi = -Infinity;
    for (const l of f.loops) for (const v of l) {
      const d = (P[v * 3] - P[v0]) * n[0] + (P[v * 3 + 1] - P[v0 + 1]) * n[1] + (P[v * 3 + 2] - P[v0 + 2]) * n[2];
      if (d < lo) lo = d; if (d > hi) hi = d;
    }
    const k = (lo + hi) / 2;
    f.origin = [P[v0] + k * n[0], P[v0 + 1] + k * n[1], P[v0 + 2] + k * n[2]];
    f.deviation = (hi - lo) / 2;
  }
  faces.triRegion = region; // üçgen → bölge (inceleme ve test için)
  return faces;

  function projector(n) {
    const ax = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = [n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0]];
    const ul = Math.hypot(...u); u[0] /= ul; u[1] /= ul; u[2] /= ul;
    const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    return (v) => [P[v * 3] * u[0] + P[v * 3 + 1] * u[1] + P[v * 3 + 2] * u[2], P[v * 3] * w[0] + P[v * 3 + 1] * w[1] + P[v * 3 + 2] * w[2]];
  }
}

function inPoly([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Ayar yüzdesi (0–100) → toleranslar. 0: birleştirme yok (her üçgen ayrı yüz, önceki davranış).
// Açı 0,5°'den 20°'ye; uzaklık parça köşegeninin %0,01'inden %0,5'ine (karesel: düşük yüzdelerde ince ayar).
export function mergeTolerance(percent, diag) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
  if (p <= 0) return null;
  return { angle: 0.5 + 19.5 * p * p, dist: Math.max(diag * 1e-7, diag * (0.0001 + 0.0049 * p * p)) };
}
