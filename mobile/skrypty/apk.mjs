// Buduje podpisany plik APK (Gradle) i kładzie go w mobile/apk/Mikroplatnosci.apk.
// Użycie: npm run apk (w folderze mobile/) - najpierw składa www/ i kopiuje je do projektu Androida.
// Java i Android SDK z %LOCALAPPDATA%\Android (instalacja bez uprawnień administratora).

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = join(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(mobile, 'android');
const narzedzia = join(process.env.LOCALAPPDATA, 'Android');

function zmienna(nazwa) {
  if (process.env[nazwa]) return process.env[nazwa];
  try {
    const wynik = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', nazwa], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return (wynik.match(/REG_(?:EXPAND_)?SZ\s+(.*)/)?.[1] ?? '').trim();
  } catch {
    return '';
  }
}

const jdk = readdirSync(join(narzedzia, 'jdk')).find((n) => n.startsWith('jdk-21'));
const sdk = join(narzedzia, 'sdk');
const haslo = zmienna('MIKROPLATNOSCI_KLUCZ_HASLO');
if (!jdk || !existsSync(join(sdk, 'platforms'))) throw new Error('Brak Javy albo Android SDK w ' + narzedzia + ' - zob. mobile/README.md');
if (!haslo) throw new Error('Brak zmiennej MIKROPLATNOSCI_KLUCZ_HASLO (hasło klucza podpisu)');

const wersja = JSON.parse(readFileSync(join(mobile, 'wersja.json'), 'utf8'));
if (!Number.isInteger(wersja.kod) || !/^[\d.]+$/.test(wersja.nazwa)) throw new Error('Zły mobile/wersja.json - uruchom npm run apk od nowa');

execFileSync('cmd', ['/c', 'gradlew.bat', 'assembleRelease', '--console=plain', '-q', `-PwersjaKod=${wersja.kod}`, `-PwersjaNazwa=${wersja.nazwa}`], {
  cwd: android,
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME: join(narzedzia, 'jdk', jdk), ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, MIKROPLATNOSCI_KLUCZ_HASLO: haslo },
});

const wynik = join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
mkdirSync(join(mobile, 'apk'), { recursive: true });
copyFileSync(wynik, join(mobile, 'apk', 'Mikroplatnosci.apk'));
console.log(`APK gotowe: mobile/apk/Mikroplatnosci.apk (wersja ${wersja.nazwa})`);
