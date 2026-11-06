// C15 (Anulowane), F27 (wersja angielska - słownik i formatowanie), F25 (ustawienie notatek - w magazyn.test.mjs).
// Stały „dziś”: wtorek 10.11.2026.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zbierzAlarmy, przeniesNastepnaCene, formatujDate, doPlatnosci } from '../resources/js/alarmy.js';
import { policz, oszczednoscRoczna } from '../resources/js/podsumowanie.js';
import { normalizuj, dodajPrzyklad, nicDoStracenia } from '../resources/js/dane.js';
import { przypomnienia } from '../resources/js/powiadomienia.js';
import { wydatkiRoku } from '../resources/js/historia.js';
import { scal } from '../resources/js/scalanie.js';
import { formatujKwote } from '../resources/js/waluty.js';
import { t, tn, ustawJezyk, jezyk, liczba } from '../resources/js/teksty.js';
import EN from '../resources/js/teksty-en.js';

mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 10, 10, 0).getTime() });
const wpis = (extra) => normalizuj({ id: 'x', nazwa: 'x', przedluzac: 'tak', waluta: 'PLN', okres: 'M', ...extra });

test('C15: anulowana - poza sumami, alarmami i powiadomieniami; liczy się do „oszczędzasz / rok”', () => {
  const netflix = wpis({ id: 'n', nazwa: 'Netflix', koszt: 45, od: '2026-10-20', anulowano: '2026-11-05' });
  const domena = wpis({ id: 'd', nazwa: 'Domena', koszt: 120, okres: 'R', od: '2026-01-20', przedluzac: 'nie', anulowano: '2026-11-01' });
  const spotify = wpis({ id: 's', nazwa: 'Spotify', koszt: 24, od: '2026-10-20', osob: 2 });
  const s = policz([netflix, domena, spotify]);
  assert.equal(s.miesieczne, 12); // tylko moja część Spotify
  assert.equal(s.jednorazoweIlosc, 0);
  assert.equal(s.anulowaneIlosc, 2);
  assert.equal(s.oszczednoscRok, 45 * 12 + 120);
  assert.equal(oszczednoscRoczna(wpis({ koszt: 30, osob: 3 })), 120);
  const alarmy = zbierzAlarmy([netflix, domena]);
  assert.deepEqual([alarmy.roczne.length, alarmy.jednorazowe.length], [0, 0]);
  assert.deepEqual(przypomnienia([netflix, domena, wpis({ koszt: 9, od: '2026-10-20', przedluzac: 'nie', anulowano: '2026-11-09' })]), []);
  assert.equal(normalizuj({ anulowano: 'wczoraj' }).anulowano, '');
});

test('C15: anulowana nie przenosi ceny następnej; historia liczy płatności do dnia anulowania', () => {
  const w = wpis({ koszt: 40, prognoza: 50, od: '2026-10-01', anulowano: '2026-11-01' });
  assert.equal(przeniesNastepnaCene(w), '');
  assert.equal(w.koszt, 40);
  // Zakup 15.07, co miesiąc: płatności 15.07, 15.08, 15.09; anulowana 01.10 - październik i listopad bez płatności.
  const r = wydatkiRoku([wpis({ koszt: 10, od: '2026-07-15', anulowano: '2026-10-01' })], 2026);
  assert.deepEqual(r.miesiace.map((m) => m.suma), [0, 0, 0, 0, 0, 0, 10, 10, 10, 0, 0, 0]);
});

test('C15: przywrócenie po anulowaniu na drugim urządzeniu - wygrywa nowsza zmiana (scalanie)', () => {
  const anulowana = wpis({ id: 'a', koszt: 5, anulowano: '2026-11-09', zmieniono: '2026-11-09T10:00:00.000Z' });
  const przywrocona = { ...anulowana, anulowano: '', zmieniono: '2026-11-10T08:00:00.000Z' };
  assert.equal(scal({ wpisy: [anulowana], usuniete: [] }, { wpisy: [przywrocona], usuniete: [] }).wpisy[0].anulowano, '');
  assert.equal(scal({ wpisy: [przywrocona], usuniete: [] }, { wpisy: [anulowana], usuniete: [] }).wpisy[0].anulowano, '');
});

test('F25: przykład z własnym opisem (PC, telefon) - płatność za 9 dni, wykreślany od razu; pusty wpis tak samo', () => {
  const wpisy = [];
  dodajPrzyklad(wpisy, 'opis telefonu');
  assert.equal(wpisy[0].opis, 'opis telefonu');
  assert.equal(wpisy[0].nazwa, t('Przykład: serwis muzyczny'));
  assert.equal(doPlatnosci(wpisy[0]).dni, 9);
  assert.equal(nicDoStracenia(wpisy[0]), true);
  assert.equal(nicDoStracenia(normalizuj({ id: 'p', przedluzac: 'tak' })), true);
  assert.equal(nicDoStracenia(normalizuj({ id: 'p', przedluzac: 'nie' })), false);
  assert.equal(nicDoStracenia(wpis({ koszt: 5 })), false);
});

// --- F27: słownik angielski ---------------------------------------------------------------------

