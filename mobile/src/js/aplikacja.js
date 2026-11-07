// Mikropłatności na telefonie: lista, terminy, paragon, dodawanie i edycja, synchronizacja z Google Dyskiem.
// Obliczenia i format danych wspólne z aplikacją PC (pliki kopiowane z pc/resources/js przy budowaniu).

import { termin, doPlatnosci, dniTekst, kiedyTekst, formatujDate, parsujDate, zbierzAlarmy, czyZakonczona, czyWstrzymana, dzis, isoDnia, zakupBiezacegoOkresu, doZaplaty, oznaczZaplate, czerwienZaplaty, przeniesNastepnaCene, nazwaOkresu, ostatniaPlatnosc } from './alarmy.js';
import { WALUTY, waluta, naPln, formatujKwote, wczytajZapamietane, odswiezZNbp, czyAktualne, ustawProwizje, pobierzProwizje, poprawnaProwizja } from './waluty.js';
import { renderujPodsumowanie, policz } from './podsumowanie.js';
import { wypelnijListe } from './spisy.js';
import { nowyWpis, doZapisu, usun, formatujKoszt, parsujKoszt, zastosujFormularz, nazwaWpisu, bezZaleglegoOdbioru, dodajPrzyklad, nicDoStracenia, OKRESY, KATEGORIE, nazwaKategorii, normalizuj, noweId, odczytajTresc, zastapZKopii } from './dane.js';
import { funkcja, ustawFunkcje, pobierzFunkcje, reczna, zmiennaKwota, osobWpisu, cenaNastepna, kategoriaWpisu, firmowa } from './funkcje.js';
import { renderujAnulowane } from './anulowane.js';
import { renderujHistorie } from './historia.js';
import { wczytajNaStart, zapiszPlik, usunDaneLokalne, zrobKopie, znacznikCzasu } from './magazyn.js';
import { przygotujDysk, czyPolaczony } from './dysk.js';
import { wczytajUstawienia, zapiszUstawienia, poprawnyBudzet } from './ustawienia.js';
import { pokazOAplikacji } from './oAplikacji.js';
import { pokazUstawienia } from './ustawieniaOkno.js';
import { polaczSynchronizacje, OPOZNIENIE_WYSYLKI, poWymianie } from './synchronizacja.js';
import { renderujMiarke, ulozTory } from './miarka.js';
import { rozplanuj, tytul, tresc, wczytajPamiec, zapiszPamiec, DOMYSLNE_RODZAJE } from './powiadomienia.js';
import { element } from './dom.js';
import { podepnijPomocStrony, przetlumaczPomoc } from './pomoc.js';
import { t, tn, ustawJezyk, jezyk, region, przetlumaczStrone, dataDluga, liczbaKrotka } from './teksty.js';
import { pustyFiltr, pasuje, poprawFiltr, renderujFiltr } from './filtr.js';
import { doCsv } from './eksport.js';
import { dekoduj, odczytajWyciag, znajdzPowtarzajace } from './wyciag.js';
import { pokazWyciag } from './wyciagOkno.js';

const FOLDER = 'Mikroplatnosci';
const PLIK = FOLDER + '/mikroplatnosci.json';
const PLIK_KURSOW = FOLDER + '/kursy.json';
const PLIK_POWIADOMIEN = FOLDER + '/powiadomienia.json';
const PLIK_USTAWIEN = FOLDER + '/ustawienia.json';
const FOLDER_KOPII = FOLDER + '/kopie';
const MAKS_ZAPLANOWANYCH = 400; // Android pozwala aplikacji na ok. 500 budzików

const stan = {
  wpisy: [],
  usuniete: [],
  zablokowany: false,
  lokalnie: true, // „Zapisuj w telefonie” - wyłączone: dane tylko w pamięci i na Google Dysku
  synchronizacja: false,
  edytowany: null, // wpis w arkuszu edycji (null = nowy)
  timerWysylki: null,
  doWyslania: false, // zmiany jeszcze nie wysłane na Dysk (także po nieudanej wysyłce)
  powiadomienia: { ...DOMYSLNE_RODZAJE }, // rodzaje powiadomień z „Ustawień”
  jezyk: '', // F27: wybrany w „Ustawieniach”; pusty - język telefonu
  wprowadzenie: false, // F25: notatki „pierwsze kroki” nad listą (do schowania)
  budzet: 0, // D19: budżet miesięczny w zł (0 = bez limitu)
  filtr: pustyFiltr(), // D17: filtr nad listą (niezapamiętywany)
};

const $ = (id) => document.getElementById(id);

function pokazBlad(tekst) {
  $('blad').textContent = tekst;
  $('blad').hidden = false;
}

// --- dane -------------------------------------------------------------

// Odczyt i zapis jak na PC (magazyn.js): tylko „nie ma pliku” (NE_FS_NOPATHE z neutralino-telefon.js)
// znaczy nowy zeszyt; pusty, obcy albo nieczytelny plik = błąd i blokada zapisu.
// Zwraca kopia() (kopia zapasowa wczytanej treści) albo null, gdy pliku jeszcze nie ma.
async function wczytaj() {
  const plik = await wczytajNaStart(PLIK, FOLDER_KOPII);
  if (!plik) return null;
  stan.wpisy = plik.odczytane.wpisy;
  stan.usuniete = plik.odczytane.usuniete;
  return plik.kopia;
}

// Zapisy po kolei (dwa naraz pisałyby do tego samego pliku tymczasowego); zapis przez plik
// tymczasowy i podmianę - zanik zasilania w trakcie zapisu nie zostawia uciętego pliku.
// Zwraca false, gdy zapis w telefonie się nie udał.
let kolejkaZapisu = Promise.resolve(true);
function zapisz() {
  kolejkaZapisu = kolejkaZapisu.then(async () => {
    if (stan.zablokowany || !stan.lokalnie) return true;
    try {
      await zapiszPlik(PLIK, JSON.stringify(doZapisu(stan), null, 2));
      return true;
    } catch (e) {
      pokazBlad(t('Błąd zapisu na telefonie - ostatnia zmiana może zniknąć.'));
      console.error(e);
      return false;
    }
  });
  return kolejkaZapisu;
}

// A3: ceny od następnej płatności, których dzień już nadszedł, stają się zapłaconymi (jak w main.js na PC).
// Zmiana ceny to zwykła zmiana wpisu (czas zmiany - do scalania z Dyskiem); samo zapamiętanie dnia - nie.
// Zwraca true, gdy jest co zapisać.
function przeniesCeny() {
  if (stan.zablokowany) return false;
  let zmiana = false;
  for (const w of stan.wpisy) {
    const wynik = przeniesNastepnaCene(w);
    if (wynik === 'cena') w.zmieniono = new Date().toISOString();
    if (wynik) zmiana = true;
  }
  return zmiana;
}

// Po każdej zmianie: zapis w telefonie, a przy włączonym Dysku - wysyłka po chwili (kilka zmian = jedna wysyłka).
async function poZmianie() {
  przeniesCeny();
  await zapisz();
  renderuj();
  zaplanujWysylke();
  zaplanujPowiadomienia();
}

// doWyslania (jak na PC): nieudana wysyłka (np. bez internetu) czeka na następną wymianę z Dyskiem.
function zaplanujWysylke() {
  if (!czyPolaczony() || stan.zablokowany) return;
  stan.doWyslania = true;
  clearTimeout(stan.timerWysylki);
  dysk.pokaz(t('zmiany czekają na wysłanie…'));
  stan.timerWysylki = setTimeout(wyslijZaleglosci, OPOZNIENIE_WYSYLKI);
}

