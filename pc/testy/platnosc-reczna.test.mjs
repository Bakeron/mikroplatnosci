// Płatność ręczna („płacę sam”): kiedy wiersz czerwienieje (alarmy.js doZaplaty), zaległość po terminie
// zostaje aż do „✓ zapłacone”, cofnięcie, powiadomienia „Zapłać” (powiadomienia.js) i pola w pliku (dane.js).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { doZaplaty, terminZaplaty, oplacone, cofnijZaplate, doPlatnosci, oznaczZaplate, ustawPoczatekZaplaty, czerwienZaplaty, termin, dniPlatnosci, dzis, dodajMiesiace, isoDnia as iso, DNI_DO_ZAPLATY } from '../resources/js/alarmy.js';
import * as P from '../resources/js/powiadomienia.js';
import { normalizuj, zastosujFormularz } from '../resources/js/dane.js';

mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 10, 10, 0) });

const za = (dni) => { const d = dzis(); d.setDate(d.getDate() + dni); return d; };
// Miesięczna, przedłużana, płacona ręcznie, z terminem za N dni (N < 0 - termin już minął).
// Ostatni zapłacony termin: miesiąc przed tym terminem (jak po włączeniu „płacę sam”).
const prad = (dniDoTerminu, extra = {}) => {
  const t = za(dniDoTerminu);
  return { id: 'prad', nazwa: 'Energia', koszt: 180, waluta: 'PLN', okres: 'M', przedluzac: 'tak', platnoscReczna: true, od: iso(dodajMiesiace(t, -3)), zaplaconyTermin: iso(dodajMiesiace(t, -1)), ...extra };
};

test('do zapłaty: tylko „płacę sam”, od DNI_DO_ZAPLATY dni przed terminem', () => {
  assert.equal(doZaplaty(prad(DNI_DO_ZAPLATY)).dni, DNI_DO_ZAPLATY);
  assert.equal(doZaplaty(prad(0)).dni, 0);
  assert.equal(doZaplaty(prad(DNI_DO_ZAPLATY + 1)), null);
  assert.equal(doZaplaty(prad(3, { platnoscReczna: false })), null);
  assert.equal(doZaplaty(prad(3, { przedluzac: 'nie' })), null, 'do wycofania - nie płacimy');
});

test('niezapłacony termin po czasie zostaje - licznik rośnie, aż do zaznaczenia „zapłacone”', () => {
  const w = prad(-5);
  const dz = doZaplaty(w);
  assert.equal(dz.dni, -5);
  assert.equal(dz.zalegle, true);
  assert.equal(iso(termin(w).data), iso(za(-5)), 'termin nie przeskakuje na następny miesiąc');
  // Dwa miesiące zaległości - najpierw najstarszy termin.
  const dwa = prad(-5, { zaplaconyTermin: iso(dodajMiesiace(za(-5), -2)) });
  assert.equal(iso(termin(dwa).data), iso(dodajMiesiace(za(-5), -1)));
  // Zapłata zdejmuje zaległość: następny termin za ok. miesiąc, bez oznaczenia.
  assert.equal(oznaczZaplate(w), true);
  assert.equal(w.zaplaconyTermin, iso(za(-5)));
  assert.equal(iso(termin(w).data), iso(dodajMiesiace(za(-5), 1)));
  assert.equal(doZaplaty(w), null, 'zapłacone - zwykłe odliczanie');
  assert.equal(oplacone(w), null, 'zaległość zapłacona po terminie - bez „opłacone”');
});

test('zapłacone przed terminem - bez czerwieni, „opłacone” do tego terminu (autor 19.11.2026), potem następny', () => {
  const w = prad(3);
  assert.equal(oznaczZaplate(w), true);
  assert.equal(doZaplaty(w), null);
  assert.equal(iso(oplacone(w)), iso(za(3)));
  assert.equal(iso(termin(w).data), iso(dodajMiesiace(za(3), 1)));
});

