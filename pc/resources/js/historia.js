// Historia wydatków: ile poszło w miesiącach wybranego roku, na co najwięcej i jak zmieniały się ceny.
// Wpłaty „płacę sam” zaznaczone jako zapłacone - dokładne (kwota i dzień z historii); pozostałe - szacunek
// z daty zakupu, okresu i historii cen. Usunięte na zawsze nie są liczone, anulowane - do dnia anulowania.
// Kwoty obce po obecnym kursie.

import { dniPlatnosci, isoDnia, parsujDate, dzis, formatujDate } from './alarmy.js';
import { przeliczNaPln, waluta, formatujKwote } from './waluty.js';
import { nazwaWpisu, formatujKoszt } from './dane.js';
import { element } from './dom.js';
import { osobWpisu } from './funkcje.js';
import { t, tn, miesiac } from './teksty.js';

// Nazwy miesięcy w języku aplikacji (teksty.js): krótkie „sty”, pełne z wielkiej litery „Styczeń”.
const nazwaMiesiaca = (rok, i) => miesiac(new Date(rok, i, 1), 'short');
const nazwaMiesiacaPelna = (rok, i) => {
  const n = miesiac(new Date(rok, i, 1), 'long');
  return n.charAt(0).toUpperCase() + n.slice(1);
};

let wybranyRok = null; // rok na wykresie - zostaje przy odświeżaniu

// Cena obowiązująca w danym dniu (historia cen; pierwsza pozycja z pustym „od” - cena sprzed zmian),
// bez historii - obecny koszt.
export function cenaWDniu(wpis, dzien) {
  const iso = isoDnia(dzien);
  let cena = null;
  for (const c of wpis.ceny ?? []) if (c.od <= iso) cena = c.kwota;
  return cena ?? wpis.koszt;
}

// Wpłaty pozycji w roku: [{ dzien, kwota (waluta wpisu, moja część), dokladna }].
export function wplatyWRoku(wpis, rok) {
  const poczatek = new Date(rok, 0, 1);
  const koniecRoku = new Date(rok, 11, 31);
  // Anulowana (C15) - płatności tylko do dnia anulowania.
  const ostatni = parsujDate(wpis.anulowano) ?? dzis();
  const koniec = koniecRoku < ostatni ? koniecRoku : ostatni;
  if (koniec < poczatek) return [];
  const osob = osobWpisu(wpis);
  const zapisane = new Map((wpis.historia ?? []).map((h) => [h.termin, h]));
  const wynik = [];
  const dodaj = (dzien, kwota, dokladna) => {
    if (dzien >= poczatek && dzien <= koniec && typeof kwota === 'number') wynik.push({ dzien, kwota: kwota / osob, dokladna });
  };
  // Terminy od roku wcześniej - zaległość zapłacona w tym roku liczy się w dniu zapłaty.
  for (const d of dniPlatnosci(wpis, new Date(rok - 1, 0, 1), koniec)) {
    const zapis = zapisane.get(isoDnia(d));
    if (zapis) {
      zapisane.delete(zapis.termin);
      dodaj(parsujDate(zapis.dnia), zapis.kwota, true);
    } else {
      dodaj(d, cenaWDniu(wpis, d), false);
    }
  }
  // Zapisane wpłaty spoza obecnego harmonogramu (np. po zmianie okresu) - też się liczą.
  for (const zapis of zapisane.values()) dodaj(parsujDate(zapis.dnia), zapis.kwota, true);
  return wynik;
}