async function wyslijZaleglosci() {
  clearTimeout(stan.timerWysylki);
  stan.timerWysylki = null;
  if (stan.synchronizacja) {
    if (stan.doWyslania) zaplanujWysylke(); // trwa inna wymiana z Dyskiem - wysyłka zaraz po niej
    return false;
  }
  const wyslij = stan.doWyslania;
  stan.doWyslania = false; // zmiany w trakcie wysyłki ustawią to od nowa
  const ok = await dysk.synchronizuj(wyslij);
  if (!ok && wyslij) stan.doWyslania = true;
  return ok;
}

// --- widok ------------------------------------------------------------

// Najpierw najbliższe płatności, potem bez daty, na końcu zakończone jednorazowe.
function kolejnosc(w) {
  if (czyZakonczona(w)) return [2, 0];
  const dp = doPlatnosci(w);
  return dp ? [0, dp.dni] : [1, 0];
}

function kwotaTekst(wpis) {
  if (typeof wpis.koszt !== 'number') return '-';
  const kod = waluta(wpis);
  const pln = naPln(wpis);
  return formatujKwote(wpis.koszt, kod) + (kod !== 'PLN' && pln !== null ? ' ≈ ' + formatujKwote(pln) : '');
}

// Okres na karcie: zwykłe „mies.” i „rok”, inne po nazwie („co kwartał”).
function okresTekst(wpis) {
  if (wpis.coIle > 1 || wpis.okres === 'T') return nazwaOkresu(wpis);
  return wpis.okres === 'R' ? t('rok') : t('mies.');
}

// Wiersz pod kartą z polem do zaznaczenia (A4 „oddane”).
function dopisekZPolem(klasa, tekst, etykieta, opisPola, naZaznaczenie) {
  const wiersz = element('div', klasa);
  const pole = element('input');
  pole.type = 'checkbox';
  pole.setAttribute('aria-label', opisPola);
  const napis = element('label', 'karta-zaplac karta-zaplac--wiersz');
  napis.append(pole, ' ' + etykieta);
  pole.addEventListener('change', () => { if (pole.checked) naZaznaczenie(); });
  wiersz.append(element('span', 't-dopisek__tekst', tekst), napis);
  return wiersz;
}

// A2: kwota za każdym razem inna - po „☐ zapłacone” pytanie, ile zapłacono (podpowiedź - ostatnia kwota).
function pytanieOKwote(wpis, pole) {
  const wiersz = element('div', 't-ile');
  const kwota = element('input');
  kwota.type = 'text';
  kwota.inputMode = 'decimal';
  kwota.setAttribute('aria-label', t('Ile zapłacono'));
  kwota.value = formatujKoszt(wpis.historia?.at(-1)?.kwota ?? wpis.prognoza ?? wpis.koszt);
  const zapisz = element('button', 't-zapisz', t('zapisz'));
  zapisz.type = 'button';
  zapisz.addEventListener('click', async () => {
    const wartosc = parsujKoszt(kwota.value);
    if (typeof wartosc !== 'number') {
      kwota.classList.add('pole--blad');
      kwota.focus();
      return;
    }
    if (!oznaczZaplate(wpis, wartosc)) return;
    wpis.zmieniono = new Date().toISOString();
    await poZmianie();
  });
  wiersz.append(element('span', '', t('ile?')), kwota, element('span', '', waluta(wpis)), zapisz);
  pole.addEventListener('change', () => {
    wiersz.hidden = !pole.checked;
    if (pole.checked) {
      kwota.focus();
      kwota.select();
    }
  });
  wiersz.hidden = true;
  return wiersz;
}

