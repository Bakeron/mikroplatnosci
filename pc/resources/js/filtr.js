// D17: filtr nad tabelą - zakładki indeksowe wystające znad kartki: kategorie (z liczbą pozycji)
// i trzy „tylko …” (płacę sam, do wycofania, na firmę). Filtr tylko chowa wiersze - kolejność i dane
// się nie zmieniają; nie jest zapamiętywany (po uruchomieniu widać wszystko).
// Kategorie, które nie mieszczą się w jednym rzędzie (i zawsze na telefonie), zamieniają się w listę
// rozwijaną (select) - autor 18.11.2026.

import { element } from './dom.js';
import { kolejnoscKategorii, nazwaKategorii, oznaczKategorie } from './dane.js';
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
  b.onclick = onKlik; // właściwość, nie addEventListener - przy odświeżeniu w miejscu (niżej) podmienia się obsługę
  return b;
}

// Te same zakładki co przed kliknięciem - zmiana w miejscu, nie nowe przyciski: tylko wtedy wciśnięcie
// przechodzi płynnie (nowy element nie ma „poprzedniego wyglądu”, więc przejścia CSS nie startują).
function odswiezWMiejscu(kontener, nowe) {
  const stare = [...kontener.querySelectorAll('.zakladka')];
  const klucze = (lista) => lista.map((b) => b.dataset.klucz).join('|');
  if (!stare.length || klucze(stare) !== klucze(nowe)) return false;
  stare.forEach((b, i) => {
    b.setAttribute('aria-pressed', nowe[i].getAttribute('aria-pressed'));
    b.onclick = nowe[i].onclick;
    b.replaceChildren(...nowe[i].childNodes);
  });
  return true;
}

// Lista rozwijana zamiast zakładek kategorii: [klucz, napis, ile]; klucz null - wszystkie.
function wyborKategorii(pozycje, f, naZmiane) {
  const wybor = element('select', 'zakladki__wybor');
  wybor.dataset.klucz = 'wybor';
  wybor.setAttribute('aria-label', t('Kategoria'));
  pozycje.forEach(([klucz, napis, ile], i) => {
    const opcja = new Option(`${napis} (${ile})`, String(i)); // wartość = numer - nazwa własnej kategorii może być dowolna
    opcja.selected = klucz === f.kategoria;
    wybor.append(opcja);
  });
  if (f.kategoria !== null) oznaczKategorie(wybor, f.kategoria);
  wybor.onchange = () => naZmiane({ ...f, kategoria: pozycje[Number(wybor.value)]?.[0] ?? null });
  return wybor;
}

// Zakładki kategorii mieszczą się, gdy kategorie i „tylko …” stoją w jednym rzędzie (licznik może zejść niżej).
// Pomiar tylko przy zmianie szerokości i po przerysowaniu - nie przy każdej zmianie wysokości.
const szerokosci = new WeakMap();
function dopasuj(kontener) {
  const kategorie = kontener.querySelector('.zakladki__kategorie');
  if (!kategorie || kontener.hidden || kontener.classList.contains('zakladki--zawsze-wybor')) return;
  szerokosci.set(kontener, kontener.clientWidth);
  kontener.classList.remove('zakladki--wybor');
  const rzad = [...kontener.querySelectorAll('.zakladka')];
  // Dół bez przesunięcia (transform) wciśniętej - zakładki stoją na jednej linii, ale różnią się wysokością.
  const dol = (e) => e.offsetTop + e.offsetHeight;
  const miesci = rzad.every((e) => Math.abs(dol(e) - dol(rzad[0])) < 6);
  kontener.classList.toggle('zakladki--wybor', !miesci);
}
const obserwowane = new WeakSet();
function obserwuj(kontener) {
  if (obserwowane.has(kontener)) return;
  obserwowane.add(kontener);
  new ResizeObserver(() => {
    if (kontener.clientWidth !== szerokosci.get(kontener)) dopasuj(kontener);
  }).observe(kontener);
}

