// B10 (harmonogram.js): polecenia schtasks tylko ze stałych tekstów i sprawdzonych ścieżek.
// Udawane Neutralino - żadne polecenie nie trafia do prawdziwego Windows.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dodajZadanie, usunZadanie, czyZadanie, dodajStart, usunStart, czyStart } from '../resources/js/harmonogram.js';

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

const zwykleWywolanie = () => { Neutralino.os.execCommand = async (polecenie) => { polecenia.push(polecenie); return wynikPolecenia(polecenie); }; };
// whoami: nazwa konta z polskimi znakami (tu bez znaczenia) i SID.
const WHOAMI = '"komputer\\Zażółć","S-1-5-21-1004336348-1177238915-682003330-1001"\r\n';
const zWhoami = (inne = { exitCode: 0, stdOut: '', stdErr: '' }) => (p) => (p.startsWith('whoami') ? { exitCode: 0, stdOut: WHOAMI, stdErr: '' } : inne);

test('start z Windows: zadanie po zalogowaniu tego użytkownika, schowane w zasobniku, bez limitu czasu', async () => {
  zwykleWywolanie(); // poprzedni test podmienia wywołanie poleceń na błąd
  wynikPolecenia = zWhoami();
  let zapisany = null;
  const zapis = Neutralino.filesystem.writeBinaryFile;
  Neutralino.filesystem.writeBinaryFile = async (p, dane) => { zapisany = dane; };
  try {
    assert.equal(await dodajStart(DANE), '');
  } finally {
    Neutralino.filesystem.writeBinaryFile = zapis;
  }
  assert.equal(polecenia[0], 'whoami /user /fo csv /nh');
  assert.match(polecenia[1], /^schtasks \/Create \/F \/TN "Mikroplatnosci - start z Windows" \/XML "C:\\Users\\x\\AppData\\Roaming\\Mikroplatnosci\\zadanie\.xml"$/);
  const tresc = String.fromCharCode(...new Uint16Array(zapisany).slice(1));
  assert.match(tresc, /<LogonTrigger><Enabled>true<\/Enabled><UserId>S-1-5-21-1004336348-1177238915-682003330-1001<\/UserId>/); // SID, nie nazwa konta
  assert.match(tresc, /<Arguments>--zasobnik --window-hidden=true<\/Arguments>/);
  assert.match(tresc, /<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/);
  assert.match(tresc, /<WorkingDirectory>C:\\Program Files\\Mikroplatnosci<\/WorkingDirectory>/);
});

test('start z Windows: whoami bez SID, z błędem albo z obcym tekstem - komunikat i żadnego schtasks; usunięcie i sprawdzenie po nazwie zadania', async () => {
  zwykleWywolanie(); // poprzedni test podmienia wywołanie poleceń na błąd
  for (const whoami of [{ exitCode: 1, stdOut: '' }, { exitCode: 0, stdOut: '"komputer\\x"' }, { exitCode: 0, stdOut: '"x","S-1-5-21-1" & del x' }, { exitCode: 0, stdOut: '"x","S-1-5-21-1\"<a>"' }]) {
    wynikPolecenia = () => whoami;
    assert.notEqual(await dodajStart(DANE), '');
  }
  assert.ok(polecenia.every((p) => p === 'whoami /user /fo csv /nh'));
  polecenia = [];
  wynikPolecenia = () => ({ exitCode: 0, stdOut: '', stdErr: '' });
  assert.equal(await usunStart(), '');
  assert.equal(await czyStart(), true);
  assert.deepEqual(polecenia, ['schtasks /Query /TN "Mikroplatnosci - start z Windows"', 'schtasks /Delete /F /TN "Mikroplatnosci - start z Windows"', 'schtasks /Query /TN "Mikroplatnosci - start z Windows"']);
});
