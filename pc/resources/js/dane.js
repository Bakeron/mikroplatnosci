// Format danych wspólny dla PC i telefonu: nowy wpis i sprawdzanie danych z pliku (także z Google Dysku).

import { okresZDat, ustawPoczatekZaplaty, ustawPrzedluzanie, dodajPrzerwe, isoDnia, dzis, dopiszCene, parsujDate, czyWstrzymana, ostatniaPlatnosc, dodajMiesiace, MAKS_HISTORII, MAKS_CEN, MAKS_PRZERW } from './alarmy.js';
import { WALUTY } from './waluty.js';
import { t, tekst, jezyk } from './teksty.js';

// D17: kategorie pozycji [klucz, nazwa] - nazwa po polsku, tłumaczona przy wyświetleniu (t()).
export const KATEGORIE = [
  ['rozrywka', tekst('rozrywka')], ['praca', tekst('praca')], ['ai', tekst('AI')], ['dom', tekst('dom i rachunki')],
  ['nauka', tekst('nauka')], ['zdrowie', tekst('zdrowie i sport')], ['inne', tekst('inne')],
];
export const nazwaKategorii = (klucz) => t(KATEGORIE.find(([k]) => k === klucz)?.[1] ?? '');

// A1: gotowe okresy [okres, co ile, napis] - napis po polsku, tłumaczony przy wyświetleniu (t()).
export const OKRESY = [['T', 1, tekst('tydzień')], ['T', 4, tekst('4 tygodnie')], ['M', 1, tekst('miesiąc')], ['M', 3, tekst('kwartał')], ['M', 6, tekst('pół roku')], ['R', 1, tekst('rok')], ['R', 2, tekst('2 lata')]];

export function noweId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Nowy wpis = pusty wpis po sprawdzeniu (jedna lista pól - w normalizuj); subskrypcje bierze się, żeby je przedłużać.
export const nowyWpis = () => normalizuj({ id: noweId(), przedluzac: 'tak', zmieniono: new Date().toISOString() });

export const nazwaWpisu = (w) => w.nazwa.trim() || t('(bez nazwy)');

// F25: przykładowy wpis z pierwszego uruchomienia. opis - inny na PC i na telefonie.
const PRZYKLAD = 'przyklad-';
export function dodajPrzyklad(wpisy, opis) {
  const zakup = dodajMiesiace(dzis(), -1);
  zakup.setDate(zakup.getDate() + 9); // płatność za 9 dni - lont już trochę wypalony
  wpisy.push(normalizuj({
    id: PRZYKLAD + noweId(),
    nazwa: t('Przykład: serwis muzyczny'),
    opis,
    koszt: 23.99,
    od: isoDnia(zakup),
    okres: 'M',
    przedluzac: 'tak',
    zmieniono: new Date().toISOString(),
  }));
}

// Pusty, niewypełniony wpis i przykład (F25) wykreślają się od razu, bez pytania i bez „Anulowanych” - nie ma czego tracić.
export const nicDoStracenia = (w) => w.id.startsWith(PRZYKLAD)
  || (!w.nazwa.trim() && !w.opis.trim() && !w.link.trim() && !w.od && w.przedluzac !== 'nie' && w.koszt === null && w.prognoza === null);

