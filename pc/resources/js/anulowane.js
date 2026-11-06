// C15: „Anulowane” pod tabelą albo listą (PC i telefon) - wykreślone pozycje z datą anulowania, kosztem rocznym,
// przyciskiem „przywróć” i „usuń na zawsze”. Zwinięte (details) - w nagłówku liczba i ile rocznie oszczędzasz.

import { element } from './dom.js';
import { formatujDate, parsujDate } from './alarmy.js';
import { formatujKwote } from './waluty.js';
import { nazwaWpisu } from './dane.js';
import { oszczednoscRoczna } from './podsumowanie.js';
import { funkcja, anulowana } from './funkcje.js';
import { t, tn } from './teksty.js';

// kontener: <details id="anulowane">; zdarzenia: naPrzywroc(wpis), naUsun(wpis).
export function renderujAnulowane(kontener, wpisy, { naPrzywroc, naUsun }) {
  const lista = wpisy.filter(anulowana).sort((a, b) => (a.anulowano < b.anulowano ? 1 : -1)); // najnowsze na górze
  kontener.hidden = !funkcja('archiwum') || !lista.length;
  if (kontener.hidden) {
    kontener.replaceChildren();
    return;
  }
  const otwarte = kontener.open;
  const suma = lista.reduce((s, w) => s + oszczednoscRoczna(w), 0);
  const naglowek = element('summary', 'anulowane__naglowek');
  naglowek.append(
    element('span', 'anulowane__tytul', t('Anulowane')),
    element('span', 'anulowane__ile', tn(lista.length, '{n} pozycja', '{n} pozycje', '{n} pozycji')),
    element('span', 'anulowane__oszczednosc', t('oszczędzasz {kwota} / rok', { kwota: formatujKwote(suma) })),
  );
  const ul = element('ul', 'anulowane__lista');
  for (const w of lista) {
    const li = element('li', 'anulowane__pozycja');
    const rok = oszczednoscRoczna(w);
    const opis = [t('anulowano {data}', { data: formatujDate(parsujDate(w.anulowano)) })];
    if (rok) opis.push(t('{kwota} / rok', { kwota: formatujKwote(rok) }));
    const przywroc = element('button', 'przycisk-tekst anulowane__przycisk', t('przywróć'));
    przywroc.type = 'button';
    przywroc.title = t('Wraca do tabeli na swoje miejsce, z tymi samymi danymi');
    przywroc.addEventListener('click', () => naPrzywroc(w));
    const usun = element('button', 'przycisk-tekst anulowane__przycisk anulowane__przycisk--usun', t('usuń na zawsze'));
    usun.type = 'button';
    usun.addEventListener('click', () => naUsun(w));
    li.append(element('s', 'anulowane__nazwa', nazwaWpisu(w)), element('span', 'anulowane__opis', opis.join(' · ')), przywroc, usun);
    ul.append(li);
  }
  kontener.replaceChildren(naglowek, ul);
  kontener.open = otwarte;
}
