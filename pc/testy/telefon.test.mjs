// Telefon (mobile/): kompletność plików kopiowanych przy budowaniu i zamiennik Neutralino.
// Błędy stąd widać inaczej dopiero po zbudowaniu i zainstalowaniu APK (biały ekran, utrata danych).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const sciezka = (p) => new URL('../../' + p, import.meta.url);
const czytaj = (p) => readFileSync(sciezka(p), 'utf8');

// Lista WSPOLNE z mobile/skrypty/przygotuj.mjs (plik przy imporcie od razu buduje www/, więc czytany jako tekst).
function wspolne() {
  const m = czytaj('mobile/skrypty/przygotuj.mjs').match(/const WSPOLNE = \[([^\]]*)\]/);
  assert.ok(m, 'nie znaleziono listy WSPOLNE w przygotuj.mjs');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

test('każdy plik importowany na telefonie trafia do www/ (WSPOLNE albo mobile/src/js)', () => {
  const lista = wspolne();
  for (const plik of lista) assert.ok(existsSync(sciezka('pc/resources/js/' + plik)), `w WSPOLNE jest ${plik}, a nie ma go w pc/resources/js`);
  const doSprawdzenia = [['mobile/src/js/aplikacja.js'], ...lista.map((p) => ['pc/resources/js/' + p])];
  for (const [plik] of doSprawdzenia) {
    for (const [, cel] of czytaj(plik).matchAll(/from '\.\/([^']+)'/g)) {
      const jest = lista.includes(cel) || existsSync(sciezka('mobile/src/js/' + cel));
      assert.ok(jest, `${plik} importuje ${cel}, którego nie ma w WSPOLNE (mobile/skrypty/przygotuj.mjs)`);
    }
  }
});

test('wspólne pliki wołają tylko te funkcje Neutralino, które ma zamiennik na telefonie', () => {
  const zamiennik = czytaj('mobile/src/js/neutralino-telefon.js');
  for (const plik of wspolne()) {
    for (const [wywolanie, grupa, funkcja] of czytaj('pc/resources/js/' + plik).matchAll(/Neutralino\.([a-z]+)\.([a-zA-Z]+)/g)) {
      const blok = zamiennik.match(new RegExp(`${grupa}: \\{([\\s\\S]*?)\\n    \\}`));
      assert.ok(blok && new RegExp(`\\b${funkcja}:`).test(blok[1]), `${plik} woła ${wywolanie}, a zamiennik na telefonie tego nie ma`);
    }
  }
});

// Zamiennik uruchomiony z udawanym Capacitorem: stat rzuca podanym błędem.
function zamiennikZBledem(blad) {
  const wtyczki = { Filesystem: { stat: async () => { throw blad; } }, Browser: {} };
  const window = {};
  runInNewContext(czytaj('mobile/src/js/neutralino-telefon.js'), { window, Capacitor: { registerPlugin: (n) => wtyczki[n] } });
  return window.Neutralino;
}

test('telefon: brak pliku = kod NE_FS_NOPATHE (jak na PC), inny błąd zostaje błędem', async () => {
  const brak = Object.assign(new Error("'stat' failed because file at 'Mikroplatnosci/mikroplatnosci.json' does not exist."), { code: 'OS-PLUG-FILE-0008' });
  await assert.rejects(zamiennikZBledem(brak).filesystem.getStats('Mikroplatnosci/mikroplatnosci.json'), { code: 'NE_FS_NOPATHE' });
  const inny = Object.assign(new Error('Unable to do file operation, user denied permission request.'), { code: 'OS-PLUG-FILE-0007' });
  await assert.rejects(zamiennikZBledem(inny).filesystem.getStats('x.json'), (e) => e.code === 'OS-PLUG-FILE-0007');
});

