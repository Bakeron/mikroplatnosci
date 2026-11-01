// Paragon - sumy kosztów w złotówkach.

import { okres, czyZakonczona, parsujDate, formatujDate } from './alarmy.js';
import { naPln, przeliczNaPln, waluta, pobierzKursy, formatujKwote } from './waluty.js';
import { nazwaWpisu } from './dane.js';
import { element } from './dom.js';

const kwotaKursu = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export function policz(wpisy) {
  const s = { listaMiesieczne: [], listaRoczne: [], miesieczne: 0, roczne: 0, jednorazoweIlosc: 0, jednorazoweKoszt: 0, bezKursu: 0, walutyObce: false, prognozaNaMiesiac: 0, jestPrognoza: false };

  for (const wpis of wpisy) {
    // Wszystkie sumy w złotówkach; waluta obca bez kursu NBP nie wchodzi do sum.
    const pln = naPln(wpis);
    if (waluta(wpis) !== 'PLN' && typeof wpis.koszt === 'number') {
      s.walutyObce = true;
      if (pln === null) s.bezKursu++;
    }
    const koszt = pln ?? 0;
    const ok = okres(wpis);

    // Pozycje paragonu wg nazw; bez kursu NBP pozycja jest na liście, ale poza sumą.
    const pozycjaParagonu = { nazwa: nazwaWpisu(wpis), pln, bezKwoty: typeof wpis.koszt !== 'number' };

    if (wpis.przedluzac === 'nie') {
      if (!czyZakonczona(wpis)) {
        s.jednorazoweIlosc++;
        s.jednorazoweKoszt += koszt;
        // Widoczna w swojej sekcji z „!”, ale poza sumą - nie będzie przedłużana.
        const doWycofania = { ...pozycjaParagonu, wycofanie: true };
        if (ok.typ === 'M') s.listaMiesieczne.push(doWycofania);
        else if (ok.typ === 'R') s.listaRoczne.push(doWycofania);
      }
      continue;
    }

    if (ok.typ === 'M') { s.miesieczne += koszt; s.listaMiesieczne.push(pozycjaParagonu); }
    else if (ok.typ === 'R') { s.roczne += koszt; s.listaRoczne.push(pozycjaParagonu); }

    // Prognoza na miesiąc: jak RAZEM / MIESIĄC, ale z prognozowaną ceną tam, gdzie jest.
    const prognozaPln = przeliczNaPln(wpis.prognoza, waluta(wpis));
    if (prognozaPln !== null) s.jestPrognoza = true;
    const doPrognozy = prognozaPln ?? koszt;
    if (ok.typ) s.prognozaNaMiesiac += doPrognozy / ok.miesiecy;
  }

  s.lacznieMiesiecznie = s.miesieczne + s.roczne / 12;
  return s;
}

// Pozycja paragonu: nazwa ....... wartość
function pozycja(nazwa, wartosc, klasa) {
  const el = element('div', 'paragon__pozycja' + (klasa ? ' ' + klasa : ''));
  el.append(element('span', 'paragon__nazwa', nazwa), element('span', 'paragon__kropki'), element('span', 'paragon__kwota', wartosc));
  return el;
}

// Sekcja paragonu: tytuł, pozycje wg nazw i suma.
function sekcja(tytul, lista, napisSumy, suma, pustyTekst) {
  const linie = [element('hr', 'paragon__kreska'), element('div', 'paragon__sekcja', tytul)];
  if (!lista.length) linie.push(element('div', 'paragon__brak', pustyTekst));
  for (const p of lista) {
    const wartosc = p.bezKwoty ? '-' : p.pln === null ? 'brak kursu' : formatujKwote(p.pln);
    if (!p.wycofanie) {
      linie.push(pozycja(p.nazwa, wartosc));
      continue;
    }
    linie.push(pozycja('! ' + p.nazwa, wartosc, 'paragon__pozycja--wycofanie'), element('div', 'paragon__waluta', 'do wycofania - poza sumą'));
  }
  linie.push(pozycja(napisSumy, formatujKwote(suma), 'paragon__pozycja--podsuma'));
  return linie;
}

// Podsumowanie w formie paragonu z kasy.
export function renderujPodsumowanie(kontener, wpisy) {
  const s = policz(wpisy);
  const teraz = new Date();
  const linie = [
    element('div', 'paragon__tytul', 'Podsumowanie'),
    ...sekcja('Miesięczne', s.listaMiesieczne, 'Suma / mies.', s.miesieczne, 'brak - zaznacz MIES. przy dacie zakupu'),
    ...sekcja('Roczne', s.listaRoczne, 'Suma / rok', s.roczne, 'brak - zaznacz ROK przy dacie zakupu'),
  ];
  linie.push(
    element('hr', 'paragon__kreska paragon__kreska--podwojna'),
    pozycja('RAZEM / MIESIĄC', formatujKwote(s.lacznieMiesiecznie), 'paragon__pozycja--suma'),
    pozycja('RAZEM / ROK', formatujKwote(s.lacznieMiesiecznie * 12), 'paragon__pozycja--suma'),
    element('div', 'paragon__waluta', 'miesięczne × 12 + roczne'),
  );
  if (s.jestPrognoza) {
    const roznica = Math.round((s.prognozaNaMiesiac - s.lacznieMiesiecznie) * 100) / 100;
    linie.push(
      pozycja('PROGNOZA / MIES.', formatujKwote(s.prognozaNaMiesiac), 'paragon__pozycja--suma'),
      element('div', 'paragon__waluta', roznica === 0 ? 'bez zmian' : (roznica > 0 ? 'drożej o ' : 'taniej o ') + formatujKwote(Math.abs(roznica))),
    );
  }
  linie.push(
    element('hr', 'paragon__kreska'),
    pozycja('Do wycofania', s.jednorazoweIlosc + ' szt.', s.jednorazoweIlosc ? 'paragon__pozycja--alarm' : ''),
    pozycja('Ich koszt', formatujKwote(s.jednorazoweKoszt), s.jednorazoweIlosc ? 'paragon__pozycja--alarm' : ''),
  );

  const kursy = pobierzKursy();
  if (kursy || s.walutyObce) linie.push(element('hr', 'paragon__kreska'));
  if (kursy) {
    linie.push(
      pozycja('Kurs NBP  USD', kwotaKursu.format(kursy.USD)),
      pozycja('          EUR', kwotaKursu.format(kursy.EUR)),
      element('div', 'paragon__waluta', 'tabela A z dnia ' + formatujDate(parsujDate(kursy.data))),
    );
  }
  if (s.bezKursu > 0) linie.push(pozycja('Bez kursu (poza sumą)', s.bezKursu + ' szt.', 'paragon__pozycja--alarm'));
  linie.push(
    element('hr', 'paragon__kreska'),
    element('div', 'paragon__stopka', teraz.toLocaleDateString('pl-PL') + '  ' + teraz.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })),
    element('div', 'paragon__stopka', '*** pilnuj odnowień ***'),
  );
  kontener.replaceChildren(...linie);
}
