// Mikropłatności na telefonie: lista, terminy, paragon, dodawanie i edycja, synchronizacja z Google Dyskiem.
// Obliczenia i format danych wspólne z aplikacją PC (pliki kopiowane z pc/resources/js przy budowaniu).

import { termin, doPlatnosci, dniTekst, formatujDate, zbierzAlarmy, czyZakonczona, dzis, zakupBiezacegoOkresu, doZaplaty, oznaczZaplate, czerwienZaplaty } from './alarmy.js';
import { waluta, naPln, formatujKwote, wczytajZapamietane, odswiezZNbp } from './waluty.js';
import { renderujPodsumowanie, policz } from './podsumowanie.js';
import { wypelnijListe } from './spisy.js';
import { nowyWpis, doZapisu, usun, formatujKoszt, zastosujFormularz } from './dane.js';
import { wczytajPlikDanych, zapiszPlik, zrobKopie, usunDaneLokalne } from './magazyn.js';
import { przygotujDysk, czyPolaczony } from './dysk.js';
import { wczytajUstawienia, zapiszUstawienia } from './ustawienia.js';
import { pokazOAplikacji } from './oAplikacji.js';
import { polaczSynchronizacje } from './synchronizacja.js';
import { renderujMiarke, ulozTory } from './miarka.js';
import { rozplanuj, tytul, tresc, wczytajPamiec, zapiszPamiec } from './powiadomienia.js';

const FOLDER = 'Mikroplatnosci';
const PLIK = FOLDER + '/mikroplatnosci.json';
const PLIK_KURSOW = FOLDER + '/kursy.json';
const PLIK_POWIADOMIEN = FOLDER + '/powiadomienia.json';
const PLIK_USTAWIEN = FOLDER + '/ustawienia.json';
const FOLDER_KOPII = FOLDER + '/kopie';
const MAKS_ZAPLANOWANYCH = 400; // Android pozwala aplikacji na ok. 500 budzików
const OPOZNIENIE_WYSYLKI = 3000;

const stan = {
  wpisy: [],
  usuniete: [],
  zablokowany: false,
  lokalnie: true, // „Zapisuj w telefonie” - wyłączone: dane tylko w pamięci i na Google Dysku
  synchronizacja: false,
  edytowany: null, // wpis w arkuszu edycji (null = nowy)
  timerWysylki: null,
};

const $ = (id) => document.getElementById(id);

function element(tag, klasa, tekst) {
  const el = document.createElement(tag);
  if (klasa) el.className = klasa;
  if (tekst !== undefined) el.textContent = tekst;
  return el;
}

function pokazBlad(tekst) {
  $('blad').textContent = tekst;
  $('blad').hidden = false;
}

// --- dane -------------------------------------------------------------

// Odczyt i zapis jak na PC (magazyn.js): tylko „nie ma pliku” (NE_FS_NOPATHE z neutralino-telefon.js)
// znaczy nowy zeszyt; pusty, obcy albo nieczytelny plik = błąd i blokada zapisu.
// Zwraca treść pliku (do kopii zapasowej) albo null, gdy pliku jeszcze nie ma.
async function wczytaj() {
  const plik = await wczytajPlikDanych(PLIK);
  if (!plik) return null;
  stan.wpisy = plik.odczytane.wpisy;
  stan.usuniete = plik.odczytane.usuniete;
  return plik.tresc;
}

// Zapisy po kolei (dwa naraz pisałyby do tego samego pliku tymczasowego); zapis przez plik
// tymczasowy i podmianę - zanik zasilania w trakcie zapisu nie zostawia uciętego pliku.
let kolejkaZapisu = Promise.resolve();
function zapisz() {
  kolejkaZapisu = kolejkaZapisu.then(async () => {
    if (stan.zablokowany || !stan.lokalnie) return;
    try {
      await zapiszPlik(PLIK, JSON.stringify(doZapisu(stan), null, 2));
    } catch (e) {
      pokazBlad('Błąd zapisu na telefonie - ostatnia zmiana może zniknąć.');
      console.error(e);
    }
  });
  return kolejkaZapisu;
}

// Po każdej zmianie: zapis w telefonie, a przy włączonym Dysku - wysyłka po chwili (kilka zmian = jedna wysyłka).
async function poZmianie() {
  await zapisz();
  renderuj();
  zaplanujWysylke();
  zaplanujPowiadomienia();
}