// Zwraca bezpieczny adres http(s) albo null. „example.com” → „https://example.com/”.
export function bezpiecznyLink(tekst) {
  let s = (tekst || '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    if (!s.includes('.') || /\s/.test(s)) return null;
    s = 'https://' + s;
  }
  try {
    const url = new URL(s);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

// Wartość do pola edycji - bez separatora tysięcy (parsujKoszt); przecinek tylko po polsku.
export function formatujKoszt(koszt) {
  if (typeof koszt !== 'number') return '';
  return jezyk() === 'pl' ? koszt.toFixed(2).replace('.', ',') : koszt.toFixed(2);
}

// null = puste pole, undefined = błędna wartość.
export function parsujKoszt(tekst) {
  let s = String(tekst).replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+,\d*$/.test(s)) s = s.replace(/\./g, ''); // „1.234,56” - kropki jako separator tysięcy
  s = s.replace(',', '.');
  if (!s) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  return Math.round(parseFloat(s) * 100) / 100;
}

// Wpis bez id (ręczna edycja pliku) dostaje id z treści - przy każdym odczycie to samo,
// więc pobranie z Google Dysku nie dopisuje go za każdym razem jako nowego (skrót FNV-1a).
function idZTresci(w) {
  let h = 0x811c9dc5;
  for (const znak of JSON.stringify([w.nazwa, w.opis, w.od, w.do, w.koszt, w.link])) {
    h = Math.imul(h ^ znak.charCodeAt(0), 0x01000193) >>> 0;
  }
  return 'bez-id-' + h.toString(36);
}

// Dane z pliku traktowane jak dane z zewnątrz - każde pole sprawdzane.
// okres przychodzi już ze sprawdzonych dat (RRRR-MM-DD albo pusty tekst).
function okresZDatWpisu(od, doDnia) {
  const okres = okresZDat(od, doDnia);
  return okres === 'inny' ? '' : okres || 'M';
}

// Liczba całkowita z zakresu albo wartość domyślna (np. „co ile” okresów, na ile osób).
const calkowita = (v, min, max, domyslna) => (Number.isInteger(v) && v >= min && v <= max ? v : domyslna);

// Lista z pliku: tylko poprawne pozycje, najwyżej max ostatnich.
// Waluta przy wpłacie i cenie z historii tylko, gdy zapisana (brak = waluta wpisu).
const innaWaluta = (h) => (WALUTY.includes(h.waluta) ? { waluta: h.waluta } : {});
const lista = (v, sprawdz, max) => (Array.isArray(v) ? v.map(sprawdz).filter(Boolean).slice(-max) : []);


export function normalizuj(w) {
  const tekst = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const data = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const kwota = (v) => (Number.isFinite(v) && v >= 0 ? v : null);
  return {
    id: typeof w.id === 'string' && w.id ? w.id.slice(0, 64) : idZTresci(w),
    od: data(w.od),
    do: data(w.do),
    // Stare wpisy: okres z różnicy dat „od” i „do”, a gdy jest tylko jedna z nich - miesięczny;
    // odstęp ani miesięczny, ani roczny (np. kwartał) - bez okresu, do wybrania przez użytkownika.
    // T - tygodnie (co tydzień, co 4 tygodnie).
    okres: w.okres === 'M' || w.okres === 'R' || w.okres === 'T' ? w.okres : okresZDatWpisu(data(w.od), data(w.do)),
    coIle: calkowita(w.coIle, 1, 99, 1), // co ile okresów: M + 3 = kwartał, R + 2 = co 2 lata
    nazwa: tekst(w.nazwa, 200),
    opis: tekst(w.opis, 300),
    koszt: kwota(w.koszt),
    waluta: WALUTY.includes(w.waluta) ? w.waluta : 'PLN',
    link: tekst(w.link, 2000),
    przedluzac: w.przedluzac === 'tak' || w.przedluzac === 'nie' ? w.przedluzac : '',
    ostatniTermin: data(w.ostatniTermin), // „Przedłużać: nie”: dzień, w którym już się nie odnowi (data zakupu zostaje)
    prognoza: kwota(w.prognoza), // cena od następnej płatności, wpisywana ręcznie
    walutaNastepna: WALUTY.includes(w.walutaNastepna) ? w.walutaNastepna : '', // jej waluta; puste = jak koszt
    prognozaOd: data(w.prognozaOd), // dzień tej następnej płatności - wtedy cena staje się zapłaconą
    platnoscReczna: w.platnoscReczna === true, // „płacę sam” - nie pobiera się samo z konta
    zaplaconyTermin: data(w.zaplaconyTermin), // ostatni termin oznaczony jako zapłacony
    koniecMiesiaca: w.koniecMiesiaca === true, // płatność ręczna: termin w ostatnim dniu miesiąca
    zmiennaKwota: w.zmiennaKwota === true, // płatność ręczna: przy „zapłacone” pytanie, ile zapłacono
    // Zapłacone ręcznie: termin, dzień zapłaty i kwota (w walucie wpisu; inna waluta - pole waluta,
    // np. sprzed ceny następnej w innej walucie).
    historia: lista(w.historia, (h) => (h && data(h.termin) && data(h.dnia) && kwota(h.kwota) !== null ? { termin: h.termin, dnia: h.dnia, kwota: h.kwota, ...innaWaluta(h) } : null), MAKS_HISTORII),
    // Zmiany ceny: od kiedy obowiązuje (pusty = od początku) i kwota (waluta jak wyżej).
    ceny: lista(w.ceny, (c) => (c && typeof c.od === 'string' && (c.od === '' || data(c.od)) && kwota(c.kwota) !== null ? { od: c.od, kwota: c.kwota, ...innaWaluta(c) } : null), MAKS_CEN),
    osob: calkowita(w.osob, 1, 20, 1), // koszt dzielony na tyle osób - w sumach tylko moja część
    ktoOddaje: tekst(w.ktoOddaje, 200), // komu przypominać o oddaniu części („Ania, Tomek”)
    oddaneTermin: data(w.oddaneTermin), // ostatnia płatność, za którą inni już oddali
    wstrzymanaOd: data(w.wstrzymanaOd), // pauza: od kiedy
    wstrzymanaDo: data(w.wstrzymanaDo), // pauza: dzień wznowienia (pierwsza płatność po przerwie)
    // Zakończone przerwy w płatnościach (poprzednie pauzy, czas po „nie” przed powrotem na „tak”) - do historii i terminów.
    przerwy: lista(w.przerwy, (p) => (p && data(p.do) ? { od: data(p.od), do: p.do } : null), MAKS_PRZERW),
    kategoria: KATEGORIE.some(([k]) => k === w.kategoria) ? w.kategoria : '', // D17
    firmowa: w.firmowa === true, // D18: koszt firmowy (osobna suma, „pobierz fakturę”)
    fakturaTermin: data(w.fakturaTermin), // D18: ostatnia płatność, za którą faktura już pobrana
    anulowano: data(w.anulowano), // C15: wykreślona - w „Anulowanych” pod tabelą (do przywrócenia), poza sumami i alarmami
    zmieniono: czasIso(w.zmieniono),
  };
}

// Zmiana zapłaconej ceny zapamiętana w historii cen (od dziś) - do wykresu wydatków i zmian cen.
export const zapiszZmianeCeny = (wpis, stara) => dopiszCene(wpis, stara, isoDnia(dzis()));

// A5: pauza do dnia wznowienia (RRRR-MM-DD, tylko dzień z przyszłości - inaczej false). Nowa pauza po zakończonej
// poprzedniej: poprzednia trafia do przerw (data zakupu i historia zostają, terminy dalej od jej wznowienia).
// Pauza przesuwa termin - dzień ceny następnej liczy się od nowa.
export function ustawPauze(wpis, dzien) {
  const wznowienie = parsujDate(dzien);
  if (!wznowienie || wznowienie <= dzis()) return false;
  if (!czyWstrzymana(wpis)) {
    if (wpis.wstrzymanaDo && wpis.wstrzymanaDo > wpis.od && parsujDate(wpis.wstrzymanaDo) <= dzis()) dodajPrzerwe(wpis, wpis.wstrzymanaOd, wpis.wstrzymanaDo);
    wpis.wstrzymanaOd = isoDnia(dzis());
  }
  wpis.wstrzymanaDo = dzien;
  wpis.prognozaOd = '';
  return true;
}

// Wznowienie dziś = dziś pierwsza płatność po przerwie.
export function wznowDzis(wpis) {
  wpis.wstrzymanaDo = isoDnia(dzis());
  wpis.prognozaOd = '';
}

// Bez pauzy - terminy jak przed nią (od daty zakupu albo od wznowienia po poprzedniej pauzie).
export function usunPauze(wpis) {
  wpis.wstrzymanaOd = '';
  wpis.wstrzymanaDo = '';
  wpis.prognozaOd = '';
}

// A4: włączenie podziału albo przypomnień nie przypomina o płatnościach sprzed tej chwili; to samo przy „☐ oddane”.
export function bezZaleglegoOdbioru(wpis) {
  const ostatnia = ostatniaPlatnosc(wpis);
  if (ostatnia) wpis.oddaneTermin = isoDnia(ostatnia);
}

// Czas zmiany albo usunięcia (ISO z toISOString) - inny tekst traktowany jak brak czasu.
export function czasIso(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v) ? v : '';
}