// Odczyt i zapis na telefonie idą przez magazyn.js (testy w magazyn.test.mjs) - bez własnej kopii,
// która łapałaby każdy błąd jako „brak pliku”.
// Ustawienia na telefonie: wybrane rodzaje naprawdę idą do planowania i do pliku, a karta pokazuje „zapłać do” z B8.
test('telefon: rodzaje powiadomień z „Ustawień” w planowaniu i w pliku, „zapłać do” po B8', () => {
  const kod = czytaj('mobile/src/js/aplikacja.js');
  assert.match(kod, /rozplanuj\(stan\.wpisy, pamiecPowiadomien, new Date\(\), stan\.powiadomienia\)/);
  assert.match(kod, /zapiszUstawienia\(PLIK_USTAWIEN, \{[^}]*powiadomienia: stan\.powiadomienia/);
  assert.match(kod, /t\('zapłać do \{data\}', \{ data: [^\n]*formatujDate\(dz\.doDnia\)/);
  assert.doesNotMatch(kod, /t\('zapłać do \{data\}'[^\n]*formatujDate\(dz\.data\)/);
});

test('telefon: okno „Ustawienia” bez B10 - harmonogram Windows nie trafia do www/', () => {
  const kod = czytaj('mobile/src/js/aplikacja.js');
  assert.ok(wspolne().includes('ustawieniaOkno.js'));
  assert.ok(!wspolne().includes('harmonogram.js'));
  assert.doesNotMatch(kod, /naWTle/);
});

test('telefon: język i notatki „pierwsze kroki” (F25, F27) zostają w pliku ustawień, data bez stałego pl-PL', () => {
  const kod = czytaj('mobile/src/js/aplikacja.js');
  assert.match(kod, /zapiszUstawienia\(PLIK_USTAWIEN, \{[^}]*jezyk: stan\.jezyk, wprowadzenie: stan\.wprowadzenie/);
  assert.match(kod, /naJezyk: zmienJezyk/);
  assert.match(kod, /naWprowadzenie\(\)/);
  assert.doesNotMatch(kod, /'pl-PL'/);
});

test('telefon: wykreślenie z wyłączonymi „Anulowanymi” usuwa na zawsze, przykład od razu', () => {
  assert.match(czytaj('mobile/src/js/aplikacja.js'), /if \(odRazu \|\| !archiwum\) usun\(stan, wpis\);/);
});

test('telefon: „Wstecz” zamyka każde otwarte okno, także tworzone z kodu', () => {
  assert.match(czytaj('mobile/src/js/aplikacja.js'), /querySelectorAll\('dialog\[open\]'\)/);
});

test('telefon: odczyt i zapis danych przez wspólny magazyn.js, bez własnego zapisu wprost', () => {
  const kod = czytaj('mobile/src/js/aplikacja.js');
  assert.match(kod, /import \{[^}]*wczytajNaStart[^}]*zapiszPlik[^}]*\} from '\.\/magazyn\.js'/);
  assert.doesNotMatch(kod, /async function istnieje\(/);
  assert.doesNotMatch(kod, /filesystem\.writeFile\(PLIK\b/);
});

test('telefon: D17-D19, E23, E24 - moduły w www/, budżet w pliku ustawień i na paragonie', () => {
  const kod = czytaj('mobile/src/js/aplikacja.js');
  for (const plik of ['filtr.js', 'eksport.js', 'wyciag.js', 'wyciagOkno.js']) assert.ok(wspolne().includes(plik), plik);
  assert.match(kod, /zapiszUstawienia\(PLIK_USTAWIEN, \{[^}]*budzet: stan\.budzet/);
  assert.match(kod, /renderujPodsumowanie\(\$\('paragon'\), stan\.wpisy, \{ budzet: stan\.budzet \}\)/);
  assert.match(kod, /naBudzet\(kwota\)/);
  assert.match(kod, /stan\.budzet = poprawnyBudzet\(ustawienia\.budzet\)/);
});

test('telefon: wczytanie kopii - najpierw kopia zapasowa, dane zastępuje wspólne zastapZKopii', () => {
  const kod = czytaj('mobile/src/js/aplikacja.js');
  const start = kod.indexOf('async function wczytajKopie');
  const blok = kod.slice(start, kod.indexOf('// E24:', start));
  assert.ok(blok.indexOf('zrobKopie(FOLDER_KOPII') > 0 && blok.indexOf('zrobKopie(FOLDER_KOPII') < blok.indexOf('zastapZKopii(stan, dane)'));
  assert.match(blok, /if \(!confirm\(pytanie\)\) return;/);
});

test('telefon: wybór pliku bez accept, kopia i CSV w publicznych Dokumentach, zgoda tylko dla starych Androidów', async () => {
  assert.doesNotMatch(czytaj('mobile/src/index.html'), /id="plik-wybor"[^>]*accept/);
  const zapisy = [];
  const wtyczki = { Filesystem: { writeFile: async (o) => { zapisy.push(o); } }, Browser: {} };
  const window = {};
  runInNewContext(czytaj('mobile/src/js/neutralino-telefon.js'), { window, Capacitor: { registerPlugin: (n) => wtyczki[n] } });
  await window.Neutralino.os.zapiszDokument('kopia.json', 'x');
  assert.equal(zapisy[0].path, 'Mikroplatnosci/kopia.json');
  assert.equal(zapisy[0].directory, 'DOCUMENTS');
  const manifest = czytaj('mobile/android/app/src/main/AndroidManifest.xml');
  for (const z of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE']) assert.match(manifest, new RegExp(`${z}" android:maxSdkVersion="29"`));
});

test('telefon: dostęp do Google Dysku poza kopią zapasową Androida, CSP łączy się tylko z NBP i Google', () => {
  const manifest = czytaj('mobile/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  assert.match(manifest, /android:fullBackupContent="@xml\/backup_rules"/);
  const wylaczenie = /<exclude domain="file" path="Mikroplatnosci\/google\.json" \/>/g;
  assert.equal(czytaj('mobile/android/app/src/main/res/xml/data_extraction_rules.xml').match(wylaczenie)?.length, 2);
  assert.equal(czytaj('mobile/android/app/src/main/res/xml/backup_rules.xml').match(wylaczenie)?.length, 1);
  const csp = czytaj('mobile/src/index.html').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.match(csp, /connect-src 'self' https:\/\/api\.nbp\.pl https:\/\/oauth2\.googleapis\.com https:\/\/www\.googleapis\.com;/);
});

test('telefon: wybrany plik czeka na koniec pobrania z Dysku, zapisana pozycja nie znika za filtrem', () => {
  const kod = czytaj('mobile/src/js/aplikacja.js');
  const start = kod.indexOf("$('plik-wybor').addEventListener");
  const blok = kod.slice(start, kod.indexOf('// E23: kopia z pliku', start));
  assert.match(blok, /await poWymianie\(stan\);/);
  assert.doesNotMatch(blok, /stan\.synchronizacja\) return/);
  assert.match(kod, /if \(!pasuje\(wpis, stan\.filtr\)\) stan\.filtr = pustyFiltr\(\);/);
});
