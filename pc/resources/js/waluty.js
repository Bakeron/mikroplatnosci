// Waluty i kursy średnie NBP (tabela A) - tylko odczyt kursów, nic nie jest wysyłane.

import { isoDnia } from './alarmy.js';

export const WALUTY = ['PLN', 'USD', 'EUR'];

const ADRES_NBP = 'https://api.nbp.pl/api/exchangerates/tables/a/?format=json';
const LIMIT_CZASU = 8000;

let kursy = null; // { USD, EUR, data: 'RRRR-MM-DD' (dzień tabeli NBP), pobrano: 'RRRR-MM-DD' }

const liczba2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function waluta(wpis) {
  return WALUTY.includes(wpis.waluta) ? wpis.waluta : 'PLN';
}

export function formatujKwote(kwota, kod = 'PLN') {
  return liczba2.format(kwota) + (kod === 'PLN' ? ' zł' : ' ' + kod);
}

// Kwota w złotówkach: null, gdy brak kwoty albo brak kursu dla waluty obcej.
export function przeliczNaPln(kwota, kod) {
  if (typeof kwota !== 'number') return null;
  if (kod === 'PLN') return kwota;
  const kurs = kursy?.[kod];
  return kurs ? Math.round(kwota * kurs * 100) / 100 : null;
}

export function naPln(wpis) {
  return przeliczNaPln(wpis.koszt, waluta(wpis));
}

export function pobierzKursy() {
  return kursy;
}

const dzisTekst = () => isoDnia(new Date());

// Kurs z pliku lub z NBP przyjmowany tylko, gdy jest sensowną liczbą.
function poprawnyKurs(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0.5 && v < 50;
}

function poprawneKursy(k) {
  return !!k && poprawnyKurs(k.USD) && poprawnyKurs(k.EUR)
    && /^\d{4}-\d{2}-\d{2}$/.test(k.data) && /^\d{4}-\d{2}-\d{2}$/.test(k.pobrano);
}

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
    if (poprawneKursy(k)) kursy = { USD: k.USD, EUR: k.EUR, data: k.data, pobrano: k.pobrano };
  } catch {
    // brak pliku lub uszkodzony - kursy zostaną pobrane
  }
}

// Pobiera bieżącą tabelę A z NBP i zapisuje ją do pliku (tylko gdy coś się zmieniło).
// Zwraca true, gdy zmieniły się kursy - wtedy trzeba przeliczyć kwoty.
export async function odswiezZNbp(plik) {
  const odp = await fetch(ADRES_NBP, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.timeout(LIMIT_CZASU),
  });
  if (!odp.ok) throw new Error('NBP: HTTP ' + odp.status);
  const tabela = (await odp.json())?.[0];
  const kurs = (kod) => tabela?.rates?.find((r) => r.code === kod)?.mid;
  const nowe = { USD: kurs('USD'), EUR: kurs('EUR'), data: tabela?.effectiveDate, pobrano: dzisTekst() };
  if (!poprawneKursy(nowe)) throw new Error('NBP: nieprawidłowa odpowiedź');
  const zmiana = !kursy || kursy.USD !== nowe.USD || kursy.EUR !== nowe.EUR || kursy.data !== nowe.data;
  const doZapisu = zmiana || kursy.pobrano !== nowe.pobrano; // „pobrano” potrzebne do czyAktualne()
  kursy = nowe;
  if (doZapisu) await Neutralino.filesystem.writeFile(plik, JSON.stringify(kursy, null, 2));
  return zmiana;
}
