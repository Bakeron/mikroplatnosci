// Powiadomienia o pozycjach, których nie przedłużamy (przedłużać = „nie”), przed terminem odnowienia.
// Roczne: 3, 2, 1 miesiąc i 3, 2, 1 tydzień przed; miesięczne: 14, 7, 5, 4, 3, 2, 1 dzień przed.
// Nie przychodzą, gdy pozycja zostanie usunięta albo przestawiona na „tak - odnawiam”.
// Do tego „Zapłać” przy płatności ręcznej („płacę sam”): 7, 3 i 1 dzień przed pierwszym
// niezapłaconym terminem (po „☐ zapłacone” - przed następnym), a gdy termin wypada w dzień wolny -
// przed ostatnim dniem roboczym przed nim (B8, alarmy.js zaplacDo).
// B9 (domyślnie wyłączone): „Przygotuj pieniądze” - tydzień przed drogą płatnością, która pobiera się
// sama, i „Podwyżka” - przed płatnością, od której obowiązuje wyższa cena następna.
// Wspólne dla PC (pokazuje, gdy aplikacja jest otwarta albo uruchomiona w tle) i telefonu (planuje z wyprzedzeniem).

import { termin, dodajMiesiace, dzis, roznicaDni, formatujDate, isoDnia, okres, czyDlugi, czyWstrzymana, parsujDate, zaplacDo } from './alarmy.js';
import { waluta, formatujKwote, przeliczNaPln } from './waluty.js';
import { nazwaWpisu } from './dane.js';
import { reczna, cenaNastepna, anulowana, walutaNastepnej, zmianaNastepnej } from './funkcje.js';
import { powodWolnego } from './swieta.js';
import { t, tn, tekst } from './teksty.js';

const GODZINA = 9; // o tej godzinie przychodzi powiadomienie w swoim dniu

// Napisy progów zostają po polsku (są też w kluczu pamięci pokazanych) - tłumaczone przy wyświetleniu (tresc).
const PROGI = {
  R: [
    { miesiecy: 3, napis: tekst('za 3 miesiące') }, { miesiecy: 2, napis: tekst('za 2 miesiące') }, { miesiecy: 1, napis: tekst('za miesiąc') },
    { dni: 21, napis: tekst('za 3 tygodnie') }, { dni: 14, napis: tekst('za 2 tygodnie') }, { dni: 7, napis: tekst('za tydzień') },
  ],
  M: [
    { dni: 14, napis: tekst('za 2 tygodnie') }, { dni: 7, napis: tekst('za tydzień') }, { dni: 5, napis: tekst('za 5 dni') }, { dni: 4, napis: tekst('za 4 dni') },
    { dni: 3, napis: tekst('za 3 dni') }, { dni: 2, napis: tekst('za 2 dni') }, { dni: 1, napis: tekst('jutro') },
  ],
};

const PROGI_ZAPLATY = [{ dni: 7, napis: tekst('za tydzień') }, { dni: 3, napis: tekst('za 3 dni') }, { dni: 1, napis: tekst('jutro') }];

const PROGI_DROGICH = [{ dni: 7, napis: tekst('za tydzień') }];
const PROGI_PODWYZKI = { R: [{ miesiecy: 1, napis: tekst('za miesiąc') }, { dni: 7, napis: tekst('za tydzień') }], M: [{ dni: 7, napis: tekst('za tydzień') }] };

// Które rodzaje powiadomień (ustawienia): bez podanych - jak dotąd, tylko „Wycofaj” i „Zapłać” (telefon).
// progDrogich - od tej kwoty w złotych płatność jest „droga” (B9).
export const DOMYSLNE_RODZAJE = { wycofaj: true, zaplac: true, drogie: false, podwyzka: false, progDrogich: 100 };

// Początek klucza wg rodzaju - „Wycofaj” bez przedrostka i „zapłać ” jak dotąd (pamięć pokazanych zostaje ważna).
const PRZEDROSTEK = { wycofaj: '', zaplac: 'zapłać ', drogie: 'drogie ', podwyzka: 'podwyżka ' };

// Kwota płatności w danym terminie z walutą: cena następna, jeśli wpisana i obowiązuje już od tego terminu
// (w swojej walucie), inaczej koszt.
function kwotaWTerminie(wpis, data) {
  const nowa = cenaNastepna(wpis);
  return nowa !== null && (!wpis.prognozaOd || isoDnia(data) >= wpis.prognozaOd) ? { kwota: nowa, kod: walutaNastepnej(wpis) } : { kwota: wpis.koszt, kod: waluta(wpis) };
}

