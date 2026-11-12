// D17 (kategorie i filtr), D18 (firmowe), D19 (budżet - zapis w magazyn.test.mjs), E23 (eksport CSV),
// E24 (import z wyciągu bankowego). Stały „dziś”: wtorek 10.11.2026.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { policz } from '../resources/js/podsumowanie.js';
import { normalizuj } from '../resources/js/dane.js';
import { poprawneFunkcje, ustawFunkcje, kategoriaWpisu, firmowa } from '../resources/js/funkcje.js';
import { pustyFiltr, pasuje, poprawFiltr, czyPusty } from '../resources/js/filtr.js';
import { doCsv, komorkaCsv } from '../resources/js/eksport.js';
import { ustawJezyk } from '../resources/js/teksty.js';
import { dekoduj, parsujCsv, parsujDateWyciagu, parsujKwoteWyciagu, odczytajWyciag, odbiorca, znajdzPowtarzajace } from '../resources/js/wyciag.js';

mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 10, 10, 0).getTime() });
const wpis = (extra) => normalizuj({ id: 'x', nazwa: 'x', przedluzac: 'tak', waluta: 'PLN', okres: 'M', od: '2026-10-20', ...extra });
const wlacz = (f = {}) => ustawFunkcje({ kategorie: true, firma: true, ...f });

test('D17, D18: przełączniki domyślnie wyłączone, pozostałe funkcje domyślnie włączone', () => {
  const f = poprawneFunkcje();
  assert.equal(f.kategorie, false);
  assert.equal(f.firma, false);
  assert.equal(f.okresy, false); // inne okresy - też domyślnie wyłączone (autor 02.11.2026)
  assert.equal(f.krzywe, false); // krzywe elementy - domyślnie prosto (autor 10.11.2026)
  assert.equal(poprawneFunkcje({ krzywe: true }).krzywe, true);
  assert.equal(f.pauza, true);
  assert.deepEqual([poprawneFunkcje({ kategorie: true }).kategorie, poprawneFunkcje({ kategorie: 'tak' }).kategorie, poprawneFunkcje({ pauza: false }).pauza], [true, false, false]);
  ustawFunkcje(undefined);
  const w = wpis({ kategoria: 'ai', firmowa: true });
  assert.equal(kategoriaWpisu(w), ''); // wyłączone - dane zostają, ale nic ich nie widzi
  assert.equal(firmowa(w), false);
  assert.equal(w.kategoria, 'ai');
  wlacz();
  assert.equal(kategoriaWpisu(w), 'ai');
  assert.equal(firmowa(w), true);
});

test('D17, D18: pola z pliku sprawdzane - nieznana kategoria i zła data wypadają', () => {
  const w = normalizuj({ kategoria: '<script>', firmowa: 'tak', fakturaTermin: '2026-13-99x' });
  assert.deepEqual([w.kategoria, w.firmowa, w.fakturaTermin], ['', false, '']);
  const ok = normalizuj({ kategoria: 'dom', firmowa: true, fakturaTermin: '2026-10-20' });
  assert.deepEqual([ok.kategoria, ok.firmowa, ok.fakturaTermin], ['dom', true, '2026-10-20']);
});

test('D17, D18: paragon - RAZEM / MIESIĄC wg kategorii i koszty firmowe (roczne / 12, bez „!” i pauzy)', () => {
  wlacz();
  const s = policz([
    wpis({ id: 'a', koszt: 40, kategoria: 'rozrywka' }),
    wpis({ id: 'b', koszt: 120, okres: 'R', kategoria: 'praca', firmowa: true }),
    wpis({ id: 'c', koszt: 90, kategoria: 'ai', firmowa: true }),
    wpis({ id: 'd', koszt: 15 }),
    wpis({ id: 'e', koszt: 500, kategoria: 'ai', przedluzac: 'nie' }), // do wycofania - poza sumą
    wpis({ id: 'f', koszt: 30, kategoria: 'ai', wstrzymanaOd: '2026-11-01', wstrzymanaDo: '2026-12-01' }), // pauza
  ]);
  assert.deepEqual(Object.fromEntries(s.kategorie), { rozrywka: 40, praca: 10, ai: 90, '': 15 });
  assert.equal(s.firmaMiesiecznie, 100);
  assert.equal(s.firmaIlosc, 2);
  assert.equal(s.lacznieMiesiecznie, 155);
  ustawFunkcje(undefined);
  const bez = policz([wpis({ koszt: 40, kategoria: 'rozrywka', firmowa: true })]);
  assert.deepEqual(Object.fromEntries(bez.kategorie), { '': 40 });
  assert.equal(bez.firmaIlosc, 0);
});