function utworzKarte(wpis) {
  const li = element('li');
  const ramka = element('div');
  li.append(ramka);
  const karta = element('button', 'karta');
  karta.type = 'button';
  const jednorazowa = wpis.przedluzac === 'nie';
  const zakonczona = czyZakonczona(wpis);
  karta.classList.toggle('karta--jednorazowa', jednorazowa);
  karta.classList.toggle('karta--zakonczona', zakonczona);

  const gora = element('span', 'karta__gora');
  const nazwa = element('span', 'karta__nazwa');
  if (jednorazowa) nazwa.append(element('span', 'wykrzyknik', '!'), element('span', 'sr', t('jednorazowa, do wycofania') + ': '));
  nazwa.append(nazwaWpisu(wpis));
  gora.append(nazwa, element('span', 'karta__koszt', kwotaTekst(wpis)));
  karta.append(gora);
  // Moja część wspólnej płatności (jak na PC).
  const osob = osobWpisu(wpis);
  if (osob > 1 && typeof wpis.koszt === 'number') karta.append(element('span', 'karta__nastepna', `÷ ${osob} = ${formatujKwote(wpis.koszt / osob, waluta(wpis))}`));
  // Cena od następnej płatności pod zapłaconą (jak „NASTĘPNA” na PC) - tylko gdy wpisana.
  const nastepnaCena = cenaNastepna(wpis);
  if (nastepnaCena !== null) {
    const roznica = typeof wpis.koszt === 'number' ? Math.round((nastepnaCena - wpis.koszt) * 100) / 100 : 0;
    const zmiana = roznica > 0 ? ' ▲ +' + formatujKoszt(roznica) : roznica < 0 ? ' ▼ ' + formatujKoszt(roznica) : '';
    const nastepna = element('span', 'karta__nastepna', t('następna') + ' ' + formatujKwote(nastepnaCena, waluta(wpis)));
    if (zmiana) nastepna.append(element('span', roznica > 0 ? 'karta__drozej' : 'karta__taniej', zmiana));
    karta.append(nastepna);
  }
  if (wpis.opis.trim()) karta.append(element('span', 'karta__opis', wpis.opis));
  // D17, D18: kategoria (fiszka indeksu) i „na firmę” (pieczątka) pod opisem - tekstem, nie samym kolorem.
  const kategoria = kategoriaWpisu(wpis);
  if (kategoria || firmowa(wpis)) {
    const znaczki = element('span', 'znaczki');
    if (kategoria) {
      const fiszka = element('span', 'fiszka', nazwaKategorii(kategoria));
      fiszka.dataset.kategoria = kategoria;
      znaczki.append(fiszka);
    }
    if (firmowa(wpis)) znaczki.append(element('span', 'pieczatka-firma', t('na firmę')));
    karta.append(znaczki);
  }

  const dol = element('span', 'karta__dol');
  const dp = doPlatnosci(wpis);
  const data = termin(wpis).data;
  const wstrzymana = czyWstrzymana(wpis);
  if (wstrzymana) {
    dol.append(element('span', 'pauza', t('wstrzymana')));
  } else if (dp) {
    const lont = element('span', 'lont karta__lont');
    const liczba = element('span', 'lont__liczba');
    const tor = element('span', 'lont__tor');
    tor.append(element('span', 'lont__ogien'));
    lont.append(liczba, tor);
    if (dp.minal) {
      lont.classList.add('lont--minal');
      // Po terminie (zaległa płatność ręczna, zakończona jednorazowa) - na czerwono, jak na PC.
      const zalegle = doZaplaty(wpis)?.zalegle || zakonczona;
      lont.classList.toggle('lont--zalegle', !!zalegle);
      if (zalegle) liczba.replaceChildren(dniTekst(-dp.dni), element('span', 'lont__po-terminie', ' ' + t('po terminie')));
      else liczba.textContent = t('minęło {dni}', { dni: dniTekst(-dp.dni) });
      lont.style.setProperty('--zostalo', '0');
    } else {
      liczba.textContent = dp.dni < 2 ? kiedyTekst(dp.dni) : tn(dp.dni, 'za {n} dzień', 'za {n} dni', 'za {n} dni');
      lont.style.setProperty('--odcien', String(dp.odcien));
      lont.style.setProperty('--zostalo', String(Math.max(dp.zostalo, 0.03)));
    }
    dol.append(lont);
  } else {
    dol.append(element('span', 'karta__brak', t('brak daty zakupu - uzupełnij')));
  }
  // Płatność ręczna blisko terminu - czerwony margines i „zapłać do …” (jak na PC); „☐ zapłacone” obok karty.
  const dz = doZaplaty(wpis);
  const recznie = reczna(wpis) && !jednorazowa && !dz && !wstrzymana ? ' · ' + t('ręcznie') : '';
  // Pauza: pod spodem dzień wznowienia (jak na PC).
  dol.append(element('span', 'karta__termin', wstrzymana ? t('wraca {data}', { data: formatujDate(parsujDate(wpis.wstrzymanaDo)) }) : (data ? formatujDate(data) + ' · ' : '') + okresTekst(wpis) + recznie));
  karta.append(dol);
  if (jednorazowa && dp?.minal) karta.append(element('span', 'dopisek--uwaga', t('termin minął - sprawdź, czy anulowano')));
  // Karta czerwienieje z każdym dniem do terminu, po terminie - najmocniej (jak wiersz na PC).
  // Zakończona jednorazowa - tak samo mocno czerwona jak zaległa płatność (trzeba coś z nią zrobić).
  karta.classList.toggle('karta--do-zaplaty', !!dz || zakonczona);
  karta.classList.toggle('karta--po-terminie', !!dz?.zalegle || zakonczona);
  if (zakonczona) karta.style.setProperty('--czerwien', czerwienZaplaty(-1) + '%');
  if (dz) {
    karta.style.setProperty('--czerwien', czerwienZaplaty(dz.dni) + '%');
    // Ostatnia linijka karty - obok niej stoi pole „☐ zapłacone”. B8: termin w dzień wolny - ostatni dzień roboczy przed nim.
    karta.append(element('span', 'karta__zaplac', t('zapłać do {data}', { data: jezyk() === 'pl' ? formatujDate(dz.doDnia).slice(0, 5) : dz.doDnia.toLocaleDateString(region(), { day: 'numeric', month: 'short' }) })));
  }

  karta.addEventListener('click', () => otworzArkusz(wpis));
  ramka.append(karta);
  // „☐ zapłacone” od razu przy karcie (jak na PC) - osobne pole obok karty, bo karta sama jest przyciskiem.
  // Zaznaczenie = zapłacone: karta wraca do zwykłego odliczania do następnego terminu.
  if (dz) {
    ramka.classList.add('karta-z-zaplata');
    const pole = element('input');
    pole.type = 'checkbox';
    pole.setAttribute('aria-label', t('Zapłacone: {nazwa}, termin {data}', { nazwa: nazwaWpisu(wpis), data: formatujDate(dz.data) }));
    const etykieta = element('label', 'karta-zaplac');
    etykieta.append(pole, ' ' + t('zapłacone'));
    ramka.append(etykieta);
    if (zmiennaKwota(wpis)) li.append(pytanieOKwote(wpis, pole));
    else {
      pole.addEventListener('change', async () => {
        if (!pole.checked || !oznaczZaplate(wpis)) return;
        wpis.zmieniono = new Date().toISOString();
        await poZmianie();
      });
    }
  }
  // A4: po każdej płatności „odbierz po … : Ania, Tomek” i pole ☐ oddane (gdy wpisane imiona).
  const ostatnia = osob > 1 && wpis.ktoOddaje.trim() && !wstrzymana ? ostatniaPlatnosc(wpis) : null;
  if (ostatnia && isoDnia(ostatnia) > wpis.oddaneTermin) {
    const kto = wpis.ktoOddaje.trim();
    const tekst = typeof wpis.koszt === 'number' ? t('odbierz po {kwota}: {kto}', { kwota: formatujKwote(wpis.koszt / osob, waluta(wpis)), kto }) : t('odbierz: {kto}', { kto });
    li.append(dopisekZPolem('t-dopisek', tekst, t('oddane'), t('Oddane - płatność z {data}', { data: formatujDate(ostatnia) }), async () => {
      bezZaleglegoOdbioru(wpis);
      wpis.zmieniono = new Date().toISOString();
      await poZmianie();
    }));
  }
  // D18: pozycja na firmę - po każdej płatności „pobierz fakturę” i pole ☐ pobrana (jak na PC).
  const ostatniaFirmowa = firmowa(wpis) && !wstrzymana ? ostatniaPlatnosc(wpis) : null;
  if (ostatniaFirmowa && isoDnia(ostatniaFirmowa) > wpis.fakturaTermin) {
    li.append(dopisekZPolem('t-dopisek t-dopisek--faktura', t('pobierz fakturę'), t('pobrana'), t('Faktura pobrana - płatność z {data}', { data: formatujDate(ostatniaFirmowa) }), async () => {
      wpis.fakturaTermin = isoDnia(ostatniaFirmowa);
      wpis.zmieniono = new Date().toISOString();
      await poZmianie();
    }));
  }
  return li;
}

function renderuj() {
  // Anulowane (C15, jak na PC) - poza listą kart, w „Anulowanych” pod nią; sumy, alarmy
  // i powiadomienia pomijają je same (wspólne obliczenia).
  const widoczne = stan.wpisy.filter((w) => !w.anulowano);
  const posortowane = widoczne.sort((a, b) => {
    const [ka, da] = kolejnosc(a);
    const [kb, db] = kolejnosc(b);
    return ka - kb || da - db;
  });
  // D17: filtr tylko chowa karty - wyłączona funkcja kasuje też ustawiony filtr.
  stan.filtr = poprawFiltr(stan.filtr);
  const przefiltrowane = posortowane.filter((w) => pasuje(w, stan.filtr));
  $('karty').replaceChildren(...przefiltrowane.map(utworzKarte));
  renderujFiltr($('filtr'), widoczne, stan.filtr, przefiltrowane.length, (f) => {
    stan.filtr = f;
    renderuj();
  });
  $('pusto').hidden = widoczne.length > 0;
  $('legenda').hidden = !widoczne.length;
  renderujAnulowane($('anulowane'), stan.wpisy, { naPrzywroc: przywroc, naUsun: usunNaZawsze });

  const { roczne, jednorazowe } = zbierzAlarmy(stan.wpisy);
  wypelnijListe($('alarmy-roczne'), roczne, t('Żadna roczna płatność w ciągu 3 miesięcy.'), false);
  wypelnijListe($('alarmy-jednorazowe'), jednorazowe, t('Nic do wycofania.'), true);
  renderujMiarke($('miarka'), [...roczne, ...jednorazowe]);
  renderujPodsumowanie($('paragon'), stan.wpisy, { budzet: stan.budzet });
  // D20: historia wydatków pod paragonem; wyłączona - sekcja znika (nic nie jest liczone).
  $('historia').hidden = !funkcja('historia');
  if (funkcja('historia')) renderujHistorie($('historia'), stan.wpisy);
  else $('historia').replaceChildren();
  pokazProwizje();
  $('suma-miesiac').textContent = t('{kwota} / mies.', { kwota: formatujKwote(policz(stan.wpisy).lacznieMiesiecznie) });
  $('dzisiaj').textContent = dataDluga(new Date());
}

// --- zakładki ---------------------------------------------------------

let zakladka = 'lista';

function pokazZakladke(nazwa) {
  zakladka = nazwa;
  for (const przycisk of document.querySelectorAll('[data-zakladka]')) {
    const ta = przycisk.dataset.zakladka === nazwa;
    if (ta) przycisk.setAttribute('aria-current', 'page');
    else przycisk.removeAttribute('aria-current');
    $('zakladka-' + przycisk.dataset.zakladka).hidden = !ta;
  }
  $('tresc').scrollTop = 0;
  // Etykiety miarki układane dopiero na widocznej zakładce (wymiary ukrytej są zerowe).
  if (nazwa === 'terminy') ulozMiarke();
}

