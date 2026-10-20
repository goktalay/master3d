'use strict';
// Komut satırı (Gezgin "Master 3D ile aç") ve sağ tık kaydı (.reg içeriği, durum, ensure mantığı)
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, fromSecondInstance, toLockData } = require('../src/instance');
const SM = require('../src/shellmenu');
const { SHELL_EXTS } = require('../src/formats');

test('parseArgs: --open, --open=, tek başına yol, Chromium anahtarları atlanır', () => {
  assert.deepEqual(parseArgs(['exe', '--open', 'C:\\m\\a.step']), { open: 'C:\\m\\a.step' });
  assert.deepEqual(parseArgs(['exe', '--open=C:\\m\\a b.stl']), { open: 'C:\\m\\a b.stl' });
  assert.deepEqual(parseArgs(['exe', '--allow-file-access', 'C:\\x.glb']), { open: 'C:\\x.glb' });
  assert.deepEqual(parseArgs(['exe', '"C:\\x y.obj"']), { open: 'C:\\x y.obj' });
  assert.deepEqual(parseArgs(['exe', 'parca.step'], { cwd: 'C:\\İş\\Modeller' }), { open: 'C:\\İş\\Modeller\\parca.step' });
  assert.deepEqual(parseArgs(['electron', '.', '--inspect']), { open: null });
  assert.deepEqual(fromSecondInstance([], '', toLockData({ open: 'C:\\a.fbx' })), { open: 'C:\\a.fbx' });
});

test('.reg: her uzantı için fiil + "Birlikte aç"; tırnak ve ters bölü kaçışı', () => {
  const exe = 'C:\\Program Files\\Mastertool\\Master 3D\\Master 3D.exe';
  const reg = SM.registerReg(exe, 'Master 3D ile aç');
  assert.ok(reg.startsWith('Windows Registry Editor Version 5.00\r\n'));
  for (const e of SHELL_EXTS) assert.ok(reg.includes(`[HKEY_CURRENT_USER\\Software\\Classes\\SystemFileAssociations\\.${e}\\shell\\MastertoolMaster3D\\command]`), e);
  assert.ok(reg.includes('@="\\"C:\\\\Program Files\\\\Mastertool\\\\Master 3D\\\\Master 3D.exe\\" --open \\"%1\\""'));
  assert.ok(reg.includes('"MUIVerb"="Master 3D ile aç"'));
  assert.ok(reg.includes('".step"=""') && !reg.includes('".zip"'));
  const un = SM.unregisterReg();
  assert.equal((un.match(/^\[-/gm) || []).length, SHELL_EXTS.length + 1);
  const u16 = SM.toUtf16('ç');
  assert.deepEqual([...u16.subarray(0, 2)], [0xff, 0xfe]);
  assert.equal(u16.subarray(2).toString('utf16le'), 'ç');
});

test('ensure: yazar, değişmediyse dokunmaz, kapatınca yalnız kendi kaydını siler', async () => {
  const exe = 'C:\\M3\\Master 3D.exe';
  const calls = [];
  let registered = null;
  const runner = async (file, args) => {
    calls.push(args[0]);
    if (args[0] === 'query') return registered ? { ok: true, stdout: `\r\n    (Default)    REG_SZ    ${registered}\r\n` } : { ok: false, stdout: '' };
    if (args[0] === 'import') { const txt = require('fs').readFileSync(args[1]).subarray(2).toString('utf16le'); registered = txt.includes('[-') ? null : SM.commandLine(exe); return { ok: true }; }
    return { ok: false };
  };
  const sm = SM.createShellMenu({ exe, runner, platform: 'win32' });
  let r = await sm.ensure(true, 'Master 3D ile aç', null);
  assert.equal(r.ok, true);
  assert.deepEqual(r.last, { exe, label: 'Master 3D ile aç' });
  calls.length = 0;
  r = await sm.ensure(true, 'Master 3D ile aç', r.last);
  assert.equal(r.unchanged, true);
  assert.deepEqual(calls, ['query']);
  r = await sm.ensure(true, 'Open with Master 3D', r.last); // dil değişti
  assert.equal(r.last.label, 'Open with Master 3D');
  r = await sm.ensure(false, 'x', r.last);
  assert.equal(registered, null);
  const off = SM.createShellMenu({ exe, runner, platform: 'linux' });
  assert.equal((await off.status()).supported, false);
});