test('D17: filtr - kategoria, „bez kategorii”, tylko płacę sam / do wycofania / na firmę; wyłączona funkcja zeruje filtr', () => {
  wlacz();
  const ai = wpis({ kategoria: 'ai', platnoscReczna: true });
  const bez = wpis({ przedluzac: 'nie', firmowa: true });
  const f = pustyFiltr();
  assert.ok(czyPusty(f) && pasuje(ai, f) && pasuje(bez, f));
  assert.deepEqual([pasuje(ai, { ...f, kategoria: 'ai' }), pasuje(bez, { ...f, kategoria: 'ai' })], [true, false]);
  assert.deepEqual([pasuje(ai, { ...f, kategoria: '' }), pasuje(bez, { ...f, kategoria: '' })], [false, true]);
  assert.deepEqual([pasuje(ai, { ...f, reczne: true }), pasuje(bez, { ...f, reczne: true })], [true, false]);
  assert.deepEqual([pasuje(ai, { ...f, wycofanie: true }), pasuje(bez, { ...f, wycofanie: true })], [false, true]);
  assert.deepEqual([pasuje(ai, { ...f, firma: true }), pasuje(bez, { ...f, firma: true })], [false, true]);
  wlacz({ firma: false });
  assert.equal(poprawFiltr({ ...f, firma: true, kategoria: 'ai' }).firma, false);
  ustawFunkcje(undefined);
  assert.deepEqual(poprawFiltr({ ...f, kategoria: 'ai', wycofanie: true }), pustyFiltr());
});