// wpisy: wiersze tabeli (bez anulowanych); widac: ile wierszy pokazuje filtr; naZmiane(nowyFiltr);
// zawszeWybor - kategorie od razu w liście rozwijanej (telefon).
export function renderujFiltr(kontener, wpisy, f, widac, naZmiane, { zawszeWybor = false } = {}) {
  const fokus = kontener.contains(document.activeElement) ? document.activeElement.dataset.klucz : null;
  kontener.hidden = !funkcja('kategorie') || !wpisy.length;
  if (kontener.hidden) {
    kontener.replaceChildren();
    return;
  }
  // Wciśnięcie widać od razu po kliknięciu, a nie dopiero po zgaśnięciu tabeli (zamienPlynnie).
  const wcisnieta = (klucz, nf) => (klucz === 'wszystkie' ? nf.kategoria === null : klucz.startsWith('k-') ? nf.kategoria === klucz.slice(2) : Boolean(nf[klucz.slice(2)]));
  const naZmianeWprost = naZmiane;
  naZmiane = (nf) => {
    for (const b of kontener.querySelectorAll('.zakladka')) b.setAttribute('aria-pressed', String(wcisnieta(b.dataset.klucz, nf)));
    naZmianeWprost(nf);
  };
  const ile = new Map();
  for (const w of wpisy) ile.set(kategoriaWpisu(w), (ile.get(kategoriaWpisu(w)) ?? 0) + 1);
  const kategorie = element('div', 'zakladki__kategorie');
  kategorie.append(zakladka('wszystkie', t('wszystkie'), wpisy.length, f.kategoria === null, 'zakladka--wszystkie', () => naZmiane({ ...f, kategoria: null })));
  const pozycje = [[null, t('wszystkie'), wpisy.length]];
  // Tylko kategorie, które są w zeszycie (i wybrana, nawet gdy już pusta - żeby dało się ją odznaczyć).
  const klucze = kolejnoscKategorii([...ile.keys(), ...(f.kategoria ? [f.kategoria] : [])]);
  for (const klucz of [...klucze, '']) {
    if (!ile.has(klucz) && f.kategoria !== klucz) continue;
    if (klucz === '' && ile.size < 2 && f.kategoria !== '') continue; // same „bez kategorii” - nic nie wnosi
    const napis = klucz ? nazwaKategorii(klucz) : t('bez kategorii');
    pozycje.push([klucz, napis, ile.get(klucz) ?? 0]);
    const z = zakladka('k-' + klucz, napis, ile.get(klucz) ?? 0, f.kategoria === klucz, '', () => naZmiane({ ...f, kategoria: f.kategoria === klucz ? null : klucz }));
    oznaczKategorie(z, klucz);
    kategorie.append(z);
  }
  kategorie.append(wyborKategorii(pozycje, f, naZmiane));
  const tylko = element('div', 'zakladki__tylko');
  tylko.append(element('span', 'zakladki__etykieta', t('tylko:')));
  for (const [klucz, nazwa, dostepne] of TYLKO) {
    // albo-albo (autor 12.11.2026): włączenie jednego „tylko” wyłącza pozostałe
    if (dostepne()) tylko.append(zakladka('t-' + klucz, t(nazwa), null, f[klucz], 'zakladka--tylko', () => naZmiane({ ...f, reczne: false, wycofanie: false, firma: false, [klucz]: !f[klucz] })));
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
  kontener.classList.toggle('zakladki--zawsze-wybor', zawszeWybor);
  if (odswiezWMiejscu(kontener, [...kategorie.children, ...tylko.children].filter((e) => e.matches('.zakladka')))) {
    kontener.querySelector('.zakladki__licznik').replaceWith(licznik);
    kontener.querySelector('.zakladki__wybor').replaceWith(kategorie.querySelector('.zakladki__wybor'));
  } else kontener.replaceChildren(kategorie, tylko, licznik);
  dopasuj(kontener);
  obserwuj(kontener);
  if (fokus && !kontener.contains(document.activeElement)) (kontener.querySelector(`[data-klucz="${CSS.escape(fokus)}"]`) ?? kontener.querySelector('.zakladka'))?.focus();
}
