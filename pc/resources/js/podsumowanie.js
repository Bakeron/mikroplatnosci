// Paragon - sumy kosztów w złotówkach.

import { okres, czyZakonczona, parsujDate, formatujDate, czyDlugi, miesiecznie, nazwaOkresu, czyWstrzymana } from './alarmy.js';
import { przeliczNaPln, waluta, pobierzKursy, formatujKwote, pobierzProwizje, WALUTY } from './waluty.js';
import { nazwaWpisu, KATEGORIE, nazwaKategorii } from './dane.js';
import { element } from './dom.js';
import { osobWpisu, cenaNastepna, anulowana, funkcja, kategoriaWpisu, firmowa, walutaNastepnej, pobierzWaluty } from './funkcje.js';
import { t, liczba, liczbaKrotka, data, godzina, jezyk } from './teksty.js';

// Ile rocznie kosztowałaby anulowana pozycja, gdyby jej nie anulować (w zł, moja część; bez okresu albo kursu - 0).
export function oszczednoscRoczna(wpis) {
  const pln = przeliczNaPln(wpis.koszt, waluta(wpis));
  return pln === null ? 0 : (miesiecznie(pln, okres(wpis)) * 12) / osobWpisu(wpis);
}

export function policz(wpisy) {
  const s = { listaMiesieczne: [], listaRoczne: [], miesieczne: 0, roczne: 0, jednorazoweIlosc: 0, jednorazoweKoszt: 0, bezKursu: 0, walutyObce: false, uzyteWaluty: new Set(), prognozaNaMiesiac: 0, jestPrognoza: false, anulowaneIlosc: 0, oszczednoscRok: 0, kategorie: new Map(), firmaMiesiecznie: 0, firmaIlosc: 0 };

  for (const wpis of wpisy) {
    // C15: anulowana - poza sumami; liczy się tylko do „oszczędzasz / rok” (moja część, po obecnym kursie).
    if (anulowana(wpis)) {
      s.anulowaneIlosc++;
      s.oszczednoscRok += oszczednoscRoczna(wpis);
      continue;
    }
    // Wszystkie sumy w złotówkach; waluta obca bez kursu NBP nie wchodzi do sum.
    // Koszt dzielony na kilka osób - w sumach tylko moja część.
    const osob = osobWpisu(wpis);
    const kod = waluta(wpis);
    const plnCalosc = przeliczNaPln(wpis.koszt, kod);
    if (kod !== 'PLN' && typeof wpis.koszt === 'number') {
      s.walutyObce = true;
      s.uzyteWaluty.add(kod);
      if (plnCalosc === null) s.bezKursu++;
    }
    const ok = okres(wpis);
    const dlugi = czyDlugi(ok);
    // Na paragonie krótsze okresy (tydzień, kwartał) przeliczone na miesiąc, dłuższe (2 lata) na rok.
    const naOkres = (kwota) => (dlugi ? (kwota * 12) / ok.miesiecy : miesiecznie(kwota, ok));
    const pln = ok.typ && plnCalosc !== null ? naOkres(plnCalosc / osob) : plnCalosc;
    const koszt = pln ?? 0;

    // Pozycje paragonu wg nazw; bez kursu NBP pozycja jest na liście, ale poza sumą. Dopisek pod nazwą:
    // nietypowy okres („co kwartał 300,00 zł”) i część wspólnej („moja część 1/4”).
    const dopiski = [];
    if (ok.typ && (ok.ile > 1 || ok.typ === 'T')) dopiski.push(nazwaOkresu(wpis) + (typeof wpis.koszt === 'number' ? ' ' + formatujKwote(wpis.koszt, kod) : ''));
    if (osob > 1) dopiski.push(t('moja część 1/{osob}', { osob }));
    const pozycjaParagonu = { nazwa: nazwaWpisu(wpis), pln, bezKwoty: typeof wpis.koszt !== 'number', dopisek: dopiski.join(', ') };
    const lista = !ok.typ ? null : dlugi ? s.listaRoczne : s.listaMiesieczne;

    if (wpis.przedluzac === 'nie') {
      if (!czyZakonczona(wpis)) {
        s.jednorazoweIlosc++;
        s.jednorazoweKoszt += (plnCalosc ?? 0) / osob;
        // Widoczna w swojej sekcji z „!”, ale poza sumą - nie będzie przedłużana.
        lista?.push({ ...pozycjaParagonu, wycofanie: true });
      }
      continue;
    }

    // Pauza - w swojej sekcji z datą wznowienia, ale poza sumą.
    if (czyWstrzymana(wpis)) {
      lista?.push({ ...pozycjaParagonu, wstrzymana: formatujDate(parsujDate(wpis.wstrzymanaDo)) });
      continue;
    }

    if (lista === s.listaMiesieczne) s.miesieczne += koszt;
    else if (lista === s.listaRoczne) s.roczne += koszt;
    lista?.push(pozycjaParagonu);

    // D17, D18: część RAZEM / MIESIĄC wg kategorii i koszty firmowe (roczne / 12, jak w RAZEM).
    if (lista) {
      const naMiesiac = lista === s.listaRoczne ? koszt / 12 : koszt;
      const kat = kategoriaWpisu(wpis);
      s.kategorie.set(kat, (s.kategorie.get(kat) ?? 0) + naMiesiac);
      if (firmowa(wpis)) {
        s.firmaMiesiecznie += naMiesiac;
        s.firmaIlosc++;
      }
    }

    // Prognoza na miesiąc: jak RAZEM / MIESIĄC, ale z prognozowaną ceną tam, gdzie jest.
    const kodNastepnej = walutaNastepnej(wpis);
    const prognozaPln = przeliczNaPln(cenaNastepna(wpis), kodNastepnej);
    if (cenaNastepna(wpis) !== null && kodNastepnej !== 'PLN') s.uzyteWaluty.add(kodNastepnej);
    if (prognozaPln !== null) s.jestPrognoza = true;
    const doPrognozy = (prognozaPln ?? plnCalosc ?? 0) / osob;
    if (ok.typ) s.prognozaNaMiesiac += miesiecznie(doPrognozy, ok);
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
    const wartosc = p.bezKwoty ? '-' : p.pln === null ? t('brak kursu') : formatujKwote(p.pln);
    const dopisek = p.dopisek ? [element('div', 'paragon__waluta', p.dopisek)] : [];
    if (p.wycofanie) linie.push(pozycja('! ' + p.nazwa, wartosc, 'paragon__pozycja--wycofanie'), ...dopisek);
    else if (p.wstrzymana) linie.push(pozycja('‖ ' + p.nazwa, wartosc, 'paragon__pozycja--wstrzymana'), ...dopisek, element('div', 'paragon__waluta', t('wstrzymana do {data} - poza sumą', { data: p.wstrzymana })));
    else linie.push(pozycja(p.nazwa, wartosc), ...dopisek);
  }
  linie.push(pozycja(napisSumy, formatujKwote(suma), 'paragon__pozycja--podsuma'));
  return linie;
}

