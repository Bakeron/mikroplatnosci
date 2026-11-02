// Zakładka „Ustawienia” (funkcje.js), B8 - „zapłać do” przed weekendem i świętem (swieta.js, alarmy.js),
// B9 - powiadomienia „Przygotuj pieniądze” i „Podwyżka” (powiadomienia.js). Stały „dziś”: wtorek 10.11.2026.
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { wielkanoc, dzienRoboczyPrzed, czySwieto } from '../resources/js/swieta.js';
import { doZaplaty, isoDnia, czyWstrzymana, przeniesNastepnaCene, termin } from '../resources/js/alarmy.js';
import { przypomnienia, rozplanuj, tresc, tytul, DOMYSLNE_RODZAJE } from '../resources/js/powiadomienia.js';
import { policz } from '../resources/js/podsumowanie.js';
import { normalizuj } from '../resources/js/dane.js';
import { ustawFunkcje, funkcja } from '../resources/js/funkcje.js';

mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 10, 10, 0).getTime() });
afterEach(() => ustawFunkcje({})); // po każdym teście - wszystkie funkcje włączone

const iso = (d) => (d ? isoDnia(d) : null);
const d = (s) => new Date(...s.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)));
const wpis = (extra) => normalizuj({ id: 'x', nazwa: 'Prąd', przedluzac: 'tak', waluta: 'PLN', okres: 'M', koszt: 100, ...extra });
const wszystkie = { wycofaj: true, zaplac: true, drogie: true, podwyzka: true, progDrogich: 100 };
const pam = () => ({ pokazane: new Set(), zaplanowane: new Set() });

test('święta: Wielkanoc i ruchome święta, Wigilia od 2025', () => {
  assert.deepEqual([2024, 2025, 2026, 2027, 2030].map((r) => iso(wielkanoc(r))), ['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2030-04-21']);
  assert.equal(czySwieto(d('2026-04-06')), true, 'Poniedziałek Wielkanocny');
  assert.equal(czySwieto(d('2026-06-04')), true, 'Boże Ciało (Wielkanoc + 60)');
  assert.equal(czySwieto(d('2026-05-24')), true, 'Zielone Świątki');
  assert.equal(czySwieto(d('2026-11-11')), true);
  assert.equal(czySwieto(d('2026-12-24')), true);
  assert.equal(czySwieto(d('2024-12-24')), false, 'Wigilia wolna dopiero od 2025');
  assert.equal(czySwieto(d('2026-11-10')), false);
});

test('ostatni dzień roboczy: sobota, niedziela, święta pod rząd', () => {
  assert.equal(iso(dzienRoboczyPrzed(d('2026-11-10'))), '2026-11-10', 'wtorek - bez zmian');
  assert.equal(iso(dzienRoboczyPrzed(d('2026-11-14'))), '2026-11-13', 'sobota → piątek');
  assert.equal(iso(dzienRoboczyPrzed(d('2026-11-01'))), '2026-10-30', 'niedziela i święto → piątek');
  assert.equal(iso(dzienRoboczyPrzed(d('2026-12-27'))), '2026-12-23', 'niedziela po 24-26.12 → 23.12');
  assert.equal(iso(dzienRoboczyPrzed(d('2026-06-04'))), '2026-06-03', 'Boże Ciało');
  assert.equal(iso(dzienRoboczyPrzed(d('2027-01-01'))), '2026-12-31', 'Nowy Rok');
});

test('B8: „zapłać do” przy terminie w niedzielę - piątek; wyłączone - sam termin', () => {
  const w = wpis({ platnoscReczna: true, od: '2026-10-15' }); // termin 15.11.2026 - niedziela
  const dz = doZaplaty(w);
  assert.equal(iso(dz.data), '2026-11-15');
  assert.equal(iso(dz.doDnia), '2026-11-13');
  assert.equal(dz.dni, 3);
  assert.equal(dz.zalegle, false);
  ustawFunkcje({ weekend: false });
  assert.equal(iso(doZaplaty(w).doDnia), '2026-11-15');
  assert.equal(doZaplaty(w).dni, 5);
});

test('B8: termin w święto jutro (11.11) - zapłać dziś; zaległość liczy się od terminu', () => {
  const w = wpis({ platnoscReczna: true, od: '2026-10-11' });
  assert.equal(iso(doZaplaty(w).doDnia), '2026-11-10');
  assert.equal(doZaplaty(w).dni, 0);
  // Termin w sobotę 14.11, dziś wtorek - „zapłać do” piątek 13.11, nie zaległe.
  const sob = doZaplaty(wpis({ platnoscReczna: true, od: '2026-10-14' }));
  assert.equal(iso(sob.doDnia), '2026-11-13');
  assert.equal(sob.zalegle, false);
});

test('B8: powiadomienia „Zapłać” liczone od dnia roboczego, w treści powód', () => {
  const w = wpis({ platnoscReczna: true, od: '2026-10-15' }); // termin niedziela 15.11 → zapłać do 13.11
  const lista = przypomnienia([w]);
  assert.deepEqual(lista.map((p) => iso(p.dzien)), ['2026-11-06', '2026-11-10', '2026-11-12']);
  assert.equal(lista[0].klucz, 'x|2026-11-15|zapłać za tydzień', 'klucz z terminem jak dotąd - pamięć pokazanych ważna');
  const p = lista.find((x) => x.napis === 'jutro');
  assert.match(tresc(p), /^Zapłać jutro, do 13\.11\.2026 \(100,00 zł\): termin 15\.11\.2026 wypada w niedzielę/);
  assert.equal(tytul(p), 'Zapłać: Prąd');
  // Termin w dzień roboczy - treść jak dotąd.
  const zwykla = przypomnienia([wpis({ platnoscReczna: true, od: '2026-10-17' })]).at(-1);
  assert.match(tresc(zwykla), /^Termin płatności jutro, 17\.11\.2026/);
});

