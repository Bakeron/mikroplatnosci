// Format danych wspólny dla PC i telefonu: nowy wpis i sprawdzanie danych z pliku (także z Google Dysku).

import { okresZDat, ustawPoczatekZaplaty } from './alarmy.js';
import { WALUTY } from './waluty.js';

export function noweId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Nowy wpis = pusty wpis po sprawdzeniu (jedna lista pól - w normalizuj); subskrypcje bierze się, żeby je przedłużać.
export const nowyWpis = () => normalizuj({ id: noweId(), przedluzac: 'tak', zmieniono: new Date().toISOString() });

export const nazwaWpisu = (w) => w.nazwa.trim() || '(bez nazwy)';

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

export function formatujKoszt(koszt) {
  return typeof koszt === 'number' ? koszt.toFixed(2).replace('.', ',') : '';
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
    okres: w.okres === 'M' || w.okres === 'R' ? w.okres : okresZDatWpisu(data(w.od), data(w.do)),
    nazwa: tekst(w.nazwa, 200),
    opis: tekst(w.opis, 300),
    koszt: kwota(w.koszt),
    waluta: WALUTY.includes(w.waluta) ? w.waluta : 'PLN',
    link: tekst(w.link, 2000),
    przedluzac: w.przedluzac === 'tak' || w.przedluzac === 'nie' ? w.przedluzac : '',
    prognoza: kwota(w.prognoza), // cena od następnej płatności, wpisywana ręcznie
    platnoscReczna: w.platnoscReczna === true, // „płacę sam” - nie pobiera się samo z konta
    zaplaconyTermin: data(w.zaplaconyTermin), // ostatni termin oznaczony jako zapłacony
    koniecMiesiaca: w.koniecMiesiaca === true, // płatność ręczna: termin w ostatnim dniu miesiąca
    zmieniono: czasIso(w.zmieniono),
  };
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
  if (koszt === undefined || prognoza === undefined) return { blad: 'Kwota musi być liczbą, np. 12,50' };
  const wpis = edytowany ? (wpisy.find((w) => w.id === edytowany.id) ?? edytowany) : nowyWpis();
  const link = String(p.link ?? '').trim();
  // Płatność ręczna liczy zaległości od ostatniego zapłaconego terminu - po jej włączeniu albo zmianie
  // daty, okresu czy „przedłużać” liczy się od najbliższego terminu (jak na PC).
  const przed = `${wpis.platnoscReczna}|${wpis.od}|${wpis.okres}|${wpis.przedluzac}|${wpis.koniecMiesiaca}`;
  Object.assign(wpis, {
    nazwa: p.nazwa,
    opis: p.opis,
    koszt,
    waluta: WALUTY.includes(p.waluta) ? p.waluta : 'PLN',
    od: p.od,
    okres: p.okres === 'R' ? 'R' : 'M',
    przedluzac: p.przedluzac,
    prognoza,
    platnoscReczna: p.platnosc === 'reczna',
    koniecMiesiaca: p.platnosc === 'reczna' && p.koniecMiesiaca === true,
    link,
    zmieniono: new Date().toISOString(),
  });
  Object.assign(wpis, normalizuj(wpis));
  if (przed !== `${wpis.platnoscReczna}|${wpis.od}|${wpis.okres}|${wpis.przedluzac}|${wpis.koniecMiesiaca}`) ustawPoczatekZaplaty(wpis);
  if (!wpisy.includes(wpis)) wpisy.push(wpis);
  return { wpis };
}

// Treść pliku danych w formacie wersja 2; PC dokłada w dodatkach swoje ustawienia (motyw).
export const doZapisu = (stan, dodatki = {}) => ({ wersja: 2, zapisano: new Date().toISOString(), ...dodatki, wpisy: stan.wpisy, usuniete: stan.usuniete });
