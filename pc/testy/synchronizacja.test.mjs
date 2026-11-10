// Przebieg synchronizacji (synchronizacja.js): uszkodzony plik na Dysku, pytanie przed usunięciem
// kilku pozycji, zapis tylko po zmianie, „Usuń z Dysku”. Strona, okno pytania (confirm), Neutralino i Google udawane w pamięci.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { odczytajDane, WERSJA_DANYCH } from '../resources/js/dane.js';
import { przygotujDysk } from '../resources/js/dysk.js';
import { polaczSynchronizacje, poWymianie } from '../resources/js/synchronizacja.js';

// Udawana strona: każdy element ma pola, których używa synchronizacja.
const elementy = new Map();
const nowyElement = () => {
  const klasy = new Set();
  const obsluga = {};
  return {
    textContent: '', value: '', hidden: false, disabled: false, checked: false,
    classList: { toggle: (k, wl) => (wl ? klasy.add(k) : klasy.delete(k)), contains: (k) => klasy.has(k) },
    addEventListener(typ, fn) { obsluga[typ] = fn; }, showModal() {}, close() {},
    kliknij: () => obsluga.click?.({}),
    obsluga,
  };
};
globalThis.document = { getElementById: (id) => { if (!elementy.has(id)) elementy.set(id, nowyElement()); return elementy.get(id); } };
const stanDysku = () => document.getElementById('dysk-stan');

let pytania;
let odpowiedz;
globalThis.confirm = (tresc) => { pytania.push(tresc); return odpowiedz; };
console.error = () => {}; // błędy synchronizacji są tu oczekiwane - bez szumu w wyniku

const DOSTEP = JSON.stringify({ odswiezajacy: 'R1', id: '123-abc.apps.googleusercontent.com', sekret: 'GOCSPX-abcdefghijk' });
const pliki = new Map([['test/google.json', DOSTEP]]);
globalThis.Neutralino = {
  os: {},
  filesystem: {
    readFile: async (p) => { if (!pliki.has(p)) throw new Error('brak'); return pliki.get(p); },
    writeFile: async (p, d) => { pliki.set(p, d); },
    remove: async (p) => { pliki.delete(p); },
  },
};

// Udawany Google: plik na Dysku = tekst w zmiennej naDysku; wysłane treści zapisywane.
let naDysku;
let wyslane;
let zapytan;
let usuniete;
globalThis.fetch = async (adres, o = {}) => {
  zapytan++;
  const a = String(adres);
  const odp = (status, dane) => ({ ok: status < 300, status, json: async () => dane, text: async () => dane });
  if (o.method === 'DELETE') { usuniete.push(a); return odp(204, {}); }
  if (a.startsWith('https://oauth2.googleapis.com/revoke')) return odp(200, {});
  if (a.startsWith('https://oauth2.googleapis.com/token')) return odp(200, { access_token: 'A1', expires_in: 3600 });
  if (a.includes('/upload/')) { wyslane.push(o.body); return odp(200, { id: 'P1' }); }
  if (a.includes('/drive/v3/files?')) return odp(200, { files: naDysku === null ? [] : [{ id: 'P1', size: String(naDysku.length) }] });
  if (a.includes('alt=media')) return odp(200, naDysku);
  return odp(500, {});
};

const T = (h) => `2026-10-30T${h}:00.000Z`;
const w = (id, h) => ({ id, nazwa: id, zmieniono: T(h), okres: 'M', koszt: 1 });
const dane = (wpisy, usuniete = []) => odczytajDane({ wpisy, usuniete });

