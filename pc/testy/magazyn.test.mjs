// Pliki na komputerze (magazyn.js) i ustawienia urządzenia (ustawienia.js): odczyt z blokadą po błędzie,
// zapis przez plik tymczasowy, kopie zapasowe, usuwanie danych, blokada drugiej kopii aplikacji.
// Udawany dysk w pamięci - bez prawdziwych plików autora.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../resources/js/magazyn.js';
import { wczytajUstawienia, zapiszUstawienia } from '../resources/js/ustawienia.js';
import { poprawneFunkcje } from '../resources/js/funkcje.js';

const pliki = new Map();
let bledy = {}; // nazwa funkcji -> błąd do rzucenia (np. getStats: { code: 'NE_FS_PERMISSION' })
let zapisy = [];
const blad = (kod) => Object.assign(new Error(kod), { code: kod });
const rzuc = (fn) => { if (bledy[fn]) throw bledy[fn]; };
globalThis.Neutralino = {
  filesystem: {
    getStats: async (p) => {
      rzuc('getStats');
      if (pliki.has(p) || [...pliki.keys()].some((k) => k.startsWith(p + '/'))) return {};
      throw blad('NE_FS_NOPATHE');
    },
    readFile: async (p) => { rzuc('readFile'); if (!pliki.has(p)) throw blad('NE_FS_FILRDER'); return pliki.get(p); },
    writeFile: async (p, d) => { rzuc('writeFile'); zapisy.push(p); pliki.set(p, d); },
    move: async (z, doCelu) => { rzuc('move'); pliki.set(doCelu, pliki.get(z)); pliki.delete(z); },
    remove: async (p) => { rzuc('remove'); pliki.delete(p); },
    readDirectory: async (folder) => [...pliki.keys()]
      .filter((k) => k.startsWith(folder + '/') && !k.slice(folder.length + 1).includes('/'))
      .map((k) => ({ entry: k.slice(folder.length + 1), type: 'FILE' })),
  },
};
console.error = () => {}; // oczekiwane błędy (np. nieudana podmiana) bez szumu w wyniku

const F = 'dane';
const PLIK = F + '/mikroplatnosci.json';
const KOPIE = F + '/kopie';
const tresc = (wpisy) => JSON.stringify({ wersja: 2, wpisy, usuniete: [] });

beforeEach(() => {
  pliki.clear();
  bledy = {};
  zapisy = [];
});

test('brak pliku = nowy zeszyt (null); błąd inny niż „brak pliku” idzie dalej', async () => {
  assert.equal(await M.wczytajPlikDanych(PLIK), null);
  bledy.getStats = blad('NE_FS_PERMISSION');
  await assert.rejects(M.wczytajPlikDanych(PLIK), { code: 'NE_FS_PERMISSION' });
});

test('przerwana podmiana na telefonie (jest tylko .tmp): dane z pliku tymczasowego; ucięty .tmp = brak danych', async () => {
  pliki.set(PLIK + '.tmp', tresc([{ id: 'a', nazwa: 'A' }]));
  const { odczytane } = await M.wczytajPlikDanych(PLIK);
  assert.deepEqual(odczytane.wpisy.map((w) => w.id), ['a']);
  pliki.set(PLIK + '.tmp', '{"wersja":2,"wpi');
  assert.equal(await M.wczytajPlikDanych(PLIK), null);
});

test('start: błąd odczytu i pusty plik - błąd idzie dalej, bez kopii; brak pliku - null; dobry - kopia wczytanej treści', async () => {
  bledy.getStats = blad('NE_FS_PERMISSION');
  await assert.rejects(M.wczytajNaStart(PLIK, KOPIE), { code: 'NE_FS_PERMISSION' });
  bledy = {};
  pliki.set(PLIK, '');
  await assert.rejects(M.wczytajNaStart(PLIK, KOPIE), /pusty/);
  assert.deepEqual(zapisy, [], 'po błędzie odczytu nic nie zapisane');
  pliki.delete(PLIK);
  assert.equal(await M.wczytajNaStart(PLIK, KOPIE), null);
  const dane = tresc([{ id: 'a', nazwa: 'A' }]);
  pliki.set(PLIK, dane);
  const start = await M.wczytajNaStart(PLIK, KOPIE);
  assert.deepEqual(start.odczytane.wpisy.map((w) => w.id), ['a']);
  pliki.set(PLIK, tresc([])); // plik zmienił się po wczytaniu - kopia ma treść z chwili wczytania
  await start.kopia();
  const kopie = [...pliki.keys()].filter((k) => k.startsWith(KOPIE + '/'));
  assert.equal(kopie.length, 1);
  assert.equal(pliki.get(kopie[0]), dane);
});

