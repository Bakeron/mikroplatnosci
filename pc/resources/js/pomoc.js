// F26: pomoc w miejscu (tylko PC) - małe „?” obwiedzione ołówkiem, jak dopisek na marginesie zeszytu.
// Jedno okienko (popover) na całą stronę; kliknięcie „?” wstawia w nie zdanie wyjaśnienia i przykleja je
// kotwicą CSS do tego „?”. Zamyka je Esc albo kliknięcie obok. Tekst przez textContent, tłumaczony (teksty.js).

import { element } from './dom.js';
import { t } from './teksty.js';

let numer = 0;

function okno() {
  let el = document.getElementById('pomoc-okno');
  if (!el) {
    el = element('div', 'karteczka pomoc-okno');
    el.id = 'pomoc-okno';
    el.popover = 'auto';
    el.setAttribute('role', 'note');
    document.body.append(el);
  }
  return el;
}

// Podpina „?”: tekst (po polsku - tłumaczony przy otwarciu) i krótka nazwa do czytnika ekranu.
export function podepnijPomoc(przycisk, tekst, czego) {
  const o = okno();
  const kotwica = `--pomoc-${++numer}`;
  przycisk.type = 'button';
  przycisk.classList.add('pomoc');
  przycisk.style.setProperty('anchor-name', kotwica);
  przycisk.popoverTargetElement = o;
  przycisk.dataset.pomocCzego = czego;
  przycisk.setAttribute('aria-label', t('Co to znaczy: {czego}?', { czego: t(czego) }));
  przycisk.addEventListener('click', (e) => {
    e.stopPropagation(); // „?” w nagłówku albo w etykiecie - bez klikania tego, co pod spodem
    o.textContent = t(tekst);
    o.style.setProperty('position-anchor', kotwica);
  });
  return przycisk;
}

export const przyciskPomocy = (tekst, czego) => podepnijPomoc(element('button', '', '?'), tekst, czego);

// „?” zapisane w index.html: data-pomoc (tekst) i data-pomoc-czego (nazwa do czytnika ekranu).
export function podepnijPomocStrony() {
  for (const p of document.querySelectorAll('[data-pomoc]')) podepnijPomoc(p, p.dataset.pomoc, p.dataset.pomocCzego);
}

// Po zmianie języka - nazwy do czytnika ekranu od nowa (tekst okienka tłumaczy się przy otwarciu).
export function przetlumaczPomoc() {
  for (const p of document.querySelectorAll('.pomoc')) p.setAttribute('aria-label', t('Co to znaczy: {czego}?', { czego: t(p.dataset.pomocCzego) }));
  const o = document.getElementById('pomoc-okno');
  if (o?.matches(':popover-open')) o.hidePopover();
}
