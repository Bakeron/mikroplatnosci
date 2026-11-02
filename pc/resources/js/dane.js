// Format danych wspólny dla PC i telefonu: nowy wpis i sprawdzanie danych z pliku (także z Google Dysku).

import { okresZDat, ustawPoczatekZaplaty, isoDnia, dzis, dopiszCene } from './alarmy.js';
import { WALUTY } from './waluty.js';
import { t, tekst, jezyk } from './teksty.js';

// D17: kategorie pozycji [klucz, nazwa] - nazwa po polsku, tłumaczona przy wyświetleniu (t()).
export const KATEGORIE = [
  ['rozrywka', tekst('rozrywka')], ['praca', tekst('praca')], ['ai', tekst('AI')], ['dom', tekst('dom i rachunki')],
  ['nauka', tekst('nauka')], ['zdrowie', tekst('zdrowie i sport')], ['inne', tekst('inne')],
];
export const nazwaKategorii = (klucz) => t(KATEGORIE.find(([k]) => k === klucz)?.[1] ?? '');

export function noweId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Nowy wpis = pusty wpis po sprawdzeniu (jedna lista pól - w normalizuj); subskrypcje bierze się, żeby je przedłużać.
export const nowyWpis = () => normalizuj({ id: noweId(), przedluzac: 'tak', zmieniono: new Date().toISOString() });

export const nazwaWpisu = (w) => w.nazwa.trim() || t('(bez nazwy)');

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
const lista = (v, sprawdz, max) => (Array.isArray(v) ? v.map(sprawdz).filter(Boolean).slice(-max) : []);

const MAKS_HISTORII = 240; // ok. 20 lat płatności miesięcznych
const MAKS_CEN = 100;

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
    prognoza: kwota(w.prognoza), // cena od następnej płatności, wpisywana ręcznie
    prognozaOd: data(w.prognozaOd), // dzień tej następnej płatności - wtedy cena staje się zapłaconą
    platnoscReczna: w.platnoscReczna === true, // „płacę sam” - nie pobiera się samo z konta
    zaplaconyTermin: data(w.zaplaconyTermin), // ostatni termin oznaczony jako zapłacony
    koniecMiesiaca: w.koniecMiesiaca === true, // płatność ręczna: termin w ostatnim dniu miesiąca
    zmiennaKwota: w.zmiennaKwota === true, // płatność ręczna: przy „zapłacone” pytanie, ile zapłacono
    // Zapłacone ręcznie: termin, dzień zapłaty i kwota (w walucie wpisu).
    historia: lista(w.historia, (h) => (h && data(h.termin) && data(h.dnia) && kwota(h.kwota) !== null ? { termin: h.termin, dnia: h.dnia, kwota: h.kwota } : null), MAKS_HISTORII),
    // Zmiany ceny: od kiedy obowiązuje (pusty = od początku) i kwota.
    ceny: lista(w.ceny, (c) => (c && typeof c.od === 'string' && (c.od === '' || data(c.od)) && kwota(c.kwota) !== null ? { od: c.od, kwota: c.kwota } : null), MAKS_CEN),
    osob: calkowita(w.osob, 1, 20, 1), // koszt dzielony na tyle osób - w sumach tylko moja część
    ktoOddaje: tekst(w.ktoOddaje, 200), // komu przypominać o oddaniu części („Ania, Tomek”)
    oddaneTermin: data(w.oddaneTermin), // ostatnia płatność, za którą inni już oddali
    wstrzymanaOd: data(w.wstrzymanaOd), // pauza: od kiedy
    wstrzymanaDo: data(w.wstrzymanaDo), // pauza: dzień wznowienia (pierwsza płatność po przerwie)
    kategoria: KATEGORIE.some(([k]) => k === w.kategoria) ? w.kategoria : '', // D17
    firmowa: w.firmowa === true, // D18: koszt firmowy (osobna suma, „pobierz fakturę”)
    fakturaTermin: data(w.fakturaTermin), // D18: ostatnia płatność, za którą faktura już pobrana
    anulowano: data(w.anulowano), // C15: wykreślona - w „Anulowanych” pod tabelą (do przywrócenia), poza sumami i alarmami
    zmieniono: czasIso(w.zmieniono),
  };
}

