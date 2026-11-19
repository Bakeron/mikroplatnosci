// Scalanie danych z dwóch urządzeń wiersz po wierszu (scalanie.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scal, oznaczPola } from '../resources/js/scalanie.js';
import { normalizuj, doZapisu, zastapZKopii } from '../resources/js/dane.js';

const T = (h) => `2026-10-30T${h}:00.000Z`;
const w = (id, h, nazwa = id) => ({ id, zmieniono: h ? T(h) : '', nazwa });

test('nowsza zmiana wygrywa (obie strony)', () => {
  const r = scal({ wpisy: [w('a', '10:00', 'PC'), w('b', '12:00', 'PC')], usuniete: [] },
    { wpisy: [w('a', '11:00', 'tel'), w('b', '09:00', 'tel')], usuniete: [] });
  assert.deepEqual(r.wpisy.map((x) => x.nazwa), ['tel', 'PC']);
});

test('dodane na telefonie trafia na koniec, kolejność z PC', () => {
  const r = scal({ wpisy: [w('b', '01:00'), w('a', '02:00')], usuniete: [] }, { wpisy: [w('a', '02:00'), w('c', '03:00')], usuniete: [] });
  assert.deepEqual(r.wpisy.map((x) => x.id), ['b', 'a', 'c']);
});

test('usunięte na telefonie znika z PC i nie wraca', () => {
  const r = scal({ wpisy: [w('a', '10:00')], usuniete: [] }, { wpisy: [], usuniete: [{ id: 'a', kiedy: T('11:00') }] });
  assert.deepEqual(r.wpisy, []);
  assert.deepEqual(r.usuniete.map((u) => u.id), ['a']);
  const r2 = scal({ wpisy: [], usuniete: [{ id: 'a', kiedy: T('11:00') }] }, { wpisy: [w('a', '10:00')], usuniete: [] });
  assert.deepEqual(r2.wpisy, []);
});

test('zmiana po usunięciu przywraca pozycję i kasuje znacznik', () => {
  const r = scal({ wpisy: [], usuniete: [{ id: 'a', kiedy: T('10:00') }] }, { wpisy: [w('a', '11:00')], usuniete: [] });
  assert.deepEqual(r.wpisy.map((x) => x.id), ['a']);
  assert.deepEqual(r.usuniete, []);
});

test('stare wpisy bez czasu - zostaje wersja z PC, usunięcie wygrywa', () => {
  const r = scal({ wpisy: [w('a', '', 'PC'), w('b', '')], usuniete: [] }, { wpisy: [w('a', '', 'tel')], usuniete: [{ id: 'b', kiedy: T('09:00') }] });
  assert.deepEqual(r.wpisy.map((x) => x.nazwa), ['PC']);
});

test('scalenie jest powtarzalne (drugi raz bez zmian)', () => {
  const L = { wpisy: [w('a', '10:00'), w('b', '08:00')], usuniete: [{ id: 'x', kiedy: T('07:00') }] };
  const Z = { wpisy: [w('b', '09:00'), w('c', '05:00')], usuniete: [{ id: 'a', kiedy: T('06:00') }] };
  const r1 = scal(L, Z);
  assert.deepEqual(scal(r1, Z), r1);
  assert.deepEqual(scal(r1, r1), r1);
});

test('kolejność z urządzenia, na którym później ułożono pozycje', () => {
  const L = { wpisy: [w('a', '01:00', 'PC'), w('b', '01:00'), w('c', '01:00'), w('l', '01:00')], usuniete: [], ulozono: T('08:00') };
  const Z = { wpisy: [w('c', '01:00'), w('a', '05:00', 'tel'), w('b', '01:00'), w('z', '01:00')], usuniete: [], ulozono: T('09:00') };
  const r = scal(L, Z);
  // Kolejność z telefonu (ułożony później), dopisane tylko na PC - na końcu; treść pozycji - nowsza zmiana.
  assert.deepEqual(r.wpisy.map((x) => x.id), ['c', 'a', 'b', 'z', 'l']);
  assert.equal(r.wpisy[1].nazwa, 'tel');
  assert.equal(r.ulozono, T('09:00'));
  // W drugą stronę (PC ułożony później) - kolejność z PC.
  const r2 = scal({ ...L, ulozono: T('10:00') }, Z);
  assert.deepEqual(r2.wpisy.map((x) => x.id), ['a', 'b', 'c', 'l', 'z']);
  assert.equal(r2.ulozono, T('10:00'));
});