export function odczytajUsuniete(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((u) => u && typeof u.id === 'string' && u.id && czasIso(u.kiedy))
    .map((u) => ({ id: u.id.slice(0, 64), kiedy: u.kiedy }));
}

// Plik z Dysku albo kopia z większą liczbą wpisów jest odrzucana (podmieniona albo uszkodzona - zawiesiłaby aplikację).
export const MAKS_WPISOW_Z_DYSKU = 5000;

// Czas zmiany wpisu: „teraz”, ale nie wcześniej niż poprzednia zmiana (zegar mógł być kiedyś do przodu) -
// inaczej ta edycja przegrałaby przy scalaniu z Dyskiem i znikła po cichu (jak czas usunięcia w usun()).
export const czasZmiany = (wpis) => new Date(Math.max(Date.now(), (Date.parse(wpis?.zmieniono) || 0) + 1)).toISOString();

// Wpisy i lista usuniętych z pliku danych (PC, telefon, Dysk) - null, gdy plik ma nieznany format.
// Czasy „z przyszłości” (zegar urządzenia był do przodu albo podmieniony plik) obcinane do jutra - inaczej
// taki wpis albo usunięcie wygrywałyby przy scalaniu z każdą późniejszą zmianą. zDysku (i import kopii) -
// limit liczby wpisów.
export function odczytajDane(dane, zDysku = false, maks = zDysku ? MAKS_WPISOW_Z_DYSKU : Infinity) {
  if (!dane || !Array.isArray(dane.wpisy)) return null;
  if (dane.wpisy.length > maks) return null;
  const wpisy = dane.wpisy.filter((w) => w && typeof w === 'object').map(normalizuj);
  // Powtórzone id (np. dwa identyczne wpisy bez id) dostają numer - usuwanie i scalanie idą po id.
  // Numer dobierany, aż id jest wolne (np. „a”, „a”, „a-1” → „a”, „a-1”, „a-1-1”).
  const uzyte = new Set();
  for (const w of wpisy) {
    let id = w.id;
    for (let n = 1; uzyte.has(id); n++) id = `${w.id.slice(0, 60)}-${n}`;
    w.id = id;
    uzyte.add(id);
  }
  const usuniete = odczytajUsuniete(dane.usuniete);
  const granica = Date.now() + 86400000;
  const jutro = new Date(granica).toISOString();
  for (const w of wpisy) if (Date.parse(w.zmieniono) > granica) w.zmieniono = jutro;
  for (const u of usuniete) if (Date.parse(u.kiedy) > granica) u.kiedy = jutro;
  // Czas ostatniego ręcznego ułożenia (przesunięcia pozycji) - przy scalaniu wygrywa nowsza kolejność.
  let ulozono = czasIso(dane.ulozono);
  if (Date.parse(ulozono) > granica) ulozono = jutro;
  return { wpisy, usuniete, ulozono };
}