const ulozMiarke = () => ulozTory($('miarka').querySelector('.miarka__znaczniki'));
window.addEventListener('resize', () => { if (zakladka === 'terminy') ulozMiarke(); });

for (const przycisk of document.querySelectorAll('[data-zakladka]')) {
  przycisk.addEventListener('click', () => pokazZakladke(przycisk.dataset.zakladka));
}

// --- arkusz edycji ----------------------------------------------------

const formularz = $('formularz');
const pola = formularz.elements;

function otworzArkusz(wpis) {
  stan.edytowany = wpis;
  const w = wpis ?? { ...nowyWpis(), od: new Date().toLocaleDateString('sv-SE') }; // nowy: zakup dziś
  $('arkusz-tytul').textContent = wpis ? t('Edycja pozycji') : t('Nowa pozycja');
  pola.nazwa.value = w.nazwa;
  pola.opis.value = w.opis;
  pola.koszt.value = formatujKoszt(w.koszt);
  pola.waluta.value = waluta(w);
  $('pole-waluta').hidden = !funkcja('waluty') && waluta(w) === 'PLN'; // obca waluta zostaje do zmiany
  pola.od.value = w.od;
  // mies. / rok - tylko co 1; kwartał, tydzień, 2 lata - „inny”. Wyłączone „Inne okresy” - bez „inny”, chyba że pozycja już go ma.
  const inny = !!w.okres && (w.okres === 'T' || w.coIle > 1);
  $('opcja-okres-inny').hidden = !funkcja('okresy') && !inny;
  for (const r of pola.okres) r.checked = false; // wpis bez okresu - bez zaznaczenia z poprzedniej pozycji
  pola.okres.value = inny ? 'inny' : w.okres;
  pola.coIle.value = String(w.coIle || 1);
  pola.jednostka.value = w.okres || 'M';
  pokazOkresInny();
  pola.przedluzac.checked = w.przedluzac !== 'nie'; // przełącznik: puste „-” liczy się jak „tak”
  pola.prognoza.value = formatujKoszt(w.prognoza);
  $('pole-prognoza').hidden = !funkcja('nastepna');
  pola.platnosc.value = w.platnoscReczna ? 'reczna' : '';
  $('pole-platnosc').hidden = !funkcja('platnosc');
  pola.koniecMiesiaca.checked = !!w.koniecMiesiaca;
  pola.zmiennaKwota.checked = !!w.zmiennaKwota;
  pokazKoniecMiesiaca();
  // Dzielę koszt i pauza zwinięte - w nagłówku grupy obecna wartość.
  const osob = osobWpisu(w);
  pola.osob.value = String(w.osob || 1); // wyłączone „Dzielę koszt” - zapis bez zmian nie kasuje liczby osób
  pola.ktoOddaje.value = w.ktoOddaje;
  $('grupa-dziel').hidden = !funkcja('dzielenie');
  $('grupa-dziel').open = false;
  $('dziel-wartosc').textContent = osob > 1 ? t('na {n} os.', { n: osob }) : t('nie');
  pauzaNowa = undefined;
  const wstrzymana = czyWstrzymana(w);
  pola.wstrzymanaDo.value = wstrzymana ? w.wstrzymanaDo : '';
  const jutro = dzis();
  jutro.setDate(jutro.getDate() + 1); // nie +24 h - w dniu zmiany czasu doba ma 23 albo 25 h
  pola.wstrzymanaDo.min = isoDnia(jutro);
  $('grupa-pauza').open = false;
  $('pauza-wartosc').textContent = wstrzymana ? t('do {data}', { data: formatujDate(parsujDate(w.wstrzymanaDo)) }) : t('nie');
  $('pauza-wznow').hidden = !wstrzymana;
  $('pauza-usun').hidden = !w.wstrzymanaDo;
  pokazPauze();
  // Kategoria i „na firmę” (D17, D18); przy wyłączonej funkcji pola schowane, a wartość zostaje bez zmian.
  pola.kategoria.replaceChildren(new Option(t('bez kategorii'), ''), ...KATEGORIE.map(([k, n]) => new Option(t(n), k)));
  pola.kategoria.value = w.kategoria;
  $('pole-kategoria').hidden = !funkcja('kategorie');
  pola.firmowa.checked = !!w.firmowa;
  $('pole-firmowa').hidden = !funkcja('firma');
  pola.link.value = w.link;
  $('formularz-blad').textContent = '';
  $('arkusz-usun').hidden = !wpis;
  $('arkusz-usun').textContent = t('Wykreśl');
  delete $('arkusz-usun').dataset.potwierdz;
  $('arkusz').showModal();
  // Nowa pozycja - od razu pisanie nazwy; edycja - bez klawiatury, dopóki nie dotknie się pola.
  if (wpis) document.activeElement?.blur();
  else pola.nazwa.focus();
}

formularz.addEventListener('submit', async (e) => {
  e.preventDefault();
  // Wspólna logika (dane.js, z testami): wpis szukany po id - w trakcie edycji mogły przyjść zmiany z Dysku.
  const wartosci = Object.fromEntries(['nazwa', 'opis', 'koszt', 'waluta', 'od', 'prognoza', 'platnosc', 'link', 'ktoOddaje', 'kategoria'].map((p) => [p, pola[p].value]));
  // „Inny” okres z pól „co [N] [jednostka]”; mies. i rok zawsze co 1; bez wyboru - zostaje, jak było.
  if (pola.okres.value === 'inny') {
    const co = Math.round(Number(pola.coIle.value));
    wartosci.okres = pola.jednostka.value;
    wartosci.coIle = co >= 1 && co <= 99 ? co : stan.edytowany?.coIle || 1;
  } else if (pola.okres.value) {
    wartosci.okres = pola.okres.value;
    wartosci.coIle = 1;
  }
  wartosci.zmiennaKwota = pola.zmiennaKwota.checked;
  wartosci.firmowa = pola.firmowa.checked;
  wartosci.osob = Math.round(Number(pola.osob.value));
  wartosci.wstrzymanaDo = pauzaNowa;
  // Przełącznik nie zmieniany przy pustym „-” zostawia puste (bez sztucznej zmiany wpisu).
  wartosci.przedluzac = !pola.przedluzac.checked ? 'nie' : stan.edytowany?.przedluzac === '' ? '' : 'tak';
  wartosci.koniecMiesiaca = pola.koniecMiesiaca.checked;
  const { blad, wpis } = zastosujFormularz(stan.wpisy, stan.edytowany, wartosci);
  if (blad) {
    $('formularz-blad').textContent = blad;
    return;
  }
  if (!pasuje(wpis, stan.filtr)) stan.filtr = pustyFiltr(); // zapisana pozycja nie znika za filtrem
  $('arkusz').close();
  await poZmianie();
});

// Wykreślenie w dwóch dotknięciach - bez okna systemowego. Jak „×” na PC (C15): pozycja trafia do
// „Anulowanych” z dzisiejszą datą, do przywrócenia; na zawsze - dopiero „usuń na zawsze” w „Anulowanych”.
// Z wyłączonymi „Anulowanymi” wykreślenie usuwa na zawsze; przykład (F25) i pusty wpis znikają od razu.
$('arkusz-usun').addEventListener('click', async () => {
  const przycisk = $('arkusz-usun');
  const wpis = stan.wpisy.find((w) => w.id === stan.edytowany?.id); // obiekt mógł podmienić Dysk w trakcie edycji
  const odRazu = wpis && nicDoStracenia(wpis);
  const archiwum = funkcja('archiwum');
  // Drugie dotknięcie liczy się dopiero po chwili - przypadkowe podwójne nie wykreśla od razu.
  if (!odRazu && !(Date.now() - Number(przycisk.dataset.potwierdz) > 500)) {
    if (przycisk.dataset.potwierdz) return;
    przycisk.dataset.potwierdz = String(Date.now());
    przycisk.textContent = archiwum ? t('Wykreślić? Trafi do „Anulowanych” - dotknij jeszcze raz') : t('Wykreślić? Tego nie da się cofnąć - dotknij jeszcze raz');
    return;
  }
  $('arkusz').close();
  if (!wpis) return;
  if (odRazu || !archiwum) usun(stan, wpis);
  else {
    wpis.anulowano = isoDnia(dzis());
    wpis.zmieniono = new Date().toISOString();
  }
  await poZmianie();
});