let stan;
let zapisow;
let sync;
let lokalnie;
let wlaczonoLokalnie;
before(async () => { await przygotujDysk('test'); });
beforeEach(() => {
  elementy.clear(); // świeże elementy - obsługa kliknięć z poprzedniego testu się nie dubluje
  usuniete = [];
  lokalnie = true;
  wlaczonoLokalnie = 0;
  stan = { ...dane([w('a', '10:00'), w('b', '10:00'), w('c', '10:00'), w('d', '10:00')]), zablokowany: false, synchronizacja: false };
  zapisow = 0;
  pytania = [];
  wyslane = [];
  zapytan = 0;
  odpowiedz = true;
  sync = polaczSynchronizacje({
    stan, poScaleniu: async () => { zapisow++; }, klasaBledu: 'blad',
    czyLokalnie: () => lokalnie, wlaczLokalnie: async () => { wlaczonoLokalnie++; lokalnie = true; },
  });
});
const idki = () => stan.wpisy.map((x) => x.id);

test('uszkodzony plik na Dysku + „Pobierz” - dane bez zmian, komunikat błędu, bez pytania i bez wysyłki', async () => {
  naDysku = '{to nie jest JSON';
  await sync.synchronizuj(false);
  assert.deepEqual(idki(), ['a', 'b', 'c', 'd']);
  assert.equal(pytania.length, 0);
  assert.equal(wyslane.length, 0);
  assert.equal(zapisow, 0);
  assert.match(stanDysku().textContent, /uszkodzony/);
  assert.ok(stanDysku().classList.contains('blad'));
  assert.equal(stan.synchronizacja, false);
});

test('uszkodzony plik + kliknięte „Wyślij” - pytanie; zgoda zastępuje plik, odmowa nic nie wysyła', async () => {
  naDysku = '[]';
  await sync.synchronizuj(true, true);
  assert.equal(pytania.length, 1);
  assert.equal(wyslane.length, 1);
  assert.deepEqual(JSON.parse(wyslane[0]).wpisy.map((x) => x.id), ['a', 'b', 'c', 'd']);
  odpowiedz = false;
  await sync.synchronizuj(true, true);
  assert.equal(pytania.length, 2);
  assert.equal(wyslane.length, 1);
});

test('uszkodzony plik + wysyłka po zmianie (nie kliknięta) - bez pytania i bez zastąpienia', async () => {
  naDysku = '{"cos":1}';
  await sync.synchronizuj(true, false);
  assert.equal(pytania.length, 0);
  assert.equal(wyslane.length, 0);
});

test('plik z nowszej wersji aplikacji - bez scalania i bez wysyłki (także kliknięte „Wyślij”), komunikat o aktualizacji', async () => {
  naDysku = JSON.stringify({ wersja: WERSJA_DANYCH + 1, wpisy: [w('e', '12:00')], usuniete: ['a', 'b', 'c'].map((id) => ({ id, kiedy: T('11:00') })) });
  await sync.synchronizuj(true, true);
  assert.deepEqual(idki(), ['a', 'b', 'c', 'd']);
  assert.equal(pytania.length, 0);
  assert.equal(wyslane.length, 0);
  assert.equal(zapisow, 0);
  assert.match(stanDysku().textContent, /nowsza wersja aplikacji/);
  assert.ok(stanDysku().classList.contains('blad'));
});

test('Dysk usuwa 3 pozycje - pytanie; odmowa = dane bez zmian, bez zapisu i bez wysyłki', async () => {
  naDysku = JSON.stringify({ wersja: 2, wpisy: [w('d', '10:00')], usuniete: ['a', 'b', 'c'].map((id) => ({ id, kiedy: T('11:00') })) });
  odpowiedz = false;
  await sync.synchronizuj(true, true);
  assert.equal(pytania.length, 1);
  assert.match(pytania[0], /usuwają z tego urządzenia 3 pozycje./);
  assert.deepEqual(idki(), ['a', 'b', 'c', 'd']);
  assert.equal(zapisow, 0);
  assert.equal(wyslane.length, 0);
  // Zgoda - pozycje usunięte, zapis na urządzeniu.
  odpowiedz = true;
  await sync.synchronizuj(false);
  assert.deepEqual(idki(), ['d']);
  assert.equal(zapisow, 1);
});

test('Dysk usuwa 2 pozycje - bez pytania', async () => {
  naDysku = JSON.stringify({ wersja: 2, wpisy: [], usuniete: ['a', 'b'].map((id) => ({ id, kiedy: T('11:00') })) });
  await sync.synchronizuj(false);
  assert.equal(pytania.length, 0);
  assert.deepEqual(idki(), ['c', 'd']);
});

