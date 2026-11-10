// Dane do obrazków poglądowych - daty liczone od dnia renderowania.
// Użycie: PODGLAD_DANE=<folder testowy> node przygotuj.mjs <scenariusz>
//   pelny-noc | pelny-dzien | bez-internetu | angielski | bez-funkcji | bez-zapisu | pusty | uszkodzony | druga-kopia | usun
// Pracuje WYŁĄCZNIE w folderze testowym - prawdziwych danych z %APPDATA%\Mikroplatnosci nigdy nie rusza.

import fs from 'node:fs';
import path from 'node:path';

const BAZA = process.env.PODGLAD_DANE;
// Prawdziwa ścieżka (krótka nazwa ROAMIN~1 albo dowiązanie nie ominą sprawdzenia).
const prawdziwa = (p) => {
  try {
    return fs.realpathSync.native(p).toLowerCase();
  } catch {
    return path.resolve(p).toLowerCase();
  }
};
const APPDATA = process.env.APPDATA ? prawdziwa(process.env.APPDATA) : null;
const wAppdata = (p) => APPDATA && (p === APPDATA || p.startsWith(APPDATA + path.sep));
if (!BAZA || /roaming/i.test(BAZA) || /roaming/i.test(prawdziwa(BAZA)) || wAppdata(prawdziwa(BAZA))) throw new Error('Ustaw PODGLAD_DANE na folder testowy (poza %APPDATA%) - prawdziwych danych nie ruszamy.');
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
// { zaplacony } - termin oznaczony „✓ zapłacone”, a do tego dowolne inne pola wpisu (kategoria, firmowa,
// osob, ktoOddaje, okres, coIle, wstrzymanaOd/Do, anulowano, zmiennaKwota, historia, ceny).
function wpis(id, od, doDnia, nazwa, opis, koszt, waluta, link, przedluzac, dodatki = {}) {
  const { prognoza, reczna, zaplacony, ...reszta } = dodatki;
  return {
    id, od: od === null ? '' : dzien(od), do: doDnia === null ? '' : dzien(doDnia), nazwa, opis, koszt, waluta, link, przedluzac,
    prognoza: prognoza ?? null, platnoscReczna: reczna ?? false, zaplaconyTermin: zaplacony ?? '', ...reszta,
  };
}