test('E23: CSV - BOM, średnik i przecinek po polsku, cudzysłowy, bez formuł Excela', () => {
  assert.equal(komorkaCsv('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(komorkaCsv('+48 123'), "'+48 123");
  assert.equal(komorkaCsv('a;b'), '"a;b"');
  assert.equal(komorkaCsv('x,=WEBSERVICE("y")'), '"x,=WEBSERVICE(""y"")"'); // Excel z przecinkiem jako separatorem
  assert.equal(komorkaCsv('12,50'), '12,50');
  assert.equal(komorkaCsv('zwykły'), 'zwykły');
  const csv = doCsv([
    wpis({ nazwa: 'Netflix', opis: 'plan "Standard"; 4K', koszt: 43, kategoria: 'rozrywka' }),
    wpis({ nazwa: '@zła', koszt: 120, okres: 'R', od: '2026-01-05', anulowano: '2026-11-01' }),
  ]);
  assert.ok(csv.startsWith('﻿Lp.;Nazwa;Opis;Kategoria;'));
  const linie = csv.trim().split('\r\n');
  assert.equal(linie.length, 3);
  assert.ok(linie[1].startsWith('1;Netflix;"plan ""Standard""; 4K";rozrywka;nie;43,00;PLN;co miesiąc;2026-10-20;2026-11-20;tak;pobiera się sama;1;43,00;'), linie[1]);
  assert.ok(linie[2].startsWith("2;'@zła;"));
  assert.ok(linie[2].endsWith('anulowana 2026-11-01'));
  assert.ok(linie[2].includes(';co rok;2026-01-05;;')); // anulowana - bez następnej płatności
  // Po angielsku też średnik i przecinek dziesiętny - Excel na polskim Windows (decyzja autora 08.11).
  ustawJezyk('en');
  try {
    const en = doCsv([wpis({ nazwa: 'Netflix', koszt: 43.5 })]).trim().split('\r\n');
    assert.equal(en[0].split(';').length, 18, en[0]);
    assert.ok(en[1].startsWith('1;Netflix;;') && en[1].includes(';43,50;PLN;'), en[1]);
  } finally {
    ustawJezyk('pl');
  }
});

// --- E24: wyciąg bankowy -----------------------------------------------------------------------

test('E24: dekodowanie UTF-8 i Windows-1250, CSV z cudzysłowami, daty i kwoty z różnych banków', () => {
  // „Płatność;-1,00” w Windows-1250 (ł = B3, ś = 9C, ć = E6)
  assert.equal(dekoduj(new Uint8Array([0x50, 0xb3, 0x61, 0x74, 0x6e, 0x6f, 0x9c, 0xe6, 0x3b, 0x2d, 0x31])), 'Płatność;-1');
  assert.equal(dekoduj(new TextEncoder().encode('﻿Łódź')), 'Łódź');
  assert.deepEqual(parsujCsv('a;"b;c";"d ""e"""\r\n1;2;3\n', ';'), [['a', 'b;c', 'd "e"'], ['1', '2', '3']]);
  assert.deepEqual(['2026-10-05', '05.10.2026', '5-10-2026', '2026-10-05 12:30:01', '31.02.2026', 'abc'].map(parsujDateWyciagu),
    ['2026-10-05', '2026-10-05', '2026-10-05', '2026-10-05', '', '']);
  assert.deepEqual(['-43,00', '-1 234,56 PLN', '−12.99', '-1,234.56', '+250,00', '1.234,50', 'PLN', ''].map(parsujKwoteWyciagu),
    [-43, -1234.56, -12.99, -1234.56, 250, 1234.5, null, null]);
});

test('E24: odbiorca z opisu - bez numerów kart, dat i słów typu „płatność kartą”', () => {
  assert.equal(odbiorca('NETFLIX.COM /AMSTERDAM  ZAKUP PRZY UŻYCIU KARTY').klucz, 'netflix amsterdam');
  assert.equal(odbiorca('Tytuł: 000498849 74230786 Lokalizacja: Adres: SPOTIFY P2F8A1 Miasto: Stockholm Kraj: SZWECJA').nazwa, 'Spotify');
  assert.equal(odbiorca('GOOGLE *YouTubePremium g.co/helppay#').nazwa, 'YouTubePremium');
  assert.equal(odbiorca('PAYPAL *').nazwa, 'Paypal');
  assert.equal(odbiorca('1234 5678 15.10.2026').klucz, '');
});

const MBANK = [
  '#Klient;', 'JAN KOWALSKI;', '', '#Za okres:;', '01.08.2026;31.10.2026;', '',
  '#Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;',
  '2026-08-05;NETFLIX.COM /AMSTERDAM  ZAKUP PRZY UŻYCIU KARTY;eKonto 1234;Rozrywka;-43,00 PLN;',
  '2026-09-05;NETFLIX.COM /AMSTERDAM  ZAKUP PRZY UŻYCIU KARTY;eKonto 1234;Rozrywka;-43,00 PLN;',
  '2026-10-06;NETFLIX.COM /AMSTERDAM  ZAKUP PRZY UŻYCIU KARTY;eKonto 1234;Rozrywka;-49,00 PLN;',
  '2026-08-12;BIEDRONKA 123 WARSZAWA;eKonto 1234;Jedzenie;-87,12 PLN;',
  '2026-09-28;BIEDRONKA 123 WARSZAWA;eKonto 1234;Jedzenie;-12,40 PLN;',
  '2026-08-10;PGE OBRÓT PRĄD 08/2026;eKonto 1234;Rachunki;-182,30 PLN;',
  '2026-09-10;PGE OBRÓT PRĄD 09/2026;eKonto 1234;Rachunki;-151,10 PLN;',
  '2026-10-10;PGE OBRÓT PRĄD 10/2026;eKonto 1234;Rachunki;-140,00 PLN;',
  '2026-08-01;WYPŁATA FIRMA SP Z O O;eKonto 1234;Wpływy;+6 500,00 PLN;',
  '2026-09-01;WYPŁATA FIRMA SP Z O O;eKonto 1234;Wpływy;+6 500,00 PLN;',
  '2026-08-15;CANVA PRO SYDNEY;eKonto 1234;Praca;-54,99 PLN;',
  '2026-09-15;CANVA PRO SYDNEY;eKonto 1234;Praca;-54,99 PLN;',
  '2026-08-03;SIŁOWNIA FIT;eKonto 1234;Sport;-30,00 PLN;',
  '2026-08-10;SIŁOWNIA FIT;eKonto 1234;Sport;-30,00 PLN;',
  '2026-08-17;SIŁOWNIA FIT;eKonto 1234;Sport;-30,00 PLN;',
  '2026-08-24;SIŁOWNIA FIT;eKonto 1234;Sport;-30,00 PLN;',
].join('\r\n');

test('E24: mBank - nagłówek po kilku linijkach, kwota z walutą; miesięczne, tygodniowe i rachunki o różnej kwocie', () => {
  const operacje = odczytajWyciag(MBANK);
  assert.equal(operacje.length, 16);
  assert.deepEqual(operacje[0], { data: '2026-08-05', kwota: -43, waluta: 'PLN', opis: 'NETFLIX.COM /AMSTERDAM ZAKUP PRZY UŻYCIU KARTY' });
  const p = znajdzPowtarzajace(operacje, [wpis({ nazwa: 'Canva' }), wpis({ nazwa: 'Próbny AI' }), wpis({ nazwa: 'Siłka' })]);
  const wg = Object.fromEntries(p.map((x) => [x.nazwa, x]));
  // Netflix: kwoty 43 i 49 w jednej grupie (różnica do 15%) - co miesiąc, ostatnia kwota.
  assert.deepEqual([wg['Netflix Amsterdam'].okres, wg['Netflix Amsterdam'].coIle, wg['Netflix Amsterdam'].kwota, wg['Netflix Amsterdam'].ile, wg['Netflix Amsterdam'].ostatnia], ['M', 1, 49, 3, '2026-10-06']);
  // Prąd: kwoty za każdym razem inne - cała grupa razem.
  assert.deepEqual([wg['Pge Obrót'].okres, wg['Pge Obrót'].min, wg['Pge Obrót'].max], ['M', 140, 182.3]);
  // Siłownia co tydzień, ale od 24.08 cisza do 10.10 - pewnie już anulowana.
  assert.deepEqual([wg['Siłownia Fit'].okres, wg['Siłownia Fit'].coIle, wg['Siłownia Fit'].dawno], ['T', 1, true]);
  assert.equal(wg['Canva Pro'].juzJest, true);
  assert.equal(wg.Biedronka, undefined); // zakupy nieregularne - nie subskrypcja
  assert.equal(p.some((x) => /wyp/i.test(x.nazwa)), false); // wpływy pomijane
  // Kolejność: nowe i aktualne najpierw, „już w zeszycie” i „dawno” na końcu.
  assert.deepEqual(p.map((x) => x.nazwa), ['Pge Obrót', 'Netflix Amsterdam', 'Siłownia Fit', 'Canva Pro']);
});

test('E24: PKO (szczegóły w kolumnach bez nagłówka), Revolut (kropka, stan transakcji), ING (kolumna waluty)', () => {
  const pko = [
    '"Data operacji","Data waluty","Typ transakcji","Kwota","Waluta","Saldo po transakcji","Opis transakcji","",""',
    '"2026-09-03","2026-09-03","Płatność kartą","-23.99","PLN","+100.00","Tytuł: 0004988 7423","Lokalizacja: Adres: SPOTIFY P2F8A1 Miasto: Stockholm Kraj: SZWECJA","Data wykonania: 2026-09-01"',
    '"2026-10-03","2026-10-03","Płatność kartą","-23.99","PLN","+76.01","Tytuł: 0005123 7423","Lokalizacja: Adres: SPOTIFY P9Q1Z2 Miasto: Stockholm Kraj: SZWECJA","Data wykonania: 2026-10-01"',
  ].join('\n');
  const p1 = znajdzPowtarzajace(odczytajWyciag(pko));
  assert.deepEqual(p1.map((x) => [x.nazwa, x.kwota, x.okres]), [['Spotify', 23.99, 'M']]);

  const revolut = [
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
    'CARD_PAYMENT,Current,2026-08-21 09:12:01,2026-08-22 10:00:00,OpenAI *ChatGPT Subscr,-20.00,0.00,USD,COMPLETED,100.00',
    'CARD_PAYMENT,Current,2026-09-21 09:12:01,2026-09-22 10:00:00,OpenAI *ChatGPT Subscr,-20.00,0.00,USD,COMPLETED,80.00',
    'CARD_PAYMENT,Current,2026-10-21 09:12:01,2026-10-22 10:00:00,OpenAI *ChatGPT Subscr,-20.00,0.00,USD,REVERTED,80.00',
    'CARD_PAYMENT,Current,2026-10-22 09:12:01,2026-10-22 10:00:00,OpenAI *ChatGPT Subscr,-20.00,0.00,USD,COMPLETED,60.00',
  ].join('\n');
  const op = odczytajWyciag(revolut);
  assert.equal(op.length, 3); // „REVERTED” pominięta
  assert.deepEqual(znajdzPowtarzajace(op).map((x) => [x.nazwa, x.kwota, x.waluta, x.ile]), [['OpenAI ChatGPT', 20, 'USD', 3]]);

  const ing = [
    '"Lista transakcji"', '',
    '"Data transakcji";"Data księgowania";"Dane kontrahenta";"Tytuł";"Nr rachunku";"Nazwa banku";"Szczegóły";"Nr transakcji";"Kwota transakcji (waluta rachunku)";"Waluta";',
    '2026-07-14;2026-07-15;"MICROSOFT*365 ";"Płatność kartą 14.07.2026 Nr karty 4246xx1234";;;;"123";-299,99;PLN;',
    '2025-07-14;2025-07-15;"MICROSOFT*365 ";"Płatność kartą 14.07.2025 Nr karty 4246xx1234";;;;"124";-299,99;PLN;',
  ].join('\r\n');
  assert.deepEqual(znajdzPowtarzajace(odczytajWyciag(ing)).map((x) => [x.nazwa, x.okres, x.ostatnia]), [['Microsoft', 'R', '2026-07-14']]);
});

test('E24: obcy plik (nie wyciąg) - null; jedna płatność - brak propozycji', () => {
  assert.equal(odczytajWyciag('imię;nazwisko\nJan;Kowalski\n'), null);
  assert.equal(odczytajWyciag('{"wersja":2,"wpisy":[]}'), null);
  assert.deepEqual(znajdzPowtarzajace([{ data: '2026-10-01', kwota: -10, waluta: 'PLN', opis: 'Netflix' }]), []);
  // Jeden odbiorca, dwie subskrypcje w różne dni (5. i 20.) - dwie propozycje, nie jedna „co 2 tygodnie”.
  const apple = ['2026-08-05', '2026-09-05', '2026-10-05'].flatMap((d) => [
    { data: d, kwota: -4.99, waluta: 'PLN', opis: 'APPLE.COM/BILL iCloud' },
    { data: d.slice(0, 8) + '20', kwota: -19.99, waluta: 'PLN', opis: 'APPLE.COM/BILL iCloud' },
  ]);
  assert.deepEqual(znajdzPowtarzajace(apple).map((x) => [x.kwota, x.okres, x.coIle]), [[19.99, 'M', 1], [4.99, 'M', 1]]);
});