// „Anulowane”: przywrócenie na listę z tymi samymi danymi albo usunięcie na zawsze (jak na PC).
async function przywroc(wpis) {
  wpis.anulowano = '';
  wpis.zmieniono = new Date().toISOString();
  await poZmianie();
}

async function usunNaZawsze(wpis) {
  if (!confirm(t('Usunąć „{nazwa}” na zawsze? Tego nie da się cofnąć.', { nazwa: nazwaWpisu(wpis) }))) return;
  usun(stan, wpis);
  await poZmianie();
}

// „nie” po kilku okresach - termin ma być najbliższym odnowieniem, a nie pierwszym po dawnym zakupie (jak na PC).
pola.przedluzac.addEventListener('change', () => {
  if (pola.przedluzac.checked) return;
  const inny = pola.okres.value === 'inny';
  pola.od.value = zakupBiezacegoOkresu({ od: pola.od.value, okres: inny ? pola.jednostka.value : pola.okres.value, coIle: inny ? Math.round(Number(pola.coIle.value)) || 1 : 1 });
});

// „Termin do końca miesiąca” i „Kwota za każdym razem inna” widać tylko przy „płacę sam” (jak w „⋯” na PC); „Przedłużać” - zawsze.
function pokazKoniecMiesiaca() {
  const recznie = pola.platnosc.value === 'reczna' && funkcja('platnosc');
  $('pole-koniec-miesiaca').hidden = !recznie;
  $('pole-zmienna-kwota').hidden = !recznie || !funkcja('kwotaZmienna');
  $('pomoc-recznie').hidden = !recznie;
}
pola.platnosc.addEventListener('change', pokazKoniecMiesiaca);

// Pola „inny” okres - gotowe okresy ustawiają „co [N] [jednostka]”; mies. i rok mają własne pola wyboru.
function pokazOkresInny() {
  $('pole-okres-inny').hidden = pola.okres.value !== 'inny';
  const co = Math.round(Number(pola.coIle.value));
  for (const b of $('okres-gotowe').children) b.setAttribute('aria-pressed', String(b.dataset.okres === pola.jednostka.value && Number(b.dataset.ile) === co));
}
for (const [typ, ile, napis] of OKRESY.filter(([typ, ile]) => typ === 'T' || ile > 1)) {
  const b = element('button', 'okres-wybor__opcja', t(napis));
  b.type = 'button';
  b.dataset.okres = typ;
  b.dataset.ile = String(ile);
  b.addEventListener('click', () => {
    pola.jednostka.value = typ;
    pola.coIle.value = String(ile);
    pokazOkresInny();
  });
  $('okres-gotowe').append(b);
}
for (const p of [...pola.okres, pola.coIle, pola.jednostka]) p.addEventListener('change', pokazOkresInny);

// Pauza jednorazowej się nie ustawia - tę się wycofuje. pauzaNowa: undefined - bez zmian (zastosujFormularz).
let pauzaNowa;
function pokazPauze() {
  $('grupa-pauza').hidden = !pola.przedluzac.checked || !funkcja('pauza');
}
pola.przedluzac.addEventListener('change', pokazPauze);
pola.wstrzymanaDo.addEventListener('change', () => { pauzaNowa = pola.wstrzymanaDo.value; });
$('pauza-wznow').addEventListener('click', () => {
  pauzaNowa = isoDnia(dzis());
  pola.wstrzymanaDo.value = '';
  $('pauza-wartosc').textContent = t('wznów od dziś');
});
$('pauza-usun').addEventListener('click', () => {
  pauzaNowa = '';
  pola.wstrzymanaDo.value = '';
  $('pauza-wartosc').textContent = t('bez pauzy');
});

pola.waluta.append(...WALUTY.map((kod) => new Option(kod, kod)));

$('arkusz-anuluj').addEventListener('click', () => $('arkusz').close());
$('arkusz').addEventListener('close', () => { stan.edytowany = null; });
$('dodaj').addEventListener('click', () => otworzArkusz(null));

// --- Google Dysk ------------------------------------------------------

const dysk = polaczSynchronizacje({
  stan,
  poScaleniu: async () => {
    przeniesCeny();
    await zapisz();
    renderuj();
    zaplanujPowiadomienia();
  },
  klasaBledu: 't-dysk__stan--blad',
  otworzOdRazu: false, // na telefonie najpierw kod do skopiowania, potem strona Google
  czyLokalnie: () => stan.lokalnie,
  wlaczLokalnie: () => wlaczZapisLokalny(),
  naOdswiez: () => odswiezMiejsceZapisu(),
});

// --- gdzie zapisywać: „Zapisuj w telefonie”, „Usuń z telefonu” ----------

// Bez zapisu w telefonie i bez Dysku dane są tylko w pamięci - lista wyszarzona, informacja u góry.
function odswiezMiejsceZapisu() {
  const bezZapisu = !stan.zablokowany && !stan.lokalnie && !czyPolaczony();
  $('lokalnie-wlacz').checked = stan.lokalnie;
  $('lokalnie-wlacz').disabled = stan.zablokowany || stan.synchronizacja;
  $('usun-lokalnie').disabled = stan.zablokowany || stan.synchronizacja || !stan.lokalnie;
  $('bez-zapisu').hidden = !bezZapisu;
  $('tresc').inert = bezZapisu;
  document.body.classList.toggle('bez-zapisu', bezZapisu);
  if (!stan.zablokowany) $('dodaj').disabled = bezZapisu;
}

const zapiszMojeUstawienia = () => zapiszUstawienia(PLIK_USTAWIEN, {
  lokalnie: stan.lokalnie, prowizja: pobierzProwizje(), funkcje: pobierzFunkcje(), powiadomienia: stan.powiadomienia, jezyk: stan.jezyk, wprowadzenie: stan.wprowadzenie, budzet: stan.budzet,
}).catch(console.error);

// A6, A7: kursy i prowizja potrzebne przy włączonych „Walutach obcych” albo pozycji w walucie obcej.
const uzywaWalut = () => funkcja('waluty') || stan.wpisy.some((w) => waluta(w) !== 'PLN');
// Po nowych kursach także powiadomienia (kwoty „Przygotuj pieniądze” w zł).
const poKursach = () => {
  renderuj();
  zaplanujPowiadomienia();
};
const pobierzKursyGdyTrzeba = () => { if (uzywaWalut() && !czyAktualne()) odswiezZNbp(PLIK_KURSOW).then(poKursach).catch(console.error); };

function pokazProwizje() {
  $('prowizja').hidden = !uzywaWalut();
  if (document.activeElement !== $('prowizja-pole')) $('prowizja-pole').value = liczbaKrotka(pobierzProwizje());
}
$('prowizja-pole').addEventListener('change', (e) => {
  const procent = Number(String(e.target.value).replace(',', '.').replace('%', '').trim());
  if (Number.isFinite(procent)) ustawProwizje(poprawnaProwizja(procent)); // np. „abc” - zostaje poprzednia
  e.target.blur();
  zapiszMojeUstawienia();
  renderuj();
  zaplanujPowiadomienia(); // „Przygotuj pieniądze” liczy z prowizją
});

