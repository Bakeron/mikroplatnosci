// E24: okno „Z wyciągu bankowego” - lista powtarzających się płatności (wyciag.js) z polami do zaznaczenia.
// Nazwę można poprawić przed dopisaniem. Treść przez textContent (element z dom.js) - opisy z banku to dane z zewnątrz.

import { element, krzyzykOkna } from './dom.js';
import { formatujDate, parsujDate, nazwaOkresu } from './alarmy.js';
import { formatujKwote } from './waluty.js';
import { t, tn } from './teksty.js';

// info: { plik, operacji, od, do } (od / do - RRRR-MM-DD); naDopisz(wybrane) - wybrane propozycje z poprawioną nazwą.
export function pokazWyciag(propozycje, info, naDopisz) {
  document.getElementById('okno-wyciag')?.remove();
  const okno = element('dialog', 'okno okno--szersze okno--wyciag');
  okno.id = 'okno-wyciag';
  okno.setAttribute('closedby', 'any'); // kliknięcie w tło obok okna zamyka je (jak Esc)
  okno.setAttribute('aria-labelledby', 'wyciag-tytul');
  const tytul = element('h2', 'okno__tytul', t('Z wyciągu bankowego'));
  tytul.id = 'wyciag-tytul';
  const zakres = info.od && info.do ? ` (${formatujDate(parsujDate(info.od))} - ${formatujDate(parsujDate(info.do))})` : '';
  okno.append(
    tytul,
    element('p', 'okno__uwaga', tn(info.operacji, '„{plik}”: {n} operacja{zakres}. Liczone tylko na tym urządzeniu - plik nigdzie nie wychodzi.', '„{plik}”: {n} operacje{zakres}. Liczone tylko na tym urządzeniu - plik nigdzie nie wychodzi.', '„{plik}”: {n} operacji{zakres}. Liczone tylko na tym urządzeniu - plik nigdzie nie wychodzi.', { plik: info.plik, zakres })),
  );

  const wybrane = new Set();
  const nazwy = new Map();
  const dopisz = element('button', 'pieczatka', '');
  dopisz.type = 'button';
  const odswiezPrzycisk = () => {
    dopisz.textContent = t('Dopisz zaznaczone ({n})', { n: wybrane.size });
    dopisz.disabled = !wybrane.size;
  };

  if (!propozycje.length) {
    okno.append(element('p', 'okno__tekst', t('Nie znalazłem płatności, które się powtarzają. Wyciąg powinien obejmować co najmniej 2-3 miesiące (płatności roczne - ponad rok).')));
  } else {
    const ul = element('ul', 'wyciag');
    for (const p of propozycje) {
      const li = element('li', 'wyciag__pozycja' + (p.juzJest || p.dawno ? ' wyciag__pozycja--uwaga' : ''));
      const pole = element('input');
      pole.type = 'checkbox';
      pole.checked = !p.juzJest && !p.dawno;
      if (pole.checked) wybrane.add(p);
      const nazwa = element('input', 'pole wyciag__nazwa');
      nazwa.type = 'text';
      nazwa.maxLength = 200;
      nazwa.value = p.nazwa;
      nazwa.spellcheck = false;
      nazwa.setAttribute('aria-label', t('Nazwa pozycji'));
      nazwa.addEventListener('input', () => nazwy.set(p, nazwa.value));
      pole.setAttribute('aria-label', t('Dopisz: {nazwa}', { nazwa: p.nazwa }));
      pole.addEventListener('change', () => {
        if (pole.checked) wybrane.add(p);
        else wybrane.delete(p);
        odswiezPrzycisk();
      });
      const kwota = p.max - p.min > 0.01 ? `${formatujKwote(p.min, p.waluta)} - ${formatujKwote(p.max, p.waluta)}` : formatujKwote(p.kwota, p.waluta);
      const opis = [kwota, nazwaOkresu(p), tn(p.ile, '{n} płatność', '{n} płatności', '{n} płatności'), t('ostatnio {data}', { data: formatujDate(parsujDate(p.ostatnia)) })];
      const uwagi = [];
      if (p.juzJest) uwagi.push(t('chyba już jest w zeszycie'));
      if (p.dawno) uwagi.push(t('dawno nie było płatności - może już anulowana'));
      if (p.max - p.min > 0.01) uwagi.push(t('kwota za każdym razem inna - wpiszę ostatnią'));
      const teksty = element('div', 'wyciag__teksty');
      teksty.append(nazwa, element('span', 'wyciag__opis', opis.join(' · ')));
      if (uwagi.length) teksty.append(element('span', 'wyciag__uwaga', uwagi.join(' · ')));
      li.append(pole, teksty);
      ul.append(li);
    }
    okno.append(ul, element('p', 'okno__uwaga', t('Data ostatniej płatności staje się datą zakupu - termin następnej policzy się sam. Sprawdź na liście, czy się zgadza.')));
  }

  const przyciski = element('div', 'okno__przyciski');
  const anuluj = element('button', 'przycisk-tekst', propozycje.length ? t('Anuluj') : t('Zamknij'));
  anuluj.type = 'button';
  anuluj.addEventListener('click', () => okno.close());
  przyciski.append(anuluj);
  if (propozycje.length) {
    odswiezPrzycisk();
    dopisz.addEventListener('click', () => {
      const lista = propozycje.filter((p) => wybrane.has(p)).map((p) => ({ ...p, nazwa: (nazwy.get(p) ?? p.nazwa).trim() || p.nazwa }));
      okno.close();
      naDopisz(lista);
    });
    przyciski.append(dopisz);
  }
  okno.append(przyciski);
  krzyzykOkna(okno, t('Zamknij'));
  okno.addEventListener('close', () => setTimeout(() => okno.remove(), 200)); // po animacji zamykania (wyglad.css)
  document.body.append(okno);
  okno.showModal();
}