function zaplanujWysylke() {
  if (!czyPolaczony() || stan.zablokowany) return;
  clearTimeout(stan.timerWysylki);
  dysk.pokaz('zmiany czekają na wysłanie…');
  stan.timerWysylki = setTimeout(() => {
    stan.timerWysylki = null;
    if (stan.synchronizacja) zaplanujWysylke();
    else dysk.synchronizuj(true);
  }, OPOZNIENIE_WYSYLKI);
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

function utworzKarte(wpis) {
  const li = element('li');
  const karta = element('button', 'karta');
  karta.type = 'button';
  const jednorazowa = wpis.przedluzac === 'nie';
  const zakonczona = czyZakonczona(wpis);
  karta.classList.toggle('karta--jednorazowa', jednorazowa);
  karta.classList.toggle('karta--zakonczona', zakonczona);

  const gora = element('span', 'karta__gora');
  const nazwa = element('span', 'karta__nazwa');
  if (jednorazowa) nazwa.append(element('span', 'wykrzyknik', '!'), element('span', 'sr', 'jednorazowa, do wycofania: '));
  nazwa.append(wpis.nazwa.trim() || '(bez nazwy)');
  gora.append(nazwa, element('span', 'karta__koszt', kwotaTekst(wpis)));
  karta.append(gora);
  // Cena od następnej płatności pod zapłaconą (jak „NASTĘPNA” na PC) - tylko gdy wpisana.
  if (typeof wpis.prognoza === 'number') {
    const roznica = typeof wpis.koszt === 'number' ? Math.round((wpis.prognoza - wpis.koszt) * 100) / 100 : 0;
    const zmiana = roznica > 0 ? ' ▲ +' + formatujKoszt(roznica) : roznica < 0 ? ' ▼ ' + formatujKoszt(roznica) : '';
    const nastepna = element('span', 'karta__nastepna', 'następna ' + formatujKwote(wpis.prognoza, waluta(wpis)));
    if (zmiana) nastepna.append(element('span', roznica > 0 ? 'karta__drozej' : 'karta__taniej', zmiana));
    karta.append(nastepna);
  }
  if (wpis.opis.trim()) karta.append(element('span', 'karta__opis', wpis.opis));

  const dol = element('span', 'karta__dol');
  const dp = doPlatnosci(wpis);
  const data = termin(wpis).data;
  if (dp) {
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
      if (zalegle) liczba.replaceChildren(dniTekst(-dp.dni), element('span', 'lont__po-terminie', ' po terminie'));
      else liczba.textContent = 'minęło ' + dniTekst(-dp.dni);
      lont.style.setProperty('--zostalo', '0');
    } else {
      liczba.textContent = dp.dni === 0 ? 'dziś' : dp.dni === 1 ? 'jutro' : 'za ' + dniTekst(dp.dni);
      lont.style.setProperty('--odcien', String(dp.odcien));
      lont.style.setProperty('--zostalo', String(Math.max(dp.zostalo, 0.03)));
    }
    dol.append(lont);
  } else {
    dol.append(element('span', 'karta__brak', 'brak daty zakupu - uzupełnij'));
  }
  const okresTekst = wpis.okres === 'R' ? 'rok' : 'mies.';
  // Płatność ręczna blisko terminu - czerwony margines i „zapłać do …” (jak na PC); „✓ zapłacone” w edycji.
  const dz = doZaplaty(wpis);
  const reczna = wpis.platnoscReczna && !jednorazowa && !dz ? ' · ręcznie' : '';
  dol.append(element('span', 'karta__termin', (data ? formatujDate(data) + ' · ' : '') + okresTekst + reczna));
  karta.append(dol);
  if (jednorazowa && dp?.minal) karta.append(element('span', 'dopisek--uwaga', 'termin minął - sprawdź, czy anulowano'));
  // Karta czerwienieje z każdym dniem do terminu, po terminie - najmocniej (jak wiersz na PC).
  // Zakończona jednorazowa - tak samo mocno czerwona jak zaległa płatność (trzeba coś z nią zrobić).
  karta.classList.toggle('karta--do-zaplaty', !!dz || zakonczona);
  karta.classList.toggle('karta--po-terminie', !!dz?.zalegle || zakonczona);
  if (zakonczona) karta.style.setProperty('--czerwien', czerwienZaplaty(-1) + '%');
  if (dz) {
    karta.style.setProperty('--czerwien', czerwienZaplaty(dz.dni) + '%');
    // Ostatnia linijka karty - obok niej stoi pole „☐ zapłacone”.
    karta.append(element('span', 'karta__zaplac', 'zapłać do ' + formatujDate(dz.data).slice(0, 5)));
  }

  karta.addEventListener('click', () => otworzArkusz(wpis));
  li.append(karta);
  // „☐ zapłacone” od razu przy karcie (jak na PC) - osobne pole obok karty, bo karta sama jest przyciskiem.
  // Zaznaczenie = zapłacone: karta wraca do zwykłego odliczania do następnego terminu.
  if (dz) {
    li.classList.add('karta-z-zaplata');
    const pole = element('input');
    pole.type = 'checkbox';
    pole.setAttribute('aria-label', 'Zapłacone: ' + (wpis.nazwa.trim() || '(bez nazwy)') + ', termin ' + formatujDate(dz.data));
    const etykieta = element('label', 'karta-zaplac');
    etykieta.append(pole, ' zapłacone');
    pole.addEventListener('change', async () => {
      if (!pole.checked || !oznaczZaplate(wpis)) return;
      wpis.zmieniono = new Date().toISOString();
      await poZmianie();
    });
    li.append(etykieta);
  }
  return li;
}

