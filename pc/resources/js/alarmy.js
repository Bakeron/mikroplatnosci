// Daty, okresy płatności i alarmy.

import { funkcja, reczna, zmiennaKwota, cenaNastepna, anulowana, walutaNastepnej } from './funkcje.js';
import { waluta } from './waluty.js';
import { dzienRoboczyPrzed } from './swieta.js';
import { t, tn, data as dataTekst } from './teksty.js';

const DZIEN_MS = 86400000;

export function parsujDate(tekst) {
  if (typeof tekst !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tekst)) return null;
  const [r, m, d] = tekst.split('-').map(Number);
  if (r < 1900 || r > 2200) return null; // new Date() zamienia lata 0-99 na 19xx
  const data = new Date(r, m - 1, d);
  return data.getMonth() === m - 1 ? data : null;
}

export function dzis() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

// Dodaje miesiące z zachowaniem dnia (31.01 + 1 mies. = 28/29.02).
export function dodajMiesiace(data, ile) {
  const wynik = new Date(data.getFullYear(), data.getMonth() + ile, 1);
  const ostatniDzien = new Date(wynik.getFullYear(), wynik.getMonth() + 1, 0).getDate();
  wynik.setDate(Math.min(data.getDate(), ostatniDzien));
  return wynik;
}

export const isoDnia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function roznicaDni(od, doDaty) {
  return Math.round((doDaty - od) / DZIEN_MS);
}

// Data w języku aplikacji (teksty.js - gotowe formatery dla każdego języka).
export function formatujDate(data) {
  return data ? dataTekst(data) : '';
}

// Okres płatności: M - miesiące, R - lata, T - tygodnie, null - nieokreślony; ile - co ile (coIle),
// np. M × 3 = kwartał, R × 2 = co 2 lata, T × 4 = co 4 tygodnie. dni - przybliżona długość (lont).
export function okres(wpis) {
  const ile = Number.isInteger(wpis.coIle) && wpis.coIle > 1 ? wpis.coIle : 1;
  if (wpis.okres === 'M') return { typ: 'M', ile, miesiecy: ile, dni: 30 * ile };
  if (wpis.okres === 'R') return { typ: 'R', ile, miesiecy: 12 * ile, dni: 365 * ile };
  if (wpis.okres === 'T') return { typ: 'T', ile, miesiecy: 0, dni: 7 * ile };
  return { typ: null };
}

// Rok i dłużej - liczone jak roczne (spis „Roczne”, alarmy 3 / 2 / 1 miesiąc przed, paragon „Roczne”).
export const czyDlugi = (ok) => ok.miesiecy >= 12;

// Kwota za okres przeliczona na miesiąc (tydzień = 365,25 / 7 / 12 miesiąca).
export function miesiecznie(kwota, ok) {
  if (!ok.typ) return 0;
  return ok.typ === 'T' ? (kwota * 365.25) / 7 / 12 / ok.ile : kwota / ok.miesiecy;
}

// Data o k okresów później.
export function dodajOkres(data, ok, k) {
  if (ok.typ === 'T') return new Date(data.getFullYear(), data.getMonth(), data.getDate() + 7 * ok.ile * k);
  return dodajMiesiace(data, ok.miesiecy * k);
}

// Ile pełnych okresów mieści się mniej więcej między datami - pętle dociągają potem tylko 1-2 kroki.
function krokiDo(od, doDaty, ok) {
  if (ok.typ === 'T') return Math.floor(roznicaDni(od, doDaty) / (7 * ok.ile));
  return Math.floor(((doDaty.getFullYear() - od.getFullYear()) * 12 + doDaty.getMonth() - od.getMonth()) / ok.miesiecy);
}

// Nazwa okresu do wyświetlenia: „co miesiąc”, „co kwartał”, „co 2 lata”, „co 4 tygodnie”.
export function nazwaOkresu(wpis) {
  const ok = okres(wpis);
  if (!ok.typ) return '';
  const { ile } = ok;
  if (ok.typ === 'T') return ile === 1 ? t('co tydzień') : tn(ile, 'co {n} tydzień', 'co {n} tygodnie', 'co {n} tygodni');
  if (ok.typ === 'R') return ile === 1 ? t('co rok') : tn(ile, 'co {n} rok', 'co {n} lata', 'co {n} lat');
  if (ile === 1) return t('co miesiąc');
  if (ile === 3) return t('co kwartał');
  if (ile === 6) return t('co pół roku');
  return tn(ile, 'co {n} miesiąc', 'co {n} miesiące', 'co {n} miesięcy');
}

