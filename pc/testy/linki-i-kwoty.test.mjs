// Bezpieczne linki i wpisywane kwoty (dane.js), kursy walut (waluty.js), ceny ze stron (ceny.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bezpiecznyLink, parsujKoszt, formatujKoszt } from '../resources/js/dane.js';
import { przeliczNaPln, wczytajZapamietane, formatujKwote, odswiezZNbp } from '../resources/js/waluty.js';
import { liczbaZTekstu, odczytajCene, adresLokalny, czytajZLimitem, przyjmijCene } from '../resources/js/ceny.js';
import { isoDnia, dzis } from '../resources/js/alarmy.js';

test('bezpiecznyLink: tylko http i https', () => {
  assert.equal(bezpiecznyLink('example.com'), 'https://example.com/');
  assert.equal(bezpiecznyLink(' https://netflix.com/pl '), 'https://netflix.com/pl');
  assert.equal(bezpiecznyLink('http://example.com'), 'http://example.com/');
  for (const zly of ['javascript:alert(1)', 'file:///C:/Windows/notepad.exe', 'ms-settings:privacy', 'search-ms:query=x', 'data:text/html,<b>x</b>', 'vbscript:x', 'a b.com', 'bezkropki', '', null]) {
    assert.equal(bezpiecznyLink(zly), null, String(zly));
  }
});

test('parsujKoszt: przecinek, spacje, błędne wartości', () => {
  assert.equal(parsujKoszt('43,99'), 43.99);
  assert.equal(parsujKoszt('1 234,5'), 1234.5);
  assert.equal(parsujKoszt('12.345'), 12.35);
  assert.equal(parsujKoszt('1.234,56'), 1234.56);
  assert.equal(parsujKoszt('12.345.678,9'), 12345678.9);
  assert.equal(parsujKoszt(''), null);
  for (const zly of ['20,5,1', '-5', 'abc', '1e3']) assert.equal(parsujKoszt(zly), undefined, zly);
  assert.equal(formatujKoszt(43.9), '43,90');
  assert.equal(formatujKoszt(null), '');
});

test('kursy: bez kursu waluta obca poza sumą, absurdalny kurs z pliku odrzucony', async () => {
  const pliki = { dobre: JSON.stringify({ USD: 3.95, EUR: 4.39, data: '2026-10-30', pobrano: '2026-10-30' }), zle: JSON.stringify({ USD: 395, EUR: 4.39, data: '2026-10-30', pobrano: '2026-10-30' }) };
  globalThis.Neutralino = { filesystem: { readFile: async (p) => pliki[p] } };
  assert.equal(przeliczNaPln(10, 'USD'), null);
  assert.equal(przeliczNaPln(10, 'PLN'), 10);
  await wczytajZapamietane('zle');
  assert.equal(przeliczNaPln(10, 'USD'), null);
  await wczytajZapamietane('dobre');
  assert.equal(przeliczNaPln(20, 'USD'), 79);
  assert.equal(przeliczNaPln(null, 'USD'), null);
  assert.match(formatujKwote(1234.5), /^1\s?234,50 zł$/);
});

test('liczbaZTekstu: zapisy polskie i angielskie', () => {
  assert.equal(liczbaZTekstu('1 234,56'), 1234.56);
  assert.equal(liczbaZTekstu('1,234.56'), 1234.56);
  assert.equal(liczbaZTekstu('12,99'), 12.99);
  assert.equal(liczbaZTekstu('1,234'), 1234);
  assert.equal(liczbaZTekstu('1.299'), 1299);
  assert.equal(liczbaZTekstu('1.299.000'), 1299000);
  assert.equal(liczbaZTekstu('12.99'), 12.99);
  assert.equal(liczbaZTekstu('20'), 20);
  assert.equal(liczbaZTekstu('brak'), null);
});

test('ceny: strony http i adresy lokalne odrzucone bez łączenia się', async () => {
  const pobrane = [];
  globalThis.fetch = async (u) => { pobrane.push(String(u)); throw new TypeError('Failed to fetch'); };
  globalThis.DOMParser = class { parseFromString() { throw new Error('nie powinno dojść do odczytu'); } };
  await assert.rejects(odczytajCene('http://example.com/cennik', 'PLN', 10), /tylko strony https/);
  for (const lokalny of ['https://127.0.0.1/', 'https://localhost/', 'https://192.168.1.1/', 'https://10.0.0.5/', 'https://[::1]/', 'https://router.local/']) {
    await assert.rejects(odczytajCene(lokalny, 'PLN', 10));
  }
  assert.deepEqual(pobrane, []);
});

test('ceny: sieć domowa i nazwy bez kropki zablokowane, zwykłe serwisy nie', () => {
  for (const lokalny of ['https://localhost./', 'https://nas.local./', 'https://router/', 'https://fritz.box/', 'https://drukarka.home.arpa/', 'https://100.64.1.2/', 'https://100.127.0.1/', 'https://serwer.lan/']) {
    assert.equal(adresLokalny(lokalny), true, lokalny);
  }
  for (const zwykly of ['https://netflix.com/pl', 'https://one.google.com/', 'https://100.200.1.1/', 'https://box.com/']) {
    assert.equal(adresLokalny(zwykly), false, zwykly);
  }
});