test('B9: „Przygotuj pieniądze” - droga płatność, która pobiera się sama, tydzień przed', () => {
  const drogi = wpis({ id: 'h', nazwa: 'Hosting', okres: 'R', koszt: 300, od: '2025-11-17' }); // termin 17.11.2026
  const tani = wpis({ id: 't', nazwa: 'Tani', koszt: 50, od: '2026-10-17' });
  assert.equal(przypomnienia([drogi]).length, 0, 'domyślnie wyłączone');
  const lista = przypomnienia([drogi, tani], wszystkie);
  assert.deepEqual(lista.map((p) => [p.rodzaj, iso(p.dzien)]), [['drogie', '2026-11-10']]);
  assert.equal(tytul(lista[0]), 'Przygotuj pieniądze: Hosting');
  assert.match(tresc(lista[0]), /^Płatność za tydzień, 17\.11\.2026 \(300,00 zł\) pobierze się sama z konta/);
  assert.equal(przypomnienia([drogi], { ...wszystkie, progDrogich: 301 }).length, 0, 'poniżej progu');
  assert.equal(przypomnienia([wpis({ ...drogi, platnoscReczna: true })], { ...wszystkie, zaplac: false }).length, 0, '„płacę sam” ma swoje „Zapłać”');
});

test('B9: „Podwyżka” przed płatnością z wyższą ceną; obniżka - bez powiadomienia', () => {
  const w = wpis({ id: 'n', nazwa: 'Netflix', koszt: 43, prognoza: 49, prognozaOd: '2026-11-17', od: '2026-10-17' });
  const lista = przypomnienia([w], wszystkie).filter((p) => p.rodzaj === 'podwyzka');
  assert.deepEqual(lista.map((p) => iso(p.dzien)), ['2026-11-10']);
  assert.equal(tytul(lista[0]), 'Podwyżka: Netflix');
  assert.match(tresc(lista[0]), /drożej o 6,00 zł: 43,00 zł → 49,00 zł\. Dalej chcesz\?/);
  assert.equal(przypomnienia([{ ...w, prognoza: 40 }], wszystkie).filter((p) => p.rodzaj === 'podwyzka').length, 0);
  ustawFunkcje({ nastepna: false });
  assert.equal(przypomnienia([w], wszystkie).filter((p) => p.rodzaj === 'podwyzka').length, 0, 'bez „Ceny następnej” - bez podwyżek');
});

test('rozplanuj: „Zapłać” i „Podwyżka” tej samej pozycji - oba; rodzaje wyłączone - nic', () => {
  const w = wpis({ platnoscReczna: true, koszt: 43, prognoza: 49, prognozaOd: '2026-11-17', od: '2026-10-17' });
  const r = rozplanuj([w], pam(), new Date(2026, 10, 10, 10), wszystkie);
  assert.deepEqual(r.teraz.map((p) => p.rodzaj).sort(), ['podwyzka', 'zaplac']);
  assert.equal(rozplanuj([w], pam(), new Date(2026, 10, 10, 10), { ...DOMYSLNE_RODZAJE, wycofaj: false, zaplac: false }).teraz.length, 0);
});

test('funkcje: wyłączone „Płacę sam” - liczone jak „pobiera się sama”, zależne też wyłączone', () => {
  const w = wpis({ platnoscReczna: true, od: '2026-10-11' });
  ustawFunkcje({ platnosc: false });
  assert.equal(doZaplaty(w), null);
  assert.equal(funkcja('weekend'), false);
  assert.equal(funkcja('kwotaZmienna'), false);
  assert.equal(przypomnienia([w]).length, 0);
  assert.equal(iso(termin(w).data), '2026-11-11', 'termin jak przy płatności, która pobiera się sama');
});

test('funkcje: wyłączone dzielenie, pauza i cena następna - dane zostają, obliczenia jak bez nich', () => {
  const wspolna = wpis({ koszt: 60, osob: 3, od: '2026-10-20' });
  assert.equal(policz([wspolna]).miesieczne, 20);
  ustawFunkcje({ dzielenie: false });
  assert.equal(policz([wspolna]).miesieczne, 60);
  assert.equal(wspolna.osob, 3);

  const wstrzymana = wpis({ od: '2026-10-20', wstrzymanaDo: '2027-01-01' });
  assert.equal(czyWstrzymana(wstrzymana), true);
  ustawFunkcje({ pauza: false });
  assert.equal(czyWstrzymana(wstrzymana), false);
  assert.equal(iso(termin(wstrzymana).data), '2026-11-20', 'terminy od daty zakupu, bez pauzy');

  const nastepna = wpis({ koszt: 43, prognoza: 49, prognozaOd: '2026-11-01', od: '2026-10-01' });
  ustawFunkcje({ nastepna: false });
  assert.equal(przeniesNastepnaCene(nastepna), '');
  assert.equal(nastepna.koszt, 43);
  assert.equal(policz([nastepna]).jestPrognoza, false);
  ustawFunkcje({});
  assert.equal(przeniesNastepnaCene(nastepna), 'cena', 'po ponownym włączeniu cena przechodzi');
  assert.equal(nastepna.koszt, 49);
});
