// Powiadomienia o pozycjach do wycofania (powiadomienia.js). Daty liczone od dziś.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../resources/js/powiadomienia.js';
import { dzis, dodajMiesiace } from '../resources/js/alarmy.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const za = (dni) => { const d = dzis(); d.setDate(d.getDate() + dni); return d; };
// wpis z terminem za N dni: zakup = termin - okres
const mies = (id, dniDoTerminu, extra = {}) => ({ id, nazwa: id, koszt: 10, waluta: 'PLN', okres: 'M', przedluzac: 'nie', od: iso(dodajMiesiace(za(dniDoTerminu), -1)), ...extra });
const rok = (id, dniDoTerminu, extra = {}) => ({ id, nazwa: id, koszt: 100, waluta: 'USD', okres: 'R', przedluzac: 'nie', od: iso(dodajMiesiace(za(dniDoTerminu), -12)), ...extra });
const pam = () => ({ pokazane: new Set(), zaplanowane: new Set() });
const po9 = new Date(); po9.setHours(10, 0, 0, 0);
const przed9 = new Date(); przed9.setHours(8, 0, 0, 0);

test('progi miesięczne: 7 sztuk, roczne: 6 sztuk', () => {
  assert.equal(P.przypomnienia([mies('a', 30)]).length, 7);
  assert.equal(P.przypomnienia([rok('b', 200)]).length, 6);
  assert.deepEqual(P.przypomnienia([rok('b', 200)]).map((p) => p.napis), ['za 3 miesiące', 'za 2 miesiące', 'za miesiąc', 'za 3 tygodnie', 'za 2 tygodnie', 'za tydzień']);
});

test('tylko „nie” - „tak” i puste bez powiadomień', () => {
  assert.equal(P.przypomnienia([mies('a', 5, { przedluzac: 'tak' }), mies('b', 5, { przedluzac: '' })]).length, 0);
});

test('dzień progu po 9:00 - pokazuje raz, drugi raz już nie', () => {
  const p = pam();
  const w = [mies('a', 7)];
  const r1 = P.rozplanuj(w, p, po9);
  assert.deepEqual(r1.teraz.map((x) => x.napis), ['za tydzień']);
  assert.equal(P.rozplanuj(w, p, po9).teraz.length, 0);
  assert.equal(P.tresc(r1.teraz[0], dzis()).startsWith('Odnowienie za tydzień'), true);
});

test('przed 9:00 w dniu progu - jeszcze nie (czeka na 9:00, na telefonie zaplanowane)', () => {
  const r = P.rozplanuj([mies('a', 7)], pam(), przed9);
  assert.equal(r.teraz.length, 0);
  assert.equal(r.przyszle[0].napis, 'za tydzień');
});

test('zaległe progi - tylko ostatni, z prawdziwą liczbą dni', () => {
  const r = P.rozplanuj([mies('a', 6)], pam(), po9); // progi 14 i 7 minęły
  assert.deepEqual(r.teraz.map((x) => x.napis), ['za tydzień']);
  assert.match(P.tresc(r.teraz[0], dzis()), /^Odnowienie za 6 dni/);
  assert.deepEqual(r.przyszle.map((x) => x.napis), ['za 5 dni', 'za 4 dni', 'za 3 dni', 'za 2 dni', 'jutro']);
});

test('roczna za 40 dni: zaległe „za 2 miesiące”, w przyszłości reszta', () => {
  const r = P.rozplanuj([rok('b', 40)], pam(), po9);
  assert.deepEqual(r.teraz.map((x) => x.napis), ['za 2 miesiące']);
  assert.deepEqual(r.przyszle.map((x) => x.napis), ['za miesiąc', 'za 3 tygodnie', 'za 2 tygodnie', 'za tydzień']);
  assert.match(P.tresc(r.teraz[0], dzis()), /USD/);
});

test('termin minął albo dziś - bez powiadomień', () => {
  assert.equal(P.rozplanuj([mies('a', 0), mies('b', -3)], pam(), po9).teraz.length, 0);
});

test('telefon: zaplanowane wcześniej przyszło samo - nie dubluje', () => {
  const p = pam();
  const w = [mies('a', 7)];
  const r0 = P.rozplanuj(w, p, przed9);
  p.zaplanowane = new Set(r0.przyszle.map((x) => x.klucz));
  assert.equal(P.rozplanuj(w, p, po9).teraz.length, 0);
});

test('zmiana daty zakupu - nowe klucze, pamięć sprzątnięta', () => {
  const p = pam();
  P.rozplanuj([mies('a', 7)], p, po9);
  assert.equal(p.pokazane.size, 1);
  const r = P.rozplanuj([mies('a', 3)], p, po9);
  assert.deepEqual(r.teraz.map((x) => x.napis), ['za 3 dni']);
  assert.equal(p.pokazane.size, 1);
});

test('przestawienie na „tak” - pamięć czyszczona', () => {
  const p = pam();
  P.rozplanuj([mies('a', 7)], p, po9);
  P.rozplanuj([mies('a', 7, { przedluzac: 'tak' })], p, po9);
  assert.equal(p.pokazane.size, 0);
});