// Sumy roku w złotówkach: miesiące (z pozycjami), cały rok, pozycje od najdroższej.
export function wydatkiRoku(wpisy, rok) {
  const miesiace = Array.from({ length: 12 }, () => ({ suma: 0, pozycje: new Map() }));
  const pozycje = new Map();
  let bezKursu = 0;
  let szacunek = false;
  for (const wpis of wpisy) {
    const kod = waluta(wpis);
    const nazwa = nazwaWpisu(wpis);
    for (const w of wplatyWRoku(wpis, rok)) {
      const pln = przeliczNaPln(w.kwota, kod);
      if (pln === null) {
        bezKursu++;
        continue;
      }
      if (!w.dokladna) szacunek = true;
      const m = miesiace[w.dzien.getMonth()];
      m.suma += pln;
      m.pozycje.set(nazwa, (m.pozycje.get(nazwa) ?? 0) + pln);
      const p = pozycje.get(wpis.id) ?? { nazwa, suma: 0, ile: 0 };
      p.suma += pln;
      p.ile++;
      pozycje.set(wpis.id, p);
    }
  }
  return {
    miesiace,
    suma: miesiace.reduce((s, m) => s + m.suma, 0),
    pozycje: [...pozycje.values()].sort((a, b) => b.suma - a.suma),
    bezKursu,
    szacunek,
  };
}

// Lata z danymi: od najwcześniejszego zakupu (albo zapisanej wpłaty) do bieżącego.
export function lataHistorii(wpisy) {
  const teraz = dzis().getFullYear();
  let pierwszy = teraz;
  for (const w of wpisy) {
    const zakup = parsujDate(w.od);
    if (zakup) pierwszy = Math.min(pierwszy, zakup.getFullYear());
    for (const h of w.historia ?? []) pierwszy = Math.min(pierwszy, Number(h.dnia.slice(0, 4)));
  }
  return { od: Math.max(pierwszy, teraz - 30), do: teraz };
}

// Zmiany cen: ostatnia zmiana przy każdej pozycji (historia cen) i rozrzut kwot „za każdym razem inna”.
export function zmianyCen(wpisy) {
  const lista = [];
  for (const w of wpisy) {
    const kod = waluta(w);
    const nazwa = nazwaWpisu(w);
    if (w.ceny?.length >= 2) {
      const ost = w.ceny.at(-1);
      const z = w.ceny.at(-2).kwota;
      lista.push({ nazwa, kiedy: ost.od, z, na: ost.kwota, kod, zmian: w.ceny.length - 1 });
    }
    const kwoty = (w.historia ?? []).map((h) => h.kwota);
    if (w.zmiennaKwota && kwoty.length >= 2) {
      lista.push({ nazwa, kiedy: w.historia.at(-1).dnia, min: Math.min(...kwoty), max: Math.max(...kwoty), ostatnio: kwoty.at(-1), kod, wplat: kwoty.length });
    }
  }
  return lista.sort((a, b) => (a.kiedy < b.kiedy ? 1 : -1));
}

// „Ładna” górna granica osi: 1, 2 albo 5 × 10^n.
function granicaOsi(maks) {
  if (maks <= 0) return 100;
  const rzad = 10 ** Math.floor(Math.log10(maks));
  return [1, 2, 5, 10].map((k) => k * rzad).find((g) => g >= maks);
}

function liniaSpisu(nazwa, opis, kwota) {
  const li = element('li', 'alarm');
  li.append(element('strong', '', nazwa), element('span', 'alarm__kropki'), element('span', 'alarm__opis', opis), element('span', 'alarm__koszt', kwota));
  return li;
}

const pusty = (tekst) => {
  const li = element('li', 'alarm alarm--pusty', tekst);
  return li;
};

