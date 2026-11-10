// Funkcje do włączania i wyłączania w „Ustawieniach” (ustawienie urządzenia, jak motyw i prowizja).
// Wyłączona funkcja znika z ekranu i nie działa w obliczeniach, a jej dane zostają w pliku - po ponownym
// włączeniu wszystko wraca. Wyjątek: inne okresy i waluty - pozycje, które już ich używają, zostają
// przy swoim (inaczej sumy byłyby błędne); znika tylko możliwość ustawienia ich w nowych.
// Na telefonie ustawienia czytane z własnego pliku, jak na PC.

import { tekst } from './teksty.js';
import { WALUTY, waluta, przeliczNaPln } from './waluty.js';

// [klucz, nazwa, opis, od czego zależy] - nazwa i opis po polsku, tłumaczone przy wyświetleniu (t()).
export const FUNKCJE = [
  ['platnosc', tekst('Płacę sam'), tekst('Wybór „pobiera się sama / płacę sam” w „⋯”. Wyłączone - wszystko liczone jak „pobiera się sama”.')],
  ['weekend', tekst('Weekend i święta'), tekst('„Zapłać do …” wypada w ostatni dzień roboczy, gdy termin jest w sobotę, niedzielę albo święto.'), 'platnosc'],
  ['kwotaZmienna', tekst('Kwota za każdym razem inna'), tekst('Przy „zapłacone” pytanie, ile zapłacono (prąd, gaz).'), 'platnosc'],
  ['okresy', tekst('Inne okresy'), tekst('Tydzień, kwartał, pół roku, 2 lata… obok „mies.” i „rok”.')],
  ['nastepna', tekst('Cena następna'), tekst('Cena od następnej płatności (koniec promocji, podwyżka) - w dniu płatności sama staje się zapłaconą.')],
  ['dzielenie', tekst('Dzielę koszt'), tekst('Koszt dzielony na kilka osób - w sumach tylko Twoja część.')],
  ['pauza', tekst('Pauza'), tekst('„Wstrzymana do …” - bez alarmów i poza sumami do dnia wznowienia.')],
  ['historia', tekst('Historia wydatków'), tekst('Wykres i zmiany cen obok paragonu.')],
  ['archiwum', tekst('Anulowane'), tekst('Wykreślone pozycje trafiają do „Anulowanych” pod tabelą (do przywrócenia), a paragon liczy, ile oszczędzasz. Wyłączone - wykreślenie usuwa na zawsze.')],
  ['kategorie', tekst('Kategorie i filtr'), tekst('Kategoria w „⋯” (rozrywka, praca, AI…), zakładki z filtrem nad tabelą i paragon z podziałem na kategorie.')],
  ['firma', tekst('Firmowe i prywatne'), tekst('Znacznik „na firmę” w „⋯”, osobna suma kosztów firmowych na paragonie i „pobierz fakturę” po każdej płatności.')],
  ['krzywe', tekst('Krzywe elementy'), tekst('Pieczątki, paragon i numery w kółkach lekko przekrzywione, jak na papierze. Wyłączone - wszystko stoi prosto.')],
];

// D17, D18 i inne okresy: domyślnie wyłączone (decyzje autora 02.11.2026), krzywe elementy też
// (decyzja autora 10.11.2026 dla wszystkich aplikacji) - pozostałe domyślnie włączone.
const DOMYSLNIE_WYLACZONE = new Set(['kategorie', 'firma', 'okresy', 'krzywe']);

// Brak wpisu w ustawieniach = wartość domyślna.
export const poprawneFunkcje = (f) => Object.fromEntries(FUNKCJE.map(([k]) => [k, DOMYSLNIE_WYLACZONE.has(k) ? f?.[k] === true : f?.[k] !== false]));

const wlaczone = poprawneFunkcje();

