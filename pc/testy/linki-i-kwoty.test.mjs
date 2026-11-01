// Bezpieczne linki i wpisywane kwoty (dane.js), kursy walut (waluty.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bezpiecznyLink, parsujKoszt, formatujKoszt } from '../resources/js/dane.js';
import { przeliczNaPln, wczytajZapamietane, formatujKwote, odswiezZNbp } from '../resources/js/waluty.js';

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

