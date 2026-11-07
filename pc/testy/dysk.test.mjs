// Google Dysk (dysk.js): identyfikator wpisany w aplikacji, zapamiętany dostęp, odmowa Google.
// Neutralino i fetch udawane w pamięci - bez sieci i bez prawdziwych plików.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const pliki = new Map();
// Identyfikator wbudowany przy budowaniu (js/google.js) - w testach podstawiany wprost.
const wbuduj = (klucze) => { globalThis.GOOGLE_KLUCZE = klucze; };
let odpowiedzi = {};
globalThis.Neutralino = {
  os: {},
  filesystem: {
    readFile: async (p) => { if (!pliki.has(p)) throw new Error('brak'); return pliki.get(p); },
    writeFile: async (p, d) => { pliki.set(p, d); },
    remove: async (p) => { pliki.delete(p); },
  },
};
let wyslaneId = [];
let wyslane = [];
globalThis.fetch = async (adres, o) => {
  wyslaneId.push(new URLSearchParams(o?.body).get('client_id'));
  wyslane.push({ adres: String(adres), pola: new URLSearchParams(o?.body) });
  const [status, dane] = odpowiedzi[Object.keys(odpowiedzi).find((k) => String(adres).includes(k))] ?? [500, {}];
  return { ok: status < 300, status, json: async () => dane };
};

const PLIK = 'test/google.json';
const ID = '123-abc.apps.googleusercontent.com';
const SEKRET = 'GOCSPX-abcdefghijk';
const plik = () => (pliki.has(PLIK) ? JSON.parse(pliki.get(PLIK)) : null);

// Moduł trzyma stan - świeża kopia przed każdym testem.
let D;
let licznik = 0;
beforeEach(async () => {
  pliki.clear();
  wbuduj(undefined);
  odpowiedzi = {};
  wyslaneId = [];
  wyslane = [];
  D = await import('../resources/js/dysk.js?' + licznik++);
});

test('bez identyfikatora - nieskonfigurowany', async () => {
  await D.przygotujDysk('test');
  assert.equal(D.czySkonfigurowany(), false);
});

test('identyfikator wbudowany przy budowaniu', async () => {
  wbuduj({ MIKROPLATNOSCI_GOOGLE_ID: ID, MIKROPLATNOSCI_GOOGLE_SECRET: SEKRET });
  await D.przygotujDysk('test');
  assert.equal(D.czySkonfigurowany(), true);
  assert.equal(plik(), null);
});

test('złe wpisy odrzucone z opisem, nic nie zapisane', async () => {
  await D.przygotujDysk('test');
  assert.match(await D.ustawIdentyfikator('abc', SEKRET), /googleusercontent/);
  assert.match(await D.ustawIdentyfikator(ID, 'krótki'), /GOCSPX/);
  assert.match(await D.ustawIdentyfikator(ID + '"<x>', SEKRET), /googleusercontent/);
  assert.equal(D.czySkonfigurowany(), false);
  assert.equal(plik(), null);
});

test('poprawny wpis zapisany (spacje obcięte) i pamiętany po ponownym uruchomieniu', async () => {
  await D.przygotujDysk('test');
  assert.equal(await D.ustawIdentyfikator(`  ${ID} `, ` ${SEKRET}\n`), '');
  assert.deepEqual(plik(), { id: ID, sekret: SEKRET });
  const D2 = await import('../resources/js/dysk.js?' + licznik++);
  await D2.przygotujDysk('test');
  assert.equal(D2.czySkonfigurowany(), true);
});

test('wpisany identyfikator ma pierwszeństwo przed zmiennymi', async () => {
  wbuduj({ MIKROPLATNOSCI_GOOGLE_ID: 'zly-1.apps.googleusercontent.com', MIKROPLATNOSCI_GOOGLE_SECRET: SEKRET });
  pliki.set(PLIK, JSON.stringify({ id: ID, sekret: SEKRET }));
  await D.przygotujDysk('test');
  await assert.rejects(D.zacznijLogowanie());
  assert.deepEqual(wyslaneId, [ID]);
});

test('Google odrzuca identyfikator - aplikacja go zapomina', async () => {
  await D.przygotujDysk('test');
  await D.ustawIdentyfikator(ID, SEKRET);
  odpowiedzi = { 'device/code': [401, { error: 'invalid_client' }] };
  await assert.rejects(D.zacznijLogowanie(), /nie rozpoznał/);
  assert.equal(D.czySkonfigurowany(), false);
  assert.equal(plik(), null);
});

test('zły tajny klucz wychodzi przy czekaniu na zgodę - też zapomniany', async () => {
  await D.przygotujDysk('test');
  await D.ustawIdentyfikator(ID, SEKRET);
  odpowiedzi = { 'device/code': [200, { device_code: 'd', user_code: 'ABCD-EFGH', interval: 0.01, expires_in: 5 }], token: [401, { error: 'invalid_client' }] };
  const l = await D.zacznijLogowanie();
  assert.equal(l.kod, 'ABCD-EFGH');
  await assert.rejects(l.czekaj(), /nie rozpoznał/);
  assert.equal(D.czySkonfigurowany(), false);
});

