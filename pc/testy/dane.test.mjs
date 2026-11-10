// Sprawdzanie danych z pliku i z Dysku (dane.js) oraz paragon (podsumowanie.js) - bez DOM.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { normalizuj, odczytajUsuniete, nowyWpis, odczytajDane, doZapisu, odczytajTresc, usun, nazwaWpisu, zastosujFormularz, zastapZKopii } from '../resources/js/dane.js';
import { scal } from '../resources/js/scalanie.js';
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
  assert.equal(plik.wersja, 4);
  assert.deepEqual(odczytajDane(JSON.parse(JSON.stringify(plik))), stan);
  assert.deepEqual(Object.keys(doZapisu(stan)), ['wersja', 'zapisano', 'wpisy', 'usuniete']);
});

test('śmieci z pliku zamieniane na bezpieczne wartości', () => {
  const w = normalizuj({ id: 5, od: '2026-13', okres: 'X', nazwa: 7, koszt: -3, waluta: 'XYZ', przedluzac: 'może', prognoza: Infinity, zmieniono: 'wczoraj' });
  assert.equal(typeof w.id, 'string');
  assert.ok(w.id.length > 0);
  assert.deepEqual(
    [w.od, w.okres, w.nazwa, w.koszt, w.waluta, w.przedluzac, w.prognoza, w.zmieniono],
    ['', 'M', '', null, 'PLN', '', null, ''],
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
  // Kwartał nie zostaje miesięczną (koszt kwartału w sumach 3 razy za duży) - bez okresu, do wyboru.
  assert.equal(normalizuj({ od: '2026-01-15', do: '2026-04-15' }).okres, '');
  assert.equal(policz([normalizuj({ od: '2026-01-15', do: '2026-04-15', koszt: 90, przedluzac: 'tak' })]).lacznieMiesiecznie, 0);
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

// Formularz edycji na telefonie (zastosujFormularz) - logika bez ekranu.
const pola = (zmiany = {}) => ({ nazwa: 'Netflix', opis: '', koszt: '43,00', waluta: 'PLN', od: '2026-10-12', okres: 'M', przedluzac: 'tak', prognoza: '', link: 'https://netflix.com', ...zmiany });

test('formularz: inny okres, kwota zmienna i podział kosztu; pola bez wartości zostają jak były', () => {
  const w = normalizuj({ id: 'a', nazwa: 'Prąd', od: '2026-01-05', okres: 'M', przedluzac: 'tak', platnoscReczna: true, zmiennaKwota: true, osob: 3, ktoOddaje: 'Ania', zaplaconyTermin: '2026-04-05' });
  zastosujFormularz([w], w, pola({ platnosc: 'reczna', od: '2026-01-05', osob: 99 }));
  assert.deepEqual([w.okres, w.coIle, w.zmiennaKwota, w.osob, w.ktoOddaje, w.zaplaconyTermin], ['M', 1, true, 3, 'Ania', '2026-04-05']);
  zastosujFormularz([w], w, pola({ platnosc: 'reczna', od: '2026-01-05', okres: 'M', coIle: 3, zmiennaKwota: false, osob: 2, ktoOddaje: '' }));
  assert.deepEqual([w.okres, w.coIle, w.zmiennaKwota, w.osob, w.ktoOddaje], ['M', 3, false, 2, '']);
  assert.equal(w.zaplaconyTermin, '', 'zmiana okresu liczy zapłatę od nowa');
});

test('formularz: włączenie podziału nie przypomina o płatnościach sprzed tej chwili', () => {
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 10, 10, 0).getTime() });
  try {
    const w = normalizuj({ id: 'a', nazwa: 'Spotify', koszt: 30, od: '2026-01-05', okres: 'M', przedluzac: 'tak' });
    zastosujFormularz([w], w, pola({ od: '2026-01-05', koszt: '30', osob: 3, ktoOddaje: 'Ania' }));
    assert.equal(w.oddaneTermin, '2026-11-05');
  } finally {
    mock.timers.reset();
  }
});

