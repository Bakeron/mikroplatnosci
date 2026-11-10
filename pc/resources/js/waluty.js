// Waluty i kursy średnie NBP (tabela A) - tylko odczyt kursów, nic nie jest wysyłane.

import { isoDnia } from './alarmy.js';
import { t, liczba } from './teksty.js';

// Waluty z tabeli A NBP (kursy średnie); USD i EUR zawsze w nagłówku, pozostałe na paragonie, gdy używane.
export const WALUTY = ['PLN', 'USD', 'EUR', 'GBP', 'CHF', 'CZK', 'SEK', 'NOK', 'DKK', 'HUF', 'JPY', 'CAD', 'AUD'];
const OBCE = WALUTY.slice(1);

const ADRES_NBP = 'https://api.nbp.pl/api/exchangerates/tables/a/?format=json';
const LIMIT_CZASU = 8000;

let kursy = null; // { USD, EUR, GBP…, data: 'RRRR-MM-DD' (dzień tabeli NBP), pobrano: 'RRRR-MM-DD' }
let prowizja = 0; // % doliczany przez bank do kursu NBP przy płatności w walucie obcej (ustawienia urządzenia)

// Prowizja banku za przewalutowanie (0-10%) - „≈ zł” bliżej tego, co naprawdę schodzi z konta.
export function ustawProwizje(procent) {
  prowizja = poprawnaProwizja(procent);
}
export const pobierzProwizje = () => prowizja;
export const poprawnaProwizja = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10 ? Math.round(v * 100) / 100 : 0);

export function waluta(wpis) {
  return WALUTY.includes(wpis.waluta) ? wpis.waluta : 'PLN';
}

export function formatujKwote(kwota, kod = 'PLN') {
  return liczba(kwota) + ' ' + (kod === 'PLN' ? t('zł') : kod);
}

// Kwota w złotówkach: null, gdy brak kwoty albo brak kursu dla waluty obcej. Waluta obca: kurs NBP + prowizja banku.
export function przeliczNaPln(kwota, kod) {
  if (typeof kwota !== 'number') return null;
  if (kod === 'PLN') return kwota;
  const kurs = kursy?.[kod];
  return kurs ? Math.round(kwota * kurs * (1 + prowizja / 100) * 100) / 100 : null;
}

export function naPln(wpis) {
  return przeliczNaPln(wpis.koszt, waluta(wpis));
}

export function pobierzKursy() {
  return kursy;
}

const dzisTekst = () => isoDnia(new Date());

// Kurs z pliku lub z NBP przyjmowany tylko, gdy jest sensowną liczbą (HUF i JPY to ok. 0,01-0,03 zł).
function poprawnyKurs(v, kod) {
  const min = kod === 'USD' || kod === 'EUR' ? 0.5 : 0.001;
  return typeof v === 'number' && Number.isFinite(v) && v > min && v < 50;
}

// USD i EUR są obowiązkowe (bez nich odpowiedź jest podejrzana); pozostałe waluty - tylko poprawne, reszta pominięta.
function poprawneKursy(k) {
  return !!k && poprawnyKurs(k.USD, 'USD') && poprawnyKurs(k.EUR, 'EUR')
    && /^\d{4}-\d{2}-\d{2}$/.test(k.data) && /^\d{4}-\d{2}-\d{2}$/.test(k.pobrano);
}

function wybierzKursy(zrodlo, data, pobrano) {
  const wynik = {};
  for (const kod of OBCE) if (poprawnyKurs(zrodlo[kod], kod)) wynik[kod] = zrodlo[kod];
  return { ...wynik, data, pobrano };
}

const takieSame = (a, b) => OBCE.every((kod) => a[kod] === b[kod]) && a.data === b.data;

// Tabela z dziś, albo pobrano dziś przed jej publikacją (NBP ok. 12:00, w weekend nie publikuje) -
// otwarta rano aplikacja dobierze dzisiejszy kurs po południu.
export function czyAktualne() {
  if (!kursy || kursy.pobrano !== dzisTekst()) return false;
  const t = new Date();
  return kursy.data === dzisTekst() || t.getHours() < 12 || t.getDay() === 0 || t.getDay() === 6;
}

// Zapamiętane kursy z poprzedniego pobrania - działają bez internetu.
export async function wczytajZapamietane(plik) {
  try {
    const k = JSON.parse(await Neutralino.filesystem.readFile(plik));
    if (poprawneKursy(k)) kursy = wybierzKursy(k, k.data, k.pobrano);
  } catch {
    // brak pliku lub uszkodzony - kursy zostaną pobrane
  }
}

// Błąd z rodzajem do napisu przy kursach: 'nbp' - serwer NBP odpowiedział źle, 'zapis' - kurs pobrany,
// ale plik się nie zapisał. Brak sieci - zwykły błąd fetch (bez rodzaju).
const blad = (tekst, rodzaj) => Object.assign(new Error(tekst), { rodzaj });

// Pobiera bieżącą tabelę A z NBP i zapisuje ją do pliku (tylko gdy coś się zmieniło).
// Zwraca true, gdy zmieniły się kursy - wtedy trzeba przeliczyć kwoty.
export async function odswiezZNbp(plik) {
  const odp = await fetch(ADRES_NBP, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.timeout(LIMIT_CZASU),
  });
  if (!odp.ok) throw blad('NBP: HTTP ' + odp.status, 'nbp');
  const tabela = (await odp.json().catch(() => { throw blad('NBP: nieprawidłowa odpowiedź', 'nbp'); }))?.[0];
  const zTabeli = {};
  for (const r of Array.isArray(tabela?.rates) ? tabela.rates : []) if (OBCE.includes(r?.code)) zTabeli[r.code] = r.mid;
  const nowe = wybierzKursy(zTabeli, tabela?.effectiveDate, dzisTekst());
  if (!poprawneKursy(nowe)) throw blad('NBP: nieprawidłowa odpowiedź', 'nbp');
  const zmiana = !kursy || !takieSame(kursy, nowe);
  const doZapisu = zmiana || kursy.pobrano !== nowe.pobrano; // „pobrano” potrzebne do czyAktualne()
  kursy = nowe;
  if (doZapisu) {
    try {
      await Neutralino.filesystem.writeFile(plik, JSON.stringify(kursy, null, 2));
    } catch (e) {
      throw Object.assign(blad('kursy: nieudany zapis pliku', 'zapis'), { zmiana, cause: e });
    }
  }
  return zmiana;
}