// Podwyżka: dzień płatności, od której obowiązuje wyższa cena następna (albo null). Inna waluta - w złotych.
function dzienPodwyzki(wpis, data) {
  if (!(zmianaNastepnej(wpis)?.roznica > 0)) return null;
  return parsujDate(wpis.prognozaOd) ?? data;
}

// Wszystkie powiadomienia: { klucz, wpis, termin, cel, dzien, godzina, napis, rodzaj } - rodzaj „wycofaj”
// (pozycje do wycofania), „zaplac” (płatność ręczna), „drogie” albo „podwyzka”. cel - dzień, do którego
// liczą się progi („zapłać do …” przy płacę sam, inaczej termin). Klucz zawiera termin - po zmianie daty
// zakupu powiadomienia liczą się od nowa.
export function przypomnienia(wpisy, rodzaje = DOMYSLNE_RODZAJE) {
  const lista = [];
  for (const wpis of wpisy) {
    if (czyWstrzymana(wpis) || anulowana(wpis)) continue; // pauza - bez przypomnień do dnia wznowienia; anulowana - wcale
    const ok = okres(wpis);
    const data = termin(wpis, ok).data;
    if (!data) continue; // przy płatności ręcznej termin to pierwszy niezapłacony - po „☐ zapłacone” już następny
    const dlugi = czyDlugi(ok);
    // Okres rok i dłużej - progi roczne; krótszy - dniowe, ale tylko krótsze od okresu (np. co tydzień: bez „za 2 tygodnie”).
    const dodaj = (rodzaj, progi, terminP, cel = terminP) => {
      for (const prog of progi.filter((p) => !p.dni || p.dni < ok.dni)) {
        const dzien = prog.miesiecy ? dodajMiesiace(cel, -prog.miesiecy) : new Date(cel.getFullYear(), cel.getMonth(), cel.getDate() - prog.dni);
        const godzina = new Date(dzien.getFullYear(), dzien.getMonth(), dzien.getDate(), GODZINA);
        // Termin zawsze przedostatni w kluczu (rozplanuj czyści pamięć po nim).
        const klucz = `${wpis.id}|${isoDnia(terminP)}|${PRZEDROSTEK[rodzaj]}${prog.napis}`;
        lista.push({ klucz, wpis, termin: terminP, cel, dzien, godzina, napis: prog.napis, rodzaj });
      }
    };
    if (wpis.przedluzac === 'nie') {
      if (rodzaje.wycofaj) dodaj('wycofaj', PROGI[dlugi ? 'R' : 'M'], data);
      continue;
    }
    if (reczna(wpis)) {
      if (rodzaje.zaplac) dodaj('zaplac', PROGI_ZAPLATY, data, zaplacDo(data));
    } else if (rodzaje.drogie) {
      // Cała kwota schodzi z konta (także przy dzieleniu kosztu) - w złotych, waluta obca po kursie NBP.
      const doZaplaty = kwotaWTerminie(wpis, data);
      const pln = przeliczNaPln(doZaplaty.kwota, doZaplaty.kod);
      if (pln !== null && pln >= (rodzaje.progDrogich ?? DOMYSLNE_RODZAJE.progDrogich)) dodaj('drogie', PROGI_DROGICH, data);
    }
    const podwyzka = rodzaje.podwyzka ? dzienPodwyzki(wpis, data) : null;
    if (podwyzka) dodaj('podwyzka', PROGI_PODWYZKI[dlugi ? 'R' : 'M'], podwyzka);
  }
  return lista;
}

// Co pokazać teraz, a co zaplanować na później. pamiec = { pokazane: Set, zaplanowane: Set } -
// funkcja ją uaktualnia. Z kilku zaległych progów jednej pozycji pokazuje się tylko ostatni.
export function rozplanuj(wpisy, pamiec, teraz = new Date(), rodzaje = DOMYSLNE_RODZAJE) {
  const dzisiaj = dzis();
  const wszystkie = przypomnienia(wpisy, rodzaje).filter((p) => p.termin > dzisiaj);
  const przyszle = wszystkie.filter((p) => p.godzina > teraz);
  // Ostatni próg do dziś włącznie (osobno dla każdego rodzaju pozycji); jeśli wypada dziś przed 9:00 - czeka na swoją godzinę.
  const biezace = new Map();
  for (const p of wszystkie) {
    const k = p.wpis.id + '|' + p.rodzaj;
    if (p.dzien <= dzisiaj && (!biezace.has(k) || p.dzien > biezace.get(k).dzien)) biezace.set(k, p);
  }
  const terazPokaz = [];
  for (const p of biezace.values()) {
    if (p.godzina > teraz || pamiec.pokazane.has(p.klucz)) continue;
    pamiec.pokazane.add(p.klucz);
    // Zaplanowane wcześniej już przyszło samo (telefon) - nie powtarzamy.
    if (!pamiec.zaplanowane.has(p.klucz)) terazPokaz.push(p);
  }
  // Pokazane zostają w pamięci do swojego terminu - zmiana daty tam i z powrotem albo „nie → tak → nie”
  // nie powtarza powiadomienia (klucz: id|termin|próg).
  const dzisIso = isoDnia(dzisiaj);
  // Termin liczony od końca klucza - id z ręcznie poprawionego pliku może zawierać „|”.
  for (const k of pamiec.pokazane) if (!(k.split('|').at(-2) > dzisIso)) pamiec.pokazane.delete(k);
  przyszle.sort((a, b) => a.godzina - b.godzina);
  return { teraz: terazPokaz, przyszle };
}

