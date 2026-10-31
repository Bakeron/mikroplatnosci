// Sprawdzanie danych z pliku i z Dysku (dane.js) oraz paragon (podsumowanie.js) - bez DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizuj, odczytajUsuniete, nowyWpis, odczytajDane, doZapisu, odczytajTresc, usun, nazwaWpisu } from '../resources/js/dane.js';
import { policz } from '../resources/js/podsumowanie.js';

test('plik danych: nieznany format odrzucony', () => {
  for (const zly of [null, {}, { wpisy: 'x' }, 'tekst', 5]) assert.equal(odczytajDane(zly), null);
});

test('plik danych: odczyt pomija śmieci i sprawdza pola', () => {
  const d = odczytajDane({ wpisy: [{ id: 'a', nazwa: 'Netflix', koszt: 43 }, null, 'x', 7], usuniete: [{ id: 'b', kiedy: '2026-10-30T10:00:00.000Z' }, { id: 'c' }] });
  assert.deepEqual(d.wpisy.map((w) => [w.id, w.nazwa, w.koszt]), [['a', 'Netflix', 43]]);
  assert.deepEqual(d.usuniete, [{ id: 'b', kiedy: '2026-10-30T10:00:00.000Z' }]);
});

test('plik danych: zapis i ponowny odczyt dają to samo, dodatki PC przed wpisami', () => {
  const stan = { wpisy: [normalizuj({ id: 'a', nazwa: 'X', koszt: 1 })], usuniete: [{ id: 'b', kiedy: '2026-10-30T10:00:00.000Z' }] };
  const plik = doZapisu(stan, { motyw: 'jasny' });
  assert.deepEqual(Object.keys(plik), ['wersja', 'zapisano', 'motyw', 'wpisy', 'usuniete']);
  assert.equal(plik.wersja, 2);
  assert.deepEqual(odczytajDane(JSON.parse(JSON.stringify(plik))), stan);
  assert.deepEqual(Object.keys(doZapisu(stan)), ['wersja', 'zapisano', 'wpisy', 'usuniete']);
});

test('śmieci z pliku zamieniane na bezpieczne wartości', () => {
  const w = normalizuj({ id: 5, od: '2026-13', okres: 'X', nazwa: 7, koszt: -3, waluta: 'GBP', przedluzac: 'może', prognoza: Infinity, prognozaCennik: 'javascript:alert(1)', zmieniono: 'wczoraj' });
  assert.equal(typeof w.id, 'string');
  assert.ok(w.id.length > 0);
  assert.deepEqual(
    [w.od, w.okres, w.nazwa, w.koszt, w.waluta, w.przedluzac, w.prognoza, w.prognozaCennik, w.zmieniono],
    ['', 'M', '', null, 'PLN', '', null, '', ''],
  );
});

test('długie teksty przycięte', () => {
  const w = normalizuj({ id: 'a'.repeat(100), nazwa: 'n'.repeat(500), opis: 'o'.repeat(500), link: 'l'.repeat(5000) });
  assert.deepEqual([w.id.length, w.nazwa.length, w.opis.length, w.link.length], [64, 200, 300, 2000]);
});

test('stare wpisy: okres z dat „od” i „do”', () => {
  assert.equal(normalizuj({ od: '2026-08-05', do: '2026-09-05' }).okres, 'M');
  assert.equal(normalizuj({ od: '2025-11-20', do: '2026-11-20' }).okres, 'R');
  assert.equal(normalizuj({ od: '2026-08-05' }).okres, 'M');
  assert.equal(normalizuj({ od: '2025-11-20', do: '2026-11-20', okres: 'M' }).okres, 'M');
});

test('lista usuniętych: tylko poprawne pozycje', () => {
  const u = odczytajUsuniete([{ id: 'a', kiedy: '2026-10-30T10:00:00.000Z' }, { id: 'b', kiedy: 'zaraz' }, null, { id: '', kiedy: '2026-10-30T10:00:00Z' }]);
  assert.deepEqual(u, [{ id: 'a', kiedy: '2026-10-30T10:00:00.000Z' }]);
  assert.deepEqual(odczytajUsuniete('nie lista'), []);
});

test('nowy wpis przechodzi sprawdzanie bez zmian', () => {
  const w = nowyWpis();
  assert.deepEqual(normalizuj(w), w);
});

test('paragon: roczna „do wycofania” widoczna, ale poza sumą (błąd z 29.10.2026)', () => {
  const s = policz([
    { nazwa: 'Youtube', koszt: 30, waluta: 'PLN', okres: 'M', przedluzac: 'tak', od: '2026-10-01' },
    { nazwa: 'Kurs online', koszt: 1000, waluta: 'PLN', okres: 'R', przedluzac: 'nie', od: '2026-06-01' },
    { nazwa: 'Domena', koszt: 120, waluta: 'PLN', okres: 'R', przedluzac: 'tak', od: '2026-01-15' },
  ]);
  assert.deepEqual(s.listaRoczne.map((p) => [p.nazwa, Boolean(p.wycofanie)]), [['Kurs online', true], ['Domena', false]]);
  assert.equal(s.miesieczne, 30);
  assert.equal(s.roczne, 120);
  assert.equal(s.lacznieMiesiecznie, 30 + 120 / 12);
  assert.deepEqual([s.jednorazoweIlosc, s.jednorazoweKoszt], [1, 1000]);
});

