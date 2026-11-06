// Funkcje do włączania i wyłączania w „Ustawieniach” (ustawienie urządzenia, jak motyw i prowizja).
// Wyłączona funkcja znika z ekranu i nie działa w obliczeniach, a jej dane zostają w pliku - po ponownym
// włączeniu wszystko wraca. Wyjątek: inne okresy i waluty obce - pozycje, które już ich używają, zostają
// przy swoim (inaczej sumy byłyby błędne); znika tylko możliwość ustawienia ich w nowych.
// Na telefonie ustawienia czytane z własnego pliku, jak na PC.

import { tekst } from './teksty.js';

// [klucz, nazwa, opis, od czego zależy] - nazwa i opis po polsku, tłumaczone przy wyświetleniu (t()).
export const FUNKCJE = [
  ['platnosc', tekst('Płacę sam'), tekst('Wybór „pobiera się sama / płacę sam” w „⋯”. Wyłączone - wszystko liczone jak „pobiera się sama”.')],
  ['weekend', tekst('Weekend i święta'), tekst('„Zapłać do …” wypada w ostatni dzień roboczy, gdy termin jest w sobotę, niedzielę albo święto.'), 'platnosc'],
  ['kwotaZmienna', tekst('Kwota za każdym razem inna'), tekst('Przy „zapłacone” pytanie, ile zapłacono (prąd, gaz).'), 'platnosc'],
  ['okresy', tekst('Inne okresy'), tekst('Tydzień, kwartał, pół roku, 2 lata… obok „mies.” i „rok”.')],
  ['nastepna', tekst('Cena następna'), tekst('Cena od następnej płatności (koniec promocji, podwyżka) - w dniu płatności sama staje się zapłaconą.')],
  ['dzielenie', tekst('Dzielę koszt'), tekst('Koszt dzielony na kilka osób - w sumach tylko Twoja część.')],
  ['pauza', tekst('Pauza'), tekst('„Wstrzymana do …” - bez alarmów i poza sumami do dnia wznowienia.')],
  ['waluty', tekst('Waluty obce'), tekst('Waluta przy kwocie, kursy NBP i prowizja banku w nagłówku.')],
  ['historia', tekst('Historia wydatków'), tekst('Wykres i zmiany cen obok paragonu.')],
  ['archiwum', tekst('Anulowane'), tekst('Wykreślone pozycje trafiają do „Anulowanych” pod tabelą (do przywrócenia), a paragon liczy, ile oszczędzasz. Wyłączone - wykreślenie usuwa na zawsze.')],
  ['kategorie', tekst('Kategorie i filtr'), tekst('Kategoria w „⋯” (rozrywka, praca, AI…), zakładki z filtrem nad tabelą i paragon z podziałem na kategorie.')],
  ['firma', tekst('Firmowe i prywatne'), tekst('Znacznik „na firmę” w „⋯”, osobna suma kosztów firmowych na paragonie i „pobierz fakturę” po każdej płatności.')],
];

// D17, D18 i inne okresy: domyślnie wyłączone (decyzje autora 02.11.2026) - pozostałe domyślnie włączone.
const DOMYSLNIE_WYLACZONE = new Set(['kategorie', 'firma', 'okresy']);

// Brak wpisu w ustawieniach = wartość domyślna.
export const poprawneFunkcje = (f) => Object.fromEntries(FUNKCJE.map(([k]) => [k, DOMYSLNIE_WYLACZONE.has(k) ? f?.[k] === true : f?.[k] !== false]));

const wlaczone = poprawneFunkcje();

export function ustawFunkcje(f) {
  Object.assign(wlaczone, poprawneFunkcje(f));
}

export const pobierzFunkcje = () => ({ ...wlaczone });

// Funkcja zależna (np. „Weekend i święta”) działa tylko razem z tą, od której zależy („Płacę sam”).
export function funkcja(klucz) {
  const zalezy = FUNKCJE.find(([k]) => k === klucz)?.[3];
  return wlaczone[klucz] !== false && (!zalezy || wlaczone[zalezy] !== false);
}

// Pola wpisu widziane przez obliczenia - z uwzględnieniem wyłączonych funkcji.
export const reczna = (wpis) => funkcja('platnosc') && wpis.platnoscReczna === true;
export const zmiennaKwota = (wpis) => reczna(wpis) && funkcja('kwotaZmienna') && wpis.zmiennaKwota === true;
export const osobWpisu = (wpis) => (funkcja('dzielenie') && wpis.osob > 1 ? wpis.osob : 1);
// Wykreślona do „Anulowanych” (C15) - nie liczy się nigdzie poza historią wydatków (do dnia anulowania)
// i licznikiem oszczędności, niezależnie od ustawień (dane zostają).
export const anulowana = (wpis) => Boolean(wpis.anulowano);
export const cenaNastepna = (wpis) => (funkcja('nastepna') && typeof wpis.prognoza === 'number' ? wpis.prognoza : null);
export const kategoriaWpisu = (wpis) => (funkcja('kategorie') ? wpis.kategoria || '' : '');
export const firmowa = (wpis) => funkcja('firma') && wpis.firmowa === true;