// Dzień wznowienia po pauzie (przedłużana pozycja) albo null - także przy wyłączonej funkcji „Pauza”.
const wznowienieWpisu = (wpis) => (funkcja('pauza') && wpis.przedluzac !== 'nie' ? parsujDate(wpis.wstrzymanaDo) : null);

// Pauza („wstrzymana do …”): przedłużana pozycja przed dniem wznowienia - bez alarmów i poza sumami.
export function czyWstrzymana(wpis) {
  const wznowienie = wznowienieWpisu(wpis);
  return !!wznowienie && wznowienie > dzis();
}

const dzienPrzed = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);

// Przerwy w płatnościach po kolei: [{ od (Date albo null), do (dzień wznowienia) }], tylko kończące się po zakupie.
// Zakończone wcześniej (przerwy - poprzednie pauzy i czas po „nie” przed powrotem na „tak”) to historia -
// liczą się zawsze; obecna pauza - tylko przy włączonej funkcji „Pauza”.
function przerwyWpisu(wpis, zakup) {
  const lista = [...(wpis.przerwy ?? [])];
  if (funkcja('pauza')) lista.push({ od: wpis.wstrzymanaOd, do: wpis.wstrzymanaDo });
  return lista
    .map((p) => ({ od: parsujDate(p.od), do: parsujDate(p.do) }))
    .filter((p) => p.do && p.do > zakup)
    .sort((a, b) => a.do - b.do);
}

// Początek liczenia terminów: data zakupu, a po pauzie - dzień wznowienia ostatniej (wtedy pierwsza płatność
// jest w dniu wznowienia, więc k od 0). Data zakupu nigdy się nie zmienia - historia liczy się od niej.
function poczatekTerminow(wpis, zakup) {
  const ostatnia = zakup && wpis.przedluzac !== 'nie' ? przerwyWpisu(wpis, zakup).at(-1) : null;
  return ostatnia ? { poczatek: ostatnia.do, k0: 0 } : { poczatek: zakup, k0: 1 };
}

// Najwięcej zapamiętanych przerw na pozycję (starsze odpadają).
export const MAKS_PRZERW = 50;

export function dodajPrzerwe(wpis, od, doDnia) {
  wpis.przerwy = [...(wpis.przerwy ?? []), { od: od || '', do: doDnia }].slice(-MAKS_PRZERW);
}

const koniecMiesiacaDaty = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

// Okres ze starych dat „od” i „do” (wpisy sprzed przełącznika mies. / rok): M, R, „inny” albo '' (brak dat).
export function okresZDat(od, doDnia) {
  const a = parsujDate(od);
  const b = parsujDate(doDnia);
  if (!a || !b || b <= a) return '';
  // Tylko wyraźny miesiąc albo rok; inny odstęp (np. kwartał, 90 dni) - „inny”: okres do wybrania
  // przez użytkownika, zamiast kosztu kwartału liczonego jak miesięczny (3 razy za dużo w sumach).
  const dni = roznicaDni(a, b);
  if (dni <= 45) return 'M';
  if (dni >= 300 && dni <= 400) return 'R';
  return 'inny';
}