test('zapłacone wcześniej niż tydzień przed terminem: „opłacone” do opłaconego terminu (autor 19.11.2026)', () => {
  // „Dziś” w testach: 10.11.2026. Energa do końca miesiąca: termin 30.11 - 20 dni, jeszcze bez czerwieni.
  const w = { id: 'e', nazwa: 'Energa', koszt: 200, waluta: 'PLN', okres: 'M', przedluzac: 'tak', platnoscReczna: true, koniecMiesiaca: true, od: '2026-10-31', zaplaconyTermin: '2026-10-31' };
  assert.equal(doZaplaty(w), null);
  assert.equal(iso(terminZaplaty(w).data), '2026-11-30', 'pole „zapłacone” jest zawsze');
  assert.equal(oplacone(w), null);
  assert.equal(oznaczZaplate(w), true);
  assert.equal(w.zaplaconyTermin, '2026-11-30');
  assert.equal(iso(oplacone(w)), '2026-11-30', 'do 30.11 napis „opłacone”');
  assert.equal(iso(termin(w).data), '2026-12-31', 'następny termin - koniec grudnia');
  assert.deepEqual(w.historia.map((h) => [h.termin, h.dnia, h.kwota]), [['2026-11-30', '2026-11-10', 200]]);
  // Termin opłacony już minął (od 1. dnia następnego miesiąca) - zwykłe odliczanie.
  assert.equal(oplacone({ ...w, zaplaconyTermin: '2026-11-09' }), null);
  // Opłacony termin dziś - jeszcze „opłacone”.
  assert.equal(iso(oplacone({ ...w, zaplaconyTermin: '2026-11-10' })), '2026-11-10');
  // „Pobiera się sama”, „nie przedłużać”, pauza - bez „opłacone”.
  assert.equal(oplacone({ ...w, platnoscReczna: false }), null);
  assert.equal(oplacone({ ...w, przedluzac: 'nie' }), null);
  assert.equal(doPlatnosci(w).dni, 51, 'samo odliczanie liczy do następnego terminu');
});

test('odznaczone „opłacone” cofa zapłatę - w tej sesji w całości, po ponownym uruchomieniu termin i wpłatę', () => {
  const w = prad(20, { prognoza: 210, historia: [{ termin: '2026-10-30', dnia: '2026-10-28', kwota: 180 }] });
  const przed = structuredClone(w);
  assert.equal(oznaczZaplate(w), true);
  assert.equal(w.koszt, 210, 'cena następna stała się zapłaconą');
  assert.equal(cofnijZaplate(w), true);
  assert.deepEqual(w, przed);
  assert.equal(cofnijZaplate(w), false, 'nic opłaconego z góry');
  // Po ponownym uruchomieniu (inny obiekt z pliku): termin znowu do zapłaty, wpłata zdjęta z historii.
  oznaczZaplate(w);
  const zPliku = structuredClone(w);
  assert.equal(cofnijZaplate(zPliku), true);
  assert.equal(iso(termin(zPliku).data), iso(za(20)));
  assert.deepEqual(zPliku.historia, przed.historia);
  assert.equal(oplacone(zPliku), null);
});

test('„termin do końca miesiąca”: ostatni dzień miesiąca, także po zapłacie', () => {
  // „Dziś” w testach: 10.11.2026. Zakup 12.09 → zwykły termin 12.10, do końca miesiąca → 31.10 (zaległe).
  const w = { id: 'e', nazwa: 'Energa', koszt: 200, waluta: 'PLN', okres: 'M', przedluzac: 'tak', platnoscReczna: true, koniecMiesiaca: true, od: '2026-09-12', zaplaconyTermin: '' };
  assert.equal(iso(termin(w).data), '2026-10-31');
  assert.equal(doZaplaty(w).zalegle, true);
  oznaczZaplate(w);
  assert.equal(iso(termin(w).data), '2026-11-30');
  assert.equal(doZaplaty(w), null, 'do 30.11 jeszcze 20 dni');
  // Odznaczone - zwykły dzień z daty zakupu.
  assert.equal(iso(termin({ ...w, koniecMiesiaca: false, zaplaconyTermin: '' }).data), '2026-10-12');
  // Bez „płacę sam” pole nic nie zmienia.
  assert.equal(normalizuj({ id: 'x', koniecMiesiaca: 'tak' }).koniecMiesiaca, false);
});

test('włączenie „płacę sam” przy starej dacie zakupu: co minęło - zapłacone, do zapłaty od dziś (decyzja autora 08.11)', () => {
  // „Dziś” w testach: 10.11.2026.
  const w = { id: 'e', nazwa: 'Energa', koszt: 200, waluta: 'PLN', okres: 'M', przedluzac: 'tak', platnoscReczna: false, od: '2024-09-30', zaplaconyTermin: '' };
  w.platnoscReczna = true;
  ustawPoczatekZaplaty(w, true);
  assert.equal(iso(termin(w).data), '2026-11-30');
  assert.equal(doZaplaty(w), null, 'bez zaległości sprzed włączenia');
  assert.deepEqual(w.historia ?? [], [], 'bez wpłat z dzisiejszą datą w historii');
  assert.equal(dniPlatnosci(w, new Date(2026, 0, 1), dzis()).length, 10, 'historia 2026: terminy styczeń-październik zapłacone jak dawniej');
  // Termin akurat dziś - do zapłaty dziś; zapłacone wcześniej dalsze terminy zostają.
  const dzisiaj = { ...w, od: '2026-08-10', zaplaconyTermin: '' };
  ustawPoczatekZaplaty(dzisiaj, true);
  assert.equal(iso(termin(dzisiaj).data), '2026-11-10');
  const zgory = { ...w, zaplaconyTermin: '2026-12-30' };
  ustawPoczatekZaplaty(zgory, true);
  assert.equal(zgory.zaplaconyTermin, '2026-12-30');
});

