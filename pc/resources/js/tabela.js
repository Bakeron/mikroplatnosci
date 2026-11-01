// Tabela mikropłatności: wiersze z edycją w komórkach i przesuwaniem.

import { termin, formatujDate, parsujDate, doPlatnosci, dniTekst, kiedyTekst, zakupBiezacegoOkresu, doZaplaty, oznaczZaplate, ustawPoczatekZaplaty, czerwienZaplaty, DNI_DO_ZAPLATY } from './alarmy.js';
import { WALUTY, waluta, przeliczNaPln, formatujKwote } from './waluty.js';
import { bezpiecznyLink, formatujKoszt, parsujKoszt, nazwaWpisu } from './dane.js';
import { element } from './dom.js';

const odswiezacze = new WeakMap();
let numerKarteczki = 0; // nazwy kotwic CSS (anchor-name) - karteczka „⋯” wisi przy swoim przycisku

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
  const onZmiana = () => { wpis.zmieniono = new Date().toISOString(); zglosZmiane(); };
  const tr = element('tr');
  tr.dataset.id = wpis.id;

  // Lp. - numer jest też uchwytem do przesuwania wiersza (przeciąganie albo strzałki).
  const uchwyt = element('button', 'uchwyt');
  uchwyt.type = 'button';
  uchwyt.title = 'Przeciągnij, aby przesunąć wiersz (albo strzałki ↑ ↓)';
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
  znak.title = 'Jednorazowa - wycofaj przed odnowieniem';
  znak.append(element('span', 'sr', ' jednorazowa, do wycofania')); // czytnik ekranu zamiast samego „!”

  // Data zakupu: tekst z ikonką, kliknięcie otwiera kalendarz (pole daty jest pod spodem, niewidoczne).
  const od = pole('date', wpis.od, 'Data zakupu', 'data__pole');
  od.tabIndex = -1;
  od.setAttribute('aria-hidden', 'true');
  const odPrzycisk = element('button', 'data');
  odPrzycisk.type = 'button';
  odPrzycisk.title = 'Wybierz datę zakupu z kalendarza';
  const dataRamka = element('div', 'data-ramka');
  dataRamka.append(od, odPrzycisk);

  // Okres płatności: miesięczna albo roczna - termin liczy się od daty zakupu.
  const okresWybor = element('div', 'okres-wybor');
  okresWybor.setAttribute('role', 'group');
  okresWybor.setAttribute('aria-label', 'Okres płatności');
  const okresOpcje = [['M', 'mies.'], ['R', 'rok']].map(([wartosc, tekst]) => {
    const opcja = element('button', 'okres-wybor__opcja', tekst);
    opcja.type = 'button';
    opcja.addEventListener('click', () => { wpis.okres = wartosc; ustawPoczatekZaplaty(wpis); odswiez(); onZmiana(); });
    okresWybor.append(opcja);
    return [wartosc, opcja];
  });
  const terminData = element('div', 'dopisek dopisek--termin');

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
  zaplacEtykieta.append(zaplacPole, ' zapłacone');
  zaplac.append(zaplacTekst, zaplacEtykieta);

  const nazwa = pole('text', wpis.nazwa, 'Nazwa', 'pole--nazwa');
  nazwa.maxLength = 200;

  const opis = poleWieloliniowe(wpis.opis, 'Krótki opis', 'pole--opis', 300);
  opis.placeholder = 'krótki opis…';

  const koszt = pole('text', formatujKoszt(wpis.koszt), 'Koszt', 'pole--koszt');
  koszt.inputMode = 'decimal';
  koszt.placeholder = '0,00';
  const walutaWybor = element('select', 'pole pole--waluta');
  walutaWybor.setAttribute('aria-label', 'Waluta');
  walutaWybor.append(...WALUTY.map((kod) => new Option(kod, kod)));
  walutaWybor.value = waluta(wpis);
  const wPln = element('div', 'dopisek dopisek--pln');
  const kosztRamka = element('div', 'koszt-ramka');
  kosztRamka.append(koszt, walutaWybor);

  // Cena od następnej płatności - pod zapłaconą, wpisywana ręcznie (np. koniec promocji, zapowiedziana
  // podwyżka). Pusta = zostaje zapłacona; wtedy w komórce tylko „+ następna cena”.
  const prognoza = pole('text', formatujKoszt(wpis.prognoza), 'Cena od następnej płatności', 'pole--koszt pole--nastepna');
  prognoza.inputMode = 'decimal';
  prognoza.placeholder = 'wpisz…';
  const prognozaEtykieta = element('span', 'nastepna__etykieta', 'następna');
  prognozaEtykieta.setAttribute('aria-hidden', 'true'); // czytnik ekranu ma etykietę pola
  const prognozaWaluta = element('span', 'prognoza__waluta');
  const prognozaRamka = element('div', 'koszt-ramka nastepna');
  prognozaRamka.title = 'Cena od następnej płatności - gdy kończy się promocja albo serwis zapowiedział podwyżkę. Pusta = zostaje zapłacona.';
  prognozaRamka.append(prognozaEtykieta, prognoza, prognozaWaluta);
  // „≈ … zł” i „▲ +6,00” w jednej linijce pod drugą ceną.
  const prognozaPln = element('span');
  const prognozaInfo = element('span', 'dopisek--prognoza');
  const prognozaDopisek = element('div', 'dopisek nastepna__dopisek');
  prognozaDopisek.append(prognozaPln, prognozaInfo);
  const prognozaDodaj = element('button', 'nastepna-dodaj', '+ następna cena');
  prognozaDodaj.type = 'button';
  prognozaDodaj.title = 'Dopisz cenę od następnej płatności (koniec promocji, podwyżka)';
  let prognozaOtwarta = false; // kliknięte „+ następna cena”, pole jeszcze puste

  const link = poleWieloliniowe(wpis.link, 'Link', 'pole--link', 2000);
  link.inputMode = 'url';
  link.placeholder = 'https://';
  const otworz = element('button', 'otworz', '↗');
  otworz.type = 'button';
  otworz.title = 'Otwórz link w przeglądarce';

  const przedluzac = element('select', 'pole pole--wybor');
  przedluzac.setAttribute('aria-label', 'Chęć przedłużania');
  przedluzac.append(...[['', '-'], ['tak', 'tak'], ['nie', 'nie']].map(([wartosc, tekst]) => new Option(tekst, wartosc)));
  przedluzac.value = wpis.przedluzac;

  // „⋯” - karteczka z ustawieniami, które ustawia się raz (przedłużać, sposób płatności).
  // Okienko „popover”: nad tabelą, zamyka je Esc albo kliknięcie obok; przyklejone do przycisku kotwicą CSS.
  const wiecej = element('button', 'wiecej', '⋯');
  wiecej.type = 'button';
  wiecej.title = 'Ustawienia pozycji: przedłużać, sposób płatności';
  const karteczka = element('div', 'karteczka');
  karteczka.popover = 'auto';
  karteczka.setAttribute('role', 'dialog');
  wiecej.popoverTargetElement = karteczka;
  const kotwica = `--karteczka-${++numerKarteczki}`;
  wiecej.style.setProperty('anchor-name', kotwica);
  karteczka.style.setProperty('position-anchor', kotwica);
  const karteczkaTytul = element('div', 'karteczka__tytul');
  const przedluzacEtykieta = element('label', 'karteczka__pole');
  przedluzacEtykieta.append(element('span', 'karteczka__nazwa', 'Przedłużać'), przedluzac);
  const platnoscWybor = element('div', 'okres-wybor karteczka__wybor');
  platnoscWybor.setAttribute('role', 'group');
  platnoscWybor.setAttribute('aria-label', 'Płatność');
  const platnoscOpcje = [[false, 'pobiera się sama'], [true, 'płacę sam']].map(([reczna, tekst]) => {
    const opcja = element('button', 'okres-wybor__opcja', tekst);
    opcja.type = 'button';
    opcja.addEventListener('click', () => {
      // Włączenie „płacę sam” - liczy się od daty zakupu. „Przedłużać” jest wtedy schowane (dotyczy tylko
      // płatności pobieranych samych), więc ukryte „nie” nie może wyłączać przypomnień - wraca „tak”.
      if (reczna && !wpis.platnoscReczna) {
        wpis.platnoscReczna = true;
        if (wpis.przedluzac === 'nie') wpis.przedluzac = 'tak';
        przedluzac.value = wpis.przedluzac;
        ustawPoczatekZaplaty(wpis);
      }
      wpis.platnoscReczna = reczna;
      odswiez();
      onZmiana();
    });
    platnoscWybor.append(opcja);
    return [reczna, opcja];
  });
  const platnoscPole = element('div', 'karteczka__pole');
  platnoscPole.append(element('span', 'karteczka__nazwa', 'Płatność'), platnoscWybor);
  // Tylko przy „płacę sam”: termin w ostatnim dniu miesiąca (np. rachunki, których data zmienia się co miesiąc).
  const koniecPole = element('input');
  koniecPole.type = 'checkbox';
  const koniecEtykieta = element('label', 'karteczka__pole karteczka__pole--zaznacz');
  koniecEtykieta.append(element('span', 'karteczka__nazwa', 'Termin do końca miesiąca'), koniecPole);
  const platnoscOpis = element('p', 'karteczka__opis', `„Płacę sam” - od ${DNI_DO_ZAPLATY} dni przed terminem wiersz czerwienieje, pojawia się „zapłać do …”, pole „zapłacone” i powiadomienie.`);
  karteczka.append(karteczkaTytul, przedluzacEtykieta, platnoscPole, koniecEtykieta, platnoscOpis);

  const usun = element('button', 'wykresl', '×');
  usun.type = 'button';
  usun.title = 'Wykreśl pozycję';
  // Czytnik ekranu słyszy, który wiersz wykreśla (nazwa zmienia się przy pisaniu).
  const opiszUsun = () => usun.setAttribute('aria-label', 'Wykreśl: ' + nazwaWpisu(wpis));
  opiszUsun();

  const linkRamka = element('div', 'link-ramka');
  linkRamka.append(link, otworz);
  // Nazwa i opis w jednej kolumnie: obok siebie, a w wąskim oknie opis pod nazwą.
  const nazwaOpis = element('div', 'nazwa-opis');
  const nazwaLinia = element('div', 'nazwa-linia');
  nazwaLinia.append(znak, nazwa); // „!” (jednorazowa) tuż przed nazwą
  nazwaOpis.append(nazwaLinia, opis);

  tr.append(
    komorka(uchwyt),
    komorka(usun),
    komorka(nazwaOpis),
    komorka(kosztRamka, wPln, prognozaDodaj, prognozaRamka, prognozaDopisek),
    komorka(dataRamka, okresWybor),
    komorka(lont, terminData, uwaga, zaplac),
    komorka(linkRamka),
    komorka(wiecej, karteczka),
  );
  tr.cells[0].className = 'kol-lp';
  tr.cells[1].className = 'kol-akcje';
  tr.cells[3].className = 'kol-koszt';
  tr.cells[7].className = 'kol-wiecej';

  function odswiez() {
    const ter = termin(wpis);
    const dp = doPlatnosci(wpis);
    const jednorazowa = wpis.przedluzac === 'nie';
    const zakonczona = jednorazowa && !!dp?.minal; // jak czyZakonczona(), bez liczenia terminu od nowa
    const kod = waluta(wpis);
    const adres = bezpiecznyLink(wpis.link);

    tr.classList.toggle('jednorazowa', jednorazowa);
    tr.classList.toggle('zakonczona', zakonczona);

    const zakup = formatujDate(parsujDate(wpis.od));
    odPrzycisk.textContent = zakup || 'wybierz datę';
    odPrzycisk.classList.toggle('data--pusta', !zakup);
    odPrzycisk.setAttribute('aria-label', 'Data zakupu: ' + (zakup || 'brak') + ' - otwórz kalendarz');
    for (const [wartosc, opcja] of okresOpcje) opcja.setAttribute('aria-pressed', String(wpis.okres === wartosc));
    // Płatność ręczna blisko terminu (albo po nim): czerwony wiersz, „zapłać do …” i pole ☐ zapłacone.
    // Dalej od terminu - tylko krótkie „· ręcznie” przy dacie (kolumna jest wąska).
    const dz = doZaplaty(wpis);
    const reczna = wpis.platnoscReczna && !jednorazowa && !dz;
    terminData.textContent = ter.data ? formatujDate(ter.data) + (reczna ? ' · ręcznie' : '') : '';
    terminData.title = reczna ? 'Płacę sam - nie pobiera się z konta' : '';
    // Cały wiersz czerwienieje z każdym dniem do terminu, po terminie - najmocniej (--czerwien w CSS).
    // Zakończona jednorazowa („nie”, termin minął) - tak samo mocno jak zaległa płatność: trzeba coś z nią zrobić.
    const poTerminie = !!dz?.zalegle || zakonczona;
    tr.classList.toggle('do-zaplaty', !!dz || zakonczona);
    tr.classList.toggle('po-terminie', poTerminie);
    if (dz || zakonczona) tr.style.setProperty('--czerwien', czerwienZaplaty(zakonczona ? -1 : dz.dni) + '%');
    else tr.style.removeProperty('--czerwien');
    zaplac.hidden = !dz;
    if (dz) {
      zaplacTekst.textContent = 'zapłać do ' + formatujDate(dz.data).slice(0, 5);
      zaplacPole.checked = false;
      zaplacPole.setAttribute('aria-label', 'Zapłacone - termin ' + formatujDate(dz.data));
    }
    koniecEtykieta.hidden = !wpis.platnoscReczna;
    przedluzacEtykieta.hidden = !!wpis.platnoscReczna; // „Przedłużać” tylko przy „pobiera się sama”
    koniecPole.checked = !!wpis.koniecMiesiaca;

    const nazwaTekst = nazwaWpisu(wpis);
    karteczkaTytul.textContent = nazwaTekst;
    wiecej.setAttribute('aria-label', 'Ustawienia: ' + nazwaTekst);
    for (const [wartosc, opcja] of platnoscOpcje) opcja.setAttribute('aria-pressed', String(!!wpis.platnoscReczna === wartosc));

    lont.hidden = !dp;
    lont.classList.toggle('lont--minal', !!dp?.minal);
    lont.classList.toggle('lont--zalegle', poTerminie); // po terminie (zaległa płatność, zakończona jednorazowa) - na czerwono
    if (dp?.minal) {
      // „2 dni po terminie” w jednej linii - „po terminie” mniejszym pismem (kolumna jest wąska).
      if (poTerminie) lontLiczba.replaceChildren(dniTekst(-dp.dni), element('span', 'lont__po-terminie', ' po terminie'));
      else lontLiczba.textContent = 'minęło ' + dniTekst(-dp.dni);
      lont.style.setProperty('--zostalo', '0');
    } else if (dp) {
      lontLiczba.textContent = kiedyTekst(dp.dni);
      lont.style.setProperty('--odcien', String(dp.odcien));
      lont.style.setProperty('--zostalo', String(Math.max(dp.zostalo, 0.03)));
    }
    uwaga.textContent = zakonczona ? 'sprawdź, czy anulowano' : '';

    // „≈ … zł” pod kwotą w walucie obcej.
    const dopisekPln = (kwota) => {
      if (kod === 'PLN' || typeof kwota !== 'number') return '';
      const pln = przeliczNaPln(kwota, kod);
      return pln === null ? 'brak kursu NBP' : '≈ ' + formatujKwote(pln);
    };
    wPln.textContent = dopisekPln(wpis.koszt);
    const nastepnaWidoczna = wpis.prognoza !== null || prognozaOtwarta || document.activeElement === prognoza;
    prognozaRamka.hidden = !nastepnaWidoczna;
    prognozaDodaj.hidden = nastepnaWidoczna;
    prognozaWaluta.textContent = kod;
    prognozaPln.textContent = dopisekPln(wpis.prognoza);
    if (document.activeElement !== prognoza) prognoza.value = formatujKoszt(wpis.prognoza);
    let info = '';
    let ocena = '';
    if (typeof wpis.prognoza === 'number' && typeof wpis.koszt === 'number') {
      const roznica = Math.round((wpis.prognoza - wpis.koszt) * 100) / 100;
      info = roznica === 0 ? 'bez zmian' : (roznica > 0 ? '▲ +' : '▼ ') + formatujKoszt(roznica);
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
    odswiez();
    onZmiana();
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
    odswiez();
    onZmiana();
  });
  prognozaDodaj.addEventListener('click', () => {
    prognozaOtwarta = true;
    odswiez();
    prognoza.focus();
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
    // „nie” po kilku okresach - termin ma być najbliższym odnowieniem, a nie pierwszym po dawnym zakupie.
    if (przedluzac.value === 'nie') wpis.od = zakupBiezacegoOkresu(wpis);
    wpis.przedluzac = przedluzac.value;
    ustawPoczatekZaplaty(wpis); // np. „nie” → „tak” przy płacę sam - bez zaległości z czasu „nie”
    od.value = wpis.od;
    odswiez();
    onZmiana();
  });
  // Zaznaczone „zapłacone” zapamiętuje termin - następny okres znowu do zapłaty; zaległość zdejmuje tylko to.
  zaplacPole.addEventListener('change', () => {
    if (!zaplacPole.checked || !oznaczZaplate(wpis)) return;
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
  tbody.addEventListener('dragstart', (e) => {
    // Tylko wiersz złapany za uchwyt Lp. (draggable) - nie przeciągany tekst z pola.
    przeciagany = e.target.closest?.('tr[draggable="true"]');
    if (!przeciagany) return;
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
  tbody.addEventListener('dragend', () => {
    if (!przeciagany) return;
    przeciagany.classList.remove('przeciagany');
    przeciagany.draggable = false;
    przeciagany = null;
    poUpuszczeniu([...tbody.rows].map((tr) => tr.dataset.id));
  });
}

// Lp. wg aktualnej kolejności wierszy.
export function numeruj(tbody) {
  [...tbody.rows].forEach((tr, i) => {
    tr.querySelector('.uchwyt').textContent = i + 1;
  });
}