test('formularz: pauza - bez zmian, ustawienie, wznowienie dziś, data z przeszłości, bez pauzy', () => {
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 10, 10, 0).getTime() });
  try {
    const w = normalizuj({ id: 'a', nazwa: 'Siłownia', koszt: 99, od: '2026-01-05', okres: 'M', przedluzac: 'tak', prognozaOd: '2026-12-05' });
    const zapisz = (wstrzymanaDo) => zastosujFormularz([w], w, pola({ od: '2026-01-05', koszt: '99', wstrzymanaDo }));
    zapisz(undefined);
    assert.equal(w.wstrzymanaDo, '');
    zapisz('2026-10-01'); // data z przeszłości
    assert.equal(w.wstrzymanaDo, '');
    zapisz('2027-01-15');
    assert.deepEqual([w.wstrzymanaOd, w.wstrzymanaDo, w.prognozaOd], ['2026-11-10', '2027-01-15', '']);
    zapisz('2026-11-10');
    assert.equal(w.wstrzymanaDo, '2026-11-10', 'wznowienie dziś');
    zapisz('');
    assert.deepEqual([w.wstrzymanaOd, w.wstrzymanaDo], ['', '']);
  } finally {
    mock.timers.reset();
  }
});

test('formularz: stary wpis bez okresu zostaje bez okresu; wyczyszczona cena następna kasuje jej dzień', () => {
  const w = normalizuj({ id: 'a', nazwa: 'Kwartał', od: '2026-01-01', do: '2026-04-01', koszt: 90, prognoza: 99, prognozaOd: '2026-11-20' });
  assert.equal(w.okres, '');
  zastosujFormularz([w], w, pola({ od: '2026-01-01', koszt: '90', okres: '', prognoza: '' }));
  assert.deepEqual([w.okres, w.prognoza, w.prognozaOd], ['', null, '']);
  const { wpis } = zastosujFormularz([], null, pola({ okres: '' }));
  assert.equal(wpis.okres, 'M', 'nowa pozycja bez wyboru - miesięczna');
});

test('formularz: nowa pozycja trafia na koniec listy z czasem zmiany', () => {
  const wpisy = [normalizuj({ id: 'a', nazwa: 'A' })];
  const { wpis } = zastosujFormularz(wpisy, null, pola());
  assert.deepEqual(wpisy.map((w) => w.nazwa), ['A', 'Netflix']);
  assert.equal(wpis.koszt, 43);
  assert.ok(Date.parse(wpis.zmieniono) > Date.now() - 5000);
});

test('formularz: wpis podmieniony przez scalanie z Dyskiem w trakcie edycji - zmiana trafia do nowego obiektu', () => {
  const stary = normalizuj({ id: 'a', nazwa: 'Stary', okres: 'M' });
  const zDysku = normalizuj({ id: 'a', nazwa: 'Z Dysku', okres: 'M' });
  const wpisy = [zDysku]; // scalanie podmieniło obiekt, formularz trzyma jeszcze stary
  zastosujFormularz(wpisy, stary, pola({ nazwa: 'Po edycji' }));
  assert.equal(wpisy.length, 1);
  assert.equal(wpisy[0], zDysku);
  assert.equal(wpisy[0].nazwa, 'Po edycji');
});

test('stare pola odczytu ceny ze strony znikają, cena od następnej płatności zostaje', () => {
  const w = normalizuj({ id: 'a', okres: 'M', prognoza: 20, prognozaZeStrony: true, prognozaZrodlo: 'strona', prognozaData: '2026-10-30', prognozaCennik: 'https://a.pl/cennik', prognozaVat: true });
  assert.equal(w.prognoza, 20);
  for (const pole of ['prognozaZeStrony', 'prognozaZrodlo', 'prognozaData', 'prognozaCennik', 'prognozaVat']) assert.equal(pole in w, false, pole);
  zastosujFormularz([w], w, pola({ prognoza: '25' }));
  assert.equal(w.prognoza, 25);
});