// Termin najbliższej płatności: zakup + okres. Przedłużane przesuwają się o kolejne okresy, jednorazowe nie.
// Stary wpis bez daty zakupu, ale z datą „do” - liczony od niej (to był termin płatności).
// „Nie” - ostatni termin zapamiętany przy przełączeniu (ostatniTermin), a od początku jednorazowa - zakup + okres.
export function termin(wpis, okresWpisu = okres(wpis)) {
  if (!okresWpisu.typ) return { data: null };
  const zakup = parsujDate(wpis.od);
  if (!zakup && !parsujDate(wpis.do)) return { data: null };
  if (wpis.przedluzac === 'nie') return { data: parsujDate(wpis.ostatniTermin) ?? (zakup ? dodajOkres(zakup, okresWpisu, 1) : parsujDate(wpis.do)) };
  // Po pauzie terminy liczą się od dnia wznowienia (w czasie pauzy termin = dzień wznowienia).
  const { poczatek, k0 } = zakup ? poczatekTerminow(wpis, zakup) : { poczatek: parsujDate(wpis.do), k0: 0 };
  let k = k0;
  let data;
  // Płatność ręczna: pierwszy termin po ostatnim zapłaconym (bez zaznaczonego „zapłacone” - po dacie
  // zakupu) - także już miniony: zaległość zostaje, aż użytkownik sam zaznaczy „zapłacone”.
  // „Termin do końca miesiąca”: ostatni dzień miesiąca, w którym wypada zwykły termin.
  let zaplacony = reczna(wpis) && zakup ? (parsujDate(wpis.zaplaconyTermin) ?? zakup) : null;
  if (zaplacony) {
    // Po pauzie: termin w dniu wznowienia jest do zapłaty, chyba że już go zaznaczono.
    if (k0 === 0 && zaplacony < poczatek) zaplacony = new Date(poczatek.getFullYear(), poczatek.getMonth(), poczatek.getDate() - 1);
    const kolejny = (n) => {
      const d = dodajOkres(poczatek, okresWpisu, n);
      return wpis.koniecMiesiaca ? koniecMiesiacaDaty(d) : d;
    };
    k = Math.max(k0, krokiDo(poczatek, zaplacony, okresWpisu) - 1);
    data = kolejny(k);
    while (data <= zaplacony && k < 5000) {
      k++;
      data = kolejny(k);
    }
    return { data };
  }
  const t = dzis();
  // Skok od razu na okres sprzed dzisiejszego - pętla dociąga tylko 1-2 kroki zamiast liczyć od zakupu.
  k = Math.max(k, krokiDo(poczatek, t, okresWpisu) - 1);
  data = dodajOkres(poczatek, okresWpisu, k);
  while (data < t && k < 5000) {
    k++;
    data = dodajOkres(poczatek, okresWpisu, k);
  }
  return { data };
}

// Kolejne daty od początek + n0 okresów w przedziale [odDnia, doDnia] (n0 - pierwszy numer okresu).
function seria(poczatek, ok, n0, koniecMiesiaca, odDnia, doDnia) {
  const daty = [];
  if (!poczatek || doDnia < odDnia) return daty;
  let n = Math.max(n0, krokiDo(poczatek, odDnia, ok) - 1);
  for (let i = 0; i < 6000; i++, n++) {
    const d0 = dodajOkres(poczatek, ok, n);
    const d = koniecMiesiaca ? koniecMiesiacaDaty(d0) : d0;
    if (d > doDnia) break;
    if (d >= odDnia) daty.push(d);
  }
  return daty;
}

// Dni płatności pozycji w [odDnia, doDnia] - szacunek z daty zakupu i okresu (historia wydatków,
// przypomnienie o oddaniu części). Zakup to pierwsza płatność, potem co okres. „Nie” - jak przy „tak”
// do dnia przed ostatnim terminem (historia zostaje), a od początku jednorazowa - tylko zakup.
// Pauza i przerwy: bez płatności od wstrzymania do wznowienia, potem od dnia wznowienia co okres.
// Płatność ręczna: tylko terminy zaznaczone jako zapłacone (do zaplaconyTermin).
export function dniPlatnosci(wpis, odDnia, doDnia) {
  const ok = okres(wpis);
  const zakup = parsujDate(wpis.od);
  if (!zakup) return [];
  const wZakresie = (d) => d >= odDnia && d <= doDnia;
  const ostatni = wpis.przedluzac === 'nie' ? parsujDate(wpis.ostatniTermin) : null;
  if (!ok.typ || (wpis.przedluzac === 'nie' && !ostatni)) return wZakresie(zakup) ? [zakup] : [];
  let koniec = doDnia;
  if (ostatni && dzienPrzed(ostatni) < koniec) koniec = dzienPrzed(ostatni);
  if (reczna(wpis)) {
    const zaplacony = parsujDate(wpis.zaplaconyTermin) ?? zakup;
    if (zaplacony < koniec) koniec = zaplacony;
  }
  const reczny = reczna(wpis) && wpis.koniecMiesiaca;
  const daty = wZakresie(zakup) ? [zakup] : [];
  let poczatek = zakup;
  let n0 = 1;
  for (const p of przerwyWpisu(wpis, zakup)) {
    // Przed przerwą: do dnia przed wstrzymaniem (bez daty wstrzymania - do dnia przed wznowieniem).
    const przerwa = p.od && p.od > poczatek && p.od < p.do ? p.od : p.do;
    const przed = dzienPrzed(przerwa);
    daty.push(...seria(poczatek, ok, n0, reczny, odDnia, przed < koniec ? przed : koniec));
    poczatek = p.do;
    n0 = 0;
  }
  daty.push(...seria(poczatek, ok, n0, reczny, odDnia, koniec));
  return daty;
}