// Różnorodne wiersze: miesięczne, roczne, tydzień, kwartał, jednorazowe (aktywne i zakończona),
// przesunięty termin, waluty, cena od następnej płatności (drożej / bez zmian / promocja),
// płatność ręczna (po terminie, za 2 dni, zapłacona, kwota za każdym razem inna), koszt dzielony na osoby,
// pauza, na firmę, kategorie, historia cen, brak dat, niebezpieczny link, dwie anulowane.
const WPISY = [
  wpis('p01', -19, 12, 'Netflix', 'plan Standard', 43, 'PLN', 'https://www.netflix.com/pl/', 'tak', { prognoza: 49, kategoria: 'rozrywka', ceny: [{ od: '', kwota: 37 }, { od: dzien(-200), kwota: 43 }] }),
  wpis('p02', -85, -54, 'Spotify', 'Premium Family - 4 osoby', 37.99, 'PLN', 'https://www.spotify.com/pl/premium/', 'tak', { kategoria: 'rozrywka', osob: 4, ktoOddaje: 'Ania, Tomek, Ola' }),
  wpis('p03', -17, 14, 'ChatGPT Plus', 'subskrypcja AI', 20, 'USD', 'https://chat.openai.com', 'tak', { prognoza: 20, kategoria: 'ai', firmowa: true }),
  wpis('p04', -28, 3, 'Próbny AI', 'anulować przed końcem testu!', 9.99, 'USD', 'https://example.com/konto', 'nie', { kategoria: 'ai' }),
  wpis('p05', -292, 73, 'Chmura 2 TB', 'promocja na pierwszy rok', 399, 'PLN', '', 'nie', { kategoria: 'praca' }),
  wpis('p06', -58, -28, 'Stara próbna', 'test edytora wideo', 15, 'PLN', '', 'nie', { kategoria: 'praca' }),
  wpis('p07', -318, 47, 'Domena .com', 'rejestrator zagraniczny', 12.99, 'EUR', 'https://www.namecheap.com', 'tak', { kategoria: 'praca', firmowa: true }),
  wpis('p08', -343, 22, 'Antywirus', 'licencja na 3 urządzenia', 149, 'PLN', 'https://www.eset.com/pl/', 'tak', { kategoria: 'dom' }),
  wpis('p09', -242, 123, 'Hosting VPS', 'serwer dla bloga', 300, 'PLN', 'hosting.pl', 'tak', { kategoria: 'praca', firmowa: true }),
  wpis('p10', -340, 25, 'Pakiet graficzny', 'licencja roczna', 120, 'PLN', 'https://example.com/licencja', 'tak', { kategoria: 'praca', firmowa: true }),
  wpis('p11', -23, 7, 'YouTube Premium', 'okres próbny', 25.99, 'PLN', 'https://www.youtube.com/premium', 'nie', { kategoria: 'rozrywka' }),
  wpis('p12', -12, 19, 'Siłownia', 'karnet open - koniec promocji', 89, 'PLN', 'https://www.silownia-przyklad.pl/cennik', 'tak', { prognoza: 159, kategoria: 'zdrowie' }),
  wpis('p13', -5, 26, 'Gazeta online', 'link wklejony z błędem', 19.9, 'PLN', 'javascript:alert(1)', '', { kategoria: 'nauka' }),
  wpis('p14', null, null, 'Bez dat', 'uzupełnij datę zakupu', 10, 'PLN', '', ''),
  wpis('p15', -34, -3, 'Energia elektryczna', 'płacę przelewem, kwota co miesiąc inna', 186.4, 'PLN', 'https://www.energa.pl', 'tak', { reczna: true, zmiennaKwota: true, kategoria: 'dom' }),
  wpis('p16', -29, 2, 'Internet domowy', 'faktura co miesiąc', 69, 'PLN', '', 'tak', { reczna: true, prognoza: 79, kategoria: 'dom' }),
  wpis('p17', -26, 5, 'Czynsz', 'przelew do spółdzielni', 640, 'PLN', '', 'tak', { reczna: true, zaplacony: poMiesiacu(-26), kategoria: 'dom' }),
  wpis('p18', -3, 4, 'Lekcje gitary', 'co tydzień, płatne z góry', 60, 'PLN', '', 'tak', { okres: 'T', coIle: 1, kategoria: 'nauka' }),
  wpis('p19', -61, 31, 'Ubezpieczenie auta', 'rata co kwartał', 210, 'PLN', '', 'tak', { okres: 'M', coIle: 3, kategoria: 'dom' }),
  wpis('p20', -70, null, 'Basen', 'karnet - przerwa wakacyjna', 120, 'PLN', '', 'tak', { kategoria: 'zdrowie', wstrzymanaOd: dzien(-10), wstrzymanaDo: dzien(40) }),
  wpis('p21', -150, -120, 'Disney+', 'anulowany po serialu', 37.99, 'PLN', 'https://www.disneyplus.com', 'tak', { kategoria: 'rozrywka', anulowano: dzien(-14) }),
  wpis('p22', -200, -170, 'Audiobooki', 'za mało czasu na słuchanie', 39.9, 'PLN', '', 'tak', { kategoria: 'nauka', anulowano: dzien(-40) }),
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

// Ustawienia urządzenia (ustawienia.json): wszystkie funkcje włączone, prowizja banku, budżet i powiadomienia.
const WSZYSTKIE = ['platnosc', 'weekend', 'kwotaZmienna', 'okresy', 'nastepna', 'dzielenie', 'pauza', 'waluty', 'historia', 'archiwum', 'kategorie', 'firma'];
const ustawienia = (motyw, inne = {}) => ({
  lokalnie: true, motyw, prowizja: 2, budzet: 1200, jezyk: 'pl',
  funkcje: Object.fromEntries(WSZYSTKIE.map((k) => [k, true])),
  powiadomienia: { wycofaj: true, zaplac: true, drogie: true, podwyzka: true, progDrogich: 100 },
  ...inne,
});

// Wyciąg w układzie jak z mBanku: kilka linijek o rachunku, potem tabela (płatności co miesiąc u tych samych odbiorców).
function wyciag() {
  const linie = ['mBank S.A. Bankowość Detaliczna;', 'Lista operacji;', '#Za okres:;' + dzien(-120) + ';' + dzien(-1) + ';', '', '#Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;'];
  const co = (nazwa, kwota, start, krok, ile) => {
    for (let i = 0; i < ile; i++) linie.push(`${dzien(start - i * krok)};"ZAKUP PRZY UŻYCIU KARTY ${nazwa}";"eKonto 1234";"Rozrywka";"-${kwota.toFixed(2).replace('.', ',')} PLN";`);
  };
  co('NETFLIX.COM', 43, -19, 30, 4);
  co('DISNEYPLUS', 37.99, -125, 30, 3);
  co('HBO MAX', 29.99, -8, 30, 4);
  co('DUOLINGO', 54.99, -15, 30, 4);
  co('TIDAL MUSIC', 26.99, -95, 30, 3);
  co('APPLE.COM/BILL ICLOUD', 12.99, -4, 30, 4);
  for (let i = 0; i < 4; i++) linie.push(`${dzien(-6 - i * 30)};"PRZELEW ZEWNĘTRZNY PGNIG OBRÓT";"eKonto 1234";"Rachunki";"-${(118.4 + i * 9.35).toFixed(2).replace('.', ',')} PLN";`);
  linie.push(`${dzien(-12)};"ZAKUP PRZY UŻYCIU KARTY BIEDRONKA";"eKonto 1234";"Jedzenie";"-87,12 PLN";`);
  linie.push(`${dzien(-33)};"ZAKUP PRZY UŻYCIU KARTY ORLEN";"eKonto 1234";"Paliwo";"-240,00 PLN";`);
  fs.writeFileSync(path.join(BAZA, 'wyciag-mbank.csv'), linie.join('\r\n'));
}

if (scenariusz === 'usun') {
  fs.rmSync(FOLDER, { recursive: true, force: true });
  fs.rmSync(path.join(BAZA, 'wyciag-mbank.csv'), { force: true });
  console.log('usunięto dane testowe');
} else {
  przygotujFolder();
  zapisz('kursy.json', KURSY);
  const dane = (motyw) => ({ wersja: 3, zapisano: new Date().toISOString(), sort: { klucz: 'termin', kierunek: 1 }, motyw, wpisy: WPISY, usuniete: [] });
  if (scenariusz === 'pelny-noc' || scenariusz === 'bez-internetu') {
    zapisz('mikroplatnosci.json', dane('ciemny'));
    zapisz('ustawienia.json', ustawienia('ciemny'));
    wyciag();
  } else if (scenariusz === 'pelny-dzien') {
    zapisz('mikroplatnosci.json', dane('jasny'));
    zapisz('ustawienia.json', ustawienia('jasny'));
  } else if (scenariusz === 'angielski') {
    zapisz('mikroplatnosci.json', dane('jasny'));
    zapisz('ustawienia.json', ustawienia('jasny', { jezyk: 'en' }));
  } else if (scenariusz === 'bez-funkcji') {
    // Wszystkie funkcje do wyłączania wyłączone - najprostszy zeszyt.
    zapisz('mikroplatnosci.json', dane('jasny'));
    zapisz('ustawienia.json', ustawienia('jasny', { funkcje: Object.fromEntries(WSZYSTKIE.map((k) => [k, false])), budzet: 0, prowizja: 0 }));
  } else if (scenariusz === 'bez-zapisu') {
    zapisz('ustawienia.json', ustawienia('ciemny', { lokalnie: false }));
  } else if (scenariusz === 'uszkodzony') {
    zapisz('mikroplatnosci.json', '{ "wersja": 3, "wpisy": [ { "nazwa": "urwany plik');
    zapisz('ustawienia.json', ustawienia('ciemny'));
  } else if (scenariusz === 'druga-kopia') {
    zapisz('mikroplatnosci.json', dane('ciemny'));
    zapisz('ustawienia.json', ustawienia('ciemny'));
    zapisz('otwarta.lock', { pid: 1, czas: Date.now() + 60000 });
  } else if (scenariusz !== 'pusty') throw new Error('nieznany scenariusz: ' + scenariusz);
  console.log('gotowe: ' + scenariusz);
}