test('bez czasu ułożenia (starsza wersja aplikacji) - kolejność z tego urządzenia', () => {
  const r = scal({ wpisy: [w('b', '01:00'), w('a', '01:00')], usuniete: [] }, { wpisy: [w('a', '01:00'), w('b', '01:00')], usuniete: [] });
  assert.deepEqual(r.wpisy.map((x) => x.id), ['b', 'a']);
  assert.equal(r.ulozono, '');
  const r2 = scal({ wpisy: [w('b', '01:00'), w('a', '01:00')], usuniete: [], ulozono: T('01:00') }, { wpisy: [w('a', '01:00'), w('b', '01:00')], usuniete: [] });
  assert.deepEqual(r2.wpisy.map((x) => x.id), ['b', 'a']);
});

// Pozycja zsynchronizowana o 09:00 na obu urządzeniach (z czasami pól), potem zmieniana osobno.
const wspolna = () => {
  const x = normalizuj({ id: 'n', nazwa: 'Netflix', koszt: 43, od: '2026-01-05', okres: 'M', zmieniono: T('09:00') });
  oznaczPola([x]);
  return structuredClone(x);
};

test('ta sama pozycja, różne pola (mąż cenę, żona datę) - zostają obie zmiany', () => {
  const maz = wspolna();
  Object.assign(maz, { koszt: 49, zmieniono: T('10:00') });
  const zona = wspolna();
  Object.assign(zona, { od: '2026-01-12', zmieniono: T('11:00') });
  for (const [L, Z] of [[maz, zona], [zona, maz]]) {
    const [x] = scal({ wpisy: [structuredClone(L)], usuniete: [] }, { wpisy: [structuredClone(Z)], usuniete: [] }).wpisy;
    assert.equal(x.koszt, 49);
    assert.equal(x.od, '2026-01-12');
    assert.equal(x.nazwa, 'Netflix');
    assert.equal(x.zmieniono, T('11:00'));
    assert.equal(x.pola.koszt.t, T('10:00'));
    assert.equal(x.pola.od.t, T('11:00'));
  }
});

test('ta sama pozycja, to samo pole - wygrywa nowsza zmiana; wynik powtarzalny', () => {
  const maz = wspolna();
  Object.assign(maz, { koszt: 49, nazwa: 'Netflix HD', zmieniono: T('12:00') });
  const zona = wspolna();
  Object.assign(zona, { koszt: 55, zmieniono: T('11:00') });
  const L = { wpisy: [maz], usuniete: [] };
  const Z = { wpisy: [zona], usuniete: [] };
  const r = scal(L, Z);
  assert.equal(r.wpisy[0].koszt, 49);
  assert.equal(r.wpisy[0].nazwa, 'Netflix HD');
  assert.deepEqual(scal(structuredClone(r), Z), r);
  assert.deepEqual(scal(structuredClone(r), structuredClone(r)), r);
});

test('druga strona bez czasów pól (starsza wersja aplikacji) - cały wiersz z nowszej zmiany', () => {
  const nowa = wspolna();
  Object.assign(nowa, { koszt: 49, zmieniono: T('10:00') });
  const stara = normalizuj({ id: 'n', nazwa: 'Netflix', koszt: 43, od: '2026-01-12', okres: 'M', zmieniono: T('11:00') });
  stara.pola = {};
  const [x] = scal({ wpisy: [nowa], usuniete: [] }, { wpisy: [stara], usuniete: [] }).wpisy;
  assert.equal(x.koszt, 43);
  assert.equal(x.od, '2026-01-12');
});

test('czasy pól: zapis oznacza zmienione pole czasem wiersza, plik z błędnymi czasami pól - pominięte', () => {
  const stan = { wpisy: [wspolna()], usuniete: [] };
  Object.assign(stan.wpisy[0], { koszt: 50, zmieniono: T('13:00') });
  const plik = doZapisu(stan);
  assert.equal(plik.wpisy[0].pola.koszt.t, T('13:00'));
  assert.equal(plik.wpisy[0].pola.nazwa.t, T('09:00'));
  const x = normalizuj(JSON.parse('{"id":"n","nazwa":"a","pola":{"nazwa":{"h":"abc","t":"wczoraj"},"koszt":{"h":"<b>","t":"2026-10-30T01:00:00.000Z"},"obce":{"h":"a","t":"2026-10-30T01:00:00.000Z"},"__proto__":{"h":"a"}}}'));
  assert.deepEqual(x.pola, { nazwa: { h: 'abc', t: '' } });
});

test('wczytanie kopii zapasowej - każde pole z czasem „teraz” (wygrywa na Dysku)', () => {
  const stan = { wpisy: [], usuniete: [] };
  zastapZKopii(stan, { wpisy: [wspolna()], kategorie: null }, T('15:00'));
  doZapisu(stan);
  assert.ok(Object.values(stan.wpisy[0].pola).every((p) => p.t === T('15:00')));
});