// Treść pliku danych (PC i telefon): pusty, nieczytelny albo obcy plik = błąd - wtedy aplikacja
// niczego nie zapisuje, żeby go nie nadpisać.
// maks - limit liczby wpisów (import kopii); plik danych przy starcie bez limitu.
export function odczytajTresc(tresc, maks = Infinity) {
  // Aplikacja nigdy nie zapisuje pustego pliku - pusty to uszkodzenie (np. zanik prądu w trakcie zapisu).
  if (!tresc.trim()) throw new Error('pusty plik danych');
  const dane = JSON.parse(tresc.replace(/^﻿/, '')); // BOM from Notepad (hand-edited file)
  const odczytane = odczytajDane(dane, false, maks);
  if (!odczytane) throw new Error('nieprawidłowy format pliku');
  return { ...odczytane, motyw: dane.motyw };
}

// Usunięcie wpisu (po id - scalanie z Dyskiem mogło w międzyczasie podmienić obiekt wpisu)
// i zapamiętanie go, żeby scalanie z Dyskiem go nie przywróciło.
export function usun(stan, wpis) {
  stan.wpisy = stan.wpisy.filter((w) => w.id !== wpis.id);
  // Czas usunięcia nie wcześniejszy niż ostatnia zmiana (zegar urządzenia mógł być do przodu) -
  // inaczej scalanie przywróciłoby wpis.
  const kiedy = Math.max(Date.now(), (Date.parse(wpis.zmieniono) || 0) + 1);
  stan.usuniete.push({ id: wpis.id, kiedy: new Date(kiedy).toISOString() });
}