test('pusty albo obcy plik danych = błąd (aplikacja blokuje wtedy zapis), dobry = wpisy', async () => {
  pliki.set(PLIK, '');
  await assert.rejects(M.wczytajPlikDanych(PLIK), /pusty/);
  pliki.set(PLIK, '{"cos":1}');
  await assert.rejects(M.wczytajPlikDanych(PLIK), /format/);
  pliki.set(PLIK, tresc([{ id: 'a', nazwa: 'A' }]));
  const { odczytane } = await M.wczytajPlikDanych(PLIK);
  assert.deepEqual(odczytane.wpisy.map((w) => w.id), ['a']);
});

test('czyZapisywac: tylko po wczytaniu, bez blokady, przy „Zapisuj lokalnie” i ze zmianami', () => {
  const dobry = { zablokowany: false, wczytano: true, lokalnie: true, plik: PLIK, niezapisane: true };
  assert.equal(M.czyZapisywac(dobry), true);
  assert.equal(M.czyZapisywac({ ...dobry, wczytano: false }), false, 'przed wczytaniem pusta lista nadpisałaby dane');
  assert.equal(M.czyZapisywac({ ...dobry, zablokowany: true }), false);
  assert.equal(M.czyZapisywac({ ...dobry, lokalnie: false }), false);
  assert.equal(M.czyZapisywac({ ...dobry, niezapisane: false }), false);
  assert.equal(M.czyZapisywac({ ...dobry, plik: '' }), false);
});

test('zapis przez plik tymczasowy i podmianę; nieudana podmiana = zapis wprost, bez .tmp', async () => {
  await M.zapiszPlik(PLIK, 'A');
  assert.equal(pliki.get(PLIK), 'A');
  assert.equal(pliki.has(PLIK + '.tmp'), false);
  assert.equal(zapisy[0], PLIK + '.tmp');
  bledy.move = blad('NE_FS_MOVEERR');
  await M.zapiszPlik(PLIK, 'B');
  assert.equal(pliki.get(PLIK), 'B');
  assert.equal(pliki.has(PLIK + '.tmp'), false);
});

test('kopie: zostaje 5 najnowszych, ta sama treść co w najnowszej - bez nowej kopii', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 10, 10, 0) });
  for (let i = 1; i <= 7; i++) pliki.set(`${KOPIE}/mikroplatnosci-2026010${i}-120000.json`, 'stara ' + i);
  pliki.set(`${KOPIE}/notatka.txt`, 'obcy plik zostaje');
  await M.zrobKopie(KOPIE, 'nowa');
  const kopie = [...pliki.keys()].filter((k) => k.startsWith(KOPIE + '/mikroplatnosci-')).sort();
  assert.equal(kopie.length, 5);
  assert.ok(!kopie.some((k) => k.includes('20260101') || k.includes('20260102') || k.includes('20260103')), 'usunięte najstarsze');
  assert.equal(pliki.get(kopie.at(-1)), 'nowa');
  assert.ok(pliki.has(`${KOPIE}/notatka.txt`));
  zapisy = [];
  await M.zrobKopie(KOPIE, 'nowa');
  assert.equal(zapisy.length, 0);
});

test('kopie: zegar cofnięty (starsze kopie „z przyszłości”) - nowa kopia zostaje', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 10, 10, 0) });
  for (let i = 1; i <= 5; i++) pliki.set(`${KOPIE}/mikroplatnosci-2027010${i}-120000.json`, 'z przyszłości ' + i);
  await M.zrobKopie(KOPIE, 'dzisiejsze');
  const kopie = [...pliki.keys()].filter((k) => k.startsWith(KOPIE + '/mikroplatnosci-'));
  assert.equal(kopie.length, 5);
  assert.ok(kopie.some((k) => pliki.get(k) === 'dzisiejsze'));
});

test('usuwanie danych z komputera: plik, plik tymczasowy i wszystkie kopie; inne pliki zostają', async () => {
  pliki.set(PLIK, tresc([]));
  pliki.set(PLIK + '.tmp', 'x');
  pliki.set(`${KOPIE}/mikroplatnosci-20260101-120000.json`, 'k1');
  pliki.set(`${KOPIE}/mikroplatnosci-20260102-120000.json`, 'k2');
  pliki.set(F + '/kursy.json', '{}');
  pliki.set(F + '/ustawienia.json', '{}');
  await M.usunDaneLokalne(PLIK, KOPIE);
  assert.deepEqual([...pliki.keys()].sort(), [F + '/kursy.json', F + '/ustawienia.json']);
  // Drugi raz (nic nie ma) - bez błędu.
  await M.usunDaneLokalne(PLIK, KOPIE);
});