// Ostatnia płatność do dziś (albo null) - od niej liczy się, czy inni oddali swoją część.
export function ostatniaPlatnosc(wpis) {
  const t = dzis();
  const ok = okres(wpis);
  const wstecz = new Date(t.getFullYear(), t.getMonth(), t.getDate() - (ok.typ ? ok.dni * 2 : 0) - 62);
  return dniPlatnosci(wpis, wstecz, t).at(-1) ?? null;
}

// Najbliższe odnowienie od dziś (RRRR-MM-DD albo '') - jak przy „tak”, z pauzą; płacę sam - bez
// zaległości (pierwszy termin od dziś, chyba że zapłacone są już dalsze).
function najblizszeOdnowienie(wpis) {
  const wczoraj = isoDnia(dzienPrzed(dzis()));
  const zaplacony = wpis.zaplaconyTermin > wczoraj ? wpis.zaplaconyTermin : wczoraj;
  const data = termin({ ...wpis, przedluzac: 'tak', ostatniTermin: '', zaplaconyTermin: zaplacony }).data;
  return data ? isoDnia(data) : '';
}

// „Przedłużać” (zasada autora: co zapłacone, zostaje zapłacone - zmienia się przyszłość, nie historia).
// Data zakupu się nie zmienia. „Nie”: ostatni termin = najbliższe odnowienie (dzień, w którym już się nie
// odnowi) - historia liczy płatności do niego. Powrót na „tak” po ostatnim terminie: czas bez płatności
// do najbliższego odnowienia zapamiętany jak pauza (przerwy); przed ostatnim terminem - terminy jak przed
// „nie”, a przy płacę sam bez zaległości sprzed „nie” (do zapłaty jest najbliższy termin).
export function ustawPrzedluzanie(wpis, nowe) {
  const nie = nowe === 'nie';
  const wartosc = nie || nowe === 'tak' ? nowe : ''; // puste „-” liczy się jak „tak”
  if (nie === (wpis.przedluzac === 'nie')) {
    wpis.przedluzac = wartosc;
    return;
  }
  if (nie) {
    wpis.ostatniTermin = najblizszeOdnowienie(wpis);
  } else {
    const ostatni = termin(wpis).data;
    wpis.ostatniTermin = '';
    wpis.przedluzac = 'tak';
    if (ostatni && ostatni < dzis()) {
      const nastepny = najblizszeOdnowienie(wpis);
      if (nastepny) dodajPrzerwe(wpis, isoDnia(ostatni), nastepny);
    } else if (ostatni && reczna(wpis)) {
      const przed = isoDnia(dzienPrzed(ostatni));
      if (!(wpis.zaplaconyTermin >= przed)) wpis.zaplaconyTermin = przed;
    }
  }
  wpis.przedluzac = wartosc;
  wpis.prognozaOd = ''; // termin się zmienia - dzień ceny następnej liczy się od nowa
}

// Poziomy: czerwony / pomaranczowy / zolty / null; „minal” gdy data już przeszła.
// Liczone od terminu wstecz - tak samo jak powiadomienia („za miesiąc” = ten sam dzień).
function poziomRoczny(data) {
  const t = dzis();
  if (data < t) return 'minal';
  if (dodajMiesiace(data, -1) <= t) return 'czerwony';
  if (dodajMiesiace(data, -2) <= t) return 'pomaranczowy';
  if (dodajMiesiace(data, -3) <= t) return 'zolty';
  return null;
}

