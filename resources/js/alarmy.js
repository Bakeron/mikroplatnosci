// Daty, okresy płatności i alarmy.

const DZIEN_MS = 86400000;

export function parsujDate(tekst) {
  if (typeof tekst !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tekst)) return null;
  const [r, m, d] = tekst.split('-').map(Number);
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

export function roznicaDni(od, doDaty) {
  return Math.round((doDaty - od) / DZIEN_MS);
}

export function formatujDate(data) {
  return data ? data.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
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
  while (data < t && k < 5000) {
    k++;
    data = dodajMiesiace(poczatek, okresWpisu.miesiecy * k);
  }
  return { data };
}

// Poziomy: czerwony / pomaranczowy / zolty / null; „minal” gdy data już przeszła.
function poziomRoczny(data) {
  const t = dzis();
  if (data < t) return 'minal';
  if (data <= dodajMiesiace(t, 1)) return 'czerwony';
  if (data <= dodajMiesiace(t, 2)) return 'pomaranczowy';
  if (data <= dodajMiesiace(t, 3)) return 'zolty';
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
// płynnie wg części okresu, która jeszcze została. Bez okresu skala 30 dni.
export function doPlatnosci(wpis) {
  const ok = okres(wpis);
  const ter = termin(wpis, ok);
  if (!ter.data) return null;
  const dni = roznicaDni(dzis(), ter.data);
  if (dni < 0) return { dni, minal: true };
  const dlugosc = ok.typ ? ok.dni : 30;
  const zostalo = Math.min(dni / dlugosc, 1);
  return { dni, minal: false, odcien: Math.round(120 * zostalo), zostalo };
}

export function dniTekst(n) {
  return n === 1 ? '1 dzień' : n + ' dni';
}

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
        const dlugi = ok.typ === 'R' || (ok.typ === 'I' && ok.dni > 45);
        poziom = dlugi ? poziomRoczny(ter.data) : poziomMiesieczny(ter.data);
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