function renderuj() {
  const posortowane = [...stan.wpisy].sort((a, b) => {
    const [ka, da] = kolejnosc(a);
    const [kb, db] = kolejnosc(b);
    return ka - kb || da - db;
  });
  $('karty').replaceChildren(...posortowane.map(utworzKarte));
  $('pusto').hidden = stan.wpisy.length > 0;

  const { roczne, jednorazowe } = zbierzAlarmy(stan.wpisy);
  wypelnijListe($('alarmy-roczne'), roczne, 'Żadna roczna płatność w ciągu 3 miesięcy.', false);
  wypelnijListe($('alarmy-jednorazowe'), jednorazowe, 'Nic do wycofania.', true);
  renderujMiarke($('miarka'), [...roczne, ...jednorazowe]);
  renderujPodsumowanie($('paragon'), stan.wpisy);
  $('suma-miesiac').textContent = formatujKwote(policz(stan.wpisy).lacznieMiesiecznie) + ' / mies.';
  $('dzisiaj').textContent = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
  $('arkusz-tytul').textContent = wpis ? 'Edycja pozycji' : 'Nowa pozycja';
  pola.nazwa.value = w.nazwa;
  pola.opis.value = w.opis;
  pola.koszt.value = formatujKoszt(w.koszt);
  pola.waluta.value = waluta(w);
  pola.od.value = w.od;
  pola.okres.value = w.okres;
  pola.przedluzac.checked = w.przedluzac !== 'nie'; // przełącznik: puste „-” liczy się jak „tak”
  pola.prognoza.value = formatujKoszt(w.prognoza);
  pola.platnosc.value = w.platnoscReczna ? 'reczna' : '';
  pola.koniecMiesiaca.checked = !!w.koniecMiesiaca;
  pokazKoniecMiesiaca();
  pola.link.value = w.link;
  $('formularz-blad').textContent = '';
  $('arkusz-usun').hidden = !wpis;
  $('arkusz-usun').textContent = 'Usuń';
  delete $('arkusz-usun').dataset.potwierdz;
  $('arkusz').showModal();
  // Nowa pozycja - od razu pisanie nazwy; edycja - bez klawiatury, dopóki nie dotknie się pola.
  if (wpis) document.activeElement?.blur();
  else pola.nazwa.focus();
}

formularz.addEventListener('submit', async (e) => {
  e.preventDefault();
  // Wspólna logika (dane.js, z testami): wpis szukany po id - w trakcie edycji mogły przyjść zmiany z Dysku.
  const wartosci = Object.fromEntries(['nazwa', 'opis', 'koszt', 'waluta', 'od', 'okres', 'prognoza', 'platnosc', 'link'].map((p) => [p, pola[p].value]));
  // Przełącznik nie zmieniany przy pustym „-” zostawia puste (bez sztucznej zmiany wpisu).
  wartosci.przedluzac = !pola.przedluzac.checked ? 'nie' : stan.edytowany?.przedluzac === '' ? '' : 'tak';
  wartosci.koniecMiesiaca = pola.koniecMiesiaca.checked;
  const { blad } = zastosujFormularz(stan.wpisy, stan.edytowany, wartosci);
  if (blad) {
    $('formularz-blad').textContent = blad;
    return;
  }
  $('arkusz').close();
  await poZmianie();
});

// Usuwanie w dwóch dotknięciach - bez okna systemowego.
$('arkusz-usun').addEventListener('click', async () => {
  const przycisk = $('arkusz-usun');
  if (!przycisk.dataset.potwierdz) {
    przycisk.dataset.potwierdz = '1';
    przycisk.textContent = 'Na pewno? Dotknij jeszcze raz';
    return;
  }
  const wpis = stan.edytowany;
  $('arkusz').close();
  if (!wpis) return;
  usun(stan, wpis);
  await poZmianie();
});