// --- Ustawienia: funkcje i powiadomienia (okno wspólne z PC, ustawieniaOkno.js) ---

function zastosujFunkcje(funkcje) {
  ustawFunkcje(funkcje);
  zapiszMojeUstawienia();
  // Ponownie włączona „Cena następna” - cena, której dzień minął, staje się zapłaconą.
  if (przeniesCeny()) poZmianie().catch(console.error);
  else {
    renderuj();
    zaplanujPowiadomienia();
  }
  pobierzKursyGdyTrzeba(); // włączone waluty - kursy, jeśli dziś jeszcze nie pobrane
}

// F27: język strony - teksty z index.html (teksty.js); to, co rysuje kod, odświeża zmienJezyk.
const pokazWersje = () => { $('wersja').textContent = t('wersja {numer}', { numer: window.WERSJA_APLIKACJI || t('robocza') }); };

function zastosujJezyk() {
  ustawJezyk(stan.jezyk);
  document.documentElement.lang = jezyk();
  // Napisy w przełącznikach tak / nie pochodzą z CSS (::after) - tu jako zmienne CSS.
  document.documentElement.style.setProperty('--napis-tak', JSON.stringify(t('tak')));
  document.documentElement.style.setProperty('--napis-nie', JSON.stringify(t('nie')));
  przetlumaczStrone();
  przetlumaczPomoc();
  pokazWersje();
}

function zmienJezyk(j) {
  stan.jezyk = j;
  zastosujJezyk();
  zapiszMojeUstawienia();
  renderuj();
  dysk.odswiez();
  zaplanujPowiadomienia(); // zaplanowane powiadomienia w nowym języku
  otworzUstawienia(); // okno ustawień od razu w nowym języku
}

// F25: pierwsze kroki nad listą i przykładowa pozycja do wykreślenia.
const dodajPrzykladowy = () => dodajPrzyklad(stan.wpisy, t('wykreśl mnie, gdy dodasz własne'));
const pokazWprowadzenie = () => { $('wprowadzenie').hidden = !stan.wprowadzenie; };

$('wprowadzenie-zmaz').addEventListener('click', () => {
  stan.wprowadzenie = false;
  pokazWprowadzenie();
  zapiszMojeUstawienia();
});

const otworzUstawienia = () => pokazUstawienia(
  { telefon: true, funkcje: pobierzFunkcje(), powiadomienia: stan.powiadomienia, jezyk: jezyk(), budzet: stan.budzet },
  {
    naFunkcje: zastosujFunkcje,
    naJezyk: zmienJezyk,
    naBudzet(kwota) {
      stan.budzet = poprawnyBudzet(kwota);
      zapiszMojeUstawienia();
      renderuj();
    },
    // Notatki jeszcze raz (przykładowa pozycja tylko przy pustej liście).
    naWprowadzenie() {
      stan.wprowadzenie = true;
      zapiszMojeUstawienia();
      pokazWprowadzenie();
      pokazZakladke('lista');
      if (!stan.wpisy.some((w) => !w.anulowano) && !stan.zablokowany && !$('dodaj').disabled) {
        dodajPrzykladowy();
        poZmianie().catch(console.error);
      }
    },
    naPowiadomienia(p) {
      stan.powiadomienia = p;
      zapiszMojeUstawienia();
      return przygotujPowiadomienia().catch((e) => {
        console.error(e);
        return true; // błąd wtyczki to nie odmowa użytkownika
      });
    },
  },
);
$('ustawienia').addEventListener('click', otworzUstawienia);

// Plik danych, plik tymczasowy i wszystkie kopie zapasowe (po zapisach, które jeszcze trwają).
async function usunPlikDanych() {
  await kolejkaZapisu;
  await usunDaneLokalne(PLIK, FOLDER_KOPII);
}

// Włączenie zapisu w telefonie: obecne dane (np. pobrane z Dysku) trafiają do pliku w telefonie.
// Nieudany zapis rzuca błąd - „Usuń z Dysku” nie usunie wtedy jedynej kopii danych.
async function wlaczZapisLokalny() {
  stan.lokalnie = true;
  const ok = await zapisz();
  if (!ok) stan.lokalnie = false;
  await zapiszMojeUstawienia();
  odswiezMiejsceZapisu();
  if (!ok) throw new Error(t('Nie udało się zapisać danych w telefonie.'));
}

// Wyłączenie zapisu w telefonie: najpierw wysyłka na Dysk, potem plik danych znika z telefonu.
// Zwraca false, gdy użytkownik zrezygnował albo wysyłka się nie udała.
async function wylaczZapisLokalny() {
  const polaczony = czyPolaczony();
  const pytanie = polaczony
    ? t('Przestać zapisywać dane w telefonie? Najpierw zostaną wysłane na Google Dysk, potem plik danych i kopie zapasowe zostaną usunięte z telefonu. Każda zmiana będzie od razu wysyłana na Dysk.')
    : t('Synchronizacja z Google Dyskiem jest wyłączona - bez zapisu w telefonie dane znikną po zamknięciu aplikacji. Usunąć plik danych i kopie zapasowe z telefonu?');
  if (!confirm(pytanie)) return false;
  if (polaczony && !(await dysk.synchronizuj(true))) {
    pokazBlad(t('Nie udało się wysłać na Dysk - dane zostają w telefonie.'));
    return false;
  }
  if (polaczony) stan.doWyslania = false;
  stan.lokalnie = false;
  await zapiszMojeUstawienia();
  await usunPlikDanych().catch((e) => {
    pokazBlad(t('Nie udało się usunąć pliku danych z telefonu.'));
    console.error(e);
  });
  return true;
}

// „Usuń z telefonu”: lista i plik danych. Przy połączonym Dysku dane najpierw idą na Dysk i tam
// zostają, a synchronizacja w telefonie się wyłącza (inaczej wróciłyby przy pobraniu).
async function usunZTelefonu() {
  if (stan.zablokowany || stan.synchronizacja || !stan.lokalnie) return;
  const polaczony = czyPolaczony();
  const pytanie = polaczony
    ? t('Usunąć wszystkie dane z tego telefonu - listę, plik danych i kopie zapasowe? Najpierw zostaną wysłane na Google Dysk i tam zostaną, a synchronizacja w telefonie się wyłączy. Tego nie da się cofnąć. Pliki z „Zapisz kopię” i eksportu w folderze Dokumenty/Mikroplatnosci zostają.')
    : t('Usunąć wszystkie dane z tego telefonu - listę, plik danych i kopie zapasowe? Synchronizacja z Dyskiem jest wyłączona, więc dane znikną całkiem. Tego nie da się cofnąć. Pliki z „Zapisz kopię” i eksportu w folderze Dokumenty/Mikroplatnosci zostają.');
  if (!confirm(pytanie)) return;
  if (polaczony && !(await dysk.synchronizuj(true))) {
    pokazBlad(t('Nie udało się wysłać na Dysk - nic nie zostało usunięte.'));
    return;
  }
  clearTimeout(stan.timerWysylki);
  stan.timerWysylki = null;
  stan.doWyslania = false;
  if (polaczony) await dysk.wylacz().catch(console.error);
  try {
    await usunPlikDanych();
  } catch (e) {
    pokazBlad(t('Nie udało się usunąć pliku danych z telefonu.'));
    console.error(e);
    return;
  }
  stan.wpisy = [];
  stan.usuniete = [];
  renderuj();
  zaplanujPowiadomienia();
}

$('lokalnie-wlacz').addEventListener('change', async (e) => {
  const pole = e.target;
  pole.disabled = true;
  try {
    if (pole.checked) await wlaczZapisLokalny();
    else if (!(await wylaczZapisLokalny())) pole.checked = true;
  } finally {
    odswiezMiejsceZapisu();
  }
});
$('usun-lokalnie').addEventListener('click', usunZTelefonu);

