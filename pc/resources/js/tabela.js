// Tabela mikropłatności: wiersze z edycją w komórkach i sortowanie.

import { okres, termin, formatujDate, parsujDate, czyZakonczona, doPlatnosci, dniTekst } from './alarmy.js';
import { WALUTY, waluta, naPln, przeliczNaPln, formatujKwote } from './waluty.js';
import { stanCen } from './ceny.js';

const odswiezacze = new WeakMap();

// Zwraca bezpieczny adres http(s) albo null. „example.com” → „https://example.com/”.
export function bezpiecznyLink(tekst) {
  let s = (tekst || '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    if (!s.includes('.') || /\s/.test(s)) return null;
    s = 'https://' + s;
  }
  try {
    const url = new URL(s);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function formatujKoszt(koszt) {
  return typeof koszt === 'number' ? koszt.toFixed(2).replace('.', ',') : '';
}

// null = puste pole, undefined = błędna wartość.
export function parsujKoszt(tekst) {
  const s = String(tekst).replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  return Math.round(parseFloat(s) * 100) / 100;
}

function element(tag, klasa, tekst) {
  const el = document.createElement(tag);
  if (klasa) el.className = klasa;
  if (tekst !== undefined) el.textContent = tekst;
  return el;
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

export function utworzWiersz(wpis, { onZmiana: zglosZmiane, onUsun, onOtworz, onSprawdzCene, onPrzesun }) {
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
  uchwyt.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      onPrzesun(wpis, e.key === 'ArrowUp' ? -1 : 1, uchwyt);
    }
  });
  tr.addEventListener('keydown', (e) => {
    if (e.target !== uchwyt && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      onPrzesun(wpis, e.key === 'ArrowUp' ? -1 : 1, document.activeElement);
    }
  });

  const znak = element('span', 'wykrzyknik', '!');
  znak.title = 'Jednorazowa - wycofaj przed odnowieniem';

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
    opcja.addEventListener('click', () => { wpis.okres = wartosc; odswiez(); onZmiana(); });
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

  const nazwa = pole('text', wpis.nazwa, 'Nazwa', 'pole--nazwa');
  nazwa.maxLength = 200;

  // Opis zawija się w kolejne linijki zamiast się ucinać.
  const opis = element('textarea', 'pole pole--opis');
  opis.rows = 1;
  opis.value = wpis.opis;
  opis.setAttribute('aria-label', 'Krótki opis');
  opis.spellcheck = false;
  opis.maxLength = 300;
  opis.placeholder = 'krótki opis…';
  opis.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });

  const koszt = pole('text', formatujKoszt(wpis.koszt), 'Koszt w złotych', 'pole--koszt');
  koszt.inputMode = 'decimal';
  koszt.placeholder = '0,00';
  const walutaWybor = element('select', 'pole pole--waluta');
  walutaWybor.setAttribute('aria-label', 'Waluta');
  for (const kod of WALUTY) {
    const opcja = element('option', '', kod);
    opcja.value = kod;
    walutaWybor.append(opcja);
  }
  walutaWybor.value = waluta(wpis);
  const wPln = element('div', 'dopisek dopisek--pln');
  const kosztRamka = element('div', 'koszt-ramka');
  kosztRamka.append(koszt, walutaWybor);

  // Prognoza: cena na najbliższy miesiąc - ręcznie albo (za zgodą) odczytana ze strony z linku.
  const prognoza = pole('text', formatujKoszt(wpis.prognoza), 'Prognozowana cena', 'pole--koszt');
  prognoza.inputMode = 'decimal';
  prognoza.placeholder = 'wpisz…';
  const prognozaWaluta = element('span', 'prognoza__waluta');
  const prognozaRamka = element('div', 'koszt-ramka');
  prognozaRamka.append(prognoza, prognozaWaluta);
  const prognozaPln = element('div', 'dopisek dopisek--pln');
  const zgoda = element('input');
  zgoda.type = 'checkbox';
  zgoda.checked = wpis.prognozaZeStrony;
  const zgodaEtykieta = element('label', 'zgoda');
  zgodaEtykieta.title = 'Zgoda: przy każdym uruchomieniu aplikacja odczyta cenę ze strony z kolumny Link';
  zgoda.setAttribute('aria-label', 'Odczytuj cenę ze strony z linku');
  zgodaEtykieta.append(zgoda);
  prognozaRamka.append(zgodaEtykieta); // ☑ tuż na prawo od ceny prognozy
  const prognozaInfo = element('div', 'dopisek dopisek--prognoza');

  // Link zawija się do nowej linii, gdy się nie mieści.
  const link = element('textarea', 'pole pole--link');
  link.rows = 1;
  link.value = wpis.link;
  link.setAttribute('aria-label', 'Link');
  link.spellcheck = false;
  link.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  link.inputMode = 'url';
  link.maxLength = 2000;
  link.placeholder = 'https://';
  const otworz = element('button', 'otworz', '↗');
  otworz.type = 'button';
  otworz.title = 'Otwórz link w przeglądarce';

  const przedluzac = element('select', 'pole pole--wybor');
  przedluzac.setAttribute('aria-label', 'Chęć przedłużania');
  for (const [wartosc, tekst] of [['', '-'], ['tak', 'tak'], ['nie', 'nie']]) {
    const opcja = element('option', '', tekst);
    opcja.value = wartosc;
    przedluzac.append(opcja);
  }
  przedluzac.value = wpis.przedluzac;

  const usun = element('button', 'wykresl', '×');
  usun.type = 'button';
  usun.title = 'Wykreśl pozycję';

  const linkRamka = element('div', 'link-ramka');
  linkRamka.append(link, otworz);
  // Cennik znaleziony przez prognozę, gdy cena była na innej stronie niż ta z linku.
  const cennik = element('div', 'dopisek dopisek--cennik');
  // Nazwa i opis w jednej kolumnie: obok siebie, a w wąskim oknie opis pod nazwą.
  const nazwaOpis = element('div', 'nazwa-opis');
  const nazwaLinia = element('div', 'nazwa-linia');
  nazwaLinia.append(znak, nazwa); // „!” (jednorazowa) tuż przed nazwą
  nazwaOpis.append(nazwaLinia, opis);

  tr.append(
    komorka(uchwyt),
    komorka(usun),
    komorka(nazwaOpis),
    komorka(kosztRamka, wPln),
    komorka(prognozaRamka, prognozaPln, prognozaInfo),
    komorka(dataRamka, okresWybor),
    komorka(lont, terminData, uwaga),
    komorka(przedluzac),
    komorka(linkRamka, cennik),
  );
  tr.cells[0].className = 'kol-lp';
  tr.cells[1].className = 'kol-akcje';
  tr.cells[3].className = 'kol-koszt';
  tr.cells[4].className = 'kol-koszt kol-prognoza';

  function odswiez() {
    const ok = okres(wpis);
    const ter = termin(wpis, ok);
    const jednorazowa = wpis.przedluzac === 'nie';
    const zakonczona = czyZakonczona(wpis);

    tr.classList.toggle('jednorazowa', jednorazowa);
    tr.classList.toggle('zakonczona', zakonczona);

    const zakup = formatujDate(parsujDate(wpis.od));
    odPrzycisk.textContent = zakup || 'wybierz datę';
    odPrzycisk.classList.toggle('data--pusta', !zakup);
    odPrzycisk.setAttribute('aria-label', 'Data zakupu: ' + (zakup || 'brak') + ' - otwórz kalendarz');
    for (const [wartosc, opcja] of okresOpcje) opcja.setAttribute('aria-pressed', String(wpis.okres === wartosc));
    terminData.textContent = ter.data ? formatujDate(ter.data) : '';

    const dp = doPlatnosci(wpis);
    lont.hidden = !dp;
    lont.classList.toggle('lont--minal', !!dp?.minal);
    if (dp?.minal) {
      lontLiczba.textContent = 'minęło ' + dniTekst(-dp.dni);
      lont.style.setProperty('--zostalo', '0');
    } else if (dp) {
      lontLiczba.textContent = dp.dni === 0 ? 'dziś' : dp.dni === 1 ? 'jutro' : dniTekst(dp.dni);
      lont.style.setProperty('--odcien', String(dp.odcien));
      lont.style.setProperty('--zostalo', String(Math.max(dp.zostalo, 0.03)));
    }
    uwaga.textContent = zakonczona ? 'sprawdź, czy anulowano' : '';

    const pln = naPln(wpis);
    wPln.textContent = waluta(wpis) === 'PLN' || typeof wpis.koszt !== 'number' ? ''
      : pln === null ? 'brak kursu NBP' : '≈ ' + formatujKwote(pln);

    prognozaWaluta.textContent = waluta(wpis);
    const prognozaWPln = przeliczNaPln(wpis.prognoza, waluta(wpis));
    prognozaPln.textContent = waluta(wpis) === 'PLN' || typeof wpis.prognoza !== 'number' ? ''
      : prognozaWPln === null ? 'brak kursu NBP' : '≈ ' + formatujKwote(prognozaWPln);
    if (document.activeElement !== prognoza) prognoza.value = formatujKoszt(wpis.prognoza);
    const stanCeny = stanCen.get(wpis.id);
    let info = '';
    let ocena = '';
    if (stanCeny?.stan === 'sprawdzam') {
      info = 'sprawdzam stronę…';
    } else if (stanCeny?.stan === 'blad') {
      info = stanCeny.tekst;
      ocena = 'blad';
    } else if (typeof wpis.prognoza === 'number') {
      const roznica = typeof wpis.koszt === 'number' ? Math.round((wpis.prognoza - wpis.koszt) * 100) / 100 : null;
      const zmiana = roznica === null ? '' : roznica === 0 ? 'bez zmian' : (roznica > 0 ? '▲ +' : '▼ ') + formatujKoszt(roznica);
      ocena = roznica > 0 ? 'drozej' : roznica < 0 ? 'taniej' : '';
      const zrodlo = wpis.prognozaZrodlo === 'strona'
        ? (wpis.prognozaVat ? '+VAT ' : 'ze strony ') + formatujDate(parsujDate(wpis.prognozaData)).slice(0, 5) : 'ręcznie'; // dłuższy tekst nie mieści się w kolumnie
      info = [zmiana, zrodlo].filter(Boolean).join(' · ');
    } else if (wpis.prognozaZeStrony && !bezpiecznyLink(wpis.link)) {
      info = 'brak linku do strony';
      ocena = 'blad';
    }
    prognozaInfo.textContent = info;
    prognozaInfo.dataset.ocena = ocena;
    prognozaInfo.title = wpis.prognozaVat && wpis.prognozaZrodlo === 'strona' ? 'Cena ze strony z doliczonym VAT 23% (tak wychodzi bliżej zapłaconej kwoty)' : '';

    const adresCennika = wpis.prognozaZeStrony ? bezpiecznyLink(wpis.prognozaCennik) : null;
    const urlCennika = adresCennika ? new URL(adresCennika) : null;
    cennik.textContent = urlCennika ? 'cennik: ' + urlCennika.hostname.replace(/^www\./, '') + urlCennika.pathname.replace(/\/$/, '') : '';
    cennik.title = adresCennika || '';

    otworz.disabled = !bezpiecznyLink(wpis.link);
  }

  od.addEventListener('change', () => { wpis.od = od.value; odswiez(); onZmiana(); });
  odPrzycisk.addEventListener('click', () => {
    try {
      od.showPicker();
    } catch {
      od.focus();
    }
  });
  nazwa.addEventListener('input', () => { wpis.nazwa = nazwa.value; onZmiana(); });
  opis.addEventListener('input', () => { wpis.opis = opis.value; onZmiana(); });
  opis.addEventListener('change', () => { opis.title = opis.value; });
  opis.title = wpis.opis;
  koszt.addEventListener('input', () => {
    const wartosc = parsujKoszt(koszt.value);
    koszt.classList.toggle('pole--blad', wartosc === undefined);
    if (wartosc === undefined) return;
    wpis.koszt = wartosc;
    odswiez();
    onZmiana();
  });
  walutaWybor.addEventListener('change', () => { wpis.waluta = walutaWybor.value; odswiez(); onZmiana(); });
  koszt.addEventListener('blur', () => {
    if (parsujKoszt(koszt.value) !== undefined) koszt.value = formatujKoszt(wpis.koszt);
  });
  prognoza.addEventListener('input', () => {
    const wartosc = parsujKoszt(prognoza.value);
    prognoza.classList.toggle('pole--blad', wartosc === undefined);
    if (wartosc === undefined) return;
    wpis.prognoza = wartosc;
    wpis.prognozaZrodlo = wartosc === null ? '' : 'reczna';
    wpis.prognozaData = '';
    stanCen.delete(wpis.id);
    odswiez();
    onZmiana();
  });
  prognoza.addEventListener('blur', () => {
    if (parsujKoszt(prognoza.value) !== undefined) prognoza.value = formatujKoszt(wpis.prognoza);
  });
  zgoda.addEventListener('change', () => {
    wpis.prognozaZeStrony = zgoda.checked;
    stanCen.delete(wpis.id);
    odswiez();
    onZmiana();
    if (zgoda.checked) onSprawdzCene(wpis);
  });
  link.addEventListener('input', () => { wpis.link = link.value; odswiez(); onZmiana(); });
  // Nowy link przy zaznaczonym ☑ - od razu odczyt ceny z nowej strony.
  // Inny link = inny serwis - zapamiętany cennik przestaje obowiązywać.
  link.addEventListener('change', () => {
    wpis.prognozaCennik = '';
    odswiez();
    onZmiana();
    if (wpis.prognozaZeStrony) onSprawdzCene(wpis);
  });
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
  przedluzac.addEventListener('change', () => { wpis.przedluzac = przedluzac.value; odswiez(); onZmiana(); });
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

// Lp. wg aktualnej kolejności wierszy.
export function numeruj(tbody) {
  [...tbody.rows].forEach((tr, i) => {
    tr.querySelector('.uchwyt').textContent = i + 1;
  });
}
