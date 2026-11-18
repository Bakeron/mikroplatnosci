// Tabela mikropłatności: wiersze z edycją w komórkach i przesuwaniem.

import { termin, formatujDate, parsujDate, doPlatnosci, dniTekst, kiedyTekst, ustawPrzedluzanie, doZaplaty, oznaczZaplate, ustawPoczatekZaplaty, czerwienZaplaty, przeniesNastepnaCene, nazwaOkresu, czyWstrzymana, ostatniaPlatnosc, isoDnia, dzis } from './alarmy.js';
import { waluta, przeliczNaPln, formatujKwote } from './waluty.js';
import { bezpiecznyLink, formatujKoszt, parsujKoszt, nazwaWpisu, zapiszZmianeCeny, kategorieWyboru, oznaczKategorie, OKRESY, nazwaKategorii, ustawPauze, wznowDzis, usunPauze, bezZaleglegoOdbioru, czasZmiany } from './dane.js';
import { element, pokazPlynnie, trescObokKrzyzyka, zamienPoKolei } from './dom.js';
import { funkcja, reczna as recznaWpisu, zmiennaKwota, osobWpisu, kategoriaWpisu, firmowa, walutyWyboru, walutaNastepnej, zmianaNastepnej } from './funkcje.js';
import { przyciskPomocy } from './pomoc.js';
import { t, tekst, jezyk, liczba, region } from './teksty.js';

const odswiezacze = new WeakMap();
let numerKarteczki = 0; // nazwy kotwic CSS (anchor-name) - karteczka „⋯” wisi przy swoim przycisku

// Rozwijana grupa w karteczce „⋯” (rzadziej zmieniane ustawienia): w zwiniętej widać nazwę i obecną wartość,
// więc karteczka zostaje krótka, a i tak widać, co jest ustawione.
function grupa(nazwa) {
  const det = element('details', 'karteczka__grupa');
  const podsumowanie = element('summary', 'karteczka__pole karteczka__podsumowanie');
  const wartosc = element('span', 'karteczka__wartosc');
  podsumowanie.append(element('span', 'karteczka__nazwa', nazwa), wartosc);
  const tresc = element('div', 'karteczka__tresc');
  det.append(podsumowanie, tresc);
  return { det, wartosc, tresc };
}

// Małe pole w karteczce z etykietą nad nim.
function poleKarteczki(etykieta, input) {
  const label = element('label', 'karteczka__male');
  label.append(element('span', 'karteczka__etykieta', etykieta), input);
  return label;
}

function pole(typ, wartosc, etykieta, klasa) {
  const input = element('input', 'pole' + (klasa ? ' ' + klasa : ''));
  input.type = typ;
  input.value = wartosc;
  input.setAttribute('aria-label', etykieta);
  input.autocomplete = 'off';
  input.spellcheck = false;
  return input;
}

function komorka(...dzieci) {
  const td = element('td');
  td.append(...dzieci);
  return td;
}

// Jednoliniowe pole, które zawija tekst w kolejne linijki zamiast go ucinać (Enter nie dodaje nowej linii).
function poleWieloliniowe(wartosc, etykieta, klasa, max) {
  const pole = element('textarea', 'pole ' + klasa);
  pole.rows = 1;
  pole.value = wartosc;
  pole.setAttribute('aria-label', etykieta);
  pole.spellcheck = false;
  pole.maxLength = max;
  pole.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  return pole;
}

// Kwota wpisana w pole: liczba, null (puste) albo undefined (błąd - pole podkreślone na czerwono).
function kwotaZPola(pole) {
  const wartosc = parsujKoszt(pole.value);
  pole.classList.toggle('pole--blad', wartosc === undefined);
  return wartosc;
}