function poziomMiesieczny(data) {
  const dni = roznicaDni(dzis(), data);
  if (dni < 0) return 'minal';
  if (dni <= 3) return 'czerwony';
  if (dni <= 7) return 'pomaranczowy';
  return null;
}

// Kolumna „Do płatności”: odcień 120 (zielony) → 60 (żółty) → 0 (czerwony),
// płynnie wg części okresu, która jeszcze została.
export function doPlatnosci(wpis) {
  const ok = okres(wpis);
  const ter = termin(wpis, ok);
  if (!ter.data) return null;
  const dni = roznicaDni(dzis(), ter.data);
  if (dni < 0) return { dni, minal: true };
  const zostalo = Math.min(dni / ok.dni, 1);
  return { dni, minal: false, odcien: Math.round(120 * zostalo), zostalo };
}

export function dniTekst(n) {
  return tn(n, '{n} dzień', '{n} dni', '{n} dni');
}

// „dziś”, „jutro” albo „N dni” do terminu.
export const kiedyTekst = (n) => (n === 0 ? t('dziś') : n === 1 ? t('jutro') : dniTekst(n));

export function czyZakonczona(wpis) {
  if (wpis.przedluzac !== 'nie') return false;
  const data = termin(wpis).data;
  return !!data && data < dzis();
}

// Płatność ręczna („płacę sam”): tyle dni przed terminem wiersz dostaje czerwony margines.
export const DNI_DO_ZAPLATY = 7;
export const MAKS_HISTORII = 240; // ok. 20 lat płatności miesięcznych
export const MAKS_CEN = 100;

// B8: ostatni dzień na zapłatę - termin, a gdy wypada w sobotę, niedzielę albo święto (i funkcja
// „Weekend i święta” włączona) - ostatni dzień roboczy przed nim.
export const zaplacDo = (data) => (funkcja('weekend') ? dzienRoboczyPrzed(data) : data);

// Termin do zapłacenia ręcznie - { data (termin), doDnia (zapłać do), dni (do „zapłać do”), zalegle }
// albo null (płaci się samo, nie przedłużamy, brak daty albo „zapłać do” dalej niż DNI_DO_ZAPLATY).
// Niezapłacony termin po czasie zostaje (zalegle, dni < 0) - aż do zaznaczenia „zapłacone”; potem wiersz
// wraca do zwykłego odliczania do następnego.
export function doZaplaty(wpis) {
  if (!reczna(wpis) || wpis.przedluzac === 'nie' || czyWstrzymana(wpis)) return null;
  const data = termin(wpis).data;
  if (!data) return null;
  const doDnia = zaplacDo(data);
  const dni = roznicaDni(dzis(), doDnia);
  if (dni > DNI_DO_ZAPLATY) return null;
  return { data, doDnia, dni, zalegle: data < dzis() };
}

// Zaznaczone „zapłacone”: zapamiętany jest zapłacony termin - liczy się następny - i wpłata w historii
// (dzień zapłaty i kwota). Bez podanej kwoty: cena od następnej płatności, jeśli wpisana, inaczej koszt.
// Kwota zmienna („za każdym razem inna”): podana kwota staje się zapłaconą (kolumna „Koszt”).
export function oznaczZaplate(wpis, kwota) {
  const dz = doZaplaty(wpis);
  if (!dz) return false;
  wpis.zaplaconyTermin = isoDnia(dz.data);
  // Cena od następnej płatności obowiązuje od swojego terminu - zapłata starszej zaległości jest jeszcze po starej cenie.
  const nowaCena = cenaNastepna(wpis) !== null && (!wpis.prognozaOd || wpis.zaplaconyTermin >= wpis.prognozaOd);
  const zaplacono = typeof kwota === 'number' ? kwota : nowaCena ? wpis.prognoza : wpis.koszt;
  // Ta płatność była już po nowej cenie - cena następna staje się zapłaconą i znika (A3). Przed wpłatą
  // w historii: przy cenie następnej w innej walucie dawne wpłaty dostają dawną walutę, a ta - już nową.
  if (nowaCena) zastosujNastepnaCene(wpis, wpis.zaplaconyTermin);
  if (typeof zaplacono === 'number') {
    if (!Array.isArray(wpis.historia)) wpis.historia = [];
    wpis.historia.push({ termin: wpis.zaplaconyTermin, dnia: isoDnia(dzis()), kwota: zaplacono });
    if (wpis.historia.length > MAKS_HISTORII) wpis.historia.splice(0, wpis.historia.length - MAKS_HISTORII);
  }
  if (zmiennaKwota(wpis) && typeof kwota === 'number') wpis.koszt = kwota;
  return true;
}

