// Spisy terminów (roczne i do wycofania) - wspólne dla PC i telefonu.

import { formatujDate, roznicaDni, dzis } from './alarmy.js';
import { waluta, naPln, formatujKwote } from './waluty.js';
import { nazwaWpisu } from './dane.js';
import { t, tn } from './teksty.js';

// Przetłumaczony szablon pocięty na części: {nazwa} zastąpione wartością (tekst, { w } albo lista części).
const czesci = (szablon, wartosci) => szablon.split(/\{(\w+)\}/).flatMap((s, i) => (i % 2 ? wartosci[s] ?? [] : s ? [s] : []));

// Części opisu: zwykły tekst albo { w: tekst } - wyróżnione (data i liczba dni).
function opisAlarmu(a, jednorazowa) {
  if (!a.data) return [t('brak daty zakupu - uzupełnij')];
  const data = { w: formatujDate(a.data) };
  const dni = roznicaDni(dzis(), a.data);
  if (a.poziom === 'minal') return czesci(t('termin minął {data} - sprawdź, czy anulowano'), { data });
  // { n: '{n}' } - liczba zostaje w szablonie, żeby wstawić ją jako wyróżnioną część.
  const za = dni === 0 ? [t('dziś')] : dni === 1 ? [t('jutro')] : czesci(tn(dni, 'za {n} dzień', 'za {n} dni', 'za {n} dni', { n: '{n}' }), { n: { w: String(dni) } });
  return czesci(jednorazowa ? t('wycofaj przed {data} ({kiedy})') : t('płatność {data} ({kiedy})'), { data, kiedy: za });
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
    nazwa.title = nazwa.textContent; // long name is cut with an ellipsis
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