export function utworzWiersz(wpis, { onZmiana: zglosZmiane, onUsun, onOtworz, onPrzesun }) {
  // Każda zmiana w wierszu zapisuje jej czas - potrzebny przy scalaniu z Google Dyskiem.
  // Przy tym dzień ceny następnej (A3) liczy się od nowa, gdy zmienił się termin; gdyby już minął -
  // cena od razu staje się zapłaconą i wiersz się odświeża.
  const onZmiana = () => {
    wpis.zmieniono = czasZmiany(wpis);
    if (przeniesNastepnaCene(wpis) === 'cena') odswiez();
    zglosZmiane();
  };
  const tr = element('tr');
  tr.dataset.id = wpis.id;

  // Lp. - numer jest też uchwytem do przesuwania wiersza (przeciąganie albo strzałki).
  const uchwyt = element('button', 'uchwyt');
  uchwyt.type = 'button';
  uchwyt.title = t('Przeciągnij, aby przesunąć wiersz (albo strzałki ↑ ↓)');
  uchwyt.addEventListener('pointerdown', () => { tr.draggable = true; });
  uchwyt.addEventListener('pointerup', () => { tr.draggable = false; });
  // Strzałki na uchwycie albo Alt + strzałki w dowolnym polu wiersza.
  tr.addEventListener('keydown', (e) => {
    if ((e.target === uchwyt || e.altKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      if (karteczka.matches(':popover-open')) karteczka.hidePopover();
      onPrzesun(wpis, e.key === 'ArrowUp' ? -1 : 1, document.activeElement);
    }
  });

  const znak = element('span', 'wykrzyknik', '!');
  znak.title = t('Jednorazowa - wycofaj przed odnowieniem');
  znak.append(element('span', 'sr', ' ' + t('jednorazowa, do wycofania'))); // czytnik ekranu zamiast samego „!”

  // Data zakupu: tekst z ikonką, kliknięcie otwiera kalendarz (pole daty jest pod spodem, niewidoczne).
  const od = pole('date', wpis.od, t('Data zakupu'), 'data__pole');
  od.tabIndex = -1;
  od.setAttribute('aria-hidden', 'true');
  const odPrzycisk = element('button', 'data');
  odPrzycisk.type = 'button';
  odPrzycisk.title = t('Wybierz datę zakupu z kalendarza');
  const dataRamka = element('div', 'data-ramka');
  dataRamka.append(od, odPrzycisk);

  // Okres płatności: miesięczna albo roczna - termin liczy się od daty zakupu.
  const okresWybor = element('div', 'okres-wybor');
  okresWybor.setAttribute('role', 'group');
  okresWybor.setAttribute('aria-label', t('Okres płatności'));
  const okresOpcje = [['M', t('mies.')], ['R', t('rok')]].map(([wartosc, tekst]) => {
    const opcja = element('button', 'okres-wybor__opcja', tekst);
    opcja.type = 'button';
    opcja.addEventListener('click', () => ustawOkres(wartosc, 1));
    okresWybor.append(opcja);
    return [wartosc, opcja];
  });
  // „inny” - kwartał, tydzień, co 2 lata… wybierane w karteczce „⋯” (grupa „Okres” od razu rozwinięta).
  const okresInny = element('button', 'okres-wybor__opcja', t('inny'));
  okresInny.type = 'button';
  okresInny.title = t('Inny okres: tydzień, 4 tygodnie, kwartał, pół roku, 2 lata…');
  okresWybor.append(okresInny);
  const okresDopisek = element('div', 'dopisek dopisek--okres');
  const terminData = element('div', 'dopisek dopisek--termin');
  // Pauza: zamiast lontu „wstrzymana”, pod spodem dzień wznowienia.
  const pauza = element('div', 'pauza', t('wstrzymana'));

  // Lont: liczba dni + pasek, który skraca się i czerwienieje w miarę zbliżania płatności.
  const lont = element('div', 'lont');
  const lontLiczba = element('span', 'lont__liczba');
  const lontTor = element('span', 'lont__tor');
  const lontOgien = element('span', 'lont__ogien');
  lontTor.append(lontOgien);
  lont.append(lontLiczba, lontTor);
  const uwaga = element('div', 'dopisek dopisek--uwaga');

  // Płatność ręczna: „zapłać do …” i pole ☐ zapłacone pod lontem, gdy termin blisko albo minął.
  // Zaznaczenie = zapłacone: wiersz wraca do zwykłego odliczania do następnego terminu (bez napisu „zapłacone”).
  const zaplac = element('div', 'zaplac');
  const zaplacTekst = element('span', 'zaplac__tekst');
  const zaplacPole = element('input');
  zaplacPole.type = 'checkbox';
  const zaplacEtykieta = element('label', 'zaplac__pole');
  zaplacEtykieta.append(zaplacPole, ' ' + t('zapłacone'));
  // Kwota za każdym razem inna: po zaznaczeniu „zapłacone” pytanie, ile zapłacono (podpowiedź - ostatnia kwota).
  const zaplacKwota = element('div', 'zaplac__kwota');
  zaplacKwota.hidden = true;
  const zaplacKwotaPole = pole('text', '', t('Ile zapłacono'), 'pole--koszt pole--zaplacono');
  zaplacKwotaPole.inputMode = 'decimal';
  const zaplacKwotaWaluta = element('span', 'prognoza__waluta');
  const zaplacKwotaOk = element('button', 'zaplac__ok', t('zapisz'));
  zaplacKwotaOk.type = 'button';
  zaplacKwota.append(element('span', 'zaplac__pytanie', t('ile?')), zaplacKwotaPole, zaplacKwotaWaluta, zaplacKwotaOk);
  zaplac.append(zaplacTekst, zaplacEtykieta, zaplacKwota);

  // Wspólna płatność z imionami: po każdej płatności „odbierz po … : Ania, Tomek” i pole ☐ oddane.
  const odbierz = element('div', 'odbierz');
  const odbierzTekst = element('span', 'odbierz__tekst');
  const odbierzPole = element('input');
  odbierzPole.type = 'checkbox';
  const odbierzEtykieta = element('label', 'zaplac__pole');
  odbierzEtykieta.append(odbierzPole, ' ' + t('oddane'));
  odbierz.append(odbierzTekst, odbierzEtykieta);

  // D18: pozycja na firmę - po każdej płatności „pobierz fakturę” i pole ☐ pobrana.
  const faktura = element('div', 'odbierz faktura');
  const fakturaPole = element('input');
  fakturaPole.type = 'checkbox';
  const fakturaEtykieta = element('label', 'zaplac__pole');
  fakturaEtykieta.append(fakturaPole, ' ' + t('pobrana'));
  faktura.append(element('span', 'odbierz__tekst', t('pobierz fakturę')), fakturaEtykieta);

  const nazwa = pole('text', wpis.nazwa, t('Nazwa'), 'pole--nazwa');
  nazwa.maxLength = 200;

  const opis = poleWieloliniowe(wpis.opis, t('Krótki opis'), 'pole--opis', 300);
  opis.placeholder = t('krótki opis…');

  const koszt = pole('text', formatujKoszt(wpis.koszt), t('Koszt'), 'pole--koszt');
  koszt.inputMode = 'decimal';
  koszt.placeholder = jezyk() === 'pl' ? '0,00' : '0.00';
  const walutaWybor = element('select', 'pole pole--waluta');
  walutaWybor.setAttribute('aria-label', t('Waluta'));
  // Waluty włączone w ustawieniach i własna pozycji (zmiana ustawień przebudowuje tabelę).
  walutaWybor.append(...walutyWyboru(waluta(wpis)).map((kod) => new Option(kod, kod)));
  walutaWybor.value = waluta(wpis);
  const wPln = element('div', 'dopisek dopisek--pln');
  const czesc = element('div', 'dopisek dopisek--czesc'); // „÷ 4 = 15,00 zł” - moja część wspólnej płatności
  czesc.title = t('Twoja część - w sumach na paragonie liczy się tylko ona (ustawienie w „⋯”)');
  const kosztRamka = element('div', 'koszt-ramka');
  kosztRamka.append(koszt, walutaWybor);

  // Cena od następnej płatności - pod zapłaconą, wpisywana ręcznie (np. koniec promocji, zapowiedziana
  // podwyżka). Pusta = zostaje zapłacona; wtedy w komórce tylko „+ następna cena”.
  const prognoza = pole('text', formatujKoszt(wpis.prognoza), t('Cena od następnej płatności'), 'pole--koszt pole--nastepna');
  prognoza.inputMode = 'decimal';
  prognoza.placeholder = t('wpisz…');
  const prognozaEtykieta = element('span', 'nastepna__etykieta', t('następna'));
  prognozaEtykieta.setAttribute('aria-hidden', 'true'); // czytnik ekranu ma etykietę pola
  const prognozaWaluta = element('span', 'prognoza__waluta');
  // Waluta ceny następnej - domyślnie ta sama co koszt (np. Perplexity: zapłacone 20 zł, następna 200 USD).
  const prognozaWybor = element('select', 'pole pole--waluta');
  prognozaWybor.setAttribute('aria-label', t('Waluta ceny następnej'));
  prognozaWybor.append(...walutyWyboru(waluta(wpis), walutaNastepnej(wpis)).map((kod) => new Option(kod, kod)));
  const prognozaRamka = element('div', 'koszt-ramka nastepna');
  prognozaRamka.title = t('Cena od następnej płatności - gdy kończy się promocja albo serwis zapowiedział podwyżkę. Pusta = zostaje zapłacona.');
  prognozaRamka.append(prognozaEtykieta, prognoza, prognozaWaluta, prognozaWybor);
  // „≈ … zł” i „▲ +6,00” w jednej linijce pod drugą ceną.
  const prognozaPln = element('span');
  const prognozaInfo = element('span', 'dopisek--prognoza');
  const prognozaDopisek = element('div', 'dopisek nastepna__dopisek');
  prognozaDopisek.append(prognozaPln, prognozaInfo);
  const prognozaDodaj = element('button', 'nastepna-dodaj', t('+ następna cena'));
  prognozaDodaj.type = 'button';
  prognozaDodaj.title = t('Dopisz cenę od następnej płatności (koniec promocji, podwyżka)');
  let prognozaOtwarta = false; // kliknięte „+ następna cena”, pole jeszcze puste
  let prognozaDoFokusu = false; // fokus w polu ceny, gdy już się pojawi (zamienPoKolei)

  const link = poleWieloliniowe(wpis.link, t('Link'), 'pole--link', 2000);
  link.inputMode = 'url';
  link.placeholder = 'https://';
  const otworz = element('button', 'otworz', '↗');
  otworz.type = 'button';
  otworz.title = t('Otwórz link w przeglądarce');

  // Przełącznik tak / nie (kółko w prawo = tak). Puste „-” liczy się jak „tak”, więc pokazuje „tak”.
  const przedluzac = element('input', 'przelacznik');
  przedluzac.type = 'checkbox';
  przedluzac.setAttribute('role', 'switch');
  przedluzac.checked = wpis.przedluzac !== 'nie';

  // „⋯” - karteczka z ustawieniami, które ustawia się raz (przedłużać, sposób płatności).
  // Okienko „popover”: nad tabelą, zamyka je Esc albo kliknięcie obok; przyklejone do przycisku kotwicą CSS.
  const wiecej = element('button', 'wiecej', '⋯');
  wiecej.type = 'button';
  wiecej.title = t('Ustawienia pozycji: płatność, przedłużać, okres, podział kosztu, pauza');
  const karteczka = element('div', 'karteczka');
  karteczka.popover = 'auto';
  karteczka.setAttribute('role', 'dialog');
  wiecej.popoverTargetElement = karteczka;
  const kotwica = `--karteczka-${++numerKarteczki}`;
  wiecej.style.setProperty('anchor-name', kotwica);
  karteczka.style.setProperty('position-anchor', kotwica);
  const karteczkaTytul = element('div', 'karteczka__tytul');
  const karteczkaX = element('button', 'okno__x', '×');
  karteczkaX.type = 'button';
  karteczkaX.title = t('Zamknij');
  karteczkaX.setAttribute('aria-label', t('Zamknij'));
  karteczkaX.addEventListener('click', () => karteczka.hidePopover());
  const przedluzacEtykieta = element('label', 'karteczka__pole');
  przedluzacEtykieta.append(element('span', 'karteczka__nazwa', t('Przedłużać')), przedluzac);
  const platnoscWybor = element('div', 'okres-wybor karteczka__wybor');
  platnoscWybor.setAttribute('role', 'group');
  platnoscWybor.setAttribute('aria-label', t('Płatność'));
  const platnoscOpcje = [[false, t('pobiera się sama')], [true, t('płacę sam')]].map(([reczna, tekst]) => {
    const opcja = element('button', 'okres-wybor__opcja', tekst);
    opcja.type = 'button';
    opcja.addEventListener('click', () => {
      // Włączenie „płacę sam” - do zapłaty od dziś (co minęło, pobrało się samo). „Przedłużać” widać przy obu sposobach płatności.
      if (reczna && !wpis.platnoscReczna) {
        wpis.platnoscReczna = true;
        ustawPoczatekZaplaty(wpis, true);
      }
      wpis.platnoscReczna = reczna;
      odswiez();
      onZmiana();
    });
    platnoscWybor.append(opcja);
    return [reczna, opcja];
  });
  const platnoscPole = element('div', 'karteczka__pole');
  // F26: „?” przy „Płatność” - czym różni się „płacę sam” od „pobiera się sama”.
  const platnoscNazwa = element('span', 'karteczka__nazwa', t('Płatność'));
  platnoscNazwa.append(' ', przyciskPomocy(tekst('„Pobiera się sama” - karta albo konto płacą bez Ciebie. „Płacę sam” - rachunek, który płacisz ręcznie (np. prąd): tydzień przed terminem wiersz czerwienieje, a po zapłacie zaznaczasz „☐ zapłacone”.'), tekst('Płatność')));
  // „?” zaraz za „płacę sam” - co się dzieje przed terminem takiej płatności.
  platnoscWybor.append(przyciskPomocy(tekst('„Płacę sam” - od 7 dni przed terminem wiersz czerwienieje, pojawia się „zapłać do …”, pole „zapłacone” i powiadomienie.'), tekst('płacę sam')));
  platnoscPole.append(platnoscNazwa, platnoscWybor);
  // Tylko przy „płacę sam”: termin w ostatnim dniu miesiąca (np. rachunki, których data zmienia się co miesiąc).
  const koniecPole = element('input', 'przelacznik przelacznik--zwykly');
  koniecPole.type = 'checkbox';
  koniecPole.setAttribute('role', 'switch');
  const koniecEtykieta = element('label', 'karteczka__pole');
  koniecEtykieta.append(element('span', 'karteczka__nazwa', t('Termin do końca miesiąca')), koniecPole);
  // Tylko przy „płacę sam”: kwota za każdym razem inna (prąd, gaz) - przy „zapłacone” pytanie, ile zapłacono.
  const zmiennaPole = element('input', 'przelacznik przelacznik--zwykly');
  zmiennaPole.type = 'checkbox';
  zmiennaPole.setAttribute('role', 'switch');
  const zmiennaEtykieta = element('label', 'karteczka__pole');
  zmiennaEtykieta.title = t('Przy zaznaczaniu „zapłacone” aplikacja zapyta, ile zapłacono, i zapamięta to w historii');
  zmiennaEtykieta.append(element('span', 'karteczka__nazwa', t('Kwota za każdym razem inna')), zmiennaPole);

  // D18: na firmę - osobna suma na paragonie i przypomnienie o fakturze po każdej płatności.
  const firmaPole = element('input', 'przelacznik przelacznik--zwykly');
  firmaPole.type = 'checkbox';
  firmaPole.setAttribute('role', 'switch');
  const firmaEtykieta = element('label', 'karteczka__pole');
  firmaEtykieta.title = t('Koszt działalności - osobna suma na paragonie i „pobierz fakturę” po każdej płatności');
  firmaEtykieta.append(element('span', 'karteczka__nazwa', t('Na firmę')), firmaPole);

  // D17: kategoria - do filtra nad tabelą i podziału na paragonie.
  const kategoriaGrupa = grupa(t('Kategoria'));
  const kategoriaWybor = element('div', 'okres-wybor karteczka__gotowe');
  kategoriaWybor.setAttribute('role', 'group');
  kategoriaWybor.setAttribute('aria-label', t('Kategoria'));
  // Lista z ustawień (gotowe i własne) - przebudowywana przy odświeżeniu, gdy się zmieniła.
  let kategoriaOpcje = [];
  function opcjeKategorii() {
    const klucze = ['', ...kategorieWyboru(wpis.kategoria)];
    if (JSON.stringify(klucze) === JSON.stringify(kategoriaOpcje.map(([k]) => k))) return;
    kategoriaOpcje = klucze.map((klucz) => {
      const opcja = element('button', 'okres-wybor__opcja', klucz ? nazwaKategorii(klucz) : t('bez kategorii'));
      opcja.type = 'button';
      opcja.addEventListener('click', () => {
        wpis.kategoria = klucz;
        odswiez();
        onZmiana();
      });
      return [klucz, opcja];
    });
    kategoriaWybor.replaceChildren(...kategoriaOpcje.map(([, opcja]) => opcja));
  }
  kategoriaGrupa.tresc.append(kategoriaWybor);

  // Okres: gotowe (tydzień … 2 lata) albo własny „co [N] [tygodni / miesięcy / lat]”.
  const okresGrupa = grupa(t('Okres'));
  const okresGotowe = element('div', 'okres-wybor karteczka__gotowe');
  okresGotowe.setAttribute('role', 'group');
  okresGotowe.setAttribute('aria-label', t('Gotowe okresy'));
  const okresGotoweOpcje = OKRESY.map(([typ, ile, napis]) => {
    const opcja = element('button', 'okres-wybor__opcja', t(napis));
    opcja.type = 'button';
    opcja.addEventListener('click', () => ustawOkres(typ, ile));
    okresGotowe.append(opcja);
    return [typ, ile, opcja];
  });
  const coIlePole = pole('number', '', t('Co ile'), 'pole--male');
  coIlePole.min = '1';
  coIlePole.max = '99';
  const jednostka = element('select', 'pole pole--waluta pole--jednostka');
  jednostka.setAttribute('aria-label', t('Jednostka okresu'));
  jednostka.append(new Option(t('tygodni'), 'T'), new Option(t('miesięcy'), 'M'), new Option(t('lat'), 'R'));
  const okresWlasny = element('div', 'karteczka__wlasny');
  okresWlasny.append(element('span', 'karteczka__etykieta', t('albo co')), coIlePole, jednostka);
  okresGrupa.tresc.append(okresGotowe, okresWlasny);

  // Dzielę koszt: na ile osób (ze mną) i opcjonalnie kto oddaje - wtedy przypomnienie po każdej płatności.
  const dzielGrupa = grupa(t('Dzielę koszt'));
  const osobPole = pole('number', '', t('Na ile osób (razem ze mną)'), 'pole--male');
  osobPole.min = '1';
  osobPole.max = '20';
  const ktoPole = pole('text', wpis.ktoOddaje, t('Kto oddaje swoją część'), 'pole--kto');
  ktoPole.maxLength = 200;
  ktoPole.placeholder = t('np. Ania, Tomek');
  dzielGrupa.tresc.append(
    poleKarteczki(t('na ile osób (ze mną)'), osobPole),
    poleKarteczki(t('kto oddaje - przypomnę po każdej płatności'), ktoPole),
    element('p', 'karteczka__opis', t('Na paragonie liczy się tylko Twoja część (koszt ÷ liczba osób).')),
  );

  // Pauza: do dnia wznowienia bez alarmów i poza sumami; w dniu wznowienia - pierwsza płatność.
  const pauzaGrupa = grupa(t('Pauza'));
  const pauzaPole = pole('date', '', t('Wstrzymana do (dzień wznowienia)'), 'pole--data-pauzy');
  const pauzaKoniec = element('button', 'przycisk-tekst karteczka__przycisk', t('wznów od dziś'));
  pauzaKoniec.type = 'button';
  const pauzaUsun = element('button', 'przycisk-tekst karteczka__przycisk', t('bez pauzy'));
  pauzaUsun.type = 'button';
  pauzaUsun.title = t('Usuń pauzę - terminy jak przed nią, od daty zakupu');
  const pauzaPrzyciski = element('div', 'karteczka__przyciski');
  pauzaPrzyciski.append(pauzaKoniec, pauzaUsun);
  pauzaGrupa.tresc.append(
    poleKarteczki(t('wstrzymana do (dzień wznowienia)'), pauzaPole),
    pauzaPrzyciski,
    element('p', 'karteczka__opis', t('Np. siłownia zawieszona na wakacje. Do tego dnia bez alarmów i poza sumami, w dniu wznowienia - pierwsza płatność.')),
  );

  karteczka.append(karteczkaX, karteczkaTytul, platnoscPole, przedluzacEtykieta, koniecEtykieta, zmiennaEtykieta, firmaEtykieta, kategoriaGrupa.det, okresGrupa.det, dzielGrupa.det, pauzaGrupa.det);
  trescObokKrzyzyka(karteczka, karteczkaX);

  function ustawOkres(typ, ile) {
    // Klik w okres, który już jest wybrany, niczego nie zmienia - inaczej kasowałby zapłacone terminy.
    if (wpis.okres === typ && (wpis.coIle || 1) === ile) return;
    wpis.okres = typ;
    wpis.coIle = ile;
    ustawPoczatekZaplaty(wpis);
    odswiez();
    onZmiana();
  }

  const usun = element('button', 'wykresl', '×');
  usun.type = 'button';
  usun.title = t('Wykreśl pozycję');
  // Czytnik ekranu słyszy, który wiersz wykreśla (nazwa zmienia się przy pisaniu).
  // Nazwa zmienia się przy pisaniu - „×” i karteczka „⋯” od razu mówią, którego wiersza dotyczą.
  const opiszUsun = () => {
    const nazwaTekst = nazwaWpisu(wpis);
    usun.setAttribute('aria-label', t('Wykreśl: {nazwa}', { nazwa: nazwaTekst }));
    karteczkaTytul.textContent = nazwaTekst;
    wiecej.setAttribute('aria-label', t('Ustawienia: {nazwa}', { nazwa: nazwaTekst }));
  };
  opiszUsun();

  const linkRamka = element('div', 'link-ramka');
  linkRamka.append(link, otworz);
  // Nazwa i opis w jednej kolumnie: obok siebie, a w wąskim oknie opis pod nazwą.
  const nazwaOpis = element('div', 'nazwa-opis');
  const nazwaLinia = element('div', 'nazwa-linia');
  nazwaLinia.append(znak, nazwa); // „!” (jednorazowa) tuż przed nazwą
  // D17, D18: kategoria (fiszka indeksu) i „na firmę” (pieczątka) pod opisem - tekstem, nie samym kolorem.
  const znaczki = element('div', 'znaczki');
  const kategoriaZnak = element('span', 'fiszka');
  const firmaZnak = element('span', 'pieczatka-firma', t('na firmę'));
  firmaZnak.title = t('Koszt firmowy - osobna suma na paragonie');
  znaczki.append(kategoriaZnak, firmaZnak);
  nazwaOpis.append(nazwaLinia, opis, znaczki);

  tr.append(
    komorka(uchwyt),
    komorka(usun),
    komorka(nazwaOpis),
    komorka(kosztRamka, wPln, czesc, prognozaDodaj, prognozaRamka, prognozaDopisek),
    komorka(dataRamka, okresWybor, okresDopisek),
    komorka(lont, pauza, terminData, uwaga, zaplac, odbierz, faktura),
    komorka(linkRamka),
    komorka(wiecej, karteczka),
  );
  tr.cells[0].className = 'kol-lp';
  tr.cells[1].className = 'kol-akcje';
  tr.cells[3].className = 'kol-koszt';
  tr.cells[5].className = 'kol-termin';
  tr.cells[7].className = 'kol-wiecej';

  function odswiez() {
    const ter = termin(wpis);
    const dp = doPlatnosci(wpis);
    const jednorazowa = wpis.przedluzac === 'nie';
    const zakonczona = jednorazowa && !!dp?.minal; // jak czyZakonczona(), bez liczenia terminu od nowa
    const kod = waluta(wpis);
    const adres = bezpiecznyLink(wpis.link);

    const wstrzymana = czyWstrzymana(wpis);
    tr.classList.toggle('jednorazowa', jednorazowa);
    tr.classList.toggle('zakonczona', zakonczona);
    tr.classList.toggle('wstrzymana', wstrzymana);

    const zakup = formatujDate(parsujDate(wpis.od));
    odPrzycisk.textContent = zakup || t('wybierz datę');
    odPrzycisk.classList.toggle('data--pusta', !zakup);
    odPrzycisk.setAttribute('aria-label', t('Data zakupu: {data} - otwórz kalendarz', { data: zakup || t('brak') }));
    // mies. / rok - tylko co 1; inny okres (kwartał, tydzień, 2 lata) - „inny” i nazwa okresu pod spodem.
    const zwykly = (wpis.okres === 'M' || wpis.okres === 'R') && !(wpis.coIle > 1);
    for (const [wartosc, opcja] of okresOpcje) opcja.setAttribute('aria-pressed', String(zwykly && wpis.okres === wartosc));
    okresInny.setAttribute('aria-pressed', String(!zwykly && !!wpis.okres));
    okresDopisek.textContent = zwykly ? '' : nazwaOkresu(wpis);
    // Wyłączone „Inne okresy” - bez „inny” i grupy „Okres”, chyba że pozycja już ma inny okres (wtedy da się go zmienić).
    const okresyWidoczne = funkcja('okresy') || (!zwykly && !!wpis.okres);
    okresInny.hidden = !okresyWidoczne;
    okresGrupa.det.hidden = !okresyWidoczne;
    // Płatność ręczna blisko terminu (albo po nim): czerwony wiersz, „zapłać do …” i pole ☐ zapłacone.
    // Dalej od terminu - tylko krótkie „· ręcznie” przy dacie (kolumna jest wąska).
    const dz = doZaplaty(wpis);
    const reczna = recznaWpisu(wpis) && !jednorazowa && !dz && !wstrzymana;
    terminData.textContent = !ter.data ? '' : wstrzymana ? t('wraca {data}', { data: formatujDate(ter.data) }) : reczna ? t('{data} · ręcznie', { data: formatujDate(ter.data) }) : formatujDate(ter.data);
    terminData.title = wstrzymana ? t('Pauza - w tym dniu pierwsza płatność po przerwie') : reczna ? t('Płacę sam - nie pobiera się z konta') : '';
    pokazPlynnie(pauza, wstrzymana);
    // Cały wiersz czerwienieje z każdym dniem do terminu, po terminie - najmocniej (--czerwien w CSS).
    // Zakończona jednorazowa („nie”, termin minął) - tak samo mocno jak zaległa płatność: trzeba coś z nią zrobić.
    const poTerminie = !!dz?.zalegle || zakonczona;
    tr.classList.toggle('do-zaplaty', !!dz || zakonczona);
    tr.classList.toggle('po-terminie', poTerminie);
    if (dz || zakonczona) tr.style.setProperty('--czerwien', czerwienZaplaty(zakonczona ? -1 : dz.dni) + '%');
    else tr.style.removeProperty('--czerwien');
    pokazPlynnie(zaplac, !!dz);
    if (!dz) pokazPlynnie(zaplacKwota, false);
    if (dz) {
      zaplacTekst.textContent = t('zapłać do {data}', { data: jezyk() === 'pl' ? formatujDate(dz.doDnia).slice(0, 5) : dz.doDnia.toLocaleDateString(region(), { day: 'numeric', month: 'short' }) });
      // B8: termin w dzień wolny - „zapłać do” to ostatni dzień roboczy przed nim.
      zaplacTekst.title = dz.doDnia < dz.data ? t('Termin {termin} wypada w dzień wolny - przelew zleć najpóźniej {data}', { termin: formatujDate(dz.data), data: formatujDate(dz.doDnia) }) : '';
      zaplacPole.checked = !zaplacKwota.hidden; // otwarte pytanie „ile?” - pole zostaje zaznaczone
      zaplacPole.setAttribute('aria-label', t('Zapłacone - termin {data}', { data: formatujDate(dz.data) }));
      zaplacKwotaWaluta.textContent = kod;
    }
    // Wyłączone „Płacę sam” - bez wyboru płatności (wszystko liczone jak „pobiera się sama”).
    platnoscPole.hidden = !funkcja('platnosc');
    pokazPlynnie(koniecEtykieta, recznaWpisu(wpis));
    koniecPole.checked = !!wpis.koniecMiesiaca;
    pokazPlynnie(zmiennaEtykieta, recznaWpisu(wpis) && funkcja('kwotaZmienna'));
    zmiennaPole.checked = !!wpis.zmiennaKwota;

    const nazwaTekst = nazwaWpisu(wpis);
    karteczkaTytul.textContent = nazwaTekst;
    wiecej.setAttribute('aria-label', t('Ustawienia: {nazwa}', { nazwa: nazwaTekst }));
    for (const [wartosc, opcja] of platnoscOpcje) opcja.setAttribute('aria-pressed', String(!!wpis.platnoscReczna === wartosc));

    // Grupy karteczki: obecna wartość widoczna także w zwiniętej.
    okresGrupa.wartosc.textContent = nazwaOkresu(wpis) || '-';
    for (const [typ, ile, opcja] of okresGotoweOpcje) opcja.setAttribute('aria-pressed', String(wpis.okres === typ && (wpis.coIle || 1) === ile));
    if (document.activeElement !== coIlePole) coIlePole.value = String(wpis.coIle || 1);
    jednostka.value = wpis.okres || 'M';
    const osob = osobWpisu(wpis);
    dzielGrupa.det.hidden = !funkcja('dzielenie');
    dzielGrupa.wartosc.textContent = osob > 1 ? t('na {n} os.', { n: osob }) : t('nie');
    if (document.activeElement !== osobPole) osobPole.value = String(osob);
    pauzaGrupa.det.hidden = jednorazowa || !funkcja('pauza'); // jednorazowej się nie wstrzymuje - wycofuje się ją
    pauzaGrupa.wartosc.textContent = wstrzymana ? t('do {data}', { data: formatujDate(parsujDate(wpis.wstrzymanaDo)) }) : t('nie');
    pauzaPole.value = wstrzymana ? wpis.wstrzymanaDo : '';
    const jutro = dzis();
    pauzaPole.min = isoDnia(new Date(jutro.getFullYear(), jutro.getMonth(), jutro.getDate() + 1)); // nie +24 h - w dniu zmiany czasu doba ma 25 h
    pokazPlynnie(pauzaKoniec, wstrzymana);
    pokazPlynnie(pauzaUsun, !!wpis.wstrzymanaDo);

    // Moja część wspólnej płatności i przypomnienie „odbierz” po płatności (gdy wpisane imiona).
    czesc.textContent = osob > 1 && typeof wpis.koszt === 'number' ? `÷ ${osob} = ${formatujKwote(wpis.koszt / osob, kod)}` : '';
    const ostatnia = osob > 1 && wpis.ktoOddaje.trim() && !wstrzymana ? ostatniaPlatnosc(wpis) : null;
    const doOdebrania = !!ostatnia && isoDnia(ostatnia) > wpis.oddaneTermin;
    pokazPlynnie(odbierz, doOdebrania);
    if (doOdebrania) {
      const kto = wpis.ktoOddaje.trim();
      odbierzTekst.textContent = typeof wpis.koszt === 'number' ? t('odbierz po {kwota}: {kto}', { kwota: formatujKwote(wpis.koszt / osob, kod), kto }) : t('odbierz: {kto}', { kto });
      odbierzPole.checked = false;
      odbierzPole.setAttribute('aria-label', t('Oddane - płatność z {data}', { data: formatujDate(ostatnia) }));
      odbierz.title = t('Płatność z {data}', { data: formatujDate(ostatnia) });
    }

    // D17, D18: znaczki pod opisem, wybór w karteczce i „pobierz fakturę” po płatności.
    const kategoria = kategoriaWpisu(wpis);
    kategoriaZnak.textContent = nazwaKategorii(kategoria);
    oznaczKategorie(kategoriaZnak, kategoria);
    kategoriaZnak.hidden = !kategoria;
    firmaZnak.hidden = !firmowa(wpis);
    znaczki.hidden = kategoriaZnak.hidden && firmaZnak.hidden;
    kategoriaGrupa.det.hidden = !funkcja('kategorie');
    kategoriaGrupa.wartosc.textContent = nazwaKategorii(wpis.kategoria) || '-';
    if (funkcja('kategorie')) opcjeKategorii();
    for (const [klucz, opcja] of kategoriaOpcje) opcja.setAttribute('aria-pressed', String((wpis.kategoria || '') === klucz));
    firmaEtykieta.hidden = !funkcja('firma');
    firmaPole.checked = !!wpis.firmowa;
    const ostatniaFirmowa = firmowa(wpis) && !wstrzymana ? ostatniaPlatnosc(wpis) : null;
    const doFaktury = !!ostatniaFirmowa && isoDnia(ostatniaFirmowa) > wpis.fakturaTermin;
    pokazPlynnie(faktura, doFaktury);
    if (doFaktury) {
      fakturaPole.checked = false;
      fakturaPole.setAttribute('aria-label', t('Faktura pobrana - płatność z {data}', { data: formatujDate(ostatniaFirmowa) }));
      faktura.title = t('Płatność z {data}', { data: formatujDate(ostatniaFirmowa) });
    }

    lont.hidden = !dp || wstrzymana;
    lont.classList.toggle('lont--minal', !!dp?.minal);
    lont.classList.toggle('lont--zalegle', poTerminie); // po terminie (zaległa płatność, zakończona jednorazowa) - na czerwono
    if (dp?.minal) {
      // „2 dni po terminie” w jednej linii - „po terminie” mniejszym pismem (kolumna jest wąska).
      if (poTerminie) lontLiczba.replaceChildren(dniTekst(-dp.dni), element('span', 'lont__po-terminie', ' ' + t('po terminie')));
      else lontLiczba.textContent = t('minęło {dni}', { dni: dniTekst(-dp.dni) });
      lont.style.setProperty('--zostalo', '0');
    } else if (dp) {
      lontLiczba.textContent = kiedyTekst(dp.dni);
      lont.style.setProperty('--odcien', String(dp.odcien));
      lont.style.setProperty('--zostalo', String(Math.max(dp.zostalo, 0.03)));
    }
    uwaga.textContent = zakonczona ? t('sprawdź, czy anulowano') : '';

    // „≈ … zł” pod kwotą w walucie obcej.
    const dopisekPln = (kwota, kodKwoty = kod) => {
      if (kodKwoty === 'PLN' || typeof kwota !== 'number') return '';
      const pln = przeliczNaPln(kwota, kodKwoty);
      return pln === null ? t('brak kursu NBP') : '≈ ' + formatujKwote(pln);
    };
    wPln.textContent = dopisekPln(wpis.koszt);
    // Same złote w ustawieniach - wybór waluty tylko przy pozycjach, które już mają obcą.
    walutaWybor.hidden = !funkcja('waluty') && kod === 'PLN';
    const kodNastepnej = walutaNastepnej(wpis);
    // Koszt mógł się zmienić sam (cena następna stała się zapłaconą) - pole pokazuje aktualny.
    if (document.activeElement !== koszt) koszt.value = formatujKoszt(wpis.koszt);
    // Wyłączona „Cena następna” - bez pola i bez „+ następna cena” (wpisana cena czeka w pliku).
    const nastepnaWidoczna = funkcja('nastepna') && (wpis.prognoza !== null || prognozaOtwarta || document.activeElement === prognoza);
    // „+ następna cena” i pole ceny - po kolei: jedno znika, potem pojawia się drugie.
    if (nastepnaWidoczna) zamienPoKolei(prognozaDodaj, prognozaRamka, () => {
      if (!prognozaDoFokusu) return;
      prognozaDoFokusu = false;
      prognoza.focus();
    });
    else if (funkcja('nastepna')) zamienPoKolei(prognozaRamka, prognozaDodaj);
    else for (const el of [prognozaRamka, prognozaDodaj]) pokazPlynnie(el, false);
    // Wybór waluty ceny następnej jak przy koszcie; bez niego sam kod waluty kosztu.
    prognozaWybor.hidden = !funkcja('waluty') && kod === 'PLN' && kodNastepnej === 'PLN';
    prognozaWybor.value = kodNastepnej;
    prognozaWaluta.hidden = !prognozaWybor.hidden;
    prognozaWaluta.textContent = kod;
    prognozaPln.textContent = dopisekPln(wpis.prognoza, kodNastepnej);
    if (document.activeElement !== prognoza) prognoza.value = formatujKoszt(wpis.prognoza);
    let info = '';
    let ocena = '';
    // Różnica w walucie kosztu, a przy innej walucie ceny następnej - w złotych po kursie NBP.
    const zmiana = zmianaNastepnej(wpis);
    if (zmiana) {
      const { roznica } = zmiana;
      const tekstRoznicy = zmiana.kod !== kod ? formatujKwote(roznica, 'PLN') : jezyk() === 'pl' ? formatujKoszt(roznica) : liczba(roznica);
      info = roznica === 0 ? t('bez zmian') : (roznica > 0 ? '▲ +' : '▼ ') + tekstRoznicy;
      ocena = roznica > 0 ? 'drozej' : roznica < 0 ? 'taniej' : '';
    }
    prognozaInfo.textContent = info;
    prognozaInfo.dataset.ocena = ocena;
    prognozaDopisek.hidden = !nastepnaWidoczna || (!prognozaPln.textContent && !info);

    otworz.disabled = !adres;
  }

  // Stare pole „do” (sprzed daty zakupu) przestaje obowiązywać - nie ma go w tabeli, więc nie da się go poprawić.
  od.addEventListener('change', () => { wpis.od = od.value; wpis.do = ''; ustawPoczatekZaplaty(wpis); odswiez(); onZmiana(); });
  odPrzycisk.addEventListener('click', () => {
    try {
      od.showPicker();
    } catch {
      od.focus();
    }
  });
  nazwa.addEventListener('input', () => { wpis.nazwa = nazwa.value; opiszUsun(); onZmiana(); });
  opis.addEventListener('input', () => { wpis.opis = opis.value; onZmiana(); });
  opis.addEventListener('change', () => { opis.title = opis.value; });
  opis.title = wpis.opis;
  koszt.addEventListener('input', () => {
    const wartosc = kwotaZPola(koszt);
    if (wartosc === undefined) return;
    wpis.koszt = wartosc;
    odswiez();
    onZmiana();
  });
  walutaWybor.addEventListener('change', () => {
    wpis.waluta = walutaWybor.value;
    if (wpis.walutaNastepna === wpis.waluta) wpis.walutaNastepna = ''; // ta sama co koszt = puste
    odswiez();
    onZmiana();
  });
  // Zmiana zapłaconej ceny trafia do historii cen (wykres wydatków, „Zmiany cen”) po wyjściu z pola.
  let cenaPrzedEdycja = wpis.koszt;
  koszt.addEventListener('focus', () => { cenaPrzedEdycja = wpis.koszt; });
  koszt.addEventListener('blur', () => {
    const przed = JSON.stringify(wpis.ceny);
    zapiszZmianeCeny(wpis, cenaPrzedEdycja);
    if (JSON.stringify(wpis.ceny) !== przed) onZmiana();
  });
  // Po wyjściu z pola widać zapisaną kwotę - także gdy wpisany tekst był błędny (np. „1.234,56”).
  for (const [pole, klucz] of [[koszt, 'koszt'], [prognoza, 'prognoza']]) {
    pole.addEventListener('blur', () => {
      pole.value = formatujKoszt(wpis[klucz]);
      pole.classList.remove('pole--blad');
    });
  }
  prognoza.addEventListener('input', () => {
    const wartosc = kwotaZPola(prognoza);
    if (wartosc === undefined) return;
    wpis.prognoza = wartosc;
    if (wartosc === null) wpis.prognozaOd = ''; // wpisana od nowa - dzień liczy się od nowa
    odswiez();
    onZmiana();
  });
  prognozaWybor.addEventListener('change', () => {
    wpis.walutaNastepna = prognozaWybor.value === waluta(wpis) ? '' : prognozaWybor.value; // ta sama co koszt = puste
    odswiez();
    onZmiana();
  });
  prognozaDodaj.addEventListener('click', () => {
    prognozaOtwarta = true;
    prognozaDoFokusu = true;
    odswiez();
  });
  // Wyjście z pustego pola - z powrotem samo „+ następna cena” (obsługa „blur” wyżej już poprawiła tekst pola).
  prognoza.addEventListener('blur', () => {
    prognozaOtwarta = false;
    odswiez();
  });
  link.addEventListener('input', () => { wpis.link = link.value; odswiez(); onZmiana(); });
  // Bez fokusu link pokazuje samą domenę - pełny adres w podpowiedzi i po kliknięciu w pole.
  function skrocLink() {
    const adres = bezpiecznyLink(wpis.link);
    link.value = adres ? new URL(adres).hostname.replace(/^www\./, '') : wpis.link;
    link.title = wpis.link;
  }
  link.addEventListener('focus', () => { link.value = wpis.link; });
  link.addEventListener('blur', skrocLink);
  skrocLink();
  otworz.addEventListener('click', () => {
    const adres = bezpiecznyLink(wpis.link);
    if (adres) onOtworz(adres);
  });
  przedluzac.addEventListener('change', () => {
    // „nie” - termin to najbliższe odnowienie; data zakupu i historia zostają (reguły w alarmy.js, te same na telefonie).
    ustawPrzedluzanie(wpis, przedluzac.checked ? 'tak' : 'nie');
    odswiez();
    onZmiana();
  });
  // Zaznaczone „zapłacone” zapamiętuje termin - następny okres znowu do zapłaty; zaległość zdejmuje tylko to.
  // Kwota za każdym razem inna - najpierw pytanie „ile?” (Enter zapisuje, Esc albo odznaczenie - rezygnacja).
  zaplacPole.addEventListener('change', () => {
    if (zmiennaKwota(wpis)) {
      pokazPlynnie(zaplacKwota, zaplacPole.checked);
      if (zaplacPole.checked) {
        const ostatnia = wpis.historia?.at(-1)?.kwota;
        zaplacKwotaPole.value = formatujKoszt(ostatnia ?? wpis.prognoza ?? wpis.koszt);
        zaplacKwotaPole.classList.remove('pole--blad');
        zaplacKwotaPole.focus();
        zaplacKwotaPole.select();
      }
      return;
    }
    if (!zaplacPole.checked || !oznaczZaplate(wpis)) return;
    odswiez();
    onZmiana();
  });
  function zapiszZaplate() {
    const kwota = kwotaZPola(zaplacKwotaPole);
    if (typeof kwota !== 'number') {
      zaplacKwotaPole.classList.add('pole--blad');
      zaplacKwotaPole.focus();
      return;
    }
    pokazPlynnie(zaplacKwota, false);
    if (!oznaczZaplate(wpis, kwota)) return;
    if (document.activeElement !== koszt) koszt.value = formatujKoszt(wpis.koszt);
    odswiez();
    onZmiana();
  }
  zaplacKwotaOk.addEventListener('click', zapiszZaplate);
  zaplacKwotaPole.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') zapiszZaplate();
    else if (e.key === 'Escape') {
      e.preventDefault();
      pokazPlynnie(zaplacKwota, false);
      zaplacPole.checked = false;
      zaplacPole.focus();
    }
  });
  zaplacKwotaPole.addEventListener('input', () => kwotaZPola(zaplacKwotaPole));
  zmiennaPole.addEventListener('change', () => {
    wpis.zmiennaKwota = zmiennaPole.checked;
    odswiez();
    onZmiana();
  });

  // Okres własny: „co [N] [tygodni / miesięcy / lat]”.
  coIlePole.addEventListener('change', () => {
    const n = Math.round(Number(coIlePole.value));
    if (!(n >= 1 && n <= 99)) {
      coIlePole.value = String(wpis.coIle || 1);
      return;
    }
    ustawOkres(wpis.okres || 'M', n);
  });
  jednostka.addEventListener('change', () => ustawOkres(jednostka.value, wpis.coIle || 1));
  okresInny.addEventListener('click', () => {
    okresGrupa.det.open = true;
    karteczka.showPopover();
    (okresGotoweOpcje.find(([, , o]) => o.getAttribute('aria-pressed') === 'true')?.[2] ?? okresGotoweOpcje[0][2]).focus();
  });

  // Dzielę koszt.
  osobPole.addEventListener('change', () => {
    const n = Math.round(Number(osobPole.value));
    if (!(n >= 1 && n <= 20)) {
      osobPole.value = String(wpis.osob || 1);
      return;
    }
    if (!(wpis.osob > 1) && n > 1) bezZaleglegoOdbioru(wpis);
    wpis.osob = n;
    odswiez();
    onZmiana();
  });
  ktoPole.addEventListener('input', () => {
    if (!wpis.ktoOddaje.trim() && ktoPole.value.trim()) bezZaleglegoOdbioru(wpis);
    wpis.ktoOddaje = ktoPole.value;
    odswiez();
    onZmiana();
  });
  // ☐ oddane - za ostatnią płatność; przypomnienie wraca po następnej.
  odbierzPole.addEventListener('change', () => {
    if (!odbierzPole.checked) return;
    bezZaleglegoOdbioru(wpis);
    odswiez();
    onZmiana();
  });

  // D18: ☐ pobrana - faktura za ostatnią płatność; przypomnienie wraca po następnej.
  fakturaPole.addEventListener('change', () => {
    if (!fakturaPole.checked) return;
    const ostatnia = ostatniaPlatnosc(wpis);
    if (ostatnia) wpis.fakturaTermin = isoDnia(ostatnia);
    odswiez();
    onZmiana();
  });
  firmaPole.addEventListener('change', () => {
    wpis.firmowa = firmaPole.checked;
    odswiez();
    onZmiana();
  });

  // Pauza (reguły w dane.js - te same na telefonie).
  pauzaPole.addEventListener('change', () => {
    const ustawiona = ustawPauze(wpis, pauzaPole.value);
    odswiez(); // data z przeszłości - pole wraca do zapisanej
    if (ustawiona) onZmiana();
  });
  pauzaKoniec.addEventListener('click', () => {
    wznowDzis(wpis);
    odswiez();
    onZmiana();
  });
  pauzaUsun.addEventListener('click', () => {
    usunPauze(wpis);
    odswiez();
    onZmiana();
  });
  // „Termin do końca miesiąca” - liczy się od nowa od daty zakupu (jak przy włączeniu „płacę sam”).
  koniecPole.addEventListener('change', () => {
    wpis.koniecMiesiaca = koniecPole.checked;
    ustawPoczatekZaplaty(wpis);
    odswiez();
    onZmiana();
  });
  usun.addEventListener('click', () => onUsun(wpis));
  // Podgląd: wiersz wygląda na przekreślony, zanim się go wykreśli.
  for (const [zdarzenie, wlacz] of [['mouseenter', true], ['mouseleave', false], ['focus', true], ['blur', false]]) {
    usun.addEventListener(zdarzenie, () => tr.classList.toggle('wykreslany', wlacz));
  }

  odswiezacze.set(tr, odswiez);
  odswiez();
  return tr;
}

