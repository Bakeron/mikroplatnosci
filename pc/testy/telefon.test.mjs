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
test('telefon: odczyt i zapis danych przez wspólny magazyn.js, bez własnego zapisu wprost', () => {
  const kod = czytaj('mobile/src/js/aplikacja.js');
  assert.match(kod, /import \{[^}]*wczytajPlikDanych[^}]*zapiszPlik[^}]*\} from '\.\/magazyn\.js'/);
  assert.doesNotMatch(kod, /async function istnieje\(/);
  assert.doesNotMatch(kod, /filesystem\.writeFile\(PLIK\b/);
});