const js = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'js');
const telefon = join(js, '..', '..', '..', 'mobile', 'src'); // własne teksty telefonu - ten sam słownik
const POMIJANE = new Set(['neutralino.js', 'teksty.js', 'teksty-en.js', 'szyfrowanie.js', 'google.js', 'wersja.js']);
const LITERAL = String.raw`('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`;
const odLiteralu = (s) => s.slice(1, -1).replace(/\\(.)/g, '$1');
const BEZ_TLUMACZENIA = new Set(['Mikropłatności', 'https://']); // nazwa aplikacji, podpowiedź w polu linku

// Klucze z kodu: t('…'), tekst('…') (napisy), tn(n, '…', …) (liczba mnoga - klucz to pierwsza forma).
function kluczeKodu() {
  const napisy = new Set();
  const mnogie = new Set();
  const pliki = readdirSync(js).filter((p) => p.endsWith('.js') && !POMIJANE.has(p)).map((p) => join(js, p));
  for (const plik of [...pliki, join(telefon, 'js', 'aplikacja.js')]) {
    const kod = readFileSync(plik, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    for (const m of kod.matchAll(new RegExp(String.raw`\b(?:t|tekst)\(\s*` + LITERAL, 'g'))) napisy.add(odLiteralu(m[1]));
    for (const m of kod.matchAll(new RegExp(String.raw`\btn\((?:[^'"()]|\([^()]*\))*?,\s*` + LITERAL, 'g'))) mnogie.add(odLiteralu(m[1]));
  }
  return { napisy, mnogie };
}

// Klucze z index.html tak, jak buduje je przetlumaczStrone (teksty.js): tekst między znacznikami
// (bez <script>, <style> i <code>), przycięty, spacje złączone; atrybuty title, aria-label, placeholder, data-pomoc*.
function kluczeStrony(plik) {
  const html = readFileSync(plik, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|code|title)\b[\s\S]*?<\/\1>/g, '<x>');
  const klucze = new Set();
  for (const kawalek of html.split(/<[^>]*>/)) {
    const k = kawalek.trim().replace(/\s+/g, ' ');
    if (/\p{L}/u.test(k)) klucze.add(k);
  }
  for (const m of html.matchAll(/\s(?:title|aria-label|placeholder|data-pomoc|data-pomoc-czego)="([^"]*)"/g)) if (/\p{L}/u.test(m[1])) klucze.add(m[1]);
  for (const k of BEZ_TLUMACZENIA) klucze.delete(k);
  return klucze;
}

const zmienne = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('F27: każdy tekst z kodu i z index.html (PC i telefon) ma tłumaczenie angielskie, z tymi samymi {parametrami}', () => {
  const { napisy, mnogie } = kluczeKodu();
  for (const plik of [join(js, '..', 'index.html'), join(telefon, 'index.html')]) for (const k of kluczeStrony(plik)) napisy.add(k);
  const brak = [...napisy, ...mnogie].filter((k) => !(k in EN));
  assert.deepEqual(brak, [], 'brak tłumaczenia');
  for (const k of napisy) {
    if (mnogie.has(k)) continue;
    assert.equal(typeof EN[k], 'string', `„${k}” - tłumaczenie ma być tekstem`);
    assert.equal(zmienne(EN[k]), zmienne(k), `„${k}” - inne {parametry} w tłumaczeniu`);
  }
  for (const k of mnogie) {
    assert.ok(Array.isArray(EN[k]) && EN[k].length === 2, `„${k}” - liczba mnoga: [jeden, wiele]`);
    for (const forma of EN[k]) assert.equal(zmienne(forma), zmienne(k), `„${k}” - inne {parametry} w formie „${forma}”`);
  }
  const nieuzywane = Object.keys(EN).filter((k) => !napisy.has(k) && !mnogie.has(k));
  assert.deepEqual(nieuzywane, [], 'tłumaczenia bez tekstu w kodzie - do usunięcia');
});

test('F27: przełączanie języka - teksty, liczba mnoga, kwoty i daty; domyślnie polski', () => {
  assert.equal(jezyk(), 'pl');
  assert.equal(formatujKwote(1234.5), '1234,50 zł');
  assert.equal(tn(1, '{n} dzień', '{n} dni', '{n} dni'), '1 dzień');
  assert.equal(tn(22, '{n} pozycja', '{n} pozycje', '{n} pozycji'), '22 pozycje');
  assert.equal(tn(12, '{n} pozycja', '{n} pozycje', '{n} pozycji'), '12 pozycji');
  assert.equal(t('nie ma {x} w słowniku', { x: 'tego' }), 'nie ma tego w słowniku');
  try {
    assert.equal(ustawJezyk('en'), 'en');
    assert.equal(formatujKwote(1234.5), '1,234.50 PLN');
    assert.equal(formatujKwote(9.99, 'USD'), '9.99 USD');
    assert.equal(liczba(2.5), '2.50');
    assert.equal(formatujDate(new Date(2026, 10, 2)), '2 Nov 2026');
    assert.equal(tn(1, '{n} dzień', '{n} dni', '{n} dni'), EN['{n} dzień'][0].replace('{n}', '1'));
    const systemu = String(globalThis.navigator?.language || 'pl').toLowerCase().startsWith('pl') ? 'pl' : 'en';
    assert.equal(ustawJezyk('xx'), systemu, 'nieznany język - język systemu');
  } finally {
    ustawJezyk('pl');
  }
  assert.equal(formatujKwote(1234.5), '1234,50 zł');
});
