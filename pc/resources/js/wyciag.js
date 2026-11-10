// E24: import z wyciągu bankowego (CSV z mBanku, PKO, ING, Pekao, Revolut i podobnych) - wszystko lokalnie,
// plik nigdzie nie wychodzi. Kroki: dekodowanie (UTF-8 albo Windows-1250 - polskie banki), rozpoznanie
// separatora i wiersza nagłówka (wyciągi mają przed tabelą kilka linijek o rachunku), kolumny daty, kwoty,
// waluty i opisu wg nazw, a potem szukanie płatności, które powtarzają się co tydzień, miesiąc, kwartał… u tego
// samego odbiorcy. Bez sieci i bez bibliotek - zwykłe funkcje (testy: grupa-d-e.test.mjs).

import { WALUTY } from './waluty.js';

const MAKS_WIERSZY = 50000;
const DZIEN_MS = 86400000;

// Bajty pliku → tekst. Najpierw ścisłe UTF-8; błąd = stare kodowanie polskich banków (mBank, PKO).
export function dekoduj(bajty) {
  const b = bajty instanceof Uint8Array ? bajty : new Uint8Array(bajty);
  let tekst;
  try {
    tekst = new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    tekst = new TextDecoder('windows-1250').decode(b);
  }
  return tekst.replace(/^﻿/, '');
}

// Separator: ten, który w największej liczbie pierwszych linijek występuje co najmniej 2 razy.
function separator(tekst) {
  const linie = tekst.split(/\r?\n/, 80).filter((l) => l.trim());
  let najlepszy = ';';
  let wynik = -1;
  for (const sep of [';', ',', '\t']) {
    const ile = linie.filter((l) => l.split(sep).length > 2).length;
    if (ile > wynik) {
      wynik = ile;
      najlepszy = sep;
    }
  }
  return najlepszy;
}

// CSV z cudzysłowami („a;b” w jednym polu, "" = cudzysłów, nowa linia w polu).
export function parsujCsv(tekst, sep = separator(tekst)) {
  const wiersze = [];
  let wiersz = [];
  let pole = '';
  let wCudzyslowie = false;
  let bylCudzyslow = false;
  const koniecPola = () => {
    wiersz.push(bylCudzyslow ? pole : pole.trim());
    pole = '';
    bylCudzyslow = false;
  };
  for (let i = 0; i < tekst.length && wiersze.length < MAKS_WIERSZY; i++) {
    const z = tekst[i];
    if (wCudzyslowie) {
      if (z !== '"') pole += z;
      else if (tekst[i + 1] === '"') {
        pole += '"';
        i++;
      } else wCudzyslowie = false;
    } else if (z === '"' && !pole.trim()) {
      wCudzyslowie = true;
      bylCudzyslow = true;
      pole = '';
    } else if (z === sep) koniecPola();
    else if (z === '\n' || z === '\r') {
      if (z === '\r' && tekst[i + 1] === '\n') i++;
      koniecPola();
      wiersze.push(wiersz);
      wiersz = [];
    } else pole += z;
  }
  if (pole || wiersz.length) {
    koniecPola();
    wiersze.push(wiersz);
  }
  return wiersze.map((w) => w.map((p) => p.trim()));
}