// Zmiana zapłaconej ceny w historii cen (od dnia „od”) - do wykresu wydatków i „Zmian cen”.
// Pierwsza zmiana zapisuje też cenę sprzed niej (z pustym „od” - obowiązywała od początku).
// Cena w innej walucie niż wpis ma pole waluta (zostawione przy cenie następnej w innej walucie).
export function dopiszCene(wpis, stara, od) {
  if (typeof stara !== 'number' || typeof wpis.koszt !== 'number' || stara === wpis.koszt) return;
  if (!Array.isArray(wpis.ceny)) wpis.ceny = [];
  if (!wpis.ceny.length) wpis.ceny.push({ od: '', kwota: stara });
  const ostatnia = wpis.ceny.at(-1);
  // Kilka poprawek tego samego dnia (literówka) = jedna zmiana.
  if (ostatnia.od === od) {
    ostatnia.kwota = wpis.koszt;
    delete ostatnia.waluta;
  } else wpis.ceny.push({ od, kwota: wpis.koszt });
  const przed = wpis.ceny.at(-2);
  if (przed && przed.kwota === wpis.ceny.at(-1).kwota && !przed.waluta) wpis.ceny.pop(); // powrót do poprzedniej ceny tego samego dnia
  if (wpis.ceny.length === 1) wpis.ceny.length = 0; // została tylko cena początkowa - bez zmian
  if (wpis.ceny.length > MAKS_CEN) wpis.ceny.splice(0, wpis.ceny.length - MAKS_CEN);
}

function zastosujNastepnaCene(wpis, od) {
  const stara = wpis.koszt;
  const dawna = waluta(wpis);
  const nowa = walutaNastepnej(wpis);
  if (nowa !== dawna) {
    // Cena następna w innej walucie (np. 20 zł, potem 200 USD): dawne wpłaty i ceny zostają w dawnej walucie
    // (historia wydatków liczy je po swojemu), dalej pozycja jest w nowej. Zmiana zawsze zapisana w cenach.
    for (const h of wpis.historia ?? []) h.waluta ??= dawna;
    if (!Array.isArray(wpis.ceny)) wpis.ceny = [];
    if (!wpis.ceny.length && typeof stara === 'number') wpis.ceny.push({ od: '', kwota: stara });
    for (const c of wpis.ceny) c.waluta ??= dawna;
    if (wpis.ceny.at(-1)?.od === od) wpis.ceny.pop(); // inna zmiana tego samego dnia
    wpis.waluta = nowa;
    wpis.koszt = wpis.prognoza;
    if (typeof wpis.koszt === 'number') wpis.ceny.push({ od, kwota: wpis.koszt });
    if (wpis.ceny.length > MAKS_CEN) wpis.ceny.splice(0, wpis.ceny.length - MAKS_CEN);
  } else {
    wpis.koszt = wpis.prognoza;
    dopiszCene(wpis, stara, od);
  }
  wpis.prognoza = null;
  wpis.prognozaOd = '';
  wpis.walutaNastepna = '';
}

// Dzień następnej płatności, od której obowiązuje cena następna. Płatność wypada dziś - liczy się
// kolejna (dzisiejsza zwykle już zeszła po starej cenie). Płacę sam - pierwszy niezapłacony termin.
function terminNowejCeny(wpis) {
  const ok = okres(wpis);
  const data = termin(wpis, ok).data;
  if (!data) return '';
  return isoDnia(!wpis.platnoscReczna && roznicaDni(dzis(), data) === 0 ? dodajOkres(data, ok, 1) : data);
}