test('formularz: zła kwota - komunikat i nic się nie zmienia', () => {
  const w = normalizuj({ id: 'a', nazwa: 'A', koszt: 10, okres: 'M' });
  const wpisy = [w];
  const przed = JSON.stringify(wpisy);
  assert.match(zastosujFormularz(wpisy, w, pola({ koszt: '12,5,1' })).blad, /liczbą/);
  assert.match(zastosujFormularz(wpisy, null, pola({ prognoza: 'abc' })).blad, /liczbą/);
  assert.equal(JSON.stringify(wpisy), przed);
});

test('formularz: nieznana waluta i okres - bezpieczne wartości', () => {
  const { wpis } = zastosujFormularz([], null, pola({ waluta: 'BTC', okres: 'X' }));
  assert.equal(wpis.waluta, 'PLN');
  assert.equal(wpis.okres, 'M');
});

test('formularz: waluta spoza listy telefonu (pole puste) - pozycja zostaje w swojej walucie', () => {
  const w = normalizuj({ id: 'a', nazwa: 'A', koszt: 10, waluta: 'GBP', okres: 'M' });
  const { wpis } = zastosujFormularz([w], w, pola({ waluta: '' }));
  assert.equal(wpis.waluta, 'GBP');
});

test('E23 wczytanie kopii: pozycje spoza kopii usunięte, wczytane z czasem „teraz”, po scaleniu z Dyskiem nic nie wraca', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-04T12:00:00.000Z') });
  const teraz = new Date().toISOString();
  const stan = {
    wpisy: [normalizuj({ id: 'A', nazwa: 'A', zmieniono: '2026-11-01T10:00:00.000Z' }), normalizuj({ id: 'B', nazwa: 'B nowa', zmieniono: '2026-11-02T10:00:00.000Z' })],
    usuniete: [{ id: 'C', kiedy: '2026-11-03T10:00:00.000Z' }],
  };
  const kopia = odczytajDane({ wpisy: [{ id: 'B', nazwa: 'B stara', zmieniono: '2026-10-01T10:00:00.000Z' }, { id: 'C', nazwa: 'C', zmieniono: '2026-10-01T10:00:00.000Z' }], usuniete: [] });
  zastapZKopii(stan, kopia, teraz);
  assert.deepEqual(stan.wpisy.map((w) => [w.id, w.nazwa, w.zmieniono]), [['B', 'B stara', teraz], ['C', 'C', teraz]]);
  assert.deepEqual(stan.usuniete.map((u) => u.id), ['A']);
  // Dysk: A zmienione wcześniej niż wczytanie kopii, B nowsza wersja sprzed wczytania, C usunięte dawno.
  const dysk = odczytajDane({
    wpisy: [{ id: 'A', nazwa: 'A z Dysku', zmieniono: '2026-11-03T10:00:00.000Z' }, { id: 'B', nazwa: 'B z Dysku', zmieniono: '2026-11-03T10:00:00.000Z' }],
    usuniete: [{ id: 'C', kiedy: '2026-11-03T10:00:00.000Z' }],
  });
  const wynik = scal(stan, dysk);
  assert.deepEqual(wynik.wpisy.map((w) => [w.id, w.nazwa]), [['B', 'B stara'], ['C', 'C']]);
  assert.deepEqual(wynik.usuniete.map((u) => u.id), ['A']);
});

test('formularz: kategoria i „na firmę” zapisane, bez pól zostają jak były, obca kategoria odrzucona', () => {
  const w = normalizuj({ id: 'k', kategoria: 'praca', firmowa: true });
  const p = { nazwa: 'x', opis: '', koszt: '10', od: '2026-01-05', prognoza: '', platnosc: '', przedluzac: 'tak', link: '' };
  zastosujFormularz([w], w, p);
  assert.equal(w.kategoria, 'praca');
  assert.equal(w.firmowa, true);
  zastosujFormularz([w], w, { ...p, kategoria: 'ai', firmowa: false });
  assert.equal(w.kategoria, 'ai');
  assert.equal(w.firmowa, false);
  zastosujFormularz([w], w, { ...p, kategoria: '<b>zla</b>' });
  assert.equal(w.kategoria, '');
});
