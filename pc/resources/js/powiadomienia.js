// Powiadomienia o pozycjach, których nie przedłużamy (przedłużać = „nie”), przed terminem odnowienia.
// Roczne: 3, 2, 1 miesiąc i 3, 2, 1 tydzień przed; miesięczne: 14, 7, 5, 4, 3, 2, 1 dzień przed.
// Znikają same, gdy pozycja zostanie usunięta albo przestawiona na „tak - odnawiam”.
// Wspólne dla PC (pokazuje, gdy aplikacja jest otwarta) i telefonu (planuje z wyprzedzeniem).

import { termin, dodajMiesiace, dzis, roznicaDni, formatujDate } from './alarmy.js';
import { waluta, formatujKwote } from './waluty.js';

const GODZINA = 9; // o tej godzinie przychodzi powiadomienie w swoim dniu

const PROGI = {
  R: [
    { miesiecy: 3, napis: 'za 3 miesiące' }, { miesiecy: 2, napis: 'za 2 miesiące' }, { miesiecy: 1, napis: 'za miesiąc' },
    { dni: 21, napis: 'za 3 tygodnie' }, { dni: 14, napis: 'za 2 tygodnie' }, { dni: 7, napis: 'za tydzień' },
  ],
  M: [
    { dni: 14, napis: 'za 2 tygodnie' }, { dni: 7, napis: 'za tydzień' }, { dni: 5, napis: 'za 5 dni' }, { dni: 4, napis: 'za 4 dni' },
    { dni: 3, napis: 'za 3 dni' }, { dni: 2, napis: 'za 2 dni' }, { dni: 1, napis: 'jutro' },
  ],
};

const isoDnia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Wszystkie powiadomienia pozycji „do wycofania”: { klucz, wpis, termin, dzien, godzina, napis }.
// Klucz zawiera termin - po zmianie daty zakupu powiadomienia liczą się od nowa.
export function przypomnienia(wpisy) {
  const lista = [];
  for (const wpis of wpisy) {
    if (wpis.przedluzac !== 'nie') continue;
    const data = termin(wpis).data;
    if (!data) continue;
    for (const prog of PROGI[wpis.okres === 'R' ? 'R' : 'M']) {
      const dzien = prog.miesiecy ? dodajMiesiace(data, -prog.miesiecy) : new Date(data.getFullYear(), data.getMonth(), data.getDate() - prog.dni);
      const godzina = new Date(dzien.getFullYear(), dzien.getMonth(), dzien.getDate(), GODZINA);
      lista.push({ klucz: `${wpis.id}|${isoDnia(data)}|${prog.napis}`, wpis, termin: data, dzien, godzina, napis: prog.napis });
    }
  }
  return lista;
}

// Co pokazać teraz, a co zaplanować na później. pamiec = { pokazane: Set, zaplanowane: Set } -
// funkcja ją uaktualnia. Z kilku zaległych progów jednej pozycji pokazuje się tylko ostatni.
export function rozplanuj(wpisy, pamiec, teraz = new Date()) {
  const dzisiaj = dzis();
  const wszystkie = przypomnienia(wpisy).filter((p) => p.termin > dzisiaj);
  const przyszle = wszystkie.filter((p) => p.godzina > teraz);
  // Ostatni próg do dziś włącznie; jeśli wypada dziś przed 9:00 - czeka na swoją godzinę.
  const biezace = new Map();
  for (const p of wszystkie) {
    if (p.dzien <= dzisiaj && (!biezace.has(p.wpis.id) || p.dzien > biezace.get(p.wpis.id).dzien)) biezace.set(p.wpis.id, p);
  }
  const terazPokaz = [];
  for (const p of biezace.values()) {
    if (p.godzina > teraz || pamiec.pokazane.has(p.klucz)) continue;
    pamiec.pokazane.add(p.klucz);
    // Zaplanowane wcześniej już przyszło samo (telefon) - nie powtarzamy.
    if (!pamiec.zaplanowane.has(p.klucz)) terazPokaz.push(p);
  }
  const klucze = new Set(wszystkie.map((p) => p.klucz));
  for (const k of pamiec.pokazane) if (!klucze.has(k)) pamiec.pokazane.delete(k);
  przyszle.sort((a, b) => a.godzina - b.godzina);
  return { teraz: terazPokaz, przyszle };
}

export function tytul(p) {
  return `Wycofaj: ${p.wpis.nazwa.trim() || '(bez nazwy)'}`;
}

// Dzień powiadomienia - napis progu („za tydzień”), zaległe - prawdziwa liczba dni.
export function tresc(p, dzien = p.dzien) {
  const dni = roznicaDni(new Date(dzien.getFullYear(), dzien.getMonth(), dzien.getDate()), p.termin);
  const kiedy = dni === roznicaDni(p.dzien, p.termin) ? p.napis : dni === 1 ? 'jutro' : `za ${dni} dni`;
  const kwota = typeof p.wpis.koszt === 'number' ? ` (${formatujKwote(p.wpis.koszt, waluta(p.wpis))})` : '';
  return `Odnowienie ${kiedy}, ${formatujDate(p.termin)}${kwota}. Jeśli nie przedłużasz - anuluj subskrypcję.`;
}

// Pamięć pokazanych powiadomień w pliku obok danych (PC: %APPDATA%\Mikroplatnosci, telefon: folder aplikacji).
export async function wczytajPamiec(plik) {
  const pamiec = { pokazane: new Set(), zaplanowane: new Set(), plik, ostatni: '' };
  try {
    const d = JSON.parse(await Neutralino.filesystem.readFile(plik));
    const lista = (v) => (Array.isArray(v) ? v.filter((k) => typeof k === 'string' && k.length < 400) : []);
    pamiec.pokazane = new Set(lista(d.pokazane));
    pamiec.zaplanowane = new Set(lista(d.zaplanowane));
  } catch {
    // brak pliku - nic jeszcze nie pokazano
  }
  return pamiec;
}

export async function zapiszPamiec(pamiec) {
  const tekst = JSON.stringify({ pokazane: [...pamiec.pokazane], zaplanowane: [...pamiec.zaplanowane] });
  if (tekst === pamiec.ostatni) return;
  await Neutralino.filesystem.writeFile(pamiec.plik, tekst);
  pamiec.ostatni = tekst;
}
