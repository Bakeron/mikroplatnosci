// E23: eksport zeszytu do CSV (Excel) - jeden wiersz na pozycję, także anulowane (z datą anulowania).
// Zawsze średnik i przecinek dziesiętny (tak czyta CSV polski Excel) - także przy angielskim języku aplikacji.
// Znak BOM na początku - Excel rozpoznaje wtedy polskie litery (UTF-8).

import { termin, okres, miesiecznie, nazwaOkresu, czyWstrzymana, isoDnia, parsujDate } from './alarmy.js';
import { przeliczNaPln, waluta } from './waluty.js';
import { formatujKoszt, nazwaKategorii } from './dane.js';
import { t, tekst } from './teksty.js';
import { walutaNastepnej } from './funkcje.js';

const KOLUMNY = [
  tekst('Lp.'), tekst('Nazwa'), tekst('Opis'), tekst('Kategoria'), tekst('Na firmę'), tekst('Koszt'), tekst('Waluta'),
  tekst('Okres'), tekst('Data zakupu'), tekst('Następna płatność'), tekst('Przedłużać'), tekst('Płatność'), tekst('Na ile osób'),
  tekst('Miesięcznie w zł (moja część)'), tekst('Cena następna'), tekst('Waluta ceny następnej'), tekst('Link'), tekst('Stan'),
];

// Komórka bez formuł: tekst zaczynający się od = + - @ Excel wykonałby jako formułę (wstrzyknięcie do CSV) -
// dostaje apostrof z przodu. Separator, cudzysłów i nowa linia - w cudzysłowie.
export function komorkaCsv(v, sep = ';') {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s.includes(sep) || /["\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function stanWpisu(w) {
  if (w.anulowano) return t('anulowana {data}', { data: w.anulowano });
  if (czyWstrzymana(w)) return t('wstrzymana do {data}', { data: w.wstrzymanaDo });
  if (w.przedluzac === 'nie') return t('do wycofania');
  return t('aktywna');
}

export function doCsv(wpisy) {
  const sep = ';';
  const kwota = (v) => formatujKoszt(v).replace('.', ',');
  const tak = (v) => (v ? t('tak') : t('nie'));
  const wiersze = [KOLUMNY.map((k) => t(k))];
  wpisy.forEach((w, i) => {
    const ok = okres(w);
    const pln = przeliczNaPln(w.koszt, waluta(w));
    const naMiesiac = ok.typ && pln !== null ? Math.round((miesiecznie(pln, ok) / (w.osob > 1 ? w.osob : 1)) * 100) / 100 : null;
    const nastepna = w.anulowano || !parsujDate(w.od) ? null : termin(w).data;
    wiersze.push([
      i + 1, w.nazwa, w.opis, nazwaKategorii(w.kategoria), tak(w.firmowa), kwota(w.koszt), waluta(w),
      nazwaOkresu(w), w.od, nastepna ? isoDnia(nastepna) : '', tak(w.przedluzac !== 'nie'), w.platnoscReczna ? t('płacę sam') : t('pobiera się sama'),
      w.osob > 1 ? w.osob : 1, naMiesiac === null ? '' : kwota(naMiesiac), kwota(w.prognoza), w.prognoza === null ? '' : walutaNastepnej(w), w.link, stanWpisu(w),
    ]);
  });
  return '﻿' + wiersze.map((r) => r.map((k) => komorkaCsv(k, sep)).join(sep)).join('\r\n') + '\r\n';
}
