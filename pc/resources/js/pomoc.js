// F26: pomoc w miejscu (PC i telefon) - małe „?” obwiedzione ołówkiem, jak dopisek na marginesie zeszytu.
// Jedno okienko (popover) na całą stronę; najechanie myszką na „?” (albo fokus z klawiatury) wstawia w nie
// zdanie wyjaśnienia i przykleja je kotwicą CSS do tego „?”. Znika po zjechaniu myszką (można na nie
// najechać, żeby doczytać), po wyjściu fokusu albo po Esc. Tekst przez textContent, tłumaczony (teksty.js).
// Popover „manual” - pokazanie dymka nie zamyka karteczki „⋯”, w której stoi „?”.

import { element } from './dom.js';
import { t } from './teksty.js';

let numer = 0;
let chowanie = 0;

function okno() {
  let el = document.getElementById('pomoc-okno');
  if (!el) {
    el = element('div', 'karteczka pomoc-okno');
    el.id = 'pomoc-okno';
    el.popover = 'manual';
    el.setAttribute('role', 'tooltip');
    el.addEventListener('mouseenter', () => clearTimeout(chowanie));
    el.addEventListener('mouseleave', () => schowaj(el));
    document.body.append(el);
  }
  return el;
}

function schowaj(o, odRazu = false) {
  clearTimeout(chowanie);
  const zamknij = () => { if (o.matches(':popover-open')) o.hidePopover(); };
  if (odRazu) zamknij();
  else chowanie = setTimeout(zamknij, 150);
}

// Podpina „?”: tekst (po polsku - tłumaczony przy pokazaniu) i krótka nazwa do czytnika ekranu.
export function podepnijPomoc(przycisk, tekst, czego) {
  const o = okno();
  const kotwica = `--pomoc-${++numer}`;
  przycisk.type = 'button';
  przycisk.classList.add('pomoc');
  przycisk.style.setProperty('anchor-name', kotwica);
  przycisk.dataset.pomocCzego = czego;
  przycisk.setAttribute('aria-label', t('Co to znaczy: {czego}?', { czego: t(czego) }));
  przycisk.setAttribute('aria-describedby', o.id);
  const pokaz = () => {
    clearTimeout(chowanie);
    o.textContent = t(tekst);
    o.style.setProperty('position-anchor', kotwica);
    if (!o.matches(':popover-open')) o.showPopover();
  };
  przycisk.addEventListener('mouseenter', pokaz);
  przycisk.addEventListener('focus', pokaz);
  przycisk.addEventListener('mouseleave', () => schowaj(o));
  przycisk.addEventListener('blur', () => schowaj(o, true));
  przycisk.addEventListener('keydown', (e) => { if (e.key === 'Escape' && o.matches(':popover-open')) { e.stopPropagation(); schowaj(o, true); } });
  przycisk.addEventListener('click', (e) => {
    e.stopPropagation(); // „?” w nagłówku albo w etykiecie - bez klikania tego, co pod spodem
    pokaz(); // ekran dotykowy - bez najechania myszką
  });
  return przycisk;
}

export const przyciskPomocy = (tekst, czego) => podepnijPomoc(element('button', '', '?'), tekst, czego);

// „?” zapisane w index.html: data-pomoc (tekst) i data-pomoc-czego (nazwa do czytnika ekranu).
export function podepnijPomocStrony() {
  for (const p of document.querySelectorAll('[data-pomoc]')) podepnijPomoc(p, p.dataset.pomoc, p.dataset.pomocCzego);
}

// Po zmianie języka - nazwy do czytnika ekranu od nowa (tekst okienka tłumaczy się przy pokazaniu).
export function przetlumaczPomoc() {
  for (const p of document.querySelectorAll('.pomoc')) p.setAttribute('aria-label', t('Co to znaczy: {czego}?', { czego: t(p.dataset.pomocCzego) }));
  const o = document.getElementById('pomoc-okno');
  if (o) schowaj(o, true);
}