// E23: dane z kopii zastępują obecne. Pozycje, których w kopii nie ma, są usuwane jak zwykle (zapamiętane
// dla scalania z Dyskiem), a wczytane dostają czas zmiany „teraz” - wygrywają na Dysku.
export function zastapZKopii(stan, dane, teraz = new Date().toISOString()) {
  const wKopii = new Set(dane.wpisy.map((w) => w.id));
  for (const w of [...stan.wpisy]) if (!wKopii.has(w.id)) usun(stan, w);
  stan.usuniete = stan.usuniete.filter((u) => !wKopii.has(u.id));
  for (const w of dane.wpisy) w.zmieniono = teraz;
  stan.wpisy = dane.wpisy;
  stan.ulozono = teraz; // kolejność z kopii wygrywa na Dysku
}

// Ręczne przesunięcie pozycji (PC i telefon): czas ułożenia „teraz”, ale nie wcześniej niż poprzedni
// (zegar mógł być kiedyś do przodu) - przy scalaniu z Dyskiem wygrywa nowsza kolejność.
export function oznaczUlozenie(stan) {
  stan.ulozono = new Date(Math.max(Date.now(), (Date.parse(stan.ulozono) || 0) + 1)).toISOString();
}

// Przesunięcie pozycji o jedno miejsce w górę (-1) albo w dół (1) wśród widocznych (filtr, anulowane
// przeskakiwane - jak strzałki na PC). Zwraca false, gdy nie ma dokąd.
export function przesunWpis(stan, widoczne, wpis, kierunek) {
  const i = widoczne.indexOf(wpis);
  const j = i + kierunek;
  if (i < 0 || j < 0 || j >= widoczne.length) return false;
  const sasiad = widoczne[j];
  stan.wpisy.splice(stan.wpisy.indexOf(wpis), 1);
  stan.wpisy.splice(stan.wpisy.indexOf(sasiad) + (kierunek > 0 ? 1 : 0), 0, wpis);
  oznaczUlozenie(stan);
  return true;
}