// Data z wyciągu: 2026-10-05, 2026-10-05 12:30, 05.10.2026, 05-10-2026, 05/10/2026, 2026.10.05.
export function parsujDateWyciagu(s) {
  const iso = (r, m, d) => {
    const data = new Date(r, m - 1, d);
    return r >= 1990 && r <= 2200 && data.getMonth() === m - 1 && data.getDate() === d
      ? `${r}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
  };
  let m = String(s).trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = String(s).trim().match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
  return m ? iso(+m[3], +m[2], +m[1]) : '';
}

// Kwota: „-43,00”, „-1 234,56 PLN”, „−12.99”, „1,234.56”, „+250,00” → liczba (null - to nie kwota).
// Przy kropce i przecinku dziesiętny jest ten ostatni; sam przecinek albo sama kropka - dziesiętny.
export function parsujKwoteWyciagu(s) {
  let t = String(s).replace(/[−–]/g, '-').replace(/[\s ']/g, '').replace(/[A-Za-zł]{3}$|^[A-Za-zł]{3}/g, '');
  if (!/^[-+]?\d[\d.,]*$/.test(t)) return null;
  const przecinek = t.lastIndexOf(',');
  const kropka = t.lastIndexOf('.');
  const dziesietny = przecinek > kropka ? ',' : '.';
  const tysiace = dziesietny === ',' ? /\./g : /,/g;
  t = t.replace(tysiace, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// Kolumny wg nazw w nagłówku (bez polskich znaków i wielkości liter).
const bezZnakow = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
const KOLUMNA = {
  data: /^#?\s*(data( operacji| transakcji| ksiegowania| zlecenia)?|date|started date|completed date|transaction date|booking date)\s*$/,
  kwota: /kwota|amount|^#?\s*wartosc/,
  obciazenia: /obciazeni|wydatki|debit/,
  waluta: /^#?\s*(waluta|currency)\s*$/,
  opis: /opis|tytul|kontrahent|odbiorc|nadawc|description|merchant|payee|counterparty|szczegol|nazwa|reference/,
  pomin: /saldo|balance|fee|oplat|prowizj|rachun|adres|account|bank|numer|nr |iban|kategori|category|typ|type|state|stan/,
  stan: /^(state|stan|status)$/,
};

function kolumny(naglowek) {
  const n = naglowek.map(bezZnakow);
  const znajdz = (wzor, bez = KOLUMNA.pomin) => n.findIndex((k) => wzor.test(k) && !bez.test(k));
  const data = n.findIndex((k) => KOLUMNA.data.test(k));
  let kwota = znajdz(KOLUMNA.kwota, /saldo|balance|fee|oplat|prowizj|oryginal|original/);
  let obciazenia = -1;
  if (kwota < 0) obciazenia = znajdz(KOLUMNA.obciazenia, /saldo|balance/);
  if (kwota < 0 && obciazenia < 0) return null;
  if (data < 0) return null;
  // Opis: kolumny o pasującej nazwie i kolumny bez nazwy (PKO dzieli w nich szczegóły operacji).
  const opis = n.map((k, i) => ((!k.replace(/[#\s]/g, '') || (KOLUMNA.opis.test(k) && !KOLUMNA.pomin.test(k))) && i !== data && i !== kwota ? i : -1)).filter((i) => i >= 0);
  return { data, kwota, obciazenia, waluta: n.findIndex((k) => KOLUMNA.waluta.test(k)), opis, stan: n.findIndex((k) => KOLUMNA.stan.test(k)), szerokosc: naglowek.length };
}

// Operacje z wyciągu: [{ data: 'RRRR-MM-DD', kwota (ujemna = wydatek), waluta, opis }] albo null, gdy to nie wyciąg.
export function odczytajWyciag(tekst) {
  const wiersze = parsujCsv(tekst);
  for (let i = 0; i < Math.min(wiersze.length, 80); i++) {
    const k = kolumny(wiersze[i]);
    if (!k) continue;
    const operacje = [];
    for (const w of wiersze.slice(i + 1)) {
      const data = parsujDateWyciagu(w[k.data] ?? '');
      if (!data) continue;
      if (k.stan >= 0 && /revert|declin|odrzuc|anulow/i.test(w[k.stan] ?? '')) continue;
      let kwota = k.kwota >= 0 ? parsujKwoteWyciagu(w[k.kwota] ?? '') : parsujKwoteWyciagu(w[k.obciazenia] ?? '');
      if (kwota === null) continue;
      if (k.kwota < 0) kwota = -Math.abs(kwota); // kolumna „Obciążenia” - zawsze wydatek
      const zKwoty = String(w[k.kwota] ?? '').match(/\b([A-Z]{3})\b/)?.[1];
      const kod = (k.waluta >= 0 ? w[k.waluta] : zKwoty || '').toUpperCase();
      // PKO dopisuje szczegóły w kolumnach bez nagłówka - też do opisu.
      const opis = [...k.opis.map((j) => w[j]), ...w.slice(k.szerokosc)].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 500);
      operacje.push({ data, kwota, waluta: WALUTY.includes(kod) ? kod : 'PLN', opis });
    }
    if (operacje.length) return operacje;
  }
  return null;
}

// --- odbiorca z opisu -----------------------------------------------------------------------------

const ETYKIETY = /\b(tytul|tytuł|lokalizacja|adres|miasto|kraj|numer karty|nr karty|data wykonania|data i czas operacji|oryginalna kwota operacji|numer telefonu|nazwa odbiorcy|odbiorca|rachunek odbiorcy|nazwa nadawcy|rachunek nadawcy|operacja|numer referencyjny)\s*:/gi;
const SLOWA_POMIJANE = new Set([
  'platnosc', 'platnosci', 'karta', 'karty', 'karte', 'zakup', 'przy', 'uzyciu', 'blik', 'transakcja', 'bezgotowkowa', 'operacja',
  'card', 'payment', 'purchase', 'to', 'from', 'www', 'http', 'https', 'pln', 'eur', 'usd', 'gbp', 'chf', 'internet', 'mobile',
  'helppay', 'nr', 'numer', 'ref', 'pol', 'pl', 'polska', 'poland', 'com', 'net', 'org', 'ltd', 'inc', 'sp', 'zoo', 'z', 'o', 'oo', 'sa', 'the', 'and', 'w', 'na', 'do',
  'apple', 'google', 'paypal', 'payu', 'przelewy24', 'zlecenie', 'stale', 'przelew', 'wychodzacy', 'krajowy', 'subscription',
]);
// Pośrednicy płatności („GOOGLE *YouTube”, „PAYPAL *SPOTIFY”) - nazwą jest to, co po nich; gdy nic - zostają.
const POSREDNICY = new Set(['apple', 'google', 'paypal', 'payu', 'przelewy24']);

// Słowa odbiorcy z opisu: etykieta „Adres:” / „Nazwa odbiorcy:” (PKO), bez numerów, kwot, dat i słów typu „płatność kartą”.
function slowaOdbiorcy(opis) {
  let s = String(opis);
  const zEtykiety = s.match(/(?:adres|nazwa odbiorcy|odbiorca)\s*:\s*(.+?)(?=\s+[\p{L} ]{2,30}\s*:|$)/iu);
  if (zEtykiety) s = zEtykiety[1];
  s = s.replace(ETYKIETY, ' ');
  const slowa = s.split(/[\s*/\\|,;:()[\]#"']+/).map((w) => w.replace(/\.(com|pl|net|org|io|eu|co)$/i, '').replace(/^[.\-_]+|[.\-_]+$/g, '')).filter(Boolean);
  const dobre = slowa.filter((w) => !/\d/.test(w) && w.length > 1 && !SLOWA_POMIJANE.has(bezZnakow(w)));
  if (dobre.length) return dobre;
  // Same słowa pomijane (np. „GOOGLE *”) - pośrednik jako nazwa.
  return slowa.filter((w) => POSREDNICY.has(bezZnakow(w)));
}

const ladnie = (w) => (w === w.toUpperCase() || w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w);

export function odbiorca(opis) {
  const slowa = slowaOdbiorcy(opis).slice(0, 2);
  return { klucz: slowa.map(bezZnakow).join(' '), nazwa: slowa.map(ladnie).join(' ') };
}

// --- szukanie powtarzających się płatności -------------------------------------------------------

// Odstępy między płatnościami (dni) → okres wpisu.
const OKRESY = [
  { okres: 'T', coIle: 1, od: 6, do: 8 },
  { okres: 'T', coIle: 2, od: 13, do: 15 },
  { okres: 'M', coIle: 1, od: 26, do: 35 },
  { okres: 'M', coIle: 2, od: 56, do: 66 },
  { okres: 'M', coIle: 3, od: 84, do: 98 },
  { okres: 'M', coIle: 6, od: 172, do: 192 },
  { okres: 'R', coIle: 1, od: 350, do: 380 },
];

const dzien = (iso) => Date.parse(iso + 'T12:00:00Z') / DZIEN_MS;
const mediana = (l) => {
  const s = [...l].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// Płatności jednego odbiorcy (po dacie) → okres albo null. Większość odstępów musi pasować do okresu.
function okresPlatnosci(lista) {
  const odstepy = [];
  for (let i = 1; i < lista.length; i++) odstepy.push(dzien(lista[i].data) - dzien(lista[i - 1].data));
  const m = mediana(odstepy);
  const ok = OKRESY.find((o) => m >= o.od && m <= o.do);
  if (!ok) return null;
  const pasuje = odstepy.filter((d) => d >= ok.od - 2 && d <= ok.do + 2).length;
  return pasuje >= Math.max(1, Math.ceil(odstepy.length * 0.6)) ? ok : null;
}

// Grupy o podobnej kwocie (różnica do 15% albo 1 zł) - jeden odbiorca może pobierać kilka subskrypcji.
function grupyKwot(lista) {
  const wgKwoty = [...lista].sort((a, b) => a.kwota - b.kwota);
  const grupy = [];
  for (const p of wgKwoty) {
    const ostatnia = grupy.at(-1);
    if (ostatnia && p.kwota <= ostatnia.at(-1).kwota * 1.15 + 1) ostatnia.push(p);
    else grupy.push([p]);
  }
  return grupy.map((g) => g.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)));
}

const slowaNazwy = (s) => bezZnakow(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

// Pozycja już w zeszycie: wspólne słowo nazwy odbiorcy i nazwy pozycji; część słowa tylko od 5 liter
// („youtubepremium” ↔ „YouTube” tak, „pro” ↔ „Próbny” nie).
const podobne = (a, b) => a === b || (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a)));
function jestWZeszycie(klucz, wpisy) {
  const k = klucz.split(' ').filter((w) => w.length >= 3);
  return wpisy.some((w) => slowaNazwy(w.nazwa).some((s) => k.some((x) => podobne(x, s))));
}

// Propozycje do dopisania: [{ klucz, nazwa, kwota, waluta, okres, coIle, ostatnia, ile, min, max, juzJest, dawno }].
// wpisy - obecne pozycje zeszytu (do oznaczenia „już w zeszycie”).
// anulowane - wykreślone do „Anulowanych”: propozycja z nich nie jest zaznaczona (wAnulowanych).
export function znajdzPowtarzajace(operacje, wpisy = [], anulowane = []) {
  const wydatki = operacje.filter((o) => o.kwota < 0).map((o) => ({ ...o, kwota: -o.kwota, ...odbiorca(o.opis) })).filter((o) => o.klucz);
  if (!wydatki.length) return [];
  const koniecWyciagu = Math.max(...operacje.map((o) => dzien(o.data)));
  const wgOdbiorcy = new Map();
  for (const o of wydatki) {
    const klucz = o.klucz + '|' + o.waluta;
    if (!wgOdbiorcy.has(klucz)) wgOdbiorcy.set(klucz, []);
    wgOdbiorcy.get(klucz).push(o);
  }
  const propozycje = [];
  for (const lista of wgOdbiorcy.values()) {
    if (lista.length < 2) continue;
    const posortowane = [...lista].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    // Osobno każda kwota (jeden odbiorca, kilka subskrypcji), gdy tak da się wyjaśnić wszystkie płatności;
    // inaczej cała grupa razem (rachunek z kwotą za każdym razem inną, np. prąd), a gdy i to nie - to, co się da.
    let znalezione = grupyKwot(lista).filter((g) => g.length >= 2).map((g) => [g, okresPlatnosci(g)]).filter(([, ok]) => ok);
    const wyjasnione = znalezione.reduce((n, [g]) => n + g.length, 0);
    const calosc = wyjasnione < lista.length ? okresPlatnosci(posortowane) : null;
    if (calosc) znalezione = [[posortowane, calosc]];
    for (const [g, ok] of znalezione) {
      const ostatnia = g.at(-1);
      const kwoty = g.map((p) => p.kwota);
      propozycje.push({
        klucz: ostatnia.klucz,
        nazwa: ostatnia.nazwa,
        kwota: ostatnia.kwota,
        waluta: ostatnia.waluta,
        okres: ok.okres,
        coIle: ok.coIle,
        ostatnia: ostatnia.data,
        ile: g.length,
        min: Math.min(...kwoty),
        max: Math.max(...kwoty),
        juzJest: jestWZeszycie(ostatnia.klucz, wpisy),
        wAnulowanych: !jestWZeszycie(ostatnia.klucz, wpisy) && jestWZeszycie(ostatnia.klucz, anulowane),
        // Od ostatniej płatności minęło ponad półtora okresu do końca wyciągu - pewnie już anulowana.
        dawno: koniecWyciagu - dzien(ostatnia.data) > ok.do * 1.5,
      });
    }
  }
  // Najpierw nowe i aktualne, potem droższe.
  return propozycje.sort((a, b) => (a.juzJest || a.wAnulowanych) - (b.juzJest || b.wAnulowanych) || a.dawno - b.dawno || b.kwota - a.kwota);
}
