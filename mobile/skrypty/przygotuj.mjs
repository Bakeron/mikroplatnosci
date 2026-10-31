// Składa folder www/ dla Capacitora: pliki telefonu (src/), wspólne obliczenia z aplikacji PC
// i identyfikator projektu Google ze zmiennych środowiskowych Windows (www/ nie trafia do gita).
// Użycie: npm run przygotuj (w folderze mobile/)

import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = join(dirname(fileURLToPath(import.meta.url)), '..');
const pc = join(mobile, '..', 'pc', 'resources');
const www = join(mobile, 'www');
const WSPOLNE = ['alarmy.js', 'waluty.js', 'podsumowanie.js', 'spisy.js', 'miarka.js', 'dane.js', 'scalanie.js', 'dysk.js', 'synchronizacja.js', 'powiadomienia.js'];

// Własne kopiowanie zamiast cpSync - cpSync w Node 24 wywraca się na ścieżce z polskimi literami.
function kopiuj(z, doCelu) {
  mkdirSync(dirname(doCelu), { recursive: true });
  copyFileSync(z, doCelu);
}

function kopiujFolder(z, doCelu) {
  for (const e of readdirSync(z, { withFileTypes: true })) {
    if (e.isDirectory()) kopiujFolder(join(z, e.name), join(doCelu, e.name));
    else kopiuj(join(z, e.name), join(doCelu, e.name));
  }
}

// Zmienna z bieżącego procesu albo zapisana przez setx (widoczna dopiero w nowych oknach).
function zmienna(nazwa) {
  if (process.env[nazwa]) return process.env[nazwa].trim();
  try {
    const wynik = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', nazwa], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return (wynik.match(/REG_(?:EXPAND_)?SZ\s+(.*)/)?.[1] ?? '').trim();
  } catch {
    return '';
  }
}

rmSync(www, { recursive: true, force: true });
kopiujFolder(join(mobile, 'src'), www);
for (const plik of WSPOLNE) kopiuj(join(pc, 'js', plik), join(www, 'js', plik));
kopiuj(join(pc, 'css', 'wyglad.css'), join(www, 'css', 'wyglad.css'));
kopiuj(join(mobile, 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js'), join(www, 'js', 'capacitor.js'));

const klucze = {
  MIKROPLATNOSCI_GOOGLE_ID: zmienna('MIKROPLATNOSCI_GOOGLE_ID'),
  MIKROPLATNOSCI_GOOGLE_SECRET: zmienna('MIKROPLATNOSCI_GOOGLE_SECRET'),
};
writeFileSync(join(www, 'js', 'google.js'), `window.GOOGLE_KLUCZE = ${JSON.stringify(klucze)};\n`);

// Numer wersji = data i godzina budowania; kod (minuty od 2026 r.) rośnie z każdym APK -
// Android instaluje aktualizację tylko z kodem nie mniejszym niż zainstalowany. apk.mjs czyta wersja.json.
const teraz = new Date();
const dwa = (n) => String(n).padStart(2, '0');
const wersja = {
  nazwa: `${teraz.getFullYear()}.${dwa(teraz.getMonth() + 1)}.${dwa(teraz.getDate())}.${dwa(teraz.getHours())}${dwa(teraz.getMinutes())}`,
  kod: Math.floor((teraz - Date.UTC(2026, 0, 1)) / 60000),
};
writeFileSync(join(www, 'js', 'wersja.js'), `window.WERSJA_APLIKACJI = '${wersja.nazwa}';\n`);
writeFileSync(join(mobile, 'wersja.json'), JSON.stringify(wersja) + '\n');

const google = klucze.MIKROPLATNOSCI_GOOGLE_ID && klucze.MIKROPLATNOSCI_GOOGLE_SECRET;
console.log('www/ gotowe. Google Dysk: ' + (google ? 'identyfikator wpisany' : 'bez identyfikatora - wpisuje się go w aplikacji'));
