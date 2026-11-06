// Teksty w kilku językach (F27). Kluczem jest tekst polski (jak w gettext): kod zostaje czytelny,
// a tłumaczenia leżą w jednym pliku na język (teksty-en.js). Brak tłumaczenia = tekst polski.
// Parametry w nawiasach klamrowych: t('Zapłać: {nazwa}', { nazwa }). Wspólne z telefonem.

import EN from './teksty-en.js';

export const JEZYKI = [['pl', 'Polski'], ['en', 'English']];
const SLOWNIKI = { en: EN };

let biezacy = 'pl';

export const jezyk = () => biezacy;
export const poprawnyJezyk = (j) => (JEZYKI.some(([k]) => k === j) ? j : '');

// Język z ustawień, a gdy nie ustawiony - język systemu (polski Windows = polski, inny = angielski).
export function ustawJezyk(j) {
  biezacy = poprawnyJezyk(j) || (String(globalThis.navigator?.language || 'pl').toLowerCase().startsWith('pl') ? 'pl' : 'en');
  return biezacy;
}

// Ustawienia regionalne do dat i liczb: angielski z datą „2 Nov 2026” (bez pomyłki dzień / miesiąc).
export const region = () => (biezacy === 'en' ? 'en-GB' : 'pl-PL');

const wstaw = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s);

export function t(tekst, parametry) {
  const s = SLOWNIKI[biezacy]?.[tekst];
  return wstaw(typeof s === 'string' ? s : tekst, parametry);
}

// Znacznik tekstu w stałych (listy opcji, nazwy funkcji): stała zostaje po polsku, a tłumaczy się dopiero
// przy wyświetleniu - t(stala). Dzięki znacznikowi test słownika (grupa-f-anulowane.test.mjs) widzi te teksty.
export const tekst = (s) => s;

// Liczba mnoga: polskie trzy formy (1 dzień, 2 dni, 5 dni); {n} = liczba. W słowniku pod pierwszą formą
// leżą formy danego języka: [jeden, wiele].
function formaPolska(n) {
  const d = n % 10;
  const s = n % 100;
  if (n === 1) return 0;
  return d >= 2 && d <= 4 && (s < 12 || s > 14) ? 1 : 2;
}
export function tn(n, jeden, kilka, wiele, parametry = {}) {
  const obce = SLOWNIKI[biezacy]?.[jeden];
  const s = Array.isArray(obce) ? obce[n === 1 ? 0 : 1] : [jeden, kilka, wiele][formaPolska(n)];
  return wstaw(s, { n, ...parametry });
}

// Gotowe formatery (tworzenie przy każdym wywołaniu jest ok. 50 razy wolniejsze) - osobno dla każdego języka.
const formatery = new Map();
function formater(rodzaj, opcje) {
  const klucz = biezacy + '|' + rodzaj;
  if (!formatery.has(klucz)) formatery.set(klucz, rodzaj.startsWith('l') ? new Intl.NumberFormat(region(), opcje) : new Intl.DateTimeFormat(region(), opcje));
  return formatery.get(klucz);
}

// Liczba z ustaloną liczbą miejsc po przecinku (separator wg języka: 12,50 / 12.50).
export const liczba = (n, miejsca = 2) => formater('l' + miejsca, { minimumFractionDigits: miejsca, maximumFractionDigits: miejsca }).format(n);
// Liczba bez zer na końcu (prowizja 2,5%).
export const liczbaKrotka = (n) => formater('lk', { maximumFractionDigits: 2 }).format(n);
// Data: 02.11.2026 / 2 Nov 2026.
export const data = (d) => (biezacy === 'en' ? formater('dk', { day: 'numeric', month: 'short', year: 'numeric' }) : formater('dk', { day: '2-digit', month: '2-digit', year: 'numeric' })).format(d);
export const dataDluga = (d) => formater('dd', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
export const godzina = (d) => formater('dg', { hour: '2-digit', minute: '2-digit' }).format(d);
export const miesiac = (d, dlugosc = 'long') => formater('dm' + dlugosc, { month: dlugosc }).format(d);
// Miesiąc bez dnia w mianowniku („listopad 2026”, nie „listopada”).
export const miesiacRok = (d) => formater('dmr', { month: 'long', year: 'numeric' }).format(d);

// --- tłumaczenie gotowej strony (index.html) ------------------------------
// Teksty w HTML zostają po polsku; tu każdy tekst (poza <code>) i atrybut tłumaczony wg słownika. Oryginał zapamiętany,
// więc zmiana języka w trakcie (także z powrotem na polski) działa bez przeładowania okna.

const ATRYBUTY = ['title', 'aria-label', 'placeholder'];
const oryginalyTekstow = new WeakMap();
const oryginalyAtrybutow = new WeakMap();
const zLiterami = /\p{L}/u;

export function przetlumaczStrone(korzen = document.body) {
  const spacer = document.createTreeWalker(korzen, NodeFilter.SHOW_TEXT);
  for (let w = spacer.nextNode(); w; w = spacer.nextNode()) {
    if (w.parentElement?.closest('script, style, code, [data-bez-tlumaczenia]')) continue;
    if (!oryginalyTekstow.has(w)) {
      if (!zLiterami.test(w.data)) continue;
      oryginalyTekstow.set(w, w.data);
    }
    const oryginal = oryginalyTekstow.get(w);
    const [, przed, srodek, po] = oryginal.match(/^(\s*)([\s\S]*?)(\s*)$/);
    w.data = przed + t(srodek.replace(/\s+/g, ' ')) + po;
  }
  for (const el of korzen.querySelectorAll(ATRYBUTY.map((a) => `[${a}]`).join(','))) {
    if (el.closest('[data-bez-tlumaczenia]')) continue;
    let zapamietane = oryginalyAtrybutow.get(el);
    if (!zapamietane) oryginalyAtrybutow.set(el, (zapamietane = {}));
    for (const a of ATRYBUTY) {
      if (!el.hasAttribute(a)) continue;
      if (!(a in zapamietane)) zapamietane[a] = el.getAttribute(a);
      if (zLiterami.test(zapamietane[a])) el.setAttribute(a, t(zapamietane[a]));
    }
  }
}
