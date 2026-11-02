// D17: filtr nad tabelą - zakładki indeksowe wystające znad kartki: kategorie (z liczbą pozycji)
// i trzy „tylko …” (płacę sam, do wycofania, na firmę). Filtr tylko chowa wiersze - kolejność i dane
// się nie zmieniają; nie jest zapamiętywany (po uruchomieniu widać wszystko).

import { element } from './dom.js';
import { KATEGORIE } from './dane.js';
import { funkcja, kategoriaWpisu, reczna, firmowa } from './funkcje.js';
import { t, tekst } from './teksty.js';

// kategoria: null - wszystkie, '' - bez kategorii, klucz - ta kategoria.
export const pustyFiltr = () => ({ kategoria: null, reczne: false, wycofanie: false, firma: false });

const TYLKO = [
  ['reczne', tekst('płacę sam'), () => funkcja('platnosc')],
  ['wycofanie', tekst('do wycofania'), () => true],
  ['firma', tekst('na firmę'), () => funkcja('firma')],
];

export const czyPusty = (f) => f.kategoria === null && !f.reczne && !f.wycofanie && !f.firma;

export function pasuje(wpis, f) {
  if (f.kategoria !== null && kategoriaWpisu(wpis) !== f.kategoria) return false;
  if (f.reczne && !reczna(wpis)) return false;
  if (f.wycofanie && wpis.przedluzac !== 'nie') return false;
  if (f.firma && !firmowa(wpis)) return false;
  return true;
}

// Filtr bez wyłączonych funkcji (np. „tylko na firmę” po wyłączeniu „Firmowe i prywatne”).
export function poprawFiltr(f) {
  if (!funkcja('kategorie')) return pustyFiltr();
  return { ...f, reczne: f.reczne && funkcja('platnosc'), firma: f.firma && funkcja('firma') };
}

function zakladka(klucz, napis, ile, wcisnieta, klasa, onKlik) {
  const b = element('button', 'zakladka' + (klasa ? ' ' + klasa : ''));
  b.type = 'button';
  b.dataset.klucz = klucz; // po przerysowaniu fokus wraca na tę samą zakładkę
  b.setAttribute('aria-pressed', String(wcisnieta));
  b.append(element('span', 'zakladka__napis', napis));
  if (ile !== null) b.append(element('span', 'zakladka__ile', String(ile)));
  b.addEventListener('click', onKlik);
  return b;
}

// wpisy: wiersze tabeli (bez anulowanych); widac: ile wierszy pokazuje filtr; naZmiane(nowyFiltr).
export function renderujFiltr(kontener, wpisy, f, widac, naZmiane) {
  const fokus = kontener.contains(document.activeElement) ? document.activeElement.dataset.klucz : null;
  kontener.hidden = !funkcja('kategorie') || !wpisy.length;
  if (kontener.hidden) {
    kontener.replaceChildren();
    return;
  }
  const ile = new Map();
  for (const w of wpisy) ile.set(kategoriaWpisu(w), (ile.get(kategoriaWpisu(w)) ?? 0) + 1);
  const kategorie = element('div', 'zakladki__kategorie');
  kategorie.append(zakladka('wszystkie', t('wszystkie'), wpisy.length, f.kategoria === null, 'zakladka--wszystkie', () => naZmiane({ ...f, kategoria: null })));
  // Tylko kategorie, które są w zeszycie (i wybrana, nawet gdy już pusta - żeby dało się ją odznaczyć).
  for (const [klucz, nazwa] of [...KATEGORIE, ['', tekst('bez kategorii')]]) {
    if (!ile.has(klucz) && f.kategoria !== klucz) continue;
    if (klucz === '' && ile.size < 2 && f.kategoria !== '') continue; // same „bez kategorii” - nic nie wnosi
    const z = zakladka('k-' + klucz, t(nazwa), ile.get(klucz) ?? 0, f.kategoria === klucz, '', () => naZmiane({ ...f, kategoria: f.kategoria === klucz ? null : klucz }));
    z.dataset.kategoria = klucz;
    kategorie.append(z);
  }
  const tylko = element('div', 'zakladki__tylko');
  tylko.append(element('span', 'zakladki__etykieta', t('tylko:')));
  for (const [klucz, nazwa, dostepne] of TYLKO) {
    if (dostepne()) tylko.append(zakladka('t-' + klucz, t(nazwa), null, f[klucz], 'zakladka--tylko', () => naZmiane({ ...f, [klucz]: !f[klucz] })));
  }
  const licznik = element('span', 'zakladki__licznik');
  licznik.setAttribute('aria-live', 'polite');
  if (!czyPusty(f)) {
    licznik.append(widac ? t('widać {n} z {razem}', { n: widac, razem: wpisy.length }) : t('nic nie pasuje do filtra'));
    const wyczysc = element('button', 'przycisk-tekst zakladki__wyczysc', t('pokaż wszystko'));
    wyczysc.type = 'button';
    wyczysc.dataset.klucz = 'wszystkie';
    wyczysc.addEventListener('click', () => naZmiane(pustyFiltr()));
    licznik.append(' ', wyczysc);
  }
  kontener.replaceChildren(kategorie, tylko, licznik);
  if (fokus) (kontener.querySelector(`[data-klucz="${CSS.escape(fokus)}"]`) ?? kontener.querySelector('.zakladka'))?.focus();
}