test('nowy wpis domyślnie przedłużany', () => {
  assert.equal(nowyWpis().przedluzac, 'tak');
});

test('wpis bez id: to samo id przy każdym odczycie, powtórzone id z numerem', () => {
  const plik = { wpisy: [{ nazwa: 'x', koszt: 5 }, { nazwa: 'x', koszt: 5 }, { nazwa: 'y' }] };
  const a = odczytajDane(plik).wpisy.map((w) => w.id);
  const b = odczytajDane(plik).wpisy.map((w) => w.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 3);
  assert.equal(a[1], a[0] + '-1');
  assert.deepEqual(odczytajDane({ wpisy: [{ id: 'k' }, { id: 'k' }] }).wpisy.map((w) => w.id), ['k', 'k-1']);
});

test('paragon: wpis bez kwoty oznaczony (nie „brak kursu”)', () => {
  const s = policz([{ nazwa: '', koszt: null, waluta: 'PLN', okres: 'M', przedluzac: 'tak', od: '' }]);
  assert.equal(s.listaMiesieczne[0].bezKwoty, true);
  assert.equal(s.bezKursu, 0);
});

test('paragon: waluta obca bez kursu NBP poza sumą', () => {
  const s = policz([{ nazwa: 'Claude', koszt: 20, waluta: 'USD', okres: 'M', przedluzac: 'tak', od: '2026-10-01' }]);
  assert.equal(s.bezKursu, 1);
  assert.equal(s.miesieczne, 0);
  assert.equal(s.listaMiesieczne[0].pln, null);
});

test('plik danych: pusty albo obcy plik to błąd (nic nie zostanie nadpisane)', () => {
  assert.throws(() => odczytajTresc('  \n'), /pusty/);
  assert.throws(() => odczytajTresc('{"cos":1}'), /format/);
  assert.throws(() => odczytajTresc('{uszkodzony'));
  const d = odczytajTresc(JSON.stringify({ wpisy: [{ id: 'a' }], usuniete: [], motyw: 'jasny' }));
  assert.equal(d.wpisy[0].id, 'a');
  assert.equal(d.motyw, 'jasny');
});

test('usuwanie: czas usunięcia nie wcześniejszy niż ostatnia zmiana (zegar do przodu)', () => {
  const przyszlosc = new Date(Date.now() + 3600000).toISOString();
  const wpis = normalizuj({ id: 'a', zmieniono: przyszlosc });
  const stan = { wpisy: [wpis, normalizuj({ id: 'b' })], usuniete: [] };
  usun(stan, { ...wpis }); // inny obiekt, to samo id - po scaleniu z Dyskiem
  assert.deepEqual(stan.wpisy.map((w) => w.id), ['b']);
  assert.ok(Date.parse(stan.usuniete[0].kiedy) > Date.parse(przyszlosc));
});

test('powtórzone id dostają wolny numer', () => {
  const d = odczytajDane({ wpisy: [{ id: 'a' }, { id: 'a' }, { id: 'a-1' }, { id: 'a' }] });
  const id = d.wpisy.map((w) => w.id);
  assert.equal(new Set(id).size, 4, id.join(' '));
  assert.deepEqual(id.slice(0, 2), ['a', 'a-1']);
});

test('dane z Dysku: czasy z przyszłości obcięte do jutra, za dużo wpisów = odrzucone', () => {
  const daleko = '9999-12-31T00:00:00.000Z';
  const zwykly = '2026-10-30T10:00:00.000Z';
  const plik = { wpisy: [{ id: 'a', zmieniono: daleko }, { id: 'b', zmieniono: zwykly }], usuniete: [{ id: 'c', kiedy: daleko }] };
  const zDysku = odczytajDane(plik, true);
  const jutro = Date.now() + 86400000;
  assert.ok(Date.parse(zDysku.wpisy[0].zmieniono) <= jutro + 1000);
  assert.equal(zDysku.wpisy[1].zmieniono, zwykly);
  assert.ok(Date.parse(zDysku.usuniete[0].kiedy) <= jutro + 1000);
  assert.equal(odczytajDane(plik).wpisy[0].zmieniono, daleko); // plik z komputera bez zmian
  assert.equal(odczytajDane({ wpisy: Array.from({ length: 5001 }, () => ({})) }, true), null);
});

test('nazwa wpisu: pusta zastąpiona „(bez nazwy)”', () => {
  assert.equal(nazwaWpisu({ nazwa: '  ' }), '(bez nazwy)');
  assert.equal(nazwaWpisu({ nazwa: ' Netflix ' }), 'Netflix');
});
