// Buduje podpisany plik APK (Gradle) i kładzie go w mobile/apk/Mikroplatnosci.apk.
// Użycie: npm run apk (w folderze mobile/) - najpierw składa www/ i kopiuje je do projektu Androida.
// npm run aab - to samo, ale paczka AAB dla Google Play (mobile/apk/Mikroplatnosci.aab); Play przyjmuje
// od nowych aplikacji tylko AAB. Ten sam klucz podpisu (w Play: klucz przesyłania).
// Java i Android SDK z %LOCALAPPDATA%\Android (instalacja bez uprawnień administratora).

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zmienna } from './zmienna.mjs';

const mobile = join(dirname(fileURLToPath(import.meta.url)), '..');
const narzedzia = join(process.env.LOCALAPPDATA, 'Android');

// Wtyczka Androida do Gradle nie buduje w ścieżce z polskimi literami („mikropłatności”) -
// budowanie przez skrót folderu (junction) bez polskich liter, tworzony raz.
const skrot = join(narzedzia, 'budowa-mikroplatnosci');
if (!existsSync(skrot)) execFileSync('cmd', ['/c', 'mklink', '/J', skrot, mobile], { stdio: 'ignore' });
if (realpathSync(skrot) !== realpathSync(mobile)) throw new Error(`Skrót ${skrot} wskazuje inny folder - usuń go (rmdir, bez /s) i uruchom jeszcze raz`);
const android = join(skrot, 'android');

const jdk = readdirSync(join(narzedzia, 'jdk')).find((n) => n.startsWith('jdk-21'));
const sdk = join(narzedzia, 'sdk');
const haslo = zmienna('MIKROPLATNOSCI_KLUCZ_HASLO');
if (!jdk || !existsSync(join(sdk, 'platforms'))) throw new Error('Brak Javy albo Android SDK w ' + narzedzia + ' - zob. mobile/README.md');
if (!haslo) throw new Error('Brak zmiennej MIKROPLATNOSCI_KLUCZ_HASLO (hasło klucza podpisu)');

const aab = process.argv.includes('--aab');
const wersja = JSON.parse(readFileSync(join(mobile, 'wersja.json'), 'utf8'));
if (!Number.isInteger(wersja.kod) || !/^\d{4}\.\d{2}\.\d{2}\.\d{4}$/.test(wersja.nazwa)) throw new Error('Zły mobile/wersja.json - uruchom npm run apk od nowa');

// Pełna ścieżka: przy NoDefaultCurrentDirectoryInExePath cmd nie szuka programów w bieżącym folderze.
execFileSync('cmd', ['/c', join(android, 'gradlew.bat'), aab ? 'bundleRelease' : 'assembleRelease', '--console=plain', '-q', `-PwersjaKod=${wersja.kod}`, `-PwersjaNazwa=${wersja.nazwa}`], {
  cwd: android,
  stdio: 'inherit',
  // Certyfikaty z magazynu Windows: antywirus (Avast) sprawdza HTTPS i podstawia swój certyfikat,
  // któremu ufa Windows, ale nie Java - bez tego Gradle nie pobierze niczego.
  env: { ...process.env, JAVA_TOOL_OPTIONS: '-Djavax.net.ssl.trustStoreType=Windows-ROOT', JAVA_HOME: join(narzedzia, 'jdk', jdk), ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, MIKROPLATNOSCI_KLUCZ_HASLO: haslo },
});

const wynik = aab
  ? join(android, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')
  : join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const cel = aab ? 'Mikroplatnosci.aab' : 'Mikroplatnosci.apk';
mkdirSync(join(mobile, 'apk'), { recursive: true });
copyFileSync(wynik, join(mobile, 'apk', cel));
console.log(`${aab ? 'AAB' : 'APK'} gotowe: mobile/apk/${cel} (wersja ${wersja.nazwa})`);
