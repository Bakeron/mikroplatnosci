// Daty, okresy płatności i alarmy.

const DZIEN_MS = 86400000;

export function parsujDate(tekst) {
  if (typeof tekst !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tekst)) return null;
  const [r, m, d] = tekst.split('-').map(Number);
  if (r < 1900 || r > 2200) return null; // new Date() zamienia lata 0-99 na 19xx
  const data = new Date(r, m - 1, d);
  return data.getMonth() === m - 1 ? data : null;
}

export function dzis() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

// Dodaje miesiące z zachowaniem dnia (31.01 + 1 mies. = 28/29.02).
export function dodajMiesiace(data, ile) {
  const wynik = new Date(data.getFullYear(), data.getMonth() + ile, 1);
  const ostatniDzien = new Date(wynik.getFullYear(), wynik.getMonth() + 1, 0).getDate();
  wynik.setDate(Math.min(data.getDate(), ostatniDzien));
  return wynik;
}

export const isoDnia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function roznicaDni(od, doDaty) {
  return Math.round((doDaty - od) / DZIEN_MS);
}

// Jeden gotowy formater - toLocaleDateString z opcjami tworzy go od nowa przy każdym wywołaniu (ok. 50 razy wolniej).
const FORMAT_DATY = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function formatujDate(data) {
  return data ? FORMAT_DATY.format(data) : '';
}

// Okres z przełącznika przy dacie zakupu: M - miesięczna, R - roczna, null - nieokreślony.
export function okres(wpis) {
  if (wpis.okres === 'M') return { typ: 'M', miesiecy: 1, dni: 30 };
  if (wpis.okres === 'R') return { typ: 'R', miesiecy: 12, dni: 365 };
  return { typ: null };
}

// Okres ze starych dat „od” i „do” (wpisy sprzed przełącznika mies. / rok) - bliższy z dwóch.
export function okresZDat(od, doDnia) {
  const a = parsujDate(od);
  const b = parsujDate(doDnia);
  if (!a || !b || b <= a) return '';
  return roznicaDni(a, b) < 183 ? 'M' : 'R';
}

// Termin najbliższej płatności: zakup + okres. Przedłużane przesuwają się o kolejne okresy, jednorazowe nie.
// Stary wpis bez daty zakupu, ale z datą „do” - liczony od niej (to był termin płatności).
export function termin(wpis, okresWpisu = okres(wpis)) {
  if (!okresWpisu.typ) return { data: null };
  const zakup = parsujDate(wpis.od);
  const poczatek = zakup ?? parsujDate(wpis.do);
  if (!poczatek) return { data: null };

  let k = zakup ? 1 : 0;
  let data = dodajMiesiace(poczatek, okresWpisu.miesiecy * k);
  if (wpis.przedluzac === 'nie') return { data };
  const t = dzis();
  // Skok od razu na okres sprzed dzisiejszego miesiąca - pętla dociąga tylko 1-2 kroki zamiast liczyć od zakupu.
  const miesiecyOdPoczatku = (t.getFullYear() - poczatek.getFullYear()) * 12 + t.getMonth() - poczatek.getMonth();
  k = Math.max(k, Math.floor(miesiecyOdPoczatku / okresWpisu.miesiecy) - 1);
  data = dodajMiesiace(poczatek, okresWpisu.miesiecy * k);
  while (data < t && k < 5000) {
    k++;
    data = dodajMiesiace(poczatek, okresWpisu.miesiecy * k);
  }
  return { data };
}

// Przy zmianie na „Przedłużać: nie” - data zakupu przesunięta na początek bieżącego okresu,
// żeby termin był najbliższym odnowieniem, a nie pierwszym po dawnym zakupie.
export function zakupBiezacegoOkresu(wpis) {
  const ok = okres(wpis);
  const zakup = parsujDate(wpis.od);
  if (!ok.typ || !zakup) return wpis.od;
  const t = dzis();
  let k = 0;
  while (dodajMiesiace(zakup, ok.miesiecy * (k + 1)) < t && k < 5000) k++;
  return isoDnia(dodajMiesiace(zakup, ok.miesiecy * k));
}

// Poziomy: czerwony / pomaranczowy / zolty / null; „minal” gdy data już przeszła.
// Liczone od terminu wstecz - tak samo jak powiadomienia („za miesiąc” = ten sam dzień).
function poziomRoczny(data) {
  const t = dzis();
  if (data < t) return 'minal';
  if (dodajMiesiace(data, -1) <= t) return 'czerwony';
  if (dodajMiesiace(data, -2) <= t) return 'pomaranczowy';
  if (dodajMiesiace(data, -3) <= t) return 'zolty';
  return null;
}

function poziomMiesieczny(data) {
  const dni = roznicaDni(dzis(), data);
  if (dni < 0) return 'minal';
  if (dni <= 3) return 'czerwony';
  if (dni <= 7) return 'pomaranczowy';
  return null;
}

// Kolumna „Do płatności”: odcień 120 (zielony) → 60 (żółty) → 0 (czerwony),
// płynnie wg części okresu, która jeszcze została.
export function doPlatnosci(wpis) {
  const ok = okres(wpis);
  const ter = termin(wpis, ok);
  if (!ter.data) return null;
  const dni = roznicaDni(dzis(), ter.data);
  if (dni < 0) return { dni, minal: true };
  const zostalo = Math.min(dni / ok.dni, 1);
  return { dni, minal: false, odcien: Math.round(120 * zostalo), zostalo };
}

export function dniTekst(n) {
  return n === 1 ? '1 dzień' : n + ' dni';
}

// „dziś”, „jutro” albo „N dni” do terminu.
export const kiedyTekst = (n) => (n === 0 ? 'dziś' : n === 1 ? 'jutro' : dniTekst(n));

export function czyZakonczona(wpis) {
  if (wpis.przedluzac !== 'nie') return false;
  const data = termin(wpis).data;
  return !!data && data < dzis();
}

export function zbierzAlarmy(wpisy) {
  const roczne = [];
  const jednorazowe = [];

  for (const wpis of wpisy) {
    const ok = okres(wpis);
    const ter = termin(wpis, ok);

    if (wpis.przedluzac === 'nie') {
      let poziom = 'brak';
      if (ter.data) {
        poziom = ok.typ === 'R' ? poziomRoczny(ter.data) : poziomMiesieczny(ter.data);
      }
      jednorazowe.push({ wpis, data: ter.data, poziom });
      continue;
    }

    if (ok.typ === 'R' && ter.data) {
      const poziom = poziomRoczny(ter.data);
      if (poziom && poziom !== 'minal') roczne.push({ wpis, data: ter.data, poziom });
    }
  }

  const poDacie = (a, b) => (a.data ? a.data.getTime() : Infinity) - (b.data ? b.data.getTime() : Infinity);
  roczne.sort(poDacie);
  jednorazowe.sort(poDacie);
  return { roczne, jednorazowe };
}
