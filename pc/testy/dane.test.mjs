// Sprawdzanie danych z pliku i z Dysku (dane.js) oraz paragon (podsumowanie.js) - bez DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizuj, odczytajUsuniete, nowyWpis } from '../resources/js/dane.js';
import { policz } from '../resources/js/podsumowanie.js';

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

test('paragon: waluta obca bez kursu NBP poza sumą', () => {
  const s = policz([{ nazwa: 'Claude', koszt: 20, waluta: 'USD', okres: 'M', przedluzac: 'tak', od: '2026-10-01' }]);
  assert.equal(s.bezKursu, 1);
  assert.equal(s.miesieczne, 0);
  assert.equal(s.listaMiesieczne[0].pln, null);
});