export function ustawFunkcje(f) {
  Object.assign(wlaczone, poprawneFunkcje(f));
  // Jedno miejsce dla każdego kąta przekrzywienia: --krzywo w wyglad.css (0 bez klasy - prosto).
  globalThis.document?.documentElement.classList.toggle('krzywe', wlaczone.krzywe);
}

export const pobierzFunkcje = () => ({ ...wlaczone });

// Waluty do wyboru przy kwocie (zamiast dawnego przełącznika „Waluty obce”, autor 10.11.2026) - złote zawsze,
// kolejność jak w WALUTY. Same złote = pole waluty ukryte, bez kursów NBP i prowizji (jak wyłączone „Waluty obce”).
export const poprawneWaluty = (lista) => WALUTY.filter((kod) => kod === 'PLN' || (Array.isArray(lista) && lista.includes(kod)));
let walutyWlaczone = ['PLN'];
export function ustawWaluty(lista) {
  walutyWlaczone = poprawneWaluty(lista);
}
export const pobierzWaluty = () => [...walutyWlaczone];

// Waluty użyte w pozycjach (koszt i cena następna, także anulowane) -> ile pozycji. Takiej waluty nie da się
// odznaczyć, a jej kursy są potrzebne niezależnie od ustawień.
export function uzyteWaluty(wpisy) {
  const ile = new Map();
  for (const w of wpisy) {
    const kody = new Set([waluta(w), typeof w.prognoza === 'number' ? walutaNastepnej(w) : 'PLN']);
    for (const kod of kody) if (kod !== 'PLN') ile.set(kod, (ile.get(kod) || 0) + 1);
  }
  return ile;
}

// Pierwsze uruchomienie z listą walut (brak listy w ustawieniach): nowa osoba i kto wyłączył „Waluty obce” -
// same złote (waluty z pozycji i tak zostają przy nich); kto miał je włączone - USD i EUR (były zawsze
// w nagłówku) i każda waluta, której używają pozycje.
export const walutyNaStart = (dawneWalutyObce, wpisy) => poprawneWaluty(dawneWalutyObce ? ['USD', 'EUR', ...uzyteWaluty(wpisy).keys()] : []);

// Waluty do wyboru przy pozycji: włączone i jej własna (obca waluta zostaje do zmiany, nawet gdy wyłączona).
export const walutyWyboru = (...wlasne) => WALUTY.filter((kod) => walutyWlaczone.includes(kod) || wlasne.includes(kod));

// Funkcja zależna (np. „Weekend i święta”) działa tylko razem z tą, od której zależy („Płacę sam”).
// „waluty” - czy jest włączona jakaś waluta obca.
export function funkcja(klucz) {
  if (klucz === 'waluty') return walutyWlaczone.length > 1;
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
// Waluta ceny następnej - puste pole = ta sama co koszt.
export const walutaNastepnej = (wpis) => (WALUTY.includes(wpis.walutaNastepna) ? wpis.walutaNastepna : waluta(wpis));

// Ile drożej (+) albo taniej (-) od następnej płatności: { roznica, kod }. Ta sama waluta - w niej, inna
// (np. 20 zł, potem 200 USD) - w złotych po kursie NBP. Bez ceny następnej, kosztu albo kursu - null.
export function zmianaNastepnej(wpis) {
  const nowa = cenaNastepna(wpis);
  if (nowa === null || typeof wpis.koszt !== 'number') return null;
  const kod = waluta(wpis);
  const kodNowej = walutaNastepnej(wpis);
  const [stara, nowaW] = kod === kodNowej ? [wpis.koszt, nowa] : [przeliczNaPln(wpis.koszt, kod), przeliczNaPln(nowa, kodNowej)];
  if (stara === null || nowaW === null) return null;
  return { roznica: Math.round((nowaW - stara) * 100) / 100, kod: kod === kodNowej ? kod : 'PLN' };
}
export const kategoriaWpisu = (wpis) => (funkcja('kategorie') ? wpis.kategoria || '' : '');
export const firmowa = (wpis) => funkcja('firma') && wpis.firmowa === true;
