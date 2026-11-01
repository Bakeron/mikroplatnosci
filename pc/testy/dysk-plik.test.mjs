// Google Dysk (dysk.js): pobieranie i wysyłanie pliku, odświeżanie dostępu.
// Udawany serwer Google w pamięci - zapisuje każde zapytanie (adres, metoda, nagłówki, treść).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const pliki = new Map();
globalThis.Neutralino = {
  os: {},
  filesystem: {
    readFile: async (p) => { if (!pliki.has(p)) throw new Error('brak'); return pliki.get(p); },
    writeFile: async (p, d) => { pliki.set(p, d); },
    remove: async (p) => { pliki.delete(p); },
  },
};

const PLIK = 'test/google.json';
const DOSTEP = { odswiezajacy: 'R1', id: '123-abc.apps.googleusercontent.com', sekret: 'GOCSPX-abcdefghijk' };

// serwer(zapytanie) zwraca [status, dane]; dane jako obiekt (json) albo tekst.
let serwer;
let zapytania;
globalThis.fetch = async (adres, o = {}) => {
  const z = { adres: String(adres), metoda: o.method ?? 'GET', naglowki: o.headers ?? {}, tresc: o.body };
  zapytania.push(z);
  const [status, dane] = serwer(z);
  return {
    ok: status < 300, status,
    json: async () => (typeof dane === 'string' ? JSON.parse(dane) : dane),
    text: async () => (typeof dane === 'string' ? dane : JSON.stringify(dane)),
  };
};

const token = (z) => z.adres.startsWith('https://oauth2.googleapis.com/token');
const lista = (z) => z.adres.startsWith('https://www.googleapis.com/drive/v3/files?');
const tokenOk = [200, { access_token: 'A1', expires_in: 3600 }];

let D;
let licznik = 0;
beforeEach(async () => {
  pliki.clear();
  pliki.set(PLIK, JSON.stringify(DOSTEP));
  zapytania = [];
  D = await import('../resources/js/dysk.js?' + licznik++);
  await D.przygotujDysk('test');
});

test('pusty Dysk: pobranie = null, wysyłka zakłada plik w ukrytym folderze aplikacji, druga wysyłka go nadpisuje', async () => {
  serwer = (z) => {
    if (token(z)) return tokenOk;
    if (lista(z)) return [200, { files: [] }];
    if (z.metoda === 'POST') return [200, { id: 'PLIK-1' }];
    if (z.metoda === 'PATCH') return [200, {}];
    return [500, {}];
  };
  assert.equal(await D.pobierzZDysku(), null);
  await D.wyslijNaDysk('{"wpisy":[]}');
  const post = zapytania.find((z) => z.metoda === 'POST' && z.adres.includes('/upload/'));
  assert.ok(post.adres.includes('uploadType=multipart'));
  assert.equal(post.naglowki.Authorization, 'Bearer A1');
  // Treść multipart rozkłada się na opis pliku i dane według granicy z nagłówka.
  const granica = post.naglowki['Content-Type'].match(/boundary=(.+)$/)[1];
  const czesci = post.tresc.split(`--${granica}`).slice(1, -1).map((c) => c.split('\r\n\r\n')[1].trim());
  assert.deepEqual(JSON.parse(czesci[0]), { name: 'mikroplatnosci.json', parents: ['appDataFolder'] });
  assert.equal(czesci[1], '{"wpisy":[]}');
  assert.ok(post.tresc.endsWith(`--${granica}--`));

  await D.wyslijNaDysk('{"wpisy":[1]}');
  const patch = zapytania.find((z) => z.metoda === 'PATCH');
  assert.ok(patch.adres.includes('/files/PLIK-1?uploadType=media'), 'druga wysyłka ma nadpisać ten sam plik, nie zakładać nowego');
  assert.equal(patch.tresc, '{"wpisy":[1]}');
  assert.equal(zapytania.filter((z) => z.metoda === 'POST' && z.adres.includes('/upload/')).length, 1);
  // Dostęp pobrany raz i użyty ponownie, dopóki ważny.
  assert.equal(zapytania.filter(token).length, 1);
});

test('plik na Dysku: pobranie zwraca treść, a wysyłka nadpisuje znaleziony plik', async () => {
  serwer = (z) => {
    if (token(z)) return tokenOk;
    if (lista(z)) return [200, { files: [{ id: 'STARY', size: '20' }] }];
    if (z.adres.includes('/files/STARY?alt=media')) return [200, '{"wpisy":["z telefonu"]}'];
    if (z.metoda === 'PATCH') return [200, {}];
    return [500, {}];
  };
  assert.equal(await D.pobierzZDysku(), '{"wpisy":["z telefonu"]}');
  assert.ok(zapytania.find(lista).adres.includes('spaces=appDataFolder'));
  await D.wyslijNaDysk('{}');
  assert.ok(zapytania.at(-1).adres.includes('/files/STARY?uploadType=media'));
});

test('za duży plik na Dysku - błąd bez pobierania treści', async () => {
  serwer = (z) => {
    if (token(z)) return tokenOk;
    if (lista(z)) return [200, { files: [{ id: 'DUZY', size: String(6 * 1024 * 1024) }] }];
    return [200, 'nie powinno być pobrane'];
  };
  await assert.rejects(D.pobierzZDysku(), /za duży/);
  assert.equal(zapytania.some((z) => z.adres.includes('alt=media')), false);
});

test('Google cofnął dostęp (invalid_grant) - aplikacja zapomina dostęp, identyfikator zostaje', async () => {
  serwer = (z) => (token(z) ? [400, { error: 'invalid_grant' }] : [500, {}]);
  await assert.rejects(D.pobierzZDysku(), /cofnął dostęp/);
  assert.equal(D.czyPolaczony(), false);
  const zapisany = JSON.parse(pliki.get(PLIK));
  assert.equal(zapisany.odswiezajacy, undefined);
  assert.equal(zapisany.id, DOSTEP.id);
});

test('401 przy pobraniu - przy następnym zapytaniu nowy dostęp', async () => {
  let pierwszy = true;
  serwer = (z) => {
    if (token(z)) return tokenOk;
    if (lista(z)) {
      if (pierwszy) { pierwszy = false; return [401, {}]; }
      return [200, { files: [] }];
    }
    return [500, {}];
  };
  await assert.rejects(D.pobierzZDysku(), /401/);
  assert.equal(await D.pobierzZDysku(), null);
  assert.equal(zapytania.filter(token).length, 2);
});
