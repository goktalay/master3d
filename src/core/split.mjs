// Bağlantısız parçalara ayırma: tek bir ağdaki (STL gibi montaj bilgisi olmayan dosyalar) birbirine dokunmayan
// gövdeleri bulur. Köşeler konuma göre kaynaştırılır (dosyalarda aynı nokta çoğu kez ayrı köşe olarak tekrar eder),
// üçgenler ortak köşe üzerinden birleşim-bul (union-find) ile öbeklenir. Saf işlev: çalışan iş parçacığında ve testte.

// position: Float32Array (x y z ...), index: Uint32Array | null (null = her 3 köşe bir üçgen)
// eps: kaynaştırma toleransı (model boyutuna göre; 0 = birebir aynı konum)
// Dönüş: { count, tri: Int32Array (üçgen → öbek no, büyükten küçüğe sıralı), sizes: [üçgen sayısı] }
export function componentsOf(position, index, eps = 0) {
  const vCount = position.length / 3;
  const triCount = index ? Math.floor(index.length / 3) : Math.floor(vCount / 3);
  // 1) Köşe kaynaştırma: ızgara anahtarı → temsilci köşe
  const weld = new Int32Array(vCount);
  const inv = eps > 0 ? 1 / eps : 0;
  const map = new Map();
  for (let i = 0; i < vCount; i++) {
    const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
    const key = inv ? `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}` : `${x},${y},${z}`;
    const hit = map.get(key);
    if (hit === undefined) { map.set(key, i); weld[i] = i; } else weld[i] = hit;
  }
  // 2) Birleşim-bul (yol sıkıştırma + boyuta göre birleşim)
  const parent = new Int32Array(vCount);
  const rank = new Uint8Array(vCount);
  for (let i = 0; i < vCount; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => {
    a = find(a); b = find(b);
    if (a === b) return;
    if (rank[a] < rank[b]) { const t = a; a = b; b = t; }
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a]++;
  };
  const vi = (t, k) => weld[index ? index[t * 3 + k] : t * 3 + k];
  for (let t = 0; t < triCount; t++) { const a = vi(t, 0); union(a, vi(t, 1)); union(a, vi(t, 2)); }
  // 3) Üçgen → öbek; öbekler üçgen sayısına göre büyükten küçüğe numaralanır
  const rootOf = new Int32Array(triCount);
  const counts = new Map();
  for (let t = 0; t < triCount; t++) { const r = find(vi(t, 0)); rootOf[t] = r; counts.set(r, (counts.get(r) || 0) + 1); }
  const order = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const num = new Map(order.map(([r], i) => [r, i]));
  const tri = new Int32Array(triCount);
  for (let t = 0; t < triCount; t++) tri[t] = num.get(rootOf[t]);
  return { count: order.length, tri, sizes: order.map(([, c]) => c) };
}