test('ceny: martwy serwer - jedno pobranie zamiast próbowania typowych adresów', async () => {
  const pobrane = [];
  globalThis.fetch = async (u) => { pobrane.push(String(u)); throw new TypeError('Failed to fetch'); };
  await assert.rejects(odczytajCene('https://martwy.example.com/plan', 'PLN', 10), /brak połączenia/);
  assert.deepEqual(pobrane, ['https://martwy.example.com/plan']);
});

test('ceny: odczyt przerwany (odznaczona zgoda) - bez pobierania', async () => {
  const pobrane = [];
  globalThis.fetch = async (u) => { pobrane.push(String(u)); throw new TypeError('Failed to fetch'); };
  await assert.rejects(odczytajCene('https://example.com/plan', 'PLN', 10, '', () => false), /przerwano/);
  assert.deepEqual(pobrane, []);
});

test('ceny: strona większa niż limit przerwana w trakcie czytania, polskie litery na granicy kawałków', async () => {
  const kawalki = (...czesci) => new Response(new ReadableStream({ start(c) { for (const k of czesci) c.enqueue(k); c.close(); } }));
  const zl = new TextEncoder().encode('12,99 zł');
  assert.equal(await czytajZLimitem(kawalki(zl.slice(0, 7), zl.slice(7))), '12,99 zł'); // „ł” rozcięte na dwa kawałki
  const duzy = new Uint8Array(1000000);
  await assert.rejects(czytajZLimitem(kawalki(duzy, duzy, duzy, duzy)), /za duża/);
});

test('ceny: długi ciąg cyfr na stronie nie zawiesza odczytu', async () => {
  const html = '<p>' + '1'.repeat(200000) + ' zł ' + '1.111'.repeat(20000) + ' zł</p>';
  globalThis.fetch = async () => new Response(html);
  globalThis.DOMParser = class {
    parseFromString(t) {
      return { querySelectorAll: () => [], querySelector: () => null, body: { textContent: t.replace(/<[^>]+>/g, '') } };
    }
  };
  const start = performance.now();
  await odczytajCene('https://example.com/plan', 'PLN', 10).catch(() => {});
  assert.ok(performance.now() - start < 3000, `trwało ${Math.round(performance.now() - start)} ms`);
});

test('ceny: ta sama cena nie zmienia czasu zmiany wpisu (scalanie z telefonem)', () => {
  const wpis = { prognoza: 20, prognozaZrodlo: 'strona', prognozaVat: false, prognozaCennik: '', prognozaData: isoDnia(dzis()), zmieniono: '2026-10-01T10:00:00.000Z' };
  assert.equal(przyjmijCene(wpis, { cena: 20, vat: false, cennik: 'https://a.pl/' }, 'https://a.pl/'), false);
  assert.equal(wpis.zmieniono, '2026-10-01T10:00:00.000Z');
  assert.equal(przyjmijCene(wpis, { cena: 25, vat: false, cennik: 'https://a.pl/' }, 'https://a.pl/'), true);
  assert.notEqual(wpis.zmieniono, '2026-10-01T10:00:00.000Z');
  assert.equal(wpis.prognoza, 25);
  // Nowy dzień, ta sama cena - zapis (data odczytu), ale bez zmiany czasu.
  const stary = { ...wpis, prognozaData: '2026-01-01', zmieniono: 'x' };
  assert.equal(przyjmijCene(stary, { cena: 25, vat: false, cennik: 'https://a.pl/' }, 'https://a.pl/'), true);
  assert.equal(stary.zmieniono, 'x');
});

test('kursy NBP: plik zapisywany tylko przy zmianie, wynik mówi, czy przeliczać kwoty', async () => {
  const zapisy = [];
  globalThis.Neutralino = { filesystem: { writeFile: async (p, t) => { zapisy.push(t); } } };
  const tabela = (usd) => new Response(JSON.stringify([{ effectiveDate: '2026-10-30', rates: [{ code: 'USD', mid: usd }, { code: 'EUR', mid: 4.4 }] }]));
  globalThis.fetch = async () => tabela(3.9);
  assert.equal(await odswiezZNbp('k'), true);
  assert.equal(await odswiezZNbp('k'), false);
  assert.equal(zapisy.length, 1);
  globalThis.fetch = async () => tabela(3.8);
  assert.equal(await odswiezZNbp('k'), true);
  assert.equal(zapisy.length, 2);
});

test('ceny: serwer milknie w trakcie strony albo przy kolejnych adresach - bez czekania na wszystkie', async () => {
  // Odpowiedź bez treści i zerwane czytanie.
  assert.equal(await czytajZLimitem(new Response(null, { status: 204 })), '');
  const zerwana = new Response(new ReadableStream({ pull(c) { c.error(new Error('timeout')); } }));
  await assert.rejects(czytajZLimitem(zerwana), (e) => e.koniec === true && /nie odpowiada/.test(e.message));
  // Strona z linku daje 404, a pierwszy typowy adres już nie odpowiada - dalej nie próbujemy.
  const pobrane = [];
  globalThis.fetch = async (u) => {
    pobrane.push(String(u));
    if (pobrane.length === 1) return new Response('', { status: 404 });
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(odczytajCene('https://example.com/plan', 'PLN', 10));
  assert.equal(pobrane.length, 2);
});
