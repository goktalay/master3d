'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/formats');

test('biçim kaydı: uzantılar tekil, motorlar bilinen, dışa aktarma kimlikleri tekil', () => {
  const exts = F.IMPORT.flatMap((f) => f.ext);
  assert.equal(new Set(exts).size, exts.length);
  for (const f of F.IMPORT) {
    assert.ok(['three', 'occt', 'assimp', 'ifc', 'x3d', 'zip'].includes(f.engine), f.id);
    assert.ok(F.GROUPS.includes(f.group), f.id);
    for (const e of f.ext) assert.match(e, /^[a-z0-9]+$/);
  }
  assert.equal(new Set(F.EXPORT.map((f) => f.id)).size, F.EXPORT.length);
  assert.equal(F.formatOf('C:\\X\\Parça.STEP').id, 'step');
  assert.equal(F.formatOf('a.tar.gz'), null);
  assert.ok(!F.SHELL_EXTS.includes('zip') && F.SHELL_EXTS.includes('ifc'));
  const filters = F.dialogFilters((k) => k);
  assert.equal(filters[0].extensions.length, exts.length);
  assert.equal(filters.length, 1 + F.GROUPS.length);
  assert.ok(F.EXPORT.some((f) => f.rec));
});
