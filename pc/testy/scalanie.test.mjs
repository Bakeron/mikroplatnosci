// Scalanie danych z dwóch urządzeń wiersz po wierszu (scalanie.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scal } from '../resources/js/scalanie.js';

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
