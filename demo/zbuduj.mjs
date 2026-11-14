// Builds the browser demo into demo/dist (Cloudflare Pages: build command "node demo/zbuduj.mjs",
// output directory "demo/dist"). No dependencies - plain Node.
//   /          computer version (pc/resources) with the Neutralino stand-in (demo/atrapa.js)
//   /telefon/  phone version (mobile/src + shared files from pc/resources/js) without Capacitor
// Nothing secret goes in: no Google project keys, invented data only (demo/dane.js).

import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const demo = dirname(fileURLToPath(import.meta.url));
const korzen = join(demo, '..');
const pc = join(korzen, 'pc', 'resources');
const mobile = join(korzen, 'mobile', 'src');
const dist = join(demo, 'dist');
const telefon = join(dist, 'telefon');

// Never copied from pc/resources/js: the real Neutralino client and generated files (google.js may hold the Google project ID).
const POMIN = new Set(['neutralino.js', 'neutralino.d.ts', 'wersja.js', 'google.js']);

// Own copying instead of cpSync - cpSync in Node 24 fails on a path with Polish letters.
function kopiuj(z, doCelu) {
  mkdirSync(dirname(doCelu), { recursive: true });
  copyFileSync(z, doCelu);
}
function kopiujFolder(z, doCelu, pomin = () => false) {
  for (const e of readdirSync(z, { withFileTypes: true })) {
    if (pomin(e.name)) continue;
    if (e.isDirectory()) kopiujFolder(join(z, e.name), join(doCelu, e.name), pomin);
    else kopiuj(join(z, e.name), join(doCelu, e.name));
  }
}

// Every replacement must hit - a changed index.html stops the build instead of publishing a broken demo.
function zamien(html, z, na, plik) {
  if (!html.includes(z)) throw new Error(`${plik}: nie ma „${z}” - popraw demo/zbuduj.mjs`);
  return html.replace(z, na);
}
const csp = (html, plik) => {
  const wynik = html.replace(/connect-src [^;]*;/, "connect-src 'self' https://api.nbp.pl;");
  if (wynik === html) throw new Error(`${plik}: nie ma connect-src w CSP`);
  return wynik;
};

const dwa = (n) => String(n).padStart(2, '0');
const teraz = new Date();
const wersja = `${teraz.getFullYear()}.${dwa(teraz.getMonth() + 1)}.${dwa(teraz.getDate())} demo`;
const WERSJA = `window.WERSJA_APLIKACJI = '${wersja}';\n`;
const GOOGLE = 'window.GOOGLE_KLUCZE = {};\n';
const SKRYPTY = '<script src="/demo/dane.js"></script>\n  <script src="/demo/atrapa.js"></script>';
const NOINDEX = '<meta name="robots" content="noindex">\n  <title>Mikropłatności - demo</title>';

rmSync(dist, { recursive: true, force: true });

// --- computer version ---
kopiujFolder(pc, dist, (nazwa) => POMIN.has(nazwa));
writeFileSync(join(dist, 'js', 'wersja.js'), WERSJA);
writeFileSync(join(dist, 'js', 'google.js'), GOOGLE);
let html = readFileSync(join(pc, 'index.html'), 'utf8');
html = csp(html, 'pc/index.html');
html = zamien(html, '<title>Mikropłatności</title>', NOINDEX, 'pc/index.html');
html = zamien(html, '<link rel="stylesheet" href="/css/wyglad.css">', '<link rel="stylesheet" href="/demo/czcionki.css">\n  <link rel="stylesheet" href="/css/wyglad.css">\n  <link rel="stylesheet" href="/demo/demo.css">', 'pc/index.html');
html = zamien(html, '<script src="/js/neutralino.js"></script>', SKRYPTY, 'pc/index.html');
html = zamien(html, '<html lang="pl" data-motyw="ciemny">', '<html lang="pl" data-motyw="jasny" data-demo="pc">', 'pc/index.html');
writeFileSync(join(dist, 'index.html'), html);

// Demo files and fonts (with their SIL OFL licences) for the computer version.
for (const plik of ['atrapa.js', 'dane.js', 'demo.css', 'czcionki.css']) kopiuj(join(demo, plik), join(dist, 'demo', plik));
kopiujFolder(join(mobile, 'czcionki'), join(dist, 'demo', 'czcionki'));

// --- phone version: shared files from the PC app, then the phone's own (as mobile/skrypty/przygotuj.mjs) ---
kopiujFolder(join(pc, 'js'), join(telefon, 'js'), (nazwa) => POMIN.has(nazwa) || nazwa === 'main.js');
kopiuj(join(pc, 'css', 'wyglad.css'), join(telefon, 'css', 'wyglad.css'));
kopiujFolder(mobile, telefon, (nazwa) => nazwa === 'neutralino-telefon.js');
writeFileSync(join(telefon, 'js', 'wersja.js'), WERSJA);
writeFileSync(join(telefon, 'js', 'google.js'), GOOGLE);
html = readFileSync(join(mobile, 'index.html'), 'utf8');
html = csp(html, 'mobile/src/index.html');
html = zamien(html, '<title>Mikropłatności</title>', NOINDEX, 'mobile/src/index.html');
html = zamien(html, '<link rel="stylesheet" href="css/telefon.css">', '<link rel="stylesheet" href="css/telefon.css">\n  <link rel="stylesheet" href="/demo/demo.css">', 'mobile/src/index.html');
html = zamien(html, '<script src="js/capacitor.js"></script>', '', 'mobile/src/index.html');
html = zamien(html, '<script src="js/neutralino-telefon.js"></script>', SKRYPTY, 'mobile/src/index.html');
html = zamien(html, '<html lang="pl" data-motyw="ciemny">', '<html lang="pl" data-motyw="jasny" data-demo="telefon">', 'mobile/src/index.html');
writeFileSync(join(telefon, 'index.html'), html);

// Cloudflare Pages headers: the demo opens in a window on the home page (and on its own in a new tab), not indexed.
writeFileSync(join(dist, '_headers'), `/*
  Content-Security-Policy: frame-ancestors 'self' https://szymonbakonis.pl https://szymonbakonis.pages.dev
  X-Robots-Tag: noindex
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
`);

console.log(`demo/dist gotowe (wersja ${wersja})`);