test('Dysk bez zmian - bez zapisu na urządzeniu; zmiana z Dysku - jeden zapis', async () => {
  naDysku = JSON.stringify({ wersja: 2, wpisy: stan.wpisy, usuniete: [] });
  await sync.synchronizuj(false);
  assert.equal(zapisow, 0);
  assert.match(stanDysku().textContent, /pobrano z Dysku/);
  naDysku = JSON.stringify({ wersja: 2, wpisy: [...stan.wpisy, w('e', '12:00')], usuniete: [] });
  await sync.synchronizuj(false);
  assert.equal(zapisow, 1);
  assert.deepEqual(idki(), ['a', 'b', 'c', 'd', 'e']);
});

test('pusty Dysk + „Wyślij” - dane z urządzenia trafiają na Dysk', async () => {
  naDysku = null;
  await sync.synchronizuj(true, true);
  assert.equal(wyslane.length, 1);
});

test('zablokowany zapis (błąd odczytu na urządzeniu) - synchronizacja nic nie robi', async () => {
  stan.zablokowany = true;
  naDysku = JSON.stringify({ wersja: 2, wpisy: [], usuniete: [] });
  await sync.synchronizuj(true, true);
  assert.equal(zapytan, 0);
  assert.equal(wyslane.length, 0);
});

// Na końcu: „Usuń z Dysku” wyłącza synchronizację (moduł Dysku jest wspólny dla wszystkich testów).
test('„Usuń z Dysku” - odmowa: nic nie znika, synchronizacja zostaje', async () => {
  naDysku = '{}';
  odpowiedz = false;
  await document.getElementById('dysk-usun').kliknij();
  assert.equal(pytania.length, 1);
  assert.equal(usuniete.length, 0);
  assert.equal(document.getElementById('dysk-usun').hidden, false);
});

test('„Usuń z Dysku” przy wyłączonym zapisie lokalnym - najpierw włącza zapis lokalny, potem kasuje plik i wyłącza synchronizację', async () => {
  naDysku = '{}';
  lokalnie = false;
  await document.getElementById('dysk-usun').kliknij();
  assert.match(pytania[0], /Włączy się zapis na tym urządzeniu/);
  assert.equal(wlaczonoLokalnie, 1);
  assert.deepEqual(usuniete, ['https://www.googleapis.com/drive/v3/files/P1']);
  assert.equal(JSON.parse(pliki.get('test/google.json')).odswiezajacy, undefined, 'dostęp do Google zapomniany');
  assert.equal(document.getElementById('dysk-usun').hidden, true);
  assert.match(stanDysku().textContent, /usunięto z Dysku/);
  // Przywrócenie połączenia dla ewentualnych kolejnych testów.
  pliki.set('test/google.json', DOSTEP);
  await przygotujDysk('test');
});

test('wyłączenie synchronizacji bez zapisu lokalnego - pytanie; odmowa zostawia połączenie', async () => {
  lokalnie = false;
  odpowiedz = false;
  const pole = document.getElementById('dysk-wlacz');
  pole.checked = false;
  await pole.obsluga.change({ target: pole });
  assert.match(pytania[0], /znikną po zamknięciu/);
  assert.equal(pole.checked, true);
  assert.ok(JSON.parse(pliki.get('test/google.json')).odswiezajacy);
});

test('zamknięcie okna w trakcie wymiany z Dyskiem: poWymianie czeka na jej koniec', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = { synchronizacja: true };
  let gotowe = false;
  const czekanie = poWymianie(s, 100).then(() => { gotowe = true; });
  t.mock.timers.tick(500);
  await Promise.resolve();
  assert.equal(gotowe, false);
  s.synchronizacja = false;
  t.mock.timers.tick(100);
  await czekanie;
  assert.equal(gotowe, true);
  assert.equal(await poWymianie({ synchronizacja: false }), undefined); // bez wymiany - od razu
});
