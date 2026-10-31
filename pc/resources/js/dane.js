// Format danych wspólny dla PC i telefonu: nowy wpis i sprawdzanie danych z pliku (także z Google Dysku).

import { okresZDat } from './alarmy.js';
import { WALUTY } from './waluty.js';

export function noweId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function nowyWpis() {
  return {
    id: noweId(), od: '', do: '', okres: 'M', nazwa: '', opis: '', koszt: null, waluta: 'PLN', link: '', przedluzac: '',
    prognoza: null, prognozaZeStrony: false, prognozaZrodlo: '', prognozaData: '', prognozaCennik: '', prognozaVat: false,
    zmieniono: new Date().toISOString(),
  };
}

// Dane z pliku traktowane jak dane z zewnątrz - każde pole sprawdzane.
export function normalizuj(w) {
  const tekst = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const data = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  return {
    id: typeof w.id === 'string' && w.id ? w.id.slice(0, 64) : noweId(),
    od: data(w.od),
    do: data(w.do),
    // Stare wpisy: okres z różnicy dat „od” i „do”, a gdy jest tylko jedna z nich - miesięczny.
    okres: w.okres === 'M' || w.okres === 'R' ? w.okres : okresZDat(data(w.od), data(w.do)) || 'M',
    nazwa: tekst(w.nazwa, 200),
    opis: tekst(w.opis, 300),
    koszt: typeof w.koszt === 'number' && Number.isFinite(w.koszt) && w.koszt >= 0 ? w.koszt : null,
    waluta: WALUTY.includes(w.waluta) ? w.waluta : 'PLN',
    link: tekst(w.link, 2000),
    przedluzac: w.przedluzac === 'tak' || w.przedluzac === 'nie' ? w.przedluzac : '',
    prognoza: typeof w.prognoza === 'number' && Number.isFinite(w.prognoza) && w.prognoza >= 0 ? w.prognoza : null,
    prognozaZeStrony: w.prognozaZeStrony === true,
    prognozaZrodlo: w.prognozaZrodlo === 'strona' || w.prognozaZrodlo === 'reczna' ? w.prognozaZrodlo : '',
    prognozaData: data(w.prognozaData),
    prognozaCennik: typeof w.prognozaCennik === 'string' && /^https:\/\//i.test(w.prognozaCennik) ? w.prognozaCennik.slice(0, 2000) : '',
    prognozaVat: w.prognozaVat === true,
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

// Wpisy i lista usuniętych z pliku danych (PC, telefon, Dysk) - null, gdy plik ma nieznany format.
export function odczytajDane(dane) {
  if (!dane || !Array.isArray(dane.wpisy)) return null;
  return { wpisy: dane.wpisy.filter((w) => w && typeof w === 'object').map(normalizuj), usuniete: odczytajUsuniete(dane.usuniete) };
}

// Treść pliku danych w formacie wersja 2; PC dokłada w dodatkach swoje ustawienia (sortowanie, motyw).
export const doZapisu = (stan, dodatki = {}) => ({ wersja: 2, zapisano: new Date().toISOString(), ...dodatki, wpisy: stan.wpisy, usuniete: stan.usuniete });