// Formularz edycji (telefon): wartości pól (tekst) do wpisu. W trakcie edycji mogły przyjść zmiany
// z Dysku - wpis szukany po id w bieżącej liście, a nie stary obiekt. Nowy wpis trafia na koniec listy.
// Zwraca { wpis } albo { blad } (zła kwota - nic się nie zmienia).
export function zastosujFormularz(wpisy, edytowany, p) {
  const koszt = parsujKoszt(p.koszt);
  const prognoza = parsujKoszt(p.prognoza);
  if (koszt === undefined || prognoza === undefined) return { blad: t('Kwota musi być liczbą, np. 12,50') };
  const wpis = edytowany ? (wpisy.find((w) => w.id === edytowany.id) ?? edytowany) : nowyWpis();
  const link = String(p.link ?? '').trim();
  // Płatność ręczna liczy zaległości od ostatniego zapłaconego terminu - po jej włączeniu albo zmianie
  // daty albo okresu liczy się od najbliższego terminu (jak na PC); „przedłużać” - ustawPrzedluzanie.
  const stan = () => `${wpis.platnoscReczna}|${wpis.od}|${wpis.okres}|${wpis.coIle}|${wpis.koniecMiesiaca}`;
  const przed = stan();
  const bylaReczna = wpis.platnoscReczna;
  const staraCena = wpis.koszt;
  const bezPodzialu = !(wpis.osob > 1);
  const bezOddajacych = !wpis.ktoOddaje.trim();
  // Formularz bez wyboru tygodni (telefon) zostawia okres, którego nie zna (pole puste); „co ile” zostaje
  // przy tym samym okresie, a przy zmianie okresu wraca do 1.
  // Stary wpis bez okresu (np. kwartał z dawnych dat „od” i „do”) zostaje bez okresu - nie miesięczny.
  const okresWpisu = p.okres === 'M' || p.okres === 'R' || p.okres === 'T' ? p.okres : wpis.okres;
  const coIle = p.coIle ?? (okresWpisu === wpis.okres ? wpis.coIle : 1);
  // Pola, których formularz nie podaje albo podaje źle (np. liczba osób spoza zakresu), zostają jak były.
  const osob = Number.isInteger(p.osob) && p.osob >= 1 && p.osob <= 20 ? p.osob : wpis.osob;
  // Pole bez waluty wpisu (telefon ma krótszą listę) zostawia jego walutę - kwota się nie zmienia.
  const walutaWpisu = WALUTY.includes(p.waluta) ? p.waluta : WALUTY.includes(wpis.waluta) ? wpis.waluta : 'PLN';
  Object.assign(wpis, {
    nazwa: p.nazwa,
    opis: p.opis,
    koszt,
    waluta: walutaWpisu,
    // Waluta ceny następnej: ta sama co koszt = puste (jak dotąd); pola brak - bez zmian.
    walutaNastepna: p.walutaNastepna === undefined ? wpis.walutaNastepna : WALUTY.includes(p.walutaNastepna) && p.walutaNastepna !== walutaWpisu ? p.walutaNastepna : '',
    od: p.od,
    okres: okresWpisu,
    coIle,
    prognoza,
    platnoscReczna: p.platnosc === 'reczna',
    koniecMiesiaca: p.platnosc === 'reczna' && p.koniecMiesiaca === true,
    zmiennaKwota: p.zmiennaKwota ?? wpis.zmiennaKwota,
    osob,
    ktoOddaje: p.ktoOddaje ?? wpis.ktoOddaje,
    kategoria: p.kategoria ?? wpis.kategoria,
    firmowa: p.firmowa ?? wpis.firmowa,
    link,
    zmieniono: czasZmiany(wpis),
  });
  Object.assign(wpis, normalizuj(wpis));
  if (prognoza === null) wpis.prognozaOd = ''; // wyczyszczona cena następna - dzień liczy się od nowa (jak na PC)
  zapiszZmianeCeny(wpis, staraCena);
  if (przed !== stan()) ustawPoczatekZaplaty(wpis, !bylaReczna && wpis.platnoscReczna);
  ustawPrzedluzanie(wpis, p.przedluzac);
  if ((bezPodzialu && wpis.osob > 1) || (bezOddajacych && wpis.ktoOddaje.trim())) bezZaleglegoOdbioru(wpis);
  // Pauza: undefined - bez zmian, pusty tekst - bez pauzy, dziś - wznowienie, dzień z przyszłości - pauza do tego dnia.
  if (p.wstrzymanaDo === '') usunPauze(wpis);
  else if (p.wstrzymanaDo === isoDnia(dzis()) && czyWstrzymana(wpis)) wznowDzis(wpis);
  // Przy „Przedłużać: nie” pole pauzy jest schowane - data wpisana przed wyłączeniem nie ustawia pauzy
  // (wróciłaby po cichu po ponownym włączeniu przedłużania).
  else if (p.wstrzymanaDo && wpis.przedluzac !== 'nie') ustawPauze(wpis, p.wstrzymanaDo);
  if (!wpisy.includes(wpis)) wpisy.push(wpis);
  return { wpis };
}

// Treść pliku danych w formacie wersja 4 (08.11.2026 wersja 3: ostatniTermin i przerwy; 10.11.2026 wersja 4:
// walutaNastepna i waluta przy wpłatach i cenach - starsza wersja aplikacji zgubiłaby je, więc nie bierze
// takich danych z Dysku ani z kopii); PC dokłada w dodatkach swoje ustawienia (motyw).
export const WERSJA_DANYCH = 4;
export const doZapisu = (stan, dodatki = {}) => ({ wersja: WERSJA_DANYCH, zapisano: new Date().toISOString(), ...dodatki, ...(stan.ulozono ? { ulozono: stan.ulozono } : {}), wpisy: stan.wpisy, usuniete: stan.usuniete });