// Przelicza kolory i daty we wszystkich wierszach (np. po północy), bez przebudowy pól.
export function odswiezWiersze(tbody) {
  for (const tr of tbody.rows) odswiezacze.get(tr)?.();
}

// Przeciąganie wiersza za numer Lp. - wiersz przesuwa się na żywo pod kursorem;
// po upuszczeniu poUpuszczeniu() dostaje nową kolejność id.
export function przeciaganieWierszy(tbody, poUpuszczeniu) {
  let przeciagany = null;
  let naMiejscu = null; // sąsiad sprzed przeciągania - Esc albo upuszczenie poza tabelą cofa wiersz
  tbody.addEventListener('dragstart', (e) => {
    // Tylko wiersz złapany za uchwyt Lp. (draggable) - nie przeciągany tekst z pola.
    przeciagany = e.target.closest?.('tr[draggable="true"]');
    if (!przeciagany) return;
    naMiejscu = przeciagany.nextElementSibling;
    przeciagany.classList.add('przeciagany');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', przeciagany.dataset.id);
  });
  tbody.addEventListener('dragover', (e) => {
    if (!przeciagany) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move'; // kursor przesuwania zamiast zwykłej strzałki
    const tr = e.target.closest?.('tr');
    if (!tr || tr === przeciagany) return;
    const r = tr.getBoundingClientRect();
    if (e.clientY > r.top + r.height / 2) tr.after(przeciagany);
    else tr.before(przeciagany);
  });
  tbody.addEventListener('drop', (e) => e.preventDefault());
  tbody.addEventListener('dragend', (e) => {
    if (!przeciagany) return;
    przeciagany.classList.remove('przeciagany');
    przeciagany.draggable = false;
    const anulowane = e.dataTransfer?.dropEffect === 'none';
    if (anulowane) tbody.insertBefore(przeciagany, naMiejscu);
    przeciagany = null;
    naMiejscu = null;
    if (anulowane) return;
    poUpuszczeniu([...tbody.rows].map((tr) => tr.dataset.id));
  });
}

// Lp. wg aktualnej kolejności wierszy.
export function numeruj(tbody) {
  [...tbody.rows].forEach((tr, i) => {
    tr.querySelector('.uchwyt').textContent = i + 1;
  });
}
