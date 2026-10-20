'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { STRINGS, LANGUAGES } = require('../src/i18n');
const FORMATS = require('../src/formats');

const SRC = path.join(__dirname, '..', 'src');
const files = () => ['main.js', ...['renderer', 'renderer/app'].flatMap((d) => fs.readdirSync(path.join(SRC, d)).filter((f) => /\.m?js$/.test(f)).map((f) => `${d}/${f}`))];

// Kodda kullanılan her anahtar sözlükte olmalı (dinamik anahtarlar dahil)
test('i18n: kullanılan anahtarlar sözlükte var', () => {
  const used = new Set();
  for (const f of files()) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const m of src.matchAll(/\bt\('([\w.-]+)'/g)) if (!m[1].endsWith('.')) used.add(m[1]);
    for (const m of src.matchAll(/'((?:auth|stage|keys|warn|exp\.warn)\.[\w]+)'/g)) used.add(m[1]);
  }
  // dinamik aileler
  for (const g of FORMATS.GROUPS) used.add('fmt.group.' + g);
  for (const f of FORMATS.IMPORT) { used.add('engine.' + f.engine); if (f.note) used.add('fmt.note.' + f.id); }
  for (const f of FORMATS.EXPORT) used.add('exp.desc.' + f.id);
  for (const k of ['gradient', 'solid', 'dark', 'light', 'transparent']) used.add('bg.' + k);
  for (const k of ['studio', 'soft', 'headlight']) used.add('light.' + k);
  for (const k of ['shaded', 'edges', 'wireframe', 'xray', 'normals']) used.add('mode.' + k);
  for (const k of ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso']) used.add('viewDir.' + k);
  for (const k of ['front', 'top', 'right', 'iso']) used.add(`viewDir.${k}Short`);
  for (const k of ['radial', 'x', 'y', 'z', 'tree']) { used.add('explode.mode.' + k); used.add(`explode.mode.${k}Hint`); }
  for (const k of ['low', 'medium', 'high']) used.add('set.cadQ.' + k);
  for (const k of ['group', 'mesh', 'points', 'lines']) used.add('tree.' + k);
  const missing = [...used].filter((k) => !(k in STRINGS.en));
  assert.deepStrictEqual(missing, []);
});

// Mastertool standardı: 8 dil sabit sırayla, hepsinde aynı anahtarlar ve aynı yer tutucular
test('i18n: 8 dil, anahtar ve yer tutucu eşliği', () => {
  assert.deepStrictEqual(Object.keys(LANGUAGES), ['tr', 'en', 'fr', 'de', 'es', 'ar', 'zh', 'ru']);
  assert.strictEqual(LANGUAGES.ar.dir, 'rtl');
  const keys = Object.keys(STRINGS.en).sort();
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const l of Object.keys(LANGUAGES)) {
    assert.deepStrictEqual(Object.keys(STRINGS[l]).sort(), keys, l);
    for (const k of keys) {
      assert.strictEqual(ph(STRINGS[l][k]), ph(STRINGS.en[k]), `${l} ${k}`);
      assert.ok(String(STRINGS[l][k]).trim(), `${l} ${k} boş`);
    }
  }
});

// Not alanı olan biçim notları gerçekten açıklama içerir; sağ tık etiketi uygulama adını taşır
test('i18n: biçim notları ve sağ tık etiketi', () => {
  for (const l of Object.keys(LANGUAGES)) {
    assert.ok(STRINGS[l]['shell.verb'].includes('Master 3D'), l);
    for (const f of FORMATS.IMPORT.filter((x) => x.note)) assert.ok(STRINGS[l]['fmt.note.' + f.id].length > 20, `${l} ${f.id}`);
  }
});
