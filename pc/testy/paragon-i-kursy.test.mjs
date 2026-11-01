// Paragon - prognoza na miesiąc (podsumowanie.js) i kursy NBP: kiedy pobrać jeszcze raz, zła odpowiedź (waluty.js).
// Stały „dziś”: wtorek 10.11.2026. Neutralino i fetch udawane w pamięci.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { policz } from '../resources/js/podsumowanie.js';
import { czyAktualne, wczytajZapamietane, odswiezZNbp, pobierzKursy } from '../resources/js/waluty.js';

const godzina = (dzien, h) => new Date(2026, 10, dzien, h, 0).getTime();
mock.timers.enable({ apis: ['Date'], now: godzina(10, 8) });

const pliki = new Map();
let zapisy = 0;
globalThis.Neutralino = {
  filesystem: {
    readFile: async (p) => { if (!pliki.has(p)) throw new Error('brak'); return pliki.get(p); },
    writeFile: async (p, d) => { zapisy++; pliki.set(p, d); },
  },
};
const PLIK = 'test/kursy.json';
const KURSY = { USD: 3.9, EUR: 4.2, data: '2026-11-09', pobrano: '2026-11-10' };
const odpowiedzNbp = (dane, status = 200) => { globalThis.fetch = async () => ({ ok: status < 300, status, json: async () => dane }); };

beforeEach(async () => {
  mock.timers.setTime(godzina(10, 8));
  pliki.clear();
  zapisy = 0;
  pliki.set(PLIK, JSON.stringify(KURSY));
  await wczytajZapamietane(PLIK);
});

const wpis = (extra) => ({ nazwa: 'x', od: '2026-10-01', przedluzac: 'tak', waluta: 'PLN', ...extra });

test('prognoza na miesiąc: miesięczna wprost, roczna przez 12, bez prognozy - zwykły koszt', () => {
  const s = policz([
    wpis({ koszt: 30, prognoza: 35, okres: 'M' }),
    wpis({ koszt: 120, prognoza: 144, okres: 'R' }),
    wpis({ koszt: 10, okres: 'M' }),
  ]);
  assert.equal(s.jestPrognoza, true);
  assert.equal(s.prognozaNaMiesiac, 35 + 144 / 12 + 10);
  assert.equal(s.lacznieMiesiecznie, 30 + 120 / 12 + 10);
});

test('prognoza: „nie” poza prognozą, waluta obca przeliczana kursem NBP', () => {
  const s = policz([
    wpis({ koszt: 50, prognoza: 60, okres: 'M', przedluzac: 'nie' }),
    wpis({ koszt: 10, prognoza: 20, okres: 'M', waluta: 'USD' }),
  ]);
  assert.equal(s.prognozaNaMiesiac, 78); // 20 USD × 3,9
  assert.equal(s.jestPrognoza, true);
});

test('czyAktualne: rano tabela z wczoraj wystarcza, po 12:00 trzeba dobrać dzisiejszą, w weekend nie', async () => {
  assert.equal(czyAktualne(), true);
  mock.timers.setTime(godzina(10, 13));
  assert.equal(czyAktualne(), false);
  // Sobota: NBP nie publikuje - piątkowa tabela pobrana w sobotę jest aktualna przez cały dzień.
  mock.timers.setTime(godzina(14, 15));
  pliki.set(PLIK, JSON.stringify({ ...KURSY, data: '2026-11-13', pobrano: '2026-11-14' }));
  await wczytajZapamietane(PLIK);
  assert.equal(czyAktualne(), true);
  // Pobrane innego dnia - zawsze pobrać jeszcze raz.
  mock.timers.setTime(godzina(16, 8));
  assert.equal(czyAktualne(), false);
});

test('NBP: odpowiedź bez kursu EUR albo błąd HTTP - dobre kursy zostają, plik nietknięty', async () => {
  odpowiedzNbp([{ effectiveDate: '2026-11-10', rates: [{ code: 'USD', mid: 3.95 }] }]);
  await assert.rejects(odswiezZNbp(PLIK), /nieprawidłowa odpowiedź/);
  odpowiedzNbp([{ effectiveDate: '2026-11-10', rates: [{ code: 'USD', mid: 3.95 }, { code: 'EUR', mid: 420 }] }]);
  await assert.rejects(odswiezZNbp(PLIK), /nieprawidłowa odpowiedź/);
  odpowiedzNbp({}, 503);
  await assert.rejects(odswiezZNbp(PLIK), /HTTP 503/);
  assert.equal(zapisy, 0);
  assert.deepEqual(pobierzKursy(), KURSY);
});

test('NBP: nowa tabela zapisana raz, ta sama drugi raz bez zapisu', async () => {
  odpowiedzNbp([{ effectiveDate: '2026-11-10', rates: [{ code: 'USD', mid: 3.95 }, { code: 'EUR', mid: 4.25 }] }]);
  assert.equal(await odswiezZNbp(PLIK), true);
  assert.equal(zapisy, 1);
  assert.equal(JSON.parse(pliki.get(PLIK)).USD, 3.95);
  assert.equal(await odswiezZNbp(PLIK), false);
  assert.equal(zapisy, 1);
});