const TYTULY = { wycofaj: tekst('Wycofaj: {nazwa}'), zaplac: tekst('Zapłać: {nazwa}'), drogie: tekst('Przygotuj pieniądze: {nazwa}'), podwyzka: tekst('Podwyżka: {nazwa}') };

export function tytul(p) {
  return t(TYTULY[p.rodzaj], { nazwa: nazwaWpisu(p.wpis) });
}

// Dzień powiadomienia - napis progu („za tydzień”), zaległe - prawdziwa liczba dni.
export function tresc(p, dzien = p.dzien) {
  const cel = p.cel ?? p.termin;
  const dni = roznicaDni(new Date(dzien.getFullYear(), dzien.getMonth(), dzien.getDate()), cel);
  const kiedy = dni === roznicaDni(p.dzien, cel) ? t(p.napis) : dni === 1 ? t('jutro') : tn(dni, 'za {n} dzień', 'za {n} dni', 'za {n} dni');
  const kod = waluta(p.wpis);
  if (p.rodzaj === 'zaplac' || p.rodzaj === 'drogie') {
    // Do zapłaty jest cena od następnej płatności, jeśli wpisana i obowiązuje już od tego terminu.
    const doZaplaty = kwotaWTerminie(p.wpis, p.termin);
    const kwotaZaplaty = typeof doZaplaty.kwota === 'number' ? ` (${formatujKwote(doZaplaty.kwota, doZaplaty.kod)})` : '';
    if (p.rodzaj === 'drogie') return t('Płatność {kiedy}, {data}{kwota} pobierze się sama z konta - przygotuj pieniądze.', { kiedy, data: formatujDate(p.termin), kwota: kwotaZaplaty });
    if (cel < p.termin) {
      return t('Zapłać {kiedy}, do {doDnia}{kwota}: termin {data} wypada {powod}, a przelew w dzień wolny wychodzi dopiero po nim. Nie pobiera się samo.', { kiedy, doDnia: formatujDate(cel), kwota: kwotaZaplaty, data: formatujDate(p.termin), powod: powodWolnego(p.termin) });
    }
    return t('Termin płatności {kiedy}, {data}{kwota}. Nie pobiera się samo - zapłać ręcznie.', { kiedy, data: formatujDate(p.termin), kwota: kwotaZaplaty });
  }
  if (p.rodzaj === 'podwyzka') {
    const nowa = cenaNastepna(p.wpis) ?? 0;
    const stara = p.wpis.koszt ?? 0;
    const zmiana = zmianaNastepnej(p.wpis) ?? { roznica: Math.round((nowa - stara) * 100) / 100, kod };
    return t('Od płatności {kiedy}, {data} drożej o {roznica}: {stara} → {nowa}. Dalej chcesz? Jeśli nie - anuluj przed tym dniem.', { kiedy, data: formatujDate(p.termin), roznica: formatujKwote(zmiana.roznica, zmiana.kod), stara: formatujKwote(stara, kod), nowa: formatujKwote(nowa, walutaNastepnej(p.wpis)) });
  }
  const kwota = typeof p.wpis.koszt === 'number' ? ` (${formatujKwote(p.wpis.koszt, waluta(p.wpis))})` : '';
  return t('Odnowienie {kiedy}, {data}{kwota}. Jeśli nie przedłużasz - anuluj subskrypcję.', { kiedy, data: formatujDate(p.termin), kwota });
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
  pamiec.ostatni = tekstPamieci(pamiec); // bez zbędnego zapisu przy starcie
  return pamiec;
}

const tekstPamieci = (pamiec) => JSON.stringify({ pokazane: [...pamiec.pokazane], zaplanowane: [...pamiec.zaplanowane] });

export async function zapiszPamiec(pamiec) {
  const tekst = tekstPamieci(pamiec);
  if (tekst === pamiec.ostatni) return;
  await Neutralino.filesystem.writeFile(pamiec.plik, tekst);
  pamiec.ostatni = tekst;
}