// Zmiana zapłaconej ceny zapamiętana w historii cen (od dziś) - do wykresu wydatków i zmian cen.
export const zapiszZmianeCeny = (wpis, stara) => dopiszCene(wpis, stara, isoDnia(dzis()));

// Czas zmiany albo usunięcia (ISO z toISOString) - inny tekst traktowany jak brak czasu.
export function czasIso(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v) ? v : '';
}

export function odczytajUsuniete(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((u) => u && typeof u.id === 'string' && u.id && czasIso(u.kiedy))
    .map((u) => ({ id: u.id.slice(0, 64), kiedy: u.kiedy }));
}

// Plik z Dysku z większą liczbą wpisów jest odrzucany (podmieniony albo uszkodzony - zawiesiłby aplikację).
const MAKS_WPISOW_Z_DYSKU = 5000;

// Wpisy i lista usuniętych z pliku danych (PC, telefon, Dysk) - null, gdy plik ma nieznany format.
// zDysku: czasy „z przyszłości” (zegar drugiego urządzenia do przodu albo podmieniony plik) obcinane
// do jutra - inaczej taki wpis albo usunięcie wygrywałyby przy scalaniu z każdą późniejszą zmianą.
export function odczytajDane(dane, zDysku = false) {
  if (!dane || !Array.isArray(dane.wpisy)) return null;
  if (zDysku && dane.wpisy.length > MAKS_WPISOW_Z_DYSKU) return null;
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
  if (zDysku) {
    const granica = Date.now() + 86400000;
    const jutro = new Date(granica).toISOString();
    for (const w of wpisy) if (Date.parse(w.zmieniono) > granica) w.zmieniono = jutro;
    for (const u of usuniete) if (Date.parse(u.kiedy) > granica) u.kiedy = jutro;
  }
  return { wpisy, usuniete };
}

// Treść pliku danych (PC i telefon): pusty, nieczytelny albo obcy plik = błąd - wtedy aplikacja
// niczego nie zapisuje, żeby go nie nadpisać.
export function odczytajTresc(tresc) {
  // Aplikacja nigdy nie zapisuje pustego pliku - pusty to uszkodzenie (np. zanik prądu w trakcie zapisu).
  if (!tresc.trim()) throw new Error('pusty plik danych');
  const dane = JSON.parse(tresc);
  const odczytane = odczytajDane(dane);
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
  // daty, okresu czy „przedłużać” liczy się od najbliższego terminu (jak na PC).
  const przed = `${wpis.platnoscReczna}|${wpis.od}|${wpis.okres}|${wpis.przedluzac}|${wpis.koniecMiesiaca}`;
  const staraCena = wpis.koszt;
  // Formularz bez wyboru tygodni (telefon) zostawia okres, którego nie zna (pole puste); „co ile” zostaje
  // przy tym samym okresie, a przy zmianie okresu wraca do 1.
  const okresWpisu = p.okres === 'M' || p.okres === 'R' || p.okres === 'T' ? p.okres : wpis.okres || 'M';
  const coIle = p.coIle ?? (okresWpisu === wpis.okres ? wpis.coIle : 1);
  Object.assign(wpis, {
    nazwa: p.nazwa,
    opis: p.opis,
    koszt,
    waluta: WALUTY.includes(p.waluta) ? p.waluta : 'PLN',
    od: p.od,
    okres: okresWpisu,
    coIle,
    przedluzac: p.przedluzac,
    prognoza,
    platnoscReczna: p.platnosc === 'reczna',
    koniecMiesiaca: p.platnosc === 'reczna' && p.koniecMiesiaca === true,
    link,
    zmieniono: new Date().toISOString(),
  });
  Object.assign(wpis, normalizuj(wpis));
  zapiszZmianeCeny(wpis, staraCena);
  if (przed !== `${wpis.platnoscReczna}|${wpis.od}|${wpis.okres}|${wpis.przedluzac}|${wpis.koniecMiesiaca}`) ustawPoczatekZaplaty(wpis);
  if (!wpisy.includes(wpis)) wpisy.push(wpis);
  return { wpis };
}

// Treść pliku danych w formacie wersja 2; PC dokłada w dodatkach swoje ustawienia (motyw).
export const doZapisu = (stan, dodatki = {}) => ({ wersja: 2, zapisano: new Date().toISOString(), ...dodatki, wpisy: stan.wpisy, usuniete: stan.usuniete });