test('zmiana daty zakupu przy „płacę sam”: liczy się od niej - 30.10 zaległe (zgłoszenie autora)', () => {
  const w = { id: 'e', nazwa: 'Energa', koszt: 200, waluta: 'PLN', okres: 'M', przedluzac: 'tak', platnoscReczna: true, od: '2026-09-30', zaplaconyTermin: '' };
  ustawPoczatekZaplaty(w);
  assert.equal(iso(termin(w).data), '2026-10-30');
  const dz = doZaplaty(w);
  assert.equal(dz.zalegle, true);
  assert.equal(dz.dni, -11);
  // Zmiana daty zakupu - znowu od niej (zakup = ostatnia zapłata).
  w.zaplaconyTermin = '2026-10-30';
  w.od = '2026-11-05';
  ustawPoczatekZaplaty(w);
  assert.equal(iso(termin(w).data), '2026-12-05');
});

test('czerwień wiersza: coraz mocniej z każdym dniem, po terminie najmocniej', () => {
  const kolejne = [7, 6, 5, 4, 3, 2, 1, 0, -1, -30].map(czerwienZaplaty);
  for (let i = 1; i < kolejne.length; i++) assert.ok(kolejne[i] >= kolejne[i - 1], `dzień ${i}: ${kolejne}`);
  assert.ok(kolejne[7] > kolejne[0], 'w dniu terminu mocniej niż tydzień przed');
  assert.ok(kolejne[8] > kolejne[7], 'po terminie mocniej niż w dniu terminu');
});

test('powiadomienia „Zapłać”: 7, 3 i 1 dzień przed, kwota z ceny od następnej płatności', () => {
  const lista = P.przypomnienia([prad(20, { prognoza: 210 })]);
  assert.deepEqual(lista.map((p) => p.napis), ['za tydzień', 'za 3 dni', 'jutro']);
  assert.equal(P.tytul(lista[0]), 'Zapłać: Energia');
  assert.match(P.tresc(lista[0]), /^Termin płatności za tydzień, .*210,00.*zapłać ręcznie/);
  // Klucz: termin przedostatni (czyszczenie pamięci), inny niż w powiadomieniach „Wycofaj”.
  assert.equal(lista[0].klucz.split('|').at(-2), iso(lista[0].termin));
  assert.match(lista[0].klucz, /zapłać/);
});

test('po zapłacie powiadomienia dotyczą następnego terminu; „pobiera się sama” - wcale', () => {
  const w = prad(5);
  oznaczZaplate(w);
  const lista = P.przypomnienia([w]);
  assert.ok(lista.length && lista.every((p) => iso(p.termin) === iso(dodajMiesiace(za(5), 1))));
  assert.equal(P.przypomnienia([prad(5, { platnoscReczna: false })]).length, 0);
});

test('pola w pliku: śmieci odrzucone, formularz telefonu włącza „płacę sam” od dziś', () => {
  const w = normalizuj({ id: 'a', platnoscReczna: 'tak', zaplaconyTermin: 'wczoraj' });
  assert.equal(w.platnoscReczna, false);
  assert.equal(w.zaplaconyTermin, '');
  assert.equal(normalizuj({ id: 'b', platnoscReczna: true, zaplaconyTermin: '2026-11-15' }).zaplaconyTermin, '2026-11-15');
  const wpisy = [w];
  zastosujFormularz(wpisy, w, { nazwa: 'Prąd', opis: '', koszt: '180', waluta: 'PLN', od: '2026-06-15', okres: 'M', przedluzac: 'tak', prognoza: '', platnosc: 'reczna', link: '' });
  assert.equal(w.platnoscReczna, true);
  assert.equal(w.zaplaconyTermin, '2026-11-09');
  assert.equal(iso(termin(w).data), '2026-11-15', 'co minęło - zapłacone, do zapłaty najbliższy termin');
  assert.equal(doZaplaty(w).zalegle, false);
  // Zmiana daty zakupu przy włączonym „płacę sam” - od daty zakupu, jak dawniej.
  zastosujFormularz(wpisy, w, { nazwa: 'Prąd', opis: '', koszt: '180', waluta: 'PLN', od: '2026-06-20', okres: 'M', przedluzac: 'tak', prognoza: '', platnosc: 'reczna', link: '' });
  assert.equal(iso(termin(w).data), '2026-07-20');
});
