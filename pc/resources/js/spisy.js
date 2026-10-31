// Spisy terminów (roczne i do wycofania) - wspólne dla PC i telefonu.

import { formatujDate, roznicaDni, dzis } from './alarmy.js';
import { waluta, naPln, formatujKwote } from './waluty.js';
import { nazwaWpisu } from './dane.js';

// Części opisu: zwykły tekst albo { w: tekst } - wyróżnione (data i liczba dni).
function opisAlarmu(a, jednorazowa) {
  if (!a.data) return ['brak daty zakupu - uzupełnij'];
  const data = { w: formatujDate(a.data) };
  const dni = roznicaDni(dzis(), a.data);
  if (a.poziom === 'minal') return ['termin minął ', data, ' - sprawdź, czy anulowano'];
  const za = dni === 0 ? ['dziś'] : dni === 1 ? ['jutro'] : ['za ', { w: String(dni) }, ' dni'];
  return [jednorazowa ? 'wycofaj przed ' : 'płatność ', data, ' (', ...za, ')'];
}

export function wypelnijListe(lista, alarmy, pustyTekst, jednorazowe) {
  if (!alarmy.length) {
    const li = document.createElement('li');
    li.className = 'alarm alarm--pusty';
    li.textContent = pustyTekst;
    lista.replaceChildren(li);
    return;
  }
  // Linia spisu: nazwa ....... termin   kwota
  lista.replaceChildren(...alarmy.map((a) => {
    const li = document.createElement('li');
    li.className = 'alarm' + (a.poziom ? ' alarm--' + a.poziom : '');
    const nazwa = document.createElement('strong');
    nazwa.textContent = nazwaWpisu(a.wpis);
    const kropki = document.createElement('span');
    kropki.className = 'alarm__kropki';
    const opis = document.createElement('span');
    opis.className = 'alarm__opis';
    for (const czesc of opisAlarmu(a, jednorazowe)) {
      if (typeof czesc === 'string') {
        opis.append(czesc);
      } else {
        const wyroznienie = document.createElement('span');
        wyroznienie.className = 'alarm__wyroznienie';
        wyroznienie.textContent = czesc.w;
        opis.append(wyroznienie);
      }
    }
    const koszt = document.createElement('span');
    koszt.className = 'alarm__koszt';
    if (typeof a.wpis.koszt === 'number') {
      const kod = waluta(a.wpis);
      const pln = naPln(a.wpis);
      koszt.textContent = formatujKwote(a.wpis.koszt, kod) + (kod !== 'PLN' && pln !== null ? ' ≈ ' + formatujKwote(pln) : '');
    }
    li.append(nazwa, kropki, opis, koszt);
    return li;
  }));
}
