// B10 (harmonogram.js): polecenia schtasks tylko ze stałych tekstów i sprawdzonych ścieżek.
// Udawane Neutralino - żadne polecenie nie trafia do prawdziwego Windows.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dodajZadanie, usunZadanie, czyZadanie } from '../resources/js/harmonogram.js';

const pliki = new Map();
let polecenia = [];
let wynikPolecenia = () => ({ exitCode: 0, stdOut: '', stdErr: '' });
globalThis.window = {};
globalThis.Neutralino = {
  filesystem: {
    getStats: async (p) => {
      if (p.endsWith('Mikroplatnosci.exe') && window.istniejeExe) return {};
      throw Object.assign(new Error('brak'), { code: 'NE_FS_NOPATHE' });
    },
    writeBinaryFile: async (p, dane) => { pliki.set(p, dane); },
    remove: async (p) => { pliki.delete(p); },
  },
  os: {
    execCommand: async (polecenie) => {
      polecenia.push(polecenie);
      return wynikPolecenia(polecenie);
    },
  },
};

const DANE = 'C:/Users/x/AppData/Roaming/Mikroplatnosci';

beforeEach(() => {
  pliki.clear();
  polecenia = [];
  wynikPolecenia = () => ({ exitCode: 0, stdOut: '', stdErr: '' });
  globalThis.window = { NL_PATH: '.', NL_CWD: 'C:/Program Files/Mikroplatnosci', istniejeExe: true };
});

test('dodanie zadania: jedno polecenie /Create z plikiem XML w folderze danych, plik usunięty po wszystkim', async () => {
  assert.equal(await dodajZadanie(DANE), '');
  assert.equal(polecenia.length, 1);
  assert.match(polecenia[0], /^schtasks \/Create \/F \/TN "Mikroplatnosci - powiadomienia" \/XML "C:\\Users\\x\\AppData\\Roaming\\Mikroplatnosci\\zadanie\.xml"$/);
  assert.equal(pliki.size, 0);
});

test('dodanie zadania: plik XML w UTF-16 z BOM i ścieżką zainstalowanego programu', async () => {
  let zapisany = null;
  const zapis = Neutralino.filesystem.writeBinaryFile;
  Neutralino.filesystem.writeBinaryFile = async (p, dane) => { zapisany = dane; };
  try {
    await dodajZadanie(DANE);
  } finally {
    Neutralino.filesystem.writeBinaryFile = zapis;
  }
  const znaki = new Uint16Array(zapisany);
  assert.equal(znaki[0], 0xfeff);
  const tresc = String.fromCharCode(...znaki.slice(1));
  assert.match(tresc, /<Command>C:\\Program Files\\Mikroplatnosci\\Mikroplatnosci\.exe<\/Command>/);
  assert.match(tresc, /<RunLevel>LeastPrivilege<\/RunLevel>/);
});

test('dodanie zadania: niebezpieczne ścieżki - komunikat i żadnego polecenia', async () => {
  for (const cwd of ['C:/Prog"ram', 'C:/A&B', 'C:/100%', 'C:/a|b', 'C:/a<b>']) {
    window.NL_CWD = cwd;
    assert.notEqual(await dodajZadanie(DANE), '');
  }
  window.NL_CWD = 'C:/Program Files/Mikroplatnosci';
  assert.notEqual(await dodajZadanie('C:/Users/x/../y'), '');
  assert.notEqual(await dodajZadanie('\\\\serwer\\udzial'), '');
  assert.deepEqual(polecenia, []);
});

test('dodanie zadania: bez zainstalowanego programu (neu run) - komunikat i żadnego polecenia', async () => {
  window.istniejeExe = false;
  assert.match(await dodajZadanie(DANE), /zainstalowanej/);
  assert.deepEqual(polecenia, []);
});

test('dodanie zadania: odmowa Windows - komunikat z opisem błędu, plik XML usunięty', async () => {
  wynikPolecenia = () => ({ exitCode: 1, stdOut: '', stdErr: 'ERROR: Access is denied.\r\n' });
  assert.match(await dodajZadanie(DANE), /Access is denied\.$/);
  assert.equal(pliki.size, 0);
});

test('usunięcie zadania: brak zadania to nie błąd; jest zadanie - /Delete', async () => {
  wynikPolecenia = () => ({ exitCode: 1 });
  assert.equal(await usunZadanie(), '');
  assert.deepEqual(polecenia, ['schtasks /Query /TN "Mikroplatnosci - powiadomienia"']);
  polecenia = [];
  wynikPolecenia = () => ({ exitCode: 0 });
  assert.equal(await usunZadanie(), '');
  assert.deepEqual(polecenia, ['schtasks /Query /TN "Mikroplatnosci - powiadomienia"', 'schtasks /Delete /F /TN "Mikroplatnosci - powiadomienia"']);
});

test('sprawdzenie zadania: błąd wywołania - null (nie wiadomo)', async () => {
  Neutralino.os.execCommand = async () => { throw new Error('NE_OS_UNLTOEX'); };
  assert.equal(await czyZadanie(), null);
});
