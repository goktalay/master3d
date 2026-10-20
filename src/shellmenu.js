'use strict';

// Gezgin sağ tık menüsü: desteklenen 3B dosyalarda "Master 3D ile aç" ve "Birlikte aç" listesinde Master 3D.
// Varsayılan uygulama DEĞİŞTİRİLMEZ (kullanıcının .stl / .obj için seçtiği program yerinde kalır).
//
// Kayıtlar kullanıcı kapsamındadır (yönetici izni gerekmez):
//   HKCU\Software\Classes\SystemFileAssociations\.<uzantı>\shell\MastertoolMaster3D
//     MUIVerb = "Master 3D ile aç" (uygulamanın dili)  ·  Icon = "…\Master 3D.exe",0
//     command\(Varsayılan) = "…\Master 3D.exe" --open "%1"
//   HKCU\Software\Classes\Applications\Master 3D.exe  (Birlikte aç: FriendlyAppName, SupportedTypes, shell\open\command)
// ~60 uzantı tek tek reg.exe ile yazılsaydı saniyeler sürerdi; bunun yerine bir .reg dosyası üretilip tek bir
// "reg import" çağrısıyla yazılır. Kaldırma da aynı yolla ([-anahtar] satırları). Kurulum kaldırıcısı
// build/shell-exts.nsh ile aynı anahtarları siler (scripts/build.js üretir).
// Windows 11'de klasik menü "Daha fazla seçenek göster" altındadır (bkz. docs/site-teknik.md › Bilinen sınırlar).

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SHELL_EXTS } = require('./formats');

const VERB = 'MastertoolMaster3D';
const APP_KEY = 'HKEY_CURRENT_USER\\Software\\Classes\\Applications\\Master 3D.exe';
const extKey = (ext) => `HKEY_CURRENT_USER\\Software\\Classes\\SystemFileAssociations\\.${ext}\\shell\\${VERB}`;
const commandLine = (exe) => `"${exe}" --open "%1"`;

// .reg değerleri: ters bölü ve tırnak kaçışlı
const regStr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function registerReg(exe, label, exts = SHELL_EXTS) {
  const out = ['Windows Registry Editor Version 5.00', ''];
  for (const e of exts) {
    out.push(`[${extKey(e)}]`, `"MUIVerb"=${regStr(label)}`, `"Icon"=${regStr(`"${exe}",0`)}`, '');
    out.push(`[${extKey(e)}\\command]`, `@=${regStr(commandLine(exe))}`, '');
  }
  out.push(`[${APP_KEY}]`, `"FriendlyAppName"=${regStr('Master 3D')}`, '');
  out.push(`[${APP_KEY}\\SupportedTypes]`, ...exts.map((e) => `".${e}"=""`), '');
  out.push(`[${APP_KEY}\\DefaultIcon]`, `@=${regStr(`"${exe}",0`)}`, '');
  out.push(`[${APP_KEY}\\shell\\open\\command]`, `@=${regStr(commandLine(exe))}`, '');
  return out.join('\r\n') + '\r\n';
}

function unregisterReg(exts = SHELL_EXTS) {
  const out = ['Windows Registry Editor Version 5.00', ''];
  for (const e of exts) out.push(`[-${extKey(e)}]`, '');
  out.push(`[-${APP_KEY}]`, '');
  return out.join('\r\n') + '\r\n';
}

// reg.exe .reg dosyasını UTF-16LE (BOM'lu) bekler: Türkçe / Arapça / Çince etiketler bozulmaz
function toUtf16(text) {
  const body = Buffer.from(text, 'utf16le');
  return Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
}

function run(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, encoding: 'utf8', timeout: 20000 }, (error, stdout, stderr) => resolve({ ok: !error, stdout, stderr }));
  });
}

async function importReg(text, runner = run) {
  const tmp = path.join(os.tmpdir(), `master3d-${process.pid}-${Date.now()}.reg`);
  fs.writeFileSync(tmp, toUtf16(text));
  try { return await runner('reg.exe', ['import', tmp]); } finally { try { fs.unlinkSync(tmp); } catch { /* yok */ } }
}

// "reg query" çıktısından varsayılan değer
function parseDefault(stdout) {
  const m = /^\s*\([^)]*\)\s+REG_(?:EXPAND_)?SZ\s+(.*)$/mi.exec(String(stdout || ''));
  return m ? m[1].trim() : null;
}

function createShellMenu({ exe, runner = run, platform = process.platform } = {}) {
  const supported = platform === 'win32';
  async function status() {
    if (!supported) return { supported, registered: false, pointsHere: false };
    // Temsilci olarak .step kaydına bakılır (hepsi birlikte yazılır)
    const r = await runner('reg.exe', ['query', `${extKey('step')}\\command`.replace('HKEY_CURRENT_USER', 'HKCU'), '/ve']);
    const cmd = r.ok ? parseDefault(r.stdout) : null;
    const ascii = /^[\x20-\x7e]*$/.test(exe);
    return { supported, registered: !!cmd, pointsHere: !!cmd && ascii && cmd.toLowerCase() === commandLine(exe).toLowerCase() };
  }
  async function register(label) {
    if (!supported) return { ok: false, code: 'unsupported' };
    const r = await importReg(registerReg(exe, label), runner);
    return r.ok ? { ok: true } : { ok: false, code: 'reg_failed', message: (r.stderr || '').trim() };
  }
  async function unregister() {
    if (!supported) return { ok: false, code: 'unsupported' };
    await importReg(unregisterReg(), runner);
    return { ok: true };
  }
  // Açılışta: açık olmalıysa ve bu exe'yi göstermiyorsa ya da etiket (dil) değiştiyse yaz; kapalıysa ve kayıt bu
  // exe'ye aitse sil. last: { exe, label } (depodaki son yazım)
  async function ensure(enabled, label, last = null) {
    if (!supported) return { ok: false, code: 'unsupported', last };
    const st = await status();
    if (enabled) {
      if (st.pointsHere && last && last.exe === exe && last.label === label) return { ok: true, unchanged: true, last };
      const r = await register(label);
      return { ...r, last: r.ok ? { exe, label } : last };
    }
    if (st.registered && (st.pointsHere || (last && last.exe === exe))) { await unregister(); return { ok: true, last: null }; }
    return { ok: true, unchanged: true, last: null };
  }
  return { supported, status, register, unregister, ensure };
}

module.exports = { createShellMenu, registerReg, unregisterReg, toUtf16, parseDefault, commandLine, extKey, VERB, APP_KEY };
