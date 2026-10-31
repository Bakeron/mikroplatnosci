// Daty, terminy i alarmy (alarmy.js). Daty liczone od dziś.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsujDate, dzis, dodajMiesiace, okresZDat, termin, czyZakonczona, dniTekst, zbierzAlarmy, doPlatnosci } from '../resources/js/alarmy.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const za = (dni) => { const d = dzis(); d.setDate(d.getDate() + dni); return d; };

test('parsujDate: tylko prawdziwe daty RRRR-MM-DD', () => {
  assert.equal(parsujDate('2026-02-30'), null);
  assert.equal(parsujDate('2026-2-3'), null);
  assert.equal(parsujDate(''), null);
  assert.equal(parsujDate(20261030), null);
  assert.equal(iso(parsujDate('2028-02-29')), '2028-02-29');
});

test('dodajMiesiace: koniec miesiąca i rok przestępny', () => {
  assert.equal(iso(dodajMiesiace(parsujDate('2026-01-31'), 1)), '2026-02-28');
  assert.equal(iso(dodajMiesiace(parsujDate('2028-01-31'), 1)), '2028-02-29');
  assert.equal(iso(dodajMiesiace(parsujDate('2026-11-15'), 12)), '2027-11-15');
});

test('okresZDat: bliższy z miesiąca i roku, złe dane - pusty', () => {
  assert.equal(okresZDat('2026-08-05', '2026-09-05'), 'M');
  assert.equal(okresZDat('2025-11-20', '2026-11-20'), 'R');
  assert.equal(okresZDat('2026-09-05', '2026-08-05'), '');
  assert.equal(okresZDat('2026-08-05', ''), '');
});

test('termin: przedłużane przesuwają się na przyszłość, jednorazowe nie', () => {
  const zakup = iso(dodajMiesiace(dzis(), -3)); // 3 miesiące temu
  const przedl = termin({ od: zakup, okres: 'M', przedluzac: 'tak' }).data;
  assert.ok(przedl >= dzis());
  assert.ok(przedl <= dodajMiesiace(dzis(), 1));
  const jedno = termin({ od: zakup, okres: 'M', przedluzac: 'nie' }).data;
  assert.equal(iso(jedno), iso(dodajMiesiace(parsujDate(zakup), 1)));
  assert.equal(termin({ od: '', okres: 'M' }).data, null);
  assert.equal(termin({ od: zakup, okres: '' }).data, null);
});

test('termin: stary wpis z samą datą „do” liczony od niej', () => {
  const doDnia = iso(za(10));
  assert.equal(iso(termin({ od: '', do: doDnia, okres: 'M', przedluzac: 'tak' }).data), doDnia);
});

test('czyZakonczona: tylko „nie” z terminem w przeszłości', () => {
  const dawno = iso(dodajMiesiace(dzis(), -3));
  assert.equal(czyZakonczona({ od: dawno, okres: 'M', przedluzac: 'nie' }), true);
  assert.equal(czyZakonczona({ od: dawno, okres: 'M', przedluzac: 'tak' }), false);
  assert.equal(czyZakonczona({ od: iso(dzis()), okres: 'M', przedluzac: 'nie' }), false);
});

test('dniTekst', () => {
  assert.equal(dniTekst(1), '1 dzień');
  assert.equal(dniTekst(5), '5 dni');
});

test('doPlatnosci: kolor od zielonego do czerwonego, minięty termin', () => {
  const wpis = (dni, extra = {}) => ({ od: iso(dodajMiesiace(za(dni), -1)), okres: 'M', przedluzac: 'nie', ...extra });
  const blisko = doPlatnosci(wpis(2));
  const daleko = doPlatnosci(wpis(25));
  assert.equal(blisko.dni, 2);
  assert.ok(blisko.odcien < daleko.odcien);
  assert.deepEqual(doPlatnosci(wpis(-3)), { dni: -3, minal: true });
  assert.equal(doPlatnosci({ od: '', okres: 'M' }), null);
});

test('zbierzAlarmy: progi rocznych i miesięcznych, przedłużane miesięczne bez alarmu', () => {
  const roczna = (dni, przedluzac = 'tak') => ({ od: iso(dodajMiesiace(za(dni), -12)), okres: 'R', przedluzac });
  const miesieczna = (dni, przedluzac = 'nie') => ({ od: iso(dodajMiesiace(za(dni), -1)), okres: 'M', przedluzac });
  const { roczne, jednorazowe } = zbierzAlarmy([
    roczna(20), roczna(50), roczna(80), roczna(200),
    miesieczna(2), miesieczna(6), miesieczna(20), miesieczna(2, 'tak'),
    { od: '', okres: 'M', przedluzac: 'nie' },
  ]);
  assert.deepEqual(roczne.map((a) => a.poziom), ['czerwony', 'pomaranczowy', 'zolty']);
  assert.deepEqual(jednorazowe.map((a) => a.poziom), ['czerwony', 'pomaranczowy', null, 'brak']);
});
