// Ölçü biçimleme: model birimi (dosyadan ya da kullanıcı seçimi) → gösterim birimi (Ayarlar › Görüntüleyici).
// Model birimi bilinmiyorsa sayı birimsiz gösterilir ("birim"). Sayılar arayüz dilinin biçimiyle (ondalık ayırıcı).
/* global LANG, t */

export const UNIT_M = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };
const LABEL = { mm: 'mm', cm: 'cm', m: 'm', in: 'in', ft: 'ft' };
export const unitLabel = (u) => LABEL[u] || u;

const nf = (digits) => new Intl.NumberFormat(typeof LANG !== 'undefined' ? LANG : 'en', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
// Büyüklüğe göre anlamlı basamak: 1234.5 → 1234.5, 0.012345 → 0.01235
function smart(v) {
  const a = Math.abs(v);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6;
  return nf(d).format(v);
}

function convert(v, src, dst, power = 1) {
  if (!src || !dst || src === dst || !UNIT_M[src] || !UNIT_M[dst]) return v;
  return v * Math.pow(UNIT_M[src] / UNIT_M[dst], power);
}

export function formatLength(v, src, dst) {
  const u = dst && src ? dst : src;
  const val = convert(v, src, dst);
  return u ? `${smart(val)} ${unitLabel(u)}` : smart(val);
}
// Üç boyut tek birimle: "200 × 150 × 84 mm"
export function formatDims(dims, src, dst) {
  const u = dst && src ? dst : src;
  const txt = dims.map((v) => smart(convert(v, src, dst))).join(' × ');
  return u ? `${txt} ${unitLabel(u)}` : txt;
}
export function formatArea(v, src, dst) {
  const u = dst && src ? dst : src;
  const val = convert(v, src, dst, 2);
  return u ? `${smart(val)} ${unitLabel(u)}²` : `${smart(val)} ²`;
}
export function formatVolume(v, src, dst) {
  const u = dst && src ? dst : src;
  const val = convert(v, src, dst, 3);
  return u ? `${smart(val)} ${unitLabel(u)}³` : `${smart(val)} ³`;
}
export const formatInt = (n) => nf(0).format(Math.round(n || 0));
export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${nf(i ? 1 : 0).format(v)} ${u[i]}`;
}
