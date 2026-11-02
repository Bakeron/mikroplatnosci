// Dni robocze w Polsce - liczone w kodzie, bez internetu (B8: „zapłać do …” przed weekendem i świętem).
// Przelew zlecony w sobotę, niedzielę albo święto wychodzi dopiero w najbliższy dzień roboczy (sesje
// Elixir tylko w dni robocze), więc płacić trzeba w ostatni dzień roboczy przed takim terminem.

import { t } from './teksty.js';

// Wielkanoc (niedziela) - algorytm Meeusa/Jonesa/Butchera dla kalendarza gregoriańskiego.
export function wielkanoc(rok) {
  const a = rok % 19;
  const b = Math.floor(rok / 100);
  const c = rok % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const miesiac = Math.floor((h + l - 7 * m + 114) / 31);
  const dzien = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(rok, miesiac - 1, dzien);
}

const pamiec = new Map(); // rok -> Set „M-D” (święta liczone raz na rok)

// Dni ustawowo wolne od pracy: stałe daty i święta ruchome (od Wielkanocy). Wigilia - od 2025.
function swietaRoku(rok) {
  if (pamiec.has(rok)) return pamiec.get(rok);
  const klucz = (d) => `${d.getMonth() + 1}-${d.getDate()}`;
  const w = wielkanoc(rok);
  const poWielkanocy = (dni) => new Date(rok, w.getMonth(), w.getDate() + dni);
  const dni = new Set(['1-1', '1-6', '5-1', '5-3', '8-15', '11-1', '11-11', '12-25', '12-26']);
  if (rok >= 2025) dni.add('12-24');
  // Wielkanoc, Poniedziałek Wielkanocny, Zielone Świątki (niedziela), Boże Ciało.
  for (const n of [0, 1, 49, 60]) dni.add(klucz(poWielkanocy(n)));
  pamiec.set(rok, dni);
  return dni;
}

export function czySwieto(data) {
  return swietaRoku(data.getFullYear()).has(`${data.getMonth() + 1}-${data.getDate()}`);
}

export const czyDzienRoboczy = (data) => data.getDay() !== 0 && data.getDay() !== 6 && !czySwieto(data);

// Ten sam dzień, gdy roboczy; inaczej ostatni dzień roboczy przed nim.
export function dzienRoboczyPrzed(data) {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  for (let i = 0; i < 10 && !czyDzienRoboczy(d); i++) d.setDate(d.getDate() - 1);
  return d;
}

// Dlaczego dzień nie jest roboczy - do opisu w powiadomieniu („termin wypada w sobotę”).
export function powodWolnego(data) {
  if (data.getDay() === 6) return t('w sobotę');
  if (data.getDay() === 0) return t('w niedzielę');
  return czySwieto(data) ? t('w święto') : '';
}
