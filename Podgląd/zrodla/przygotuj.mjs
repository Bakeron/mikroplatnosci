// Dane do obrazków poglądowych - daty liczone od dnia renderowania.
// Użycie: PODGLAD_DANE=<folder testowy> node przygotuj.mjs <scenariusz>
//   pelny-noc | pelny-dzien | pusty | uszkodzony | druga-kopia | usun
// Pracuje WYŁĄCZNIE w folderze testowym - prawdziwych danych z %APPDATA%\Mikroplatnosci nigdy nie rusza.

import fs from 'node:fs';
import path from 'node:path';

const BAZA = process.env.PODGLAD_DANE;
if (!BAZA || /roaming/i.test(BAZA)) throw new Error('Ustaw PODGLAD_DANE na folder testowy (poza %APPDATA%) - prawdziwych danych nie ruszamy.');
const FOLDER = path.join(BAZA, 'Mikroplatnosci');

const scenariusz = process.argv[2];

function dzien(przesuniecie) {
  const t = new Date();
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + przesuniecie);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Data zakupu (przesunięcie od dziś) + 1 miesiąc - pierwszy termin miesięcznej płatności ręcznej.
function poMiesiacu(od) {
  const t = new Date();
  const z = new Date(t.getFullYear(), t.getMonth(), t.getDate() + od);
  const d = new Date(z.getFullYear(), z.getMonth() + 1, z.getDate());
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// dodatki: { prognoza } - cena od następnej płatności, { reczna: true } - „płacę sam”,
// { zaplacony } - termin oznaczony „✓ zapłacone”.
function wpis(id, od, doDnia, nazwa, opis, koszt, waluta, link, przedluzac, dodatki = {}) {
  return {
    id, od: od === null ? '' : dzien(od), do: doDnia === null ? '' : dzien(doDnia), nazwa, opis, koszt, waluta, link, przedluzac,
    prognoza: dodatki.prognoza ?? null, platnoscReczna: dodatki.reczna ?? false, zaplaconyTermin: dodatki.zaplacony ?? '',
  };
}

// Różnorodne wiersze: miesięczne, roczne, inny okres, jednorazowe (aktywne i zakończona),
// przesunięty termin, waluty, cena od następnej płatności (drożej / bez zmian / promocja),
// płatność ręczna (po terminie, za 2 dni, zapłacona), brak dat, niebezpieczny link.
const WPISY = [
  wpis('p01', -19, 12, 'Netflix', 'plan Standard', 43, 'PLN', 'https://www.netflix.com/pl/', 'tak', { prognoza: 49 }),
  wpis('p02', -85, -54, 'Spotify', 'Premium Individual', 23.99, 'PLN', 'https://www.spotify.com/pl/premium/', 'tak'),
  wpis('p03', -17, 14, 'ChatGPT Plus', 'subskrypcja AI', 20, 'USD', 'https://chat.openai.com', 'tak', { prognoza: 20 }),
  wpis('p04', -28, 3, 'Próbny AI', 'anulować przed końcem testu!', 9.99, 'USD', 'https://example.com/konto', 'nie'),
  wpis('p05', -292, 73, 'Chmura 2 TB', 'promocja na pierwszy rok', 399, 'PLN', '', 'nie'),
  wpis('p06', -58, -28, 'Stara próbna', 'test edytora wideo', 15, 'PLN', '', 'nie'),
  wpis('p07', -318, 47, 'Domena .com', 'rejestrator zagraniczny', 12.99, 'EUR', 'https://www.namecheap.com', 'tak'),
  wpis('p08', -343, 22, 'Antywirus', 'licencja na 3 urządzenia', 149, 'PLN', 'https://www.eset.com/pl/', 'tak'),
  wpis('p09', -242, 123, 'Hosting VPS', 'serwer dla bloga', 300, 'PLN', 'hosting.pl', 'tak'),
  wpis('p10', -340, 25, 'Pakiet graficzny', 'licencja roczna', 120, 'PLN', 'https://example.com/licencja', 'tak'),
  wpis('p11', -23, 7, 'YouTube Premium', 'okres próbny', 25.99, 'PLN', 'https://www.youtube.com/premium', 'nie'),
  wpis('p12', -12, 19, 'Siłownia', 'karnet open - koniec promocji', 89, 'PLN', 'https://www.silownia-przyklad.pl/cennik', 'tak', { prognoza: 159 }),
  wpis('p13', -5, 26, 'Gazeta online', 'link wklejony z błędem', 19.9, 'PLN', 'javascript:alert(1)', ''),
  wpis('p14', null, null, 'Bez dat', 'uzupełnij datę zakupu', 10, 'PLN', '', ''),
  wpis('p15', -34, -3, 'Energia elektryczna', 'płacę przelewem', 186.4, 'PLN', 'https://www.energa.pl', 'tak', { reczna: true }),
  wpis('p16', -29, 2, 'Internet domowy', 'faktura co miesiąc', 69, 'PLN', '', 'tak', { reczna: true, prognoza: 79 }),
  wpis('p17', -26, 5, 'Czynsz', 'przelew do spółdzielni', 640, 'PLN', '', 'tak', { reczna: true, zaplacony: poMiesiacu(-26) }),
];

// Kursy zapasowe - przy renderze z internetem i tak zostaną nadpisane bieżącą tabelą NBP.
const KURSY = { USD: 3.95, EUR: 4.39, data: dzien(-1), pobrano: dzien(-1) };

function zapisz(nazwa, tresc) {
  fs.writeFileSync(path.join(FOLDER, nazwa), typeof tresc === 'string' ? tresc : JSON.stringify(tresc, null, 2));
}

function przygotujFolder() {
  fs.rmSync(FOLDER, { recursive: true, force: true });
  fs.mkdirSync(path.join(FOLDER, 'kopie'), { recursive: true });
}

if (scenariusz === 'usun') {
  fs.rmSync(FOLDER, { recursive: true, force: true });
  console.log('usunięto dane testowe');
} else {
  przygotujFolder();
  zapisz('kursy.json', KURSY);
  const dane = (motyw) => ({ wersja: 1, zapisano: new Date().toISOString(), sort: { klucz: 'termin', kierunek: 1 }, motyw, wpisy: WPISY });
  if (scenariusz === 'pelny-noc') zapisz('mikroplatnosci.json', dane('ciemny'));
  else if (scenariusz === 'pelny-dzien') zapisz('mikroplatnosci.json', dane('jasny'));
  else if (scenariusz === 'uszkodzony') zapisz('mikroplatnosci.json', '{ "wersja": 1, "wpisy": [ { "nazwa": "urwany plik');
  else if (scenariusz === 'druga-kopia') {
    zapisz('mikroplatnosci.json', dane('ciemny'));
    zapisz('otwarta.lock', { pid: 1, czas: Date.now() + 60000 });
  } else if (scenariusz !== 'pusty') throw new Error('nieznany scenariusz: ' + scenariusz);
  console.log('gotowe: ' + scenariusz);
}