// --- E23, E24: kopia, eksport, import (pod paragonem) ---

const MAKS_PLIKU = 20 * 1024 * 1024;
const trescDanych = () => JSON.stringify(doZapisu(stan), null, 2);
const ilePozycji = (n) => tn(n, '{n} pozycja', '{n} pozycje', '{n} pozycji');

function pokazStanPliku(tekst, blad = false) {
  $('plik-stan').textContent = tekst;
  $('plik-stan').classList.toggle('t-plik__stan--blad', blad);
}

// Bez blokady odczytu - inaczej pusta lista udawałaby kopię danych, których nie udało się wczytać.
async function zapiszDokument(nazwa, tresc) {
  if (stan.zablokowany) return;
  try {
    await Neutralino.os.zapiszDokument(nazwa, tresc);
    pokazStanPliku(t('zapisano: Dokumenty/Mikroplatnosci/{plik}', { plik: nazwa }));
  } catch (e) {
    pokazStanPliku(t('Nie udało się zapisać pliku.'), true);
    console.error(e);
  }
}

$('plik-zapisz').addEventListener('click', () => zapiszDokument(`mikroplatnosci-kopia-${znacznikCzasu()}.json`, trescDanych()));
$('plik-csv').addEventListener('click', () => zapiszDokument(`mikroplatnosci-${znacznikCzasu()}.csv`, doCsv(stan.wpisy)));

// Wybór pliku bez ograniczenia typu: banki i Menedżer plików różnie oznaczają CSV, a treść i tak jest sprawdzana.
let rodzajPliku = '';
for (const [przycisk, rodzaj] of [['plik-wczytaj', 'kopia'], ['plik-bank', 'bank']]) {
  $(przycisk).addEventListener('click', () => {
    rodzajPliku = rodzaj;
    pokazStanPliku('');
    $('plik-wybor').click();
  });
}
$('plik-wybor').addEventListener('change', async (e) => {
  const plik = e.target.files?.[0];
  e.target.value = ''; // ten sam plik drugi raz też wywoła „change”
  if (!plik || stan.zablokowany) return;
  if (plik.size > MAKS_PLIKU) {
    alert(t('Plik jest za duży (ponad 20 MB).'));
    return;
  }
  // Powrót z okna wyboru pliku uruchamia pobranie z Dysku („resume”) - plik czeka na jego koniec.
  await poWymianie(stan);
  await (rodzajPliku === 'kopia' ? wczytajKopie(plik) : wczytajWyciagBankowy(plik)).catch((blad) => {
    pokazStanPliku(t('Nie udało się wczytać pliku.'), true);
    console.error(blad);
  });
});

// E23: kopia z pliku zastępuje dane; zasady jak na PC (zastapZKopii): obecne najpierw do kopii zapasowej.
async function wczytajKopie(plik) {
  let dane;
  try {
    dane = odczytajTresc(await plik.text());
  } catch (e) {
    alert(t('„{plik}” to nie jest kopia danych Mikropłatności (albo plik jest uszkodzony).', { plik: plik.name }));
    console.error(e);
    return;
  }
  const obecne = ilePozycji(stan.wpisy.length);
  const nowe = ilePozycji(dane.wpisy.length);
  const pytanie = stan.lokalnie
    ? t('Zastąpić obecne dane ({obecne}) danymi z pliku „{plik}” ({nowe})? Obecne dane najpierw trafią do kopii zapasowej w telefonie.', { obecne, nowe, plik: plik.name })
    : t('Zastąpić obecne dane ({obecne}) danymi z pliku „{plik}” ({nowe})? Zapis w telefonie jest wyłączony, więc obecne dane nie trafią do kopii zapasowej.', { obecne, nowe, plik: plik.name });
  if (!confirm(pytanie)) return;
  if (stan.lokalnie) {
    try {
      await kolejkaZapisu;
      await zrobKopie(FOLDER_KOPII, trescDanych());
    } catch (e) {
      pokazStanPliku(t('Nie udało się zrobić kopii zapasowej - nic nie zmieniono.'), true);
      console.error(e);
      return;
    }
  }
  zastapZKopii(stan, dane);
  stan.filtr = pustyFiltr();
  await poZmianie();
  pobierzKursyGdyTrzeba();
  pokazStanPliku(t('wczytano kopię: {ile}', { ile: nowe }));
}

// E24: wyciąg bankowy - powtarzające się płatności do wybrania w oknie (wyciagOkno.js).
async function wczytajWyciagBankowy(plik) {
  const operacje = odczytajWyciag(dekoduj(await plik.arrayBuffer()));
  if (!operacje) {
    alert(t('Nie rozpoznaję pliku „{plik}”. Potrzebny wyciąg w formacie CSV z kolumnami daty, kwoty i opisu (w bankowości internetowej: historia operacji → eksport → CSV).', { plik: plik.name }));
    return;
  }
  const daty = operacje.map((o) => o.data).sort();
  const info = { plik: plik.name, operacji: operacje.length, od: daty[0], do: daty.at(-1) };
  pokazWyciag(znajdzPowtarzajace(operacje, stan.wpisy.filter((w) => !w.anulowano)), info, (lista) => dopiszZWyciagu(lista).catch(console.error));
}

// Data ostatniej płatności = data zakupu - termin następnej liczy się sam (jak na PC).
async function dopiszZWyciagu(lista) {
  if (!lista.length || stan.zablokowany) return;
  const teraz = new Date().toISOString();
  for (const p of lista) {
    stan.wpisy.push(normalizuj({
      id: noweId(), nazwa: p.nazwa, opis: t('z wyciągu bankowego'), koszt: p.kwota, waluta: p.waluta,
      od: p.ostatnia, okres: p.okres, coIle: p.coIle, przedluzac: 'tak', zmieniono: teraz,
    }));
  }
  stan.filtr = pustyFiltr();
  await poZmianie();
  pobierzKursyGdyTrzeba();
  pokazStanPliku(tn(lista.length, 'dopisano {n} pozycję z wyciągu', 'dopisano {n} pozycje z wyciągu', 'dopisano {n} pozycji z wyciągu'));
}

// Numer wersji wpisuje przygotuj.mjs (wersja.js) przy każdym budowaniu.
pokazWersje();
podepnijPomocStrony();
$('o-aplikacji').addEventListener('click', () => pokazOAplikacji('telefon', (adres) => Neutralino.os.open(adres).catch(console.error)));

// --- powiadomienia ----------------------------------------------------

// Telefon planuje powiadomienia z wyprzedzeniem - przychodzą o 9:00 także przy zamkniętej aplikacji.
const Powiadomienia = window.Capacitor?.isNativePlatform() ? Capacitor.registerPlugin('LocalNotifications') : null;
let pamiecPowiadomien = null;
let timerPowiadomien = null;

// Stały numer powiadomienia z klucza (Android wymaga liczby całkowitej).
function numer(klucz) {
  let h = 0;
  for (const z of klucz) h = (Math.imul(h, 31) + z.codePointAt(0)) | 0;
  return (h >>> 1) || 1;
}

function zaplanujPowiadomienia() {
  clearTimeout(timerPowiadomien);
  timerPowiadomien = setTimeout(() => planujPowiadomienia().catch(console.error), 1000);
}

