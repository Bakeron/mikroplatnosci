// Mikropłatności na telefonie: lista, terminy, paragon, dodawanie i edycja, synchronizacja z Google Dyskiem.
// Obliczenia i format danych wspólne z aplikacją PC (pliki kopiowane z pc/resources/js przy budowaniu).

import { termin, doPlatnosci, dniTekst, formatujDate, zbierzAlarmy, czyZakonczona, dzis } from './alarmy.js';
import { WALUTY, waluta, naPln, formatujKwote, wczytajZapamietane, odswiezZNbp } from './waluty.js';
import { renderujPodsumowanie, policz } from './podsumowanie.js';
import { wypelnijListe } from './spisy.js';
import { nowyWpis, normalizuj, odczytajUsuniete } from './dane.js';
import { przygotujDysk, czyPolaczony } from './dysk.js';
import { polaczSynchronizacje } from './synchronizacja.js';
import { renderujMiarke, ulozTory } from './miarka.js';
import { rozplanuj, tytul, tresc, wczytajPamiec, zapiszPamiec } from './powiadomienia.js';

const FOLDER = 'Mikroplatnosci';
const PLIK = FOLDER + '/mikroplatnosci.json';
const PLIK_KURSOW = FOLDER + '/kursy.json';
const PLIK_POWIADOMIEN = FOLDER + '/powiadomienia.json';
const MAKS_ZAPLANOWANYCH = 400; // Android pozwala aplikacji na ok. 500 budzików
const OPOZNIENIE_WYSYLKI = 3000;

const stan = {
  wpisy: [],
  usuniete: [],
  zablokowany: false,
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

async function istnieje(sciezka) {
  try {
    await Neutralino.filesystem.getStats(sciezka);
    return true;
  } catch {
    return false;
  }
}

async function wczytaj() {
  if (!(await istnieje(PLIK))) return;
  const tresc = await Neutralino.filesystem.readFile(PLIK);
  if (!tresc.trim()) return;
  const dane = JSON.parse(tresc);
  if (!dane || !Array.isArray(dane.wpisy)) throw new Error('nieprawidłowy format pliku');
  stan.wpisy = dane.wpisy.filter((w) => w && typeof w === 'object').map(normalizuj);
  stan.usuniete = odczytajUsuniete(dane.usuniete);
}

async function zapisz() {
  if (stan.zablokowany) return;
  try {
    await Neutralino.filesystem.writeFile(PLIK, JSON.stringify({ wersja: 2, zapisano: new Date().toISOString(), wpisy: stan.wpisy, usuniete: stan.usuniete }, null, 2));
  } catch (e) {
    pokazBlad('Błąd zapisu na telefonie - ostatnia zmiana może zniknąć.');
    console.error(e);
  }
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
  karta.classList.toggle('karta--jednorazowa', jednorazowa);
  karta.classList.toggle('karta--zakonczona', czyZakonczona(wpis));

  const gora = element('span', 'karta__gora');
  const nazwa = element('span', 'karta__nazwa');
  if (jednorazowa) nazwa.append(element('span', 'wykrzyknik', '!'));
  nazwa.append(wpis.nazwa.trim() || '(bez nazwy)');
  gora.append(nazwa, element('span', 'karta__koszt', kwotaTekst(wpis)));
  karta.append(gora);
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
      liczba.textContent = 'minęło ' + dniTekst(-dp.dni);
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
  dol.append(element('span', 'karta__termin', (data ? formatujDate(data) + ' · ' : '') + okresTekst));
  karta.append(dol);
  if (jednorazowa && dp?.minal) karta.append(element('span', 'dopisek--uwaga', 'termin minął - sprawdź, czy anulowano'));

  karta.addEventListener('click', () => otworzArkusz(wpis));
  li.append(karta);
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

const kwota2 = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : '');

// „12,50” / „12.5” / „1 200” → liczba; pusty tekst → null; błędny → NaN.
function parsujKwote(tekst) {
  const t = tekst.replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

function otworzArkusz(wpis) {
  stan.edytowany = wpis;
  const w = wpis ?? { ...nowyWpis(), od: new Date().toLocaleDateString('sv-SE') }; // nowy: zakup dziś
  $('arkusz-tytul').textContent = wpis ? 'Edycja pozycji' : 'Nowa pozycja';
  pola.nazwa.value = w.nazwa;
  pola.opis.value = w.opis;
  pola.koszt.value = kwota2(w.koszt);
  pola.waluta.value = waluta(w);
  pola.od.value = w.od;
  pola.okres.value = w.okres;
  pola.przedluzac.value = w.przedluzac;
  pola.prognoza.value = kwota2(w.prognoza);
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
  const koszt = parsujKwote(pola.koszt.value);
  const prognoza = parsujKwote(pola.prognoza.value);
  if (Number.isNaN(koszt) || Number.isNaN(prognoza)) {
    $('formularz-blad').textContent = 'Kwota musi być liczbą, np. 12,50';
    return;
  }
  // W trakcie edycji mogły przyjść zmiany z Dysku - wpis szukany po id w bieżącej liście.
  const wpis = stan.edytowany ? (stan.wpisy.find((w) => w.id === stan.edytowany.id) ?? stan.edytowany) : nowyWpis();
  const link = pola.link.value.trim();
  if (wpis.prognoza !== prognoza) Object.assign(wpis, { prognozaZrodlo: prognoza === null ? '' : 'reczna', prognozaData: '' });
  if (wpis.link !== link) wpis.prognozaCennik = '';
  Object.assign(wpis, {
    nazwa: pola.nazwa.value,
    opis: pola.opis.value,
    koszt,
    waluta: WALUTY.includes(pola.waluta.value) ? pola.waluta.value : 'PLN',
    od: pola.od.value,
    okres: pola.okres.value === 'R' ? 'R' : 'M',
    przedluzac: pola.przedluzac.value,
    prognoza,
    link,
    zmieniono: new Date().toISOString(),
  });
  const sprawdzony = normalizuj(wpis);
  Object.assign(wpis, sprawdzony);
  if (!stan.wpisy.includes(wpis)) stan.wpisy.push(wpis);
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
  stan.wpisy = stan.wpisy.filter((w) => w.id !== wpis.id);
  stan.usuniete.push({ id: wpis.id, kiedy: new Date().toISOString() });
  await poZmianie();
});

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
});

// Numer wersji wpisuje przygotuj.mjs (wersja.js) przy każdym budowaniu.
$('wersja').textContent = 'wersja ' + (window.WERSJA_APLIKACJI || 'robocza');

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
  try {
    await wczytaj();
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