// A3: cena od następnej płatności sama staje się zapłaconą w dniu tej płatności (pobiera się sama;
// przy „płacę sam” - przy zaznaczeniu „zapłacone”, oznaczZaplate). Bez zapamiętanego dnia (cena
// wpisana przed tą zmianą albo termin się przesunął) - dzień zapamiętywany teraz.
// Zwraca 'cena', gdy cena się zmieniła, 'termin', gdy tylko zapamiętany został dzień, albo ''.
// Funkcja „Cena następna” wyłączona - nic się nie zmienia (cena czeka w pliku). Wyłączone „Płacę sam”
// też nie przenosi ceny pozycji „płacę sam” - dane zostają, jak były.
export function przeniesNastepnaCene(wpis) {
  if (cenaNastepna(wpis) === null || wpis.przedluzac === 'nie' || czyWstrzymana(wpis) || anulowana(wpis)) return '';
  if (!wpis.prognozaOd) {
    wpis.prognozaOd = terminNowejCeny(wpis);
    return wpis.prognozaOd ? 'termin' : '';
  }
  if (wpis.platnoscReczna || wpis.prognozaOd > isoDnia(dzis())) return '';
  zastosujNastepnaCene(wpis, wpis.prognozaOd);
  return 'cena';
}

// Włączenie „płacę sam”, „termin do końca miesiąca” albo zmiana daty zakupu / okresu: liczy się od daty zakupu (zakup = ostatnia
// zapłata) - pierwszy termin to zakup + okres; jeśli już minął, od razu jest zaległy. Termin się zmienia,
// więc dzień nowej ceny liczy się od nowa (przeniesNastepnaCene). „Nie”, które jeszcze trwa - ostatni termin
// to najbliższe odnowienie po zmianie (zakończonego nie przywraca).
// odDzis - samo włączenie „płacę sam”: co minęło, pobrało się samo (historia jak przy „pobiera się sama”),
// do zapłaty jest pierwszy termin od dziś; zapłacone wcześniej dalsze terminy zostają.
export function ustawPoczatekZaplaty(wpis, odDzis = false) {
  if (wpis.platnoscReczna) {
    const wczoraj = isoDnia(dzienPrzed(dzis()));
    wpis.zaplaconyTermin = !odDzis ? '' : wpis.zaplaconyTermin > wczoraj ? wpis.zaplaconyTermin : wczoraj;
  }
  wpis.prognozaOd = '';
  if (wpis.przedluzac === 'nie' && wpis.ostatniTermin && parsujDate(wpis.ostatniTermin) >= dzis()) wpis.ostatniTermin = najblizszeOdnowienie(wpis);
}

// Natężenie czerwieni wiersza do zapłaty (w %): od DNI_DO_ZAPLATY dni przed terminem coraz mocniej
// z każdym dniem, po terminie - najmocniej.
export function czerwienZaplaty(dni) {
  if (dni < 0) return 34;
  return Math.round(6 + (DNI_DO_ZAPLATY - Math.min(dni, DNI_DO_ZAPLATY)) * 2.5);
}

export function zbierzAlarmy(wpisy) {
  const roczne = [];
  const jednorazowe = [];

  for (const wpis of wpisy) {
    if (czyWstrzymana(wpis) || anulowana(wpis)) continue; // pauza - bez alarmów do dnia wznowienia; anulowana - wcale
    const ok = okres(wpis);
    const ter = termin(wpis, ok);

    if (wpis.przedluzac === 'nie') {
      let poziom = 'brak';
      if (ter.data) {
        poziom = czyDlugi(ok) ? poziomRoczny(ter.data) : poziomMiesieczny(ter.data);
      }
      jednorazowe.push({ wpis, data: ter.data, poziom });
      continue;
    }

    if (czyDlugi(ok) && ter.data) {
      const poziom = poziomRoczny(ter.data);
      if (poziom && poziom !== 'minal') roczne.push({ wpis, data: ter.data, poziom });
    }
  }

  const poDacie = (a, b) => (a.data ? a.data.getTime() : Infinity) - (b.data ? b.data.getTime() : Infinity);
  roczne.sort(poDacie);
  jednorazowe.sort(poDacie);
  return { roczne, jednorazowe };
}