async function planujPowiadomienia() {
  if (!Powiadomienia || !pamiecPowiadomien || stan.zablokowany) return;
  const { teraz, przyszle } = rozplanuj(stan.wpisy, pamiecPowiadomien, new Date(), stan.powiadomienia);
  // Tylko przyszłe: budzik, którego czas minął, a Android go jeszcze nie pokazał (alarm niedokładny,
  // oszczędzanie baterii), przyjdzie sam - rozplanuj liczy go już jako dostarczony.
  const { notifications: oczekujace } = await Powiadomienia.getPending();
  const przyszleOczekujace = oczekujace.filter((n) => !(new Date(n.schedule?.at) <= Date.now()));
  if (przyszleOczekujace.length) await Powiadomienia.cancel({ notifications: przyszleOczekujace.map((n) => ({ id: n.id })) });
  const plan = przyszle.slice(0, MAKS_ZAPLANOWANYCH);
  // Bez zgody na dokładne alarmy - niedokładne (Android pokaże je trochę później), bez otwierania
  // ekranu „Alarmy i przypomnienia” przy każdym planowaniu (powrót z niego to „resume” i kolejne planowanie).
  const { exact_alarm } = await Powiadomienia.checkExactNotificationSetting();
  const dokladne = exact_alarm === 'granted';
  // „Teraz” bez schedule - wtyczka pokazuje od razu, a następne planowanie nie może ich anulować.
  const powiadomienie = (p, dzien, schedule) => ({ id: numer(p.klucz), title: tytul(p), body: tresc(p, dzien), isExactNotification: dokladne, ...(schedule && { schedule }) });
  const lista = [
    ...teraz.map((p) => powiadomienie(p, dzis())),
    ...plan.map((p) => powiadomienie(p, undefined, { at: p.godzina, allowWhileIdle: true })),
  ];
  if (lista.length) await Powiadomienia.schedule({ notifications: lista });
  pamiecPowiadomien.zaplanowane = new Set(plan.map((p) => p.klucz));
  await zapiszPamiec(pamiecPowiadomien);
}

// O zgodę Androida pytamy dopiero, gdy jakiś rodzaj powiadomień jest włączony. Wszystkie wyłączone: nic
// nowego, a już zaplanowane znikają (plan bez rodzajów jest pusty). Zwraca false, gdy Android nie pozwala.
async function przygotujPowiadomienia() {
  if (!Powiadomienia || stan.zablokowany) return true;
  const { wycofaj, zaplac, drogie, podwyzka } = stan.powiadomienia;
  if (wycofaj || zaplac || drogie || podwyzka) {
    const { display } = await Powiadomienia.checkPermissions();
    if (display !== 'granted' && (await Powiadomienia.requestPermissions()).display !== 'granted') return false;
    pamiecPowiadomien ??= await wczytajPamiec(PLIK_POWIADOMIEN);
  }
  zaplanujPowiadomienia(); // z opóźnieniem - kilka przełączników pod rząd = jedno planowanie
  return true;
}

// --- system -----------------------------------------------------------

// Motyw jak w telefonie: ciemny albo jasny.
const ciemny = window.matchMedia('(prefers-color-scheme: dark)');
const ustawMotyw = () => { document.documentElement.dataset.motyw = ciemny.matches ? 'ciemny' : 'jasny'; };
ciemny.addEventListener('change', ustawMotyw);
ustawMotyw();

// Przycisk „Wstecz” Androida: chowa dymek „?”, zamyka otwarte okno (ostatnie), potem wraca do listy, dopiero potem chowa aplikację.
const App = window.Capacitor?.isNativePlatform() ? Capacitor.registerPlugin('App') : null;
App?.addListener('backButton', () => {
  const dymek = $('pomoc-okno');
  const okno = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (dymek.matches(':popover-open')) dymek.hidePopover();
  else if (okno) okno.close();
  else if (zakladka !== 'lista') pokazZakladke('lista');
  else App.minimizeApp();
});
// Przejście do innej aplikacji: niewysłane zmiany od razu na Dysk (Android może potem zamrozić albo
// zamknąć aplikację w tle, a drugie urządzenie nie zobaczyłoby zmiany do następnej edycji).
// Trwająca wymiana z Dyskiem - wysyłka zaraz po niej (wyslijZaleglosci ustawia licznik od nowa).
App?.addListener('pause', () => {
  if (stan.doWyslania) wyslijZaleglosci();
});
// Nowy dzień (powrót z tła albo północ przy otwartej aplikacji): ceny następne, terminy, powiadomienia, kursy.
function nowyDzien() {
  if (przeniesCeny()) zapisz().then(zaplanujWysylke);
  renderuj();
  zaplanujPowiadomienia();
  pobierzKursyGdyTrzeba();
}
// Aplikacja otwarta przez północ (bez wyjścia do tła) - odświeżenie tuż po niej (jak licznik co 30 min na PC).
let timerPolnocy = null;
function czekajNaPolnoc() {
  clearTimeout(timerPolnocy);
  const jutro = dzis();
  jutro.setDate(jutro.getDate() + 1);
  timerPolnocy = setTimeout(() => {
    nowyDzien();
    czekajNaPolnoc();
  }, jutro - Date.now() + 1000);
}
// Powrót do aplikacji: świeże terminy i zmiany z komputera; niewysłane zmiany idą przy okazji.
App?.addListener('resume', () => {
  nowyDzien();
  czekajNaPolnoc(); // licznik w tle mógł stanąć (Android usypia aplikację)
  if (!dysk.trwaLogowanie()) wyslijZaleglosci();
});

async function start() {
  try {
    await przygotujDysk(FOLDER);
  } catch (e) {
    console.error(e);
  }
  const ustawienia = await wczytajUstawienia(PLIK_USTAWIEN);
  stan.lokalnie = ustawienia.lokalnie;
  ustawFunkcje(ustawienia.funkcje);
  ustawProwizje(ustawienia.prowizja);
  stan.jezyk = ustawienia.jezyk || '';
  stan.wprowadzenie = ustawienia.wprowadzenie === true;
  stan.budzet = poprawnyBudzet(ustawienia.budzet);
  zastosujJezyk();
  let kopia = null;
  try {
    // Bez zapisu w telefonie dane przychodzą tylko z Dysku (pobranie na końcu startu).
    if (stan.lokalnie) {
      kopia = await wczytaj();
      // Kopia przy uruchomieniu (5 najnowszych), zanim cokolwiek się zapisze.
      if (kopia) await kopia().catch(console.error);
      if (przeniesCeny()) await zapisz(); // po kopii zapasowej
    }
  } catch (e) {
    // Nie nadpisujemy pliku, którego nie umiemy odczytać.
    stan.zablokowany = true;
    pokazBlad(t('Nie udało się odczytać danych w telefonie. Zmiany NIE będą zapisywane, żeby ich nie nadpisać.'));
    $('dodaj').disabled = true;
    console.error(e);
  }
  // Pierwsze uruchomienie z „Ustawieniami” (jak na PC): kto już używa aplikacji (jest plik danych albo dane
  // na Dysku), zachowuje „Wycofaj” i „Zapłać”; nowa osoba - wszystkie powiadomienia wyłączone.
  if (ustawienia.powiadomienia) stan.powiadomienia = ustawienia.powiadomienia;
  else if (!stan.zablokowany) {
    const uzywana = kopia !== null || !stan.lokalnie || czyPolaczony();
    stan.powiadomienia = { ...DOMYSLNE_RODZAJE, wycofaj: uzywana, zaplac: uzywana };
    // F25: nowa osoba - notatki „pierwsze kroki” i przykładowa pozycja (zapisana jak każda inna).
    if (!uzywana && !stan.wpisy.length) {
      stan.wprowadzenie = true;
      dodajPrzykladowy();
      await zapisz();
    }
    zapiszMojeUstawienia();
  }
  pokazWprowadzenie();
  await wczytajZapamietane(PLIK_KURSOW);
  renderuj();
  dysk.odswiez();
  if (uzywaWalut()) odswiezZNbp(PLIK_KURSOW).then(poKursach).catch(console.error);
  przygotujPowiadomienia().catch(console.error);
  dysk.synchronizuj(false);
  czekajNaPolnoc();
}

start();
