// Sumy kosztów w pasku na dole.

import { okres, czyZakonczona, parsujDate, formatujDate } from './alarmy.js';
import { naPln, przeliczNaPln, waluta, pobierzKursy } from './waluty.js';

const kwota = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kwotaKursu = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const zl = (n) => kwota.format(n) + ' zł'; // kwota na paragonie z „zł”

export function policz(wpisy) {
  const s = { listaMiesieczne: [], listaRoczne: [], miesieczne: 0, roczne: 0, inneNaMiesiac: 0, jednorazoweIlosc: 0, jednorazoweKoszt: 0, bezOkresu: 0, bezKursu: 0, walutyObce: false, prognozaNaMiesiac: 0, jestPrognoza: false };

  for (const wpis of wpisy) {
    // Wszystkie sumy w złotówkach; waluta obca bez kursu NBP nie wchodzi do sum.
    const pln = naPln(wpis);
    if (waluta(wpis) !== 'PLN' && typeof wpis.koszt === 'number') {
      s.walutyObce = true;
      if (pln === null) s.bezKursu++;
    }
    const koszt = pln ?? 0;
    const ok = okres(wpis);
    if (!ok.typ) s.bezOkresu++;

    // Pozycje paragonu wg nazw; bez kursu NBP pozycja jest na liście, ale poza sumą.
    const pozycjaParagonu = { nazwa: wpis.nazwa.trim() || '(bez nazwy)', pln };

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
    else if (ok.typ === 'I') s.inneNaMiesiac += koszt / ok.miesiecy;

    // Prognoza na miesiąc: jak RAZEM / MIESIĄC, ale z prognozowaną ceną tam, gdzie jest.
    const prognozaPln = przeliczNaPln(wpis.prognoza, waluta(wpis));
    if (prognozaPln !== null) s.jestPrognoza = true;
    const doPrognozy = prognozaPln ?? koszt;
    if (ok.typ) s.prognozaNaMiesiac += doPrognozy / ok.miesiecy;
  }

  s.lacznieMiesiecznie = s.miesieczne + s.roczne / 12 + s.inneNaMiesiac;
  return s;
}

function element(tag, klasa, tekst) {
  const el = document.createElement(tag);
  if (klasa) el.className = klasa;
  if (tekst !== undefined) el.textContent = tekst;
  return el;
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
    const wartosc = p.pln === null ? 'brak kursu' : zl(p.pln);
    linie.push(pozycja(p.nazwa, wartosc, p.wycofanie ? 'paragon__pozycja--wycofanie' : ''));
  }
  linie.push(pozycja(napisSumy, zl(suma), 'paragon__pozycja--podsuma'));
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
  if (s.inneNaMiesiac > 0) linie.push(pozycja('Inny okres /mies.', zl(s.inneNaMiesiac)));
  linie.push(
    element('hr', 'paragon__kreska paragon__kreska--podwojna'),
    pozycja('RAZEM / MIESIĄC', zl(s.lacznieMiesiecznie), 'paragon__pozycja--suma'),
    pozycja('RAZEM / ROK', zl(s.roczne), 'paragon__pozycja--suma'),
  );
  if (s.jestPrognoza) {
    const roznica = Math.round((s.prognozaNaMiesiac - s.lacznieMiesiecznie) * 100) / 100;
    linie.push(
      pozycja('PROGNOZA / MIES.', zl(s.prognozaNaMiesiac), 'paragon__pozycja--suma'),
      element('div', 'paragon__waluta', roznica === 0 ? 'bez zmian' : (roznica > 0 ? 'drożej o ' : 'taniej o ') + kwota.format(Math.abs(roznica)) + ' zł'),
    );
  }
  linie.push(
    element('hr', 'paragon__kreska'),
    pozycja('Do wycofania', s.jednorazoweIlosc + ' szt.', s.jednorazoweIlosc ? 'paragon__pozycja--alarm' : ''),
    pozycja('Ich koszt', zl(s.jednorazoweKoszt), s.jednorazoweIlosc ? 'paragon__pozycja--alarm' : ''),
  );
  if (s.bezOkresu > 0) linie.push(pozycja('Bez okresu (uzupełnij)', s.bezOkresu + ' szt.'));

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