// „nie” po kilku okresach - termin ma być najbliższym odnowieniem, a nie pierwszym po dawnym zakupie (jak na PC).
pola.przedluzac.addEventListener('change', () => {
  if (!pola.przedluzac.checked) pola.od.value = zakupBiezacegoOkresu({ od: pola.od.value, okres: pola.okres.value });
});

// „Termin do końca miesiąca” widać tylko przy „płacę sam” (jak w „⋯” na PC); „Przedłużać” - zawsze.
const pokazKoniecMiesiaca = () => {
  $('pole-koniec-miesiaca').hidden = pola.platnosc.value !== 'reczna';
};
pola.platnosc.addEventListener('change', pokazKoniecMiesiaca);

$('arkusz-anuluj').addEventListener('click', () => $('arkusz').close());
$('arkusz').addEventListener('close', () => { stan.edytowany = null; });
$('dodaj').addEventListener('click', () => otworzArkusz(null));

// --- Google Dysk ------------------------------------------------------

const dysk = polaczSynchronizacje({
  stan,
  poScaleniu: async () => {
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

const zapiszMojeUstawienia = () => zapiszUstawienia(PLIK_USTAWIEN, { lokalnie: stan.lokalnie }).catch(console.error);

// Plik danych, plik tymczasowy i wszystkie kopie zapasowe (po zapisach, które jeszcze trwają).
async function usunPlikDanych() {
  await kolejkaZapisu;
  await usunDaneLokalne(PLIK, FOLDER_KOPII);
}

// Włączenie zapisu w telefonie: obecne dane (np. pobrane z Dysku) trafiają do pliku w telefonie.
async function wlaczZapisLokalny() {
  stan.lokalnie = true;
  await zapiszMojeUstawienia();
  await zapisz();
  odswiezMiejsceZapisu();
}

// Wyłączenie zapisu w telefonie: najpierw wysyłka na Dysk, potem plik danych znika z telefonu.
// Zwraca false, gdy użytkownik zrezygnował albo wysyłka się nie udała.
async function wylaczZapisLokalny() {
  const polaczony = czyPolaczony();
  const pytanie = polaczony
    ? 'Przestać zapisywać dane w telefonie? Najpierw zostaną wysłane na Google Dysk, potem plik danych i kopie zapasowe zostaną usunięte z telefonu. Każda zmiana będzie od razu wysyłana na Dysk.'
    : 'Synchronizacja z Google Dyskiem jest wyłączona - bez zapisu w telefonie dane znikną po zamknięciu aplikacji. Usunąć plik danych i kopie zapasowe z telefonu?';
  if (!confirm(pytanie)) return false;
  if (polaczony && !(await dysk.synchronizuj(true))) {
    pokazBlad('Nie udało się wysłać na Dysk - dane zostają w telefonie.');
    return false;
  }
  stan.lokalnie = false;
  await zapiszMojeUstawienia();
  await usunPlikDanych().catch((e) => {
    pokazBlad('Nie udało się usunąć pliku danych z telefonu.');
    console.error(e);
  });
  return true;
}

// „Usuń z telefonu”: lista i plik danych. Przy połączonym Dysku dane najpierw idą na Dysk i tam
// zostają, a synchronizacja w telefonie się wyłącza (inaczej wróciłyby przy pobraniu).
async function usunZTelefonu() {
  if (stan.zablokowany || stan.synchronizacja || !stan.lokalnie) return;
  const polaczony = czyPolaczony();
  const pytanie = 'Usunąć wszystkie dane z tego telefonu - listę, plik danych i kopie zapasowe? '
    + (polaczony ? 'Najpierw zostaną wysłane na Google Dysk i tam zostaną, a synchronizacja w telefonie się wyłączy. ' : 'Synchronizacja z Dyskiem jest wyłączona, więc dane znikną całkiem. ')
    + 'Tego nie da się cofnąć.';
  if (!confirm(pytanie)) return;
  if (polaczony && !(await dysk.synchronizuj(true))) {
    pokazBlad('Nie udało się wysłać na Dysk - nic nie zostało usunięte.');
    return;
  }
  clearTimeout(stan.timerWysylki);
  stan.timerWysylki = null;
  if (polaczony) await dysk.wylacz().catch(console.error);
  try {
    await usunPlikDanych();
  } catch (e) {
    pokazBlad('Nie udało się usunąć pliku danych z telefonu.');
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

// Numer wersji wpisuje przygotuj.mjs (wersja.js) przy każdym budowaniu.
$('wersja').textContent = 'wersja ' + (window.WERSJA_APLIKACJI || 'robocza');
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
  const { teraz, przyszle } = rozplanuj(stan.wpisy, pamiecPowiadomien);
  const { notifications: oczekujace } = await Powiadomienia.getPending();
  if (oczekujace.length) await Powiadomienia.cancel({ notifications: oczekujace.map((n) => ({ id: n.id })) });
  const plan = przyszle.slice(0, MAKS_ZAPLANOWANYCH);
  const powiadomienie = (p, at, dzien) => ({ id: numer(p.klucz), title: tytul(p), body: tresc(p, dzien), schedule: { at, allowWhileIdle: true } });
  const lista = [
    ...teraz.map((p) => powiadomienie(p, new Date(Date.now() + 1500), dzis())),
    ...plan.map((p) => powiadomienie(p, p.godzina)),
  ];
  if (lista.length) await Powiadomienia.schedule({ notifications: lista });
  pamiecPowiadomien.zaplanowane = new Set(plan.map((p) => p.klucz));
  await zapiszPamiec(pamiecPowiadomien);
}

async function przygotujPowiadomienia() {
  if (!Powiadomienia || stan.zablokowany) return;
  const { display } = await Powiadomienia.checkPermissions();
  if (display !== 'granted' && (await Powiadomienia.requestPermissions()).display !== 'granted') return;
  pamiecPowiadomien = await wczytajPamiec(PLIK_POWIADOMIEN);
  await planujPowiadomienia();
}

// --- system -----------------------------------------------------------

// Motyw jak w telefonie: ciemny albo jasny.
const ciemny = window.matchMedia('(prefers-color-scheme: dark)');
const ustawMotyw = () => { document.documentElement.dataset.motyw = ciemny.matches ? 'ciemny' : 'jasny'; };
ciemny.addEventListener('change', ustawMotyw);
ustawMotyw();

// Przycisk „Wstecz” Androida: zamyka okno, potem wraca do listy, dopiero potem chowa aplikację.
const App = window.Capacitor?.isNativePlatform() ? Capacitor.registerPlugin('App') : null;
App?.addListener('backButton', () => {
  if ($('arkusz').open) $('arkusz').close();
  else if ($('okno-dysk').open) $('okno-dysk').close();
  else if ($('okno-google').open) $('okno-google').close();
  else if (zakladka !== 'lista') pokazZakladke('lista');
  else App.minimizeApp();
});
// Przejście do innej aplikacji bez zapisu w telefonie: niewysłane zmiany od razu na Dysk
// (Android może potem zamknąć aplikację w tle).
App?.addListener('pause', () => {
  if (stan.lokalnie || !stan.timerWysylki || stan.synchronizacja) return;
  clearTimeout(stan.timerWysylki);
  stan.timerWysylki = null;
  dysk.synchronizuj(true);
});
// Powrót do aplikacji: świeże terminy i zmiany z komputera.
App?.addListener('resume', () => {
  renderuj();
  zaplanujPowiadomienia();
  if (!dysk.trwaLogowanie()) dysk.synchronizuj(false);
});

async function start() {
  try {
    await przygotujDysk(FOLDER);
  } catch (e) {
    console.error(e);
  }
  stan.lokalnie = (await wczytajUstawienia(PLIK_USTAWIEN)).lokalnie;
  try {
    // Bez zapisu w telefonie dane przychodzą tylko z Dysku (pobranie na końcu startu).
    if (stan.lokalnie) {
      const tresc = await wczytaj();
      // Kopia przy uruchomieniu (5 najnowszych), zanim cokolwiek się zapisze.
      if (tresc !== null) await zrobKopie(FOLDER_KOPII, tresc).catch(console.error);
    }
  } catch (e) {
    // Nie nadpisujemy pliku, którego nie umiemy odczytać.
    stan.zablokowany = true;
    pokazBlad('Nie udało się odczytać danych w telefonie. Zmiany NIE będą zapisywane, żeby ich nie nadpisać.');
    $('dodaj').disabled = true;
    console.error(e);
  }
  await wczytajZapamietane(PLIK_KURSOW);
  renderuj();
  dysk.odswiez();
  odswiezZNbp(PLIK_KURSOW).then(renderuj).catch(console.error);
  przygotujPowiadomienia().catch(console.error);
  dysk.synchronizuj(false);
}

start();
