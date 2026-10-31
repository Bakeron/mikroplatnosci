// Bezpieczne linki i wpisywane kwoty (tabela.js), kursy walut (waluty.js), ceny ze stron (ceny.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bezpiecznyLink, parsujKoszt, formatujKoszt } from '../resources/js/tabela.js';
import { przeliczNaPln, wczytajZapamietane, formatujKwote } from '../resources/js/waluty.js';
import { liczbaZTekstu, odczytajCene } from '../resources/js/ceny.js';

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