export function renderujHistorie(kontener, wpisy) {
  const lata = lataHistorii(wpisy);
  if (wybranyRok === null || wybranyRok > lata.do || wybranyRok < lata.od) wybranyRok = lata.do;
  const rok = wybranyRok;
  const w = wydatkiRoku(wpisy, rok);
  const dzisiaj = dzis();
  const biezacy = rok === dzisiaj.getFullYear();
  const miesiecyDoDzis = biezacy ? dzisiaj.getMonth() + 1 : 12;

  // Nagłówek z wyborem roku.
  const naglowek = element('div', 'historia__naglowek');
  const tytul = element('h2', 'tytul-sekcji', t('Historia wydatków'));
  tytul.id = 'historia-tytul';
  const wybor = element('div', 'historia__rok');
  const wstecz = element('button', 'historia__strzalka', '‹');
  wstecz.type = 'button';
  wstecz.setAttribute('aria-label', t('Poprzedni rok'));
  wstecz.disabled = rok <= lata.od;
  const dalej = element('button', 'historia__strzalka', '›');
  dalej.type = 'button';
  dalej.setAttribute('aria-label', t('Następny rok'));
  dalej.disabled = rok >= lata.do;
  const zmienRok = (o) => {
    wybranyRok = rok + o;
    renderujHistorie(kontener, wpisy);
    kontener.querySelector(o < 0 ? '.historia__strzalka' : '.historia__strzalka:last-of-type')?.focus();
  };
  wstecz.addEventListener('click', () => zmienRok(-1));
  dalej.addEventListener('click', () => zmienRok(1));
  wybor.append(wstecz, element('span', 'historia__rok-liczba', String(rok)), dalej);
  naglowek.append(tytul, wybor);

  // Odczyt nad wykresem: podsumowanie roku, a przy najechaniu / fokusie na miesiąc - ten miesiąc.
  const odczyt = element('p', 'historia__odczyt');
  odczyt.setAttribute('aria-live', 'polite');
  const odczytRoku = () => {
    const srednio = miesiecyDoDzis ? w.suma / miesiecyDoDzis : 0;
    odczyt.replaceChildren(
      element('strong', '', biezacy ? t('Od stycznia do dziś: {kwota}', { kwota: formatujKwote(w.suma) }) : t('Rok {rok}: {kwota}', { rok, kwota: formatujKwote(w.suma) })),
      ' · ' + t('średnio {kwota} / mies.', { kwota: formatujKwote(srednio) }),
    );
  };
  const odczytMiesiaca = (i) => {
    const m = w.miesiace[i];
    const najwiecej = [...m.pozycje.entries()].sort((a, b) => b[1] - a[1]);
    const lista = najwiecej.slice(0, 4).map(([n, k]) => `${n} ${formatujKwote(k)}`).join(', ');
    odczyt.replaceChildren(
      element('strong', '', `${nazwaMiesiacaPelna(rok, i)} ${rok}: ${formatujKwote(m.suma)}`),
      lista ? ' - ' + lista + (najwiecej.length > 4 ? ` (+${najwiecej.length - 4})` : '') : ' - ' + t('nic'),
    );
  };
  odczytRoku();

  // Wykres: 12 kolumn jak w księdze rachunkowej, słupki kreskowane atramentem; bieżący miesiąc ołówkiem (do dziś).
  const granica = granicaOsi(Math.max(...w.miesiace.map((m) => m.suma)));
  const wykres = element('div', 'historia__wykres');
  wykres.setAttribute('role', 'group');
  wykres.setAttribute('aria-label', t('Wydatki w miesiącach roku {rok}', { rok }));
  const os = element('div', 'historia__os');
  os.setAttribute('aria-hidden', 'true');
  // Bez zer po przecinku (,00 / .00) przed walutą.
  const bezZer = (k) => formatujKwote(k).replace(/[,.]00(?=\s)/, '');
  os.append(element('span', 'historia__os-gora', bezZer(granica)), element('span', 'historia__os-pol', bezZer(granica / 2)));
  const kolumny = element('div', 'historia__kolumny');
  w.miesiace.forEach((m, i) => {
    const przyszly = i >= miesiecyDoDzis;
    const slupek = element('button', 'slupek' + (biezacy && i === dzisiaj.getMonth() ? ' slupek--biezacy' : '') + (przyszly ? ' slupek--przyszly' : ''));
    slupek.type = 'button';
    slupek.style.setProperty('--wys', String(Math.min(m.suma / granica, 1)));
    slupek.setAttribute('aria-label', `${nazwaMiesiacaPelna(rok, i)} ${rok}: ${przyszly ? t('jeszcze nie było') : formatujKwote(m.suma)}`);
    slupek.disabled = przyszly;
    if (!m.suma) slupek.classList.add('slupek--zero'); // bez kreski przy pustym miesiącu
    slupek.append(element('span', 'slupek__kolumna'), element('span', 'slupek__miesiac', nazwaMiesiaca(rok, i)));
    for (const [zdarzenie, akcja] of [['mouseenter', () => odczytMiesiaca(i)], ['focus', () => odczytMiesiaca(i)], ['mouseleave', odczytRoku], ['blur', odczytRoku]]) {
      slupek.addEventListener(zdarzenie, akcja);
    }
    kolumny.append(slupek);
  });
  wykres.append(os, kolumny);

  // Pod wykresem: na co najwięcej w roku (to też tabela danych wykresu) i zmiany cen.
  const dol = element('div', 'historia__dol');
  const naCo = element('div');
  const listaPozycji = element('ul', 'spis');
  if (!w.pozycje.length) listaPozycji.append(pusty(t('W tym roku nic.')));
  for (const p of w.pozycje.slice(0, 8)) listaPozycji.append(liniaSpisu(p.nazwa, tn(p.ile, '{n} płatność', '{n} płatności', '{n} płatności'), formatujKwote(p.suma)));
  if (w.pozycje.length > 8) {
    const reszta = w.pozycje.slice(8).reduce((s, p) => s + p.suma, 0);
    listaPozycji.append(liniaSpisu(t('pozostałe ({ile})', { ile: w.pozycje.length - 8 }), '', formatujKwote(reszta)));
  }
  naCo.append(element('h3', 'historia__podtytul', t('Na co najwięcej w {rok}', { rok })), listaPozycji);

  const ceny = element('div');
  const listaCen = element('ul', 'spis');
  const zmiany = zmianyCen(wpisy);
  if (!zmiany.length) listaCen.append(pusty(t('Jeszcze bez zmian - zmiana kwoty w kolumnie „Koszt” zapisze się tutaj.')));
  for (const z of zmiany.slice(0, 8)) {
    if ('min' in z) {
      listaCen.append(liniaSpisu(z.nazwa, t('{n} wpłat, od {od} do {do}', { n: z.wplat, od: formatujKoszt(z.min), do: formatujKoszt(z.max) }), t('ostatnio {kwota}', { kwota: formatujKwote(z.ostatnio, z.kod) })));
      continue;
    }
    const procent = z.z ? Math.round(((z.na - z.z) / z.z) * 100) : 0;
    const li = liniaSpisu(z.nazwa, `${formatujKoszt(z.z)} → ${formatujKoszt(z.na)}${z.kiedy ? ', ' + t('od {data}', { data: formatujDate(parsujDate(z.kiedy)) }) : ''}`, (procent > 0 ? '▲ +' : procent < 0 ? '▼ ' : '') + procent + '%');
    li.classList.add(procent > 0 ? 'alarm--drozej' : 'alarm--taniej');
    listaCen.append(li);
  }
  ceny.append(element('h3', 'historia__podtytul', t('Zmiany cen')), listaCen);
  dol.append(naCo, ceny);

  const uwagi = [t('Płatności „płacę sam” zaznaczone jako zapłacone - dokładnie; pozostałe - szacunek z daty zakupu, okresu i zmian cen.'), t('Wykreślone pozycje się nie liczą, waluty po obecnym kursie.')];
  if (w.bezKursu) uwagi.push(t('Bez kursu (poza sumą): {ile}.', { ile: w.bezKursu }));
  kontener.replaceChildren(naglowek, odczyt, wykres, dol, element('p', 'historia__uwaga', uwagi.join(' ')));
}
