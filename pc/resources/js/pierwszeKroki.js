// F25 „Pierwsze kroki” (PC i telefon): 3-5 dymków przy pierwszym uruchomieniu - karteczka przy wskazanym
// miejscu i obwódka „ołówkiem” wokół niego, „Pomiń” / „Dalej”. Klawiatura: strzałki i Enter - dalej / wstecz,
// Esc - pomiń. Telefon: „Wstecz” Androida kończy (aplikacja.js woła zamknijPierwszeKroki).
// Nie zasłania aplikacji przyciemnieniem - można dalej klikać; położenie liczone co klatkę, więc dymek idzie za
// przewijaniem i zmianą rozmiaru okna (tylko póki dymek jest otwarty).
// Treść przez textContent (element z dom.js) - bez innerHTML.

import { element } from './dom.js';
import { t } from './teksty.js';

const ODSTEP = 14; // od wskazanego miejsca do dymka (miejsce na „ogonek”)
const MARGINES = 12; // od brzegu okna
const bezRuchu = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let biezace = null;

// Wskazane miejsce na środek najbliższego przewijanego kontenera (kartka zeszytu, lista na telefonie) - tylko
// gdy go nie widać w całości. Nie scrollIntoView: to przewijało też całą stronę (telefon ma body z
// overflow: hidden - strony nie da się potem przewinąć z powrotem).
function przewinDo(cel) {
  let p = cel.parentElement;
  // Kontener, który naprawdę przewija się w pionie (ramka tabeli ma overflow tylko w bok).
  while (p && p !== document.body && !(/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight)) p = p.parentElement;
  if (!p || p === document.body) return;
  const r = cel.getBoundingClientRect();
  const rp = p.getBoundingClientRect();
  if (r.top >= rp.top && r.bottom <= rp.bottom) return;
  p.scrollBy({ top: r.top - rp.top - Math.max((rp.height - r.height) / 2, 0), behavior: bezRuchu() ? 'auto' : 'smooth' });
}

export const czyPierwszeKroki = () => biezace !== null;
export const zamknijPierwszeKroki = () => biezace?.zakoncz();

// kroki: [{ cel: () => Element | null, tytul, tresc }] - krok bez celu (np. pusta lista) jest pomijany.
// naKoniec() - po „Pomiń”, „Gotowe”, Esc albo „Wstecz”.
export function pokazPierwszeKroki(kroki, naKoniec) {
  biezace?.zakoncz(false);
  const lista = kroki.filter((k) => k.cel());
  if (!lista.length) {
    naKoniec();
    return;
  }

  const obwodka = element('div', 'kroki-obwodka');
  obwodka.setAttribute('aria-hidden', 'true');
  const dymek = element('div', 'kroki-dymek');
  dymek.setAttribute('role', 'dialog');
  dymek.setAttribute('aria-labelledby', 'kroki-tytul');
  dymek.setAttribute('aria-describedby', 'kroki-tresc');
  const licznik = element('p', 'kroki-dymek__licznik');
  const tytul = element('h2', 'kroki-dymek__tytul');
  tytul.id = 'kroki-tytul';
  const tresc = element('p', 'kroki-dymek__tresc');
  tresc.id = 'kroki-tresc';
  const pomin = element('button', 'przycisk-tekst kroki-dymek__pomin', t('Pomiń'));
  pomin.type = 'button';
  const dalej = element('button', 'przycisk-tekst kroki-dymek__dalej');
  dalej.type = 'button';
  const przyciski = element('div', 'kroki-dymek__przyciski');
  przyciski.append(pomin, dalej);
  dymek.append(licznik, tytul, tresc, przyciski);
  document.body.append(obwodka, dymek);

  let nr = 0;
  let klatka = 0;
  let zmiana = 0;

  function poloz() {
    klatka = requestAnimationFrame(poloz);
    const cel = lista[nr].cel();
    if (!cel?.isConnected) return;
    const r = cel.getBoundingClientRect();
    Object.assign(obwodka.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    const w = dymek.offsetWidth;
    const h = dymek.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = innerHeight;
    // Pod wskazanym miejscem, a gdy się nie mieści - nad nim; w ostateczności przy brzegu okna.
    let top = r.bottom + ODSTEP;
    let nad = false;
    if (top + h > vh - MARGINES && r.top - ODSTEP - h >= MARGINES) {
      top = r.top - ODSTEP - h;
      nad = true;
    }
    top = Math.min(Math.max(top, MARGINES), vh - h - MARGINES);
    const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, MARGINES), vw - w - MARGINES);
    dymek.style.left = `${left}px`;
    dymek.style.top = `${top}px`;
    dymek.classList.toggle('kroki-dymek--nad', nad);
    // „Ogonek” wskazuje środek miejsca (w granicach dymka).
    dymek.style.setProperty('--ogonek', `${Math.min(Math.max(r.left + r.width / 2 - left, 18), w - 18)}px`);
  }

  function ustaw() {
    const krok = lista[nr];
    licznik.textContent = t('Pierwsze kroki · {nr} z {ile}', { nr: nr + 1, ile: lista.length });
    tytul.textContent = krok.tytul;
    tresc.textContent = krok.tresc;
    dalej.textContent = nr === lista.length - 1 ? t('Gotowe') : t('Dalej') + ' →';
    const cel = krok.cel();
    if (cel) przewinDo(cel);
    dalej.focus({ preventScroll: true });
  }

  // Po kolei, nie przenikaniem: stary dymek gaśnie, potem pojawia się nowy (przy „ogranicz ruch” - od razu).
  function idz(o) {
    const nowy = nr + o;
    if (nowy < 0) return;
    if (nowy >= lista.length) {
      zakoncz();
      return;
    }
    clearTimeout(zmiana);
    if (bezRuchu()) {
      nr = nowy;
      ustaw();
      return;
    }
    dymek.classList.add('kroki-dymek--zgas');
    obwodka.classList.add('kroki-obwodka--zgas');
    zmiana = setTimeout(() => {
      nr = nowy;
      ustaw();
      dymek.classList.remove('kroki-dymek--zgas');
      obwodka.classList.remove('kroki-obwodka--zgas');
    }, 160);
  }

  function klawisz(e) {
    // Pisanie w polu aplikacji (strzałki w tekście, Esc w polu) zostaje polu.
    // Otwarte okno (ustawienia, edycja) - klawisze należą do niego.
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') zakoncz();
    else if (e.key === 'ArrowRight' || (e.key === 'Enter' && e.target === document.body)) idz(1);
    else if (e.key === 'ArrowLeft') idz(-1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  function zakoncz(powiadom = true) {
    if (biezace !== sterowanie) return;
    biezace = null;
    cancelAnimationFrame(klatka);
    clearTimeout(zmiana);
    document.removeEventListener('keydown', klawisz, true);
    const usun = () => {
      obwodka.remove();
      dymek.remove();
    };
    if (bezRuchu()) usun();
    else {
      dymek.classList.add('kroki-dymek--zgas');
      obwodka.classList.add('kroki-obwodka--zgas');
      setTimeout(usun, 160);
    }
    if (powiadom) naKoniec();
  }

  const sterowanie = { zakoncz };
  biezace = sterowanie;
  pomin.addEventListener('click', () => zakoncz());
  dalej.addEventListener('click', () => idz(1));
  document.addEventListener('keydown', klawisz, true);
  ustaw();
  poloz();
}