test('zgoda - dostęp zapisany obok identyfikatora; wyłączenie zostawia identyfikator', async () => {
  await D.przygotujDysk('test');
  await D.ustawIdentyfikator(ID, SEKRET);
  odpowiedzi = {
    'device/code': [200, { device_code: 'd', user_code: 'ABCD-EFGH', interval: 0.01, expires_in: 5 }],
    token: [200, { access_token: 'a', refresh_token: 'r', expires_in: 3600 }],
  };
  await (await D.zacznijLogowanie()).czekaj();
  assert.equal(D.czyPolaczony(), true);
  assert.deepEqual(plik(), { odswiezajacy: 'r', id: ID, sekret: SEKRET });
  await D.rozlacz();
  assert.equal(D.czyPolaczony(), false);
  assert.deepEqual(plik(), { id: ID, sekret: SEKRET });
});

test('identyfikator wbudowany nie trafia do pliku; po wyłączeniu plik znika', async () => {
  wbuduj({ MIKROPLATNOSCI_GOOGLE_ID: ID, MIKROPLATNOSCI_GOOGLE_SECRET: SEKRET });
  await D.przygotujDysk('test');
  odpowiedzi = {
    'device/code': [200, { device_code: 'd', user_code: 'K', interval: 0.01, expires_in: 5 }],
    token: [200, { access_token: 'a', refresh_token: 'r' }],
  };
  await (await D.zacznijLogowanie()).czekaj();
  assert.deepEqual(plik(), { odswiezajacy: 'r' });
  await D.rozlacz();
  assert.equal(plik(), null);
});

test('uszkodzony plik dostępu - ignorowany', async () => {
  pliki.set(PLIK, JSON.stringify({ odswiezajacy: 5, id: 'zly', sekret: SEKRET }));
  await D.przygotujDysk('test');
  assert.equal(D.czyPolaczony(), false);
  assert.equal(D.czySkonfigurowany(), false);
});

test('zapytanie do Google bez pamięci podręcznej i z limitem czasu; brak odpowiedzi - zrozumiały błąd', async () => {
  wbuduj({ MIKROPLATNOSCI_GOOGLE_ID: ID, MIKROPLATNOSCI_GOOGLE_SECRET: SEKRET });
  await D.przygotujDysk('test');
  const zwykly = globalThis.fetch;
  let opcje;
  globalThis.fetch = async (adres, o) => { opcje = o; throw new DOMException('signal timed out', 'TimeoutError'); };
  try {
    await assert.rejects(D.zacznijLogowanie(), /Google nie odpowiada/);
  } finally {
    globalThis.fetch = zwykly;
  }
  assert.equal(opcje.cache, 'no-store');
  assert.ok(opcje.signal instanceof AbortSignal);
});

test('limit czasu działa także wtedy, gdy fetch pomija signal (CapacitorHttp na telefonie wysyła POST natywnie)', async () => {
  wbuduj({ MIKROPLATNOSCI_GOOGLE_ID: ID, MIKROPLATNOSCI_GOOGLE_SECRET: SEKRET });
  await D.przygotujDysk('test');
  const zwykly = globalThis.fetch;
  const zwyklyLimit = AbortSignal.timeout;
  let przerwij;
  AbortSignal.timeout = () => { przerwij = new AbortController(); return przerwij.signal; };
  globalThis.fetch = () => new Promise(() => {});
  try {
    const logowanie = D.zacznijLogowanie();
    przerwij.abort(new DOMException('signal timed out', 'TimeoutError'));
    await assert.rejects(logowanie, /Google nie odpowiada/);
  } finally {
    globalThis.fetch = zwykly;
    AbortSignal.timeout = zwyklyLimit;
  }
});

test('logowanie prosi o zakres drive.file - logowanie kodem odrzuca drive.appdata (invalid_scope)', async () => {
  wbuduj({ MIKROPLATNOSCI_GOOGLE_ID: ID, MIKROPLATNOSCI_GOOGLE_SECRET: SEKRET });
  await D.przygotujDysk('test');
  odpowiedzi = { 'device/code': [200, { device_code: 'd', user_code: 'K', interval: 0.01, expires_in: 5 }] };
  (await D.zacznijLogowanie()).anuluj();
  assert.equal(wyslane[0].pola.get('scope'), 'https://www.googleapis.com/auth/drive.file');
});

test('„Zmień projekt Google”: inny identyfikator przy połączonym Dysku najpierw rozłącza konto, ten sam - nic nie zmienia', async () => {
  const INNY = '456-xyz.apps.googleusercontent.com';
  pliki.set(PLIK, JSON.stringify({ odswiezajacy: 'r', id: ID, sekret: SEKRET }));
  await D.przygotujDysk('test');
  assert.equal(D.czyWpisany(), true);
  assert.deepEqual(D.wpisanyProjekt(), { id: ID, sekret: SEKRET });
  assert.equal(await D.ustawIdentyfikator(ID, SEKRET), '');
  assert.equal(D.czyPolaczony(), true, 'ten sam projekt - połączenie zostaje');
  assert.equal(wyslane.length, 0);
  assert.equal(await D.ustawIdentyfikator(INNY, SEKRET), '');
  assert.equal(D.czyPolaczony(), false);
  assert.ok(wyslane.some((z) => z.adres.includes('/revoke') && z.pola.get('token') === 'r'), 'Google proszony o unieważnienie starego dostępu');
  assert.deepEqual(plik(), { id: INNY, sekret: SEKRET });
});

test('projekt wbudowany - nie do zmiany w aplikacji', async () => {
  wbuduj({ MIKROPLATNOSCI_GOOGLE_ID: ID, MIKROPLATNOSCI_GOOGLE_SECRET: SEKRET });
  await D.przygotujDysk('test');
  assert.equal(D.czyWpisany(), false);
  assert.deepEqual(D.wpisanyProjekt(), { id: '', sekret: '' });
});