// D19: budżet miesięczny - ile zostaje albo o ile przekroczony (RAZEM / MIESIĄC i PROGNOZA).
function linieBudzetu(s, budzet) {
  const zostaje = Math.round((budzet - s.lacznieMiesiecznie) * 100) / 100;
  const linie = [pozycja(t('BUDŻET / MIES.'), formatujKwote(budzet))];
  if (zostaje >= 0) linie.push(pozycja(t('zostaje'), formatujKwote(zostaje), 'paragon__pozycja--zostaje'));
  else linie.push(pozycja(t('PONAD BUDŻET o'), formatujKwote(-zostaje), 'paragon__pozycja--alarm paragon__pozycja--ponad'));
  const ponadPrognoza = Math.round((s.prognozaNaMiesiac - budzet) * 100) / 100;
  if (s.jestPrognoza && zostaje >= 0 && ponadPrognoza > 0) {
    linie.push(element('div', 'paragon__waluta paragon__ostrzezenie', t('! prognoza przekroczy budżet o {kwota}', { kwota: formatujKwote(ponadPrognoza) })));
  }
  return linie;
}

// opcje: { budzet } - limit miesięczny w zł (D19, PC); 0 albo brak = bez limitu.
// Podsumowanie w formie paragonu z kasy.
export function renderujPodsumowanie(kontener, wpisy, opcje = {}) {
  const s = policz(wpisy);
  const teraz = new Date();
  const linie = [
    element('div', 'paragon__tytul', t('Podsumowanie')),
    ...sekcja(t('Miesięczne'), s.listaMiesieczne, t('Suma / mies.'), s.miesieczne, t('brak - zaznacz MIES. przy dacie zakupu')),
    ...sekcja(t('Roczne'), s.listaRoczne, t('Suma / rok'), s.roczne, t('brak - zaznacz ROK przy dacie zakupu')),
  ];
  linie.push(
    element('hr', 'paragon__kreska paragon__kreska--podwojna'),
    pozycja(t('RAZEM / MIESIĄC'), formatujKwote(s.lacznieMiesiecznie), 'paragon__pozycja--suma'),
    element('div', 'paragon__waluta', t('miesięczne + roczne ÷ 12')), // roczne też tu - bez opisu mylące
    pozycja(t('RAZEM / ROK'), formatujKwote(s.lacznieMiesiecznie * 12), 'paragon__pozycja--suma'),
    element('div', 'paragon__waluta', t('miesięczne × 12 + roczne')),
  );
  if (s.jestPrognoza) {
    const roznica = Math.round((s.prognozaNaMiesiac - s.lacznieMiesiecznie) * 100) / 100;
    linie.push(
      pozycja(t('PROGNOZA / MIES.'), formatujKwote(s.prognozaNaMiesiac), 'paragon__pozycja--suma'),
      element('div', 'paragon__waluta', roznica === 0 ? t('bez zmian') : roznica > 0 ? t('drożej o {kwota}', { kwota: formatujKwote(roznica) }) : t('taniej o {kwota}', { kwota: formatujKwote(Math.abs(roznica)) })),
    );
  }
  if (opcje.budzet > 0) linie.push(element('hr', 'paragon__kreska'), ...linieBudzetu(s, opcje.budzet));
  // D18: koszty firmowe - część RAZEM.
  if (funkcja('firma') && s.firmaIlosc) {
    linie.push(
      element('hr', 'paragon__kreska'),
      pozycja(t('w tym na firmę / mies.'), formatujKwote(s.firmaMiesiecznie), 'paragon__pozycja--firma'),
      pozycja(t('na firmę / rok'), formatujKwote(s.firmaMiesiecznie * 12)),
      pozycja(t('prywatnie / mies.'), formatujKwote(s.lacznieMiesiecznie - s.firmaMiesiecznie)),
    );
  }
  // D17: RAZEM / MIESIĄC wg kategorii (od największej), gdy choć jedna pozycja ma kategorię.
  if (funkcja('kategorie') && [...s.kategorie.keys()].some(Boolean)) {
    linie.push(element('hr', 'paragon__kreska'), element('div', 'paragon__sekcja', t('Kategorie / mies.')),
      element('div', 'paragon__dopisek', t('roczne i inne okresy przeliczone na 1 miesiąc (np. roczna ÷ 12)')));
    const kolejnosc = [...KATEGORIE.map(([k]) => k), ''];
    const kategorie = [...s.kategorie].sort((a, b) => b[1] - a[1] || kolejnosc.indexOf(a[0]) - kolejnosc.indexOf(b[0]));
    for (const [kat, kwota] of kategorie) linie.push(pozycja(kat ? nazwaKategorii(kat) : t('bez kategorii'), formatujKwote(kwota)));
  }
  linie.push(
    element('hr', 'paragon__kreska'),
    pozycja(t('Do wycofania'), t('{n} szt.', { n: s.jednorazoweIlosc }), s.jednorazoweIlosc ? 'paragon__pozycja--alarm' : ''),
    pozycja(t('Ich koszt'), formatujKwote(s.jednorazoweKoszt), s.jednorazoweIlosc ? 'paragon__pozycja--alarm' : ''),
  );
  // C15: licznik oszczędności z anulowanych (wyłączone „Anulowane” - bez tej części).
  if (funkcja('archiwum') && s.anulowaneIlosc) {
    linie.push(
      element('hr', 'paragon__kreska'),
      pozycja(t('Anulowane'), t('{n} szt.', { n: s.anulowaneIlosc })),
      pozycja(t('OSZCZĘDZASZ / ROK'), formatujKwote(s.oszczednoscRok), 'paragon__pozycja--suma paragon__pozycja--oszczednosc'),
    );
  }

  const kursy = pobierzKursy();
  // Waluty włączone w ustawieniach i te, których używają pozycje (same złote - bez kursów).
  const wlaczone = pobierzWaluty();
  const kody = kursy ? WALUTY.filter((k) => k !== 'PLN' && kursy[k] && (wlaczone.includes(k) || s.uzyteWaluty.has(k))) : [];
  if (kody.length || s.walutyObce) linie.push(element('hr', 'paragon__kreska'));
  if (kody.length) {
    // Kody walut pod sobą: kolejne wiersze wcięte spacjami na długość napisu przed kodem (dwie spacje po „NBP”).
    const wciecie = ' '.repeat(Math.max(0, t('Kurs NBP  {kod}').indexOf('{kod}')));
    kody.forEach((kod, i) => linie.push(pozycja(i ? wciecie + kod : t('Kurs NBP  {kod}', { kod }), liczba(kursy[kod], 4))));
    linie.push(element('div', 'paragon__waluta', t('tabela A z dnia {data}', { data: formatujDate(parsujDate(kursy.data)) })));
    const prowizja = pobierzProwizje();
    if (prowizja) linie.push(element('div', 'paragon__waluta', t('waluty w sumach: kurs + {prowizja}% prowizji banku', { prowizja: liczbaKrotka(prowizja) })));
  }
  if (s.bezKursu > 0) linie.push(pozycja(t('Bez kursu (poza sumą)'), t('{n} szt.', { n: s.bezKursu }), 'paragon__pozycja--alarm'));
  linie.push(
    element('hr', 'paragon__kreska'),
    // Po polsku data jak dotąd bez zera na początku (2.11.2026), w innym języku - data() z teksty.js.
    element('div', 'paragon__stopka', (jezyk() === 'pl' ? teraz.toLocaleDateString('pl-PL') : data(teraz)) + '  ' + godzina(teraz)),
    element('div', 'paragon__stopka', t('*** pilnuj odnowień ***')),
  );
  kontener.replaceChildren(...linie);
}