test('usuwanie danych: błąd usuwania idzie dalej (użytkownik musi wiedzieć, że plik został)', async () => {
  pliki.set(PLIK, tresc([]));
  bledy.remove = blad('NE_FS_REMVERR');
  await assert.rejects(M.usunDaneLokalne(PLIK, KOPIE), { code: 'NE_FS_REMVERR' });
});

test('blokada: świeża blokada innej kopii zatrzymuje start; stara, „z przyszłości” albo własna - przejęta', async () => {
  const B = F + '/otwarta.lock';
  pliki.set(B, JSON.stringify({ pid: 2, czas: Date.now() - 60000 }));
  assert.equal(await M.zajmijBlokade(B, 1), false);
  pliki.set(B, JSON.stringify({ pid: 2, czas: Date.now() - 3 * 60000 }));
  assert.equal(await M.zajmijBlokade(B, 1), true);
  assert.equal(JSON.parse(pliki.get(B)).pid, 1);
  pliki.set(B, JSON.stringify({ pid: 2, czas: Date.now() + 3 * 60000 }));
  assert.equal(await M.zajmijBlokade(B, 1), true);
  pliki.set(B, JSON.stringify({ pid: 1, czas: Date.now() }));
  assert.equal(await M.zajmijBlokade(B, 1), true);
  pliki.delete(B);
  assert.equal(await M.zajmijBlokade(B, 1), true);
});

test('ustawienia: domyślnie zapis lokalny włączony; zapis i odczyt; śmieci = domyślne', async () => {
  const U = F + '/ustawienia.json';
  const domyslne = { lokalnie: true, motyw: '', prowizja: 0, funkcje: poprawneFunkcje(), powiadomienia: null, wTle: false, jezyk: '', wprowadzenie: false, budzet: 0 };
  assert.deepEqual(await wczytajUstawienia(U), domyslne);
  await zapiszUstawienia(U, { lokalnie: false, motyw: 'jasny', prowizja: 2.5 });
  assert.deepEqual(await wczytajUstawienia(U), { ...domyslne, lokalnie: false, motyw: 'jasny', prowizja: 2.5 });
  pliki.set(U, '{zepsute');
  assert.deepEqual(await wczytajUstawienia(U), domyslne);
  pliki.set(U, JSON.stringify({ lokalnie: 'nie', motyw: '<script>', prowizja: 99, funkcje: 'x', powiadomienia: 5, wTle: 'tak', jezyk: 'xx', wprowadzenie: 1 }));
  assert.deepEqual(await wczytajUstawienia(U), domyslne);
  // F27 / F25: język i notatki „pierwsze kroki” - zapis i odczyt.
  await zapiszUstawienia(U, { lokalnie: true, jezyk: 'en', wprowadzenie: true });
  assert.deepEqual(await wczytajUstawienia(U), { ...domyslne, jezyk: 'en', wprowadzenie: true });
  // D19: budżet - zapis i odczyt; ujemny, za duży albo tekst = bez limitu.
  await zapiszUstawienia(U, { lokalnie: true, budzet: 450.555 });
  assert.equal((await wczytajUstawienia(U)).budzet, 450.56);
  for (const zly of [-5, 1e9, '300', null]) {
    pliki.set(U, JSON.stringify({ budzet: zly }));
    assert.equal((await wczytajUstawienia(U)).budzet, 0);
  }
});

test('ustawienia: funkcje, rodzaje powiadomień i „w tle” - zapis i odczyt; telefon zapisuje tylko „lokalnie”', async () => {
  const U = F + '/ustawienia.json';
  const powiadomienia = { wycofaj: true, zaplac: false, drogie: true, podwyzka: false, progDrogich: 250 };
  await zapiszUstawienia(U, { lokalnie: true, funkcje: { pauza: false, historia: false }, powiadomienia, wTle: true });
  const u = await wczytajUstawienia(U);
  assert.equal(u.funkcje.pauza, false);
  assert.equal(u.funkcje.historia, false);
  assert.equal(u.funkcje.platnosc, true, 'brak wpisu = włączona');
  assert.deepEqual(u.powiadomienia, powiadomienia);
  assert.equal(u.wTle, true);
  // Próg spoza zakresu - 100 zł; brak rodzaju = wyłączony.
  pliki.set(U, JSON.stringify({ powiadomienia: { wycofaj: true, progDrogich: -5 } }));
  assert.deepEqual((await wczytajUstawienia(U)).powiadomienia, { wycofaj: true, zaplac: false, drogie: false, podwyzka: false, progDrogich: 100 });
  await zapiszUstawienia(U, { lokalnie: false });
  assert.deepEqual(JSON.parse(pliki.get(U)), { lokalnie: false });
});
