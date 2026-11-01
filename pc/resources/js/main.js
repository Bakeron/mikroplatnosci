// Start aplikacji, odczyt i zapis danych (plik JSON w %APPDATA%\Mikroplatnosci).

import { zbierzAlarmy, formatujDate, parsujDate, dzis } from './alarmy.js';
import { renderujPodsumowanie } from './podsumowanie.js';
import { utworzWiersz, odswiezWiersze, numeruj, przeciaganieWierszy } from './tabela.js';
import { renderujMiarke, ulozTory } from './miarka.js';
import { nowyWpis, doZapisu, usun, nazwaWpisu } from './dane.js';
import { wypelnijListe } from './spisy.js';
import { przygotujDysk, czyPolaczony } from './dysk.js';
import { polaczSynchronizacje } from './synchronizacja.js';
import { rozplanuj, tytul, tresc, wczytajPamiec, zapiszPamiec } from './powiadomienia.js';
import { wczytajZapamietane, odswiezZNbp, czyAktualne, pobierzKursy } from './waluty.js';
import { istnieje, czyZapisywac, wczytajPlikDanych, zrobKopie, zapiszPlik, usunDaneLokalne, zajmijBlokade, odswiezBlokade } from './magazyn.js';
import { wczytajUstawienia, zapiszUstawienia } from './ustawienia.js';
import { pokazOAplikacji } from './oAplikacji.js';

const NAZWA_PLIKU = 'mikroplatnosci.json';
const OPOZNIENIE_ZAPISU = 400;
const OPOZNIENIE_WYSYLKI = 3000; // bez zapisu lokalnego: kilka zmian = jedna wysyłka na Dysk
const LIMIT_WYSYLKI_PRZY_ZAMKNIECIU = 15000;
const OPOZNIENIE_DODATKOW = 150;
const BLOKADA_CO = 30000; // ważność blokady: magazyn.js

const stan = {
  wpisy: [],
  usuniete: [], // { id, kiedy } - żeby scalanie z Google Dyskiem nie przywróciło usuniętych pozycji
  plik: '',
  plikBlokady: '',
  plikKursow: '',
  plikPowiadomien: '',
  plikUstawien: '',
  lokalnie: true, // „Zapisuj lokalnie” - wyłączone: dane tylko w pamięci i na Google Dysku
  doWyslania: false, // bez zapisu lokalnego: są zmiany, których jeszcze nie ma na Dysku
  timerWysylki: null,
  kursyStatus: '', // pobieram / ok / offline
  motyw: 'ciemny', // ciemny / jasny
  folderKopii: '',
  zablokowany: false,
  wczytano: false, // do wczytania pliku nic nie zapisujemy - inaczej pusta lista nadpisałaby dane
  timerBlokady: null,
  synchronizacja: false, // trwa logowanie albo wymiana danych z Google Dyskiem
  timer: null,
  niezapisane: false, // są zmiany, których jeszcze nie ma w pliku
  zapis: Promise.resolve(), // kopia zapasowa i zapisy po kolei - nigdy dwa zapisy pliku naraz
  doUsuniecia: null,
};

const $ = (id) => document.getElementById(id);
const tbody = $('wiersze');

// --- dane -------------------------------------------------------------

async function przygotujFolder() {
  const folder = (await Neutralino.os.getPath('data')).replace(/\\/g, '/') + '/Mikroplatnosci';
  stan.plik = folder + '/' + NAZWA_PLIKU;
  stan.plikBlokady = folder + '/otwarta.lock';
  stan.plikKursow = folder + '/kursy.json';
  stan.plikPowiadomien = folder + '/powiadomienia.json';
  stan.plikUstawien = folder + '/ustawienia.json';
  stan.folderKopii = folder + '/kopie';
  if (!(await istnieje(folder))) await Neutralino.filesystem.createDirectory(folder);
  if (!(await istnieje(stan.folderKopii))) await Neutralino.filesystem.createDirectory(stan.folderKopii);
  await przygotujDysk(folder);
}

// Jedna kopia aplikacji naraz (magazyn.js); znacznik odświeżany co 30 s.
async function zajmijBlokadeOkna() {
  if (!(await zajmijBlokade(stan.plikBlokady, NL_PID))) return false;
  stan.timerBlokady = setInterval(() => odswiezBlokade(stan.plikBlokady, NL_PID).catch(console.error), BLOKADA_CO);
  return true;
}

// Tylko kopia, która zajęła blokadę; licznik stop, żeby nie odtworzył pliku tuż po usunięciu.
async function zwolnijBlokade() {
  if (!stan.timerBlokady) return;
  clearInterval(stan.timerBlokady);
  await Neutralino.filesystem.remove(stan.plikBlokady).catch(() => {});
}

// Zwraca treść pliku (do kopii zapasowej) albo null, gdy pliku jeszcze nie ma (pierwsze uruchomienie).
async function wczytaj() {
  const plik = await wczytajPlikDanych(stan.plik);
  if (!plik) {
    stan.wpisy = [];
    return null;
  }
  const { odczytane } = plik;
  if (odczytane.motyw === 'ciemny' || odczytane.motyw === 'jasny') stan.motyw = odczytane.motyw;
  stan.wpisy = odczytane.wpisy;
  stan.usuniete = odczytane.usuniete;
  return plik.tresc;
}

async function zapiszZmiany() {
  if (!czyZapisywac(stan)) return;
  stan.niezapisane = false; // zmiany zrobione w trakcie zapisu ustawią to od nowa
  try {
    await zapiszPlik(stan.plik, JSON.stringify(doZapisu(stan, { motyw: stan.motyw }), null, 2));
    pokazStatus('zapisano ✓ ' + new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    stan.niezapisane = true;
    pokazStatus('Błąd zapisu! Ponowię przy następnej zmianie', true);
    console.error(e);
  }
}

// Zapis od razu (po kolei za wcześniejszymi), tylko gdy są niezapisane zmiany.
function zapiszTeraz() {
  clearTimeout(stan.timer);
  stan.timer = null;
  stan.zapis = stan.zapis.then(zapiszZmiany);
  return stan.zapis;
}

function zaplanujZapis() {
  if (stan.zablokowany) return;
  if (!stan.lokalnie) {
    zaplanujWysylke();
    return;
  }
  stan.niezapisane = true;
  clearTimeout(stan.timer);
  pokazStatus('zapisuję…');
  stan.timer = setTimeout(zapiszTeraz, OPOZNIENIE_ZAPISU);
}

// --- Google Dysk ------------------------------------------------------

const dysk = polaczSynchronizacje({
  stan,
  poScaleniu: async () => {
    renderujTabele();
    odswiezDodatki();
    stan.niezapisane = true;
    await zapiszTeraz();
  },
  klasaBledu: 'stopka__stan--blad',
  otworzOdRazu: true,
  czyLokalnie: () => stan.lokalnie,
  wlaczLokalnie: () => wlaczZapisLokalny(),
  naOdswiez: () => odswiezMiejsceZapisu(),
});

// Bez zapisu lokalnego każda zmiana idzie na Dysk po chwili (kilka zmian = jedna wysyłka).
function zaplanujWysylke() {
  if (!czyPolaczony() || stan.zablokowany) return;
  stan.doWyslania = true;
  clearTimeout(stan.timerWysylki);
  dysk.pokaz('zmiany czekają na wysłanie…');
  stan.timerWysylki = setTimeout(wyslijZaleglosci, OPOZNIENIE_WYSYLKI);
}

async function wyslijZaleglosci() {
  clearTimeout(stan.timerWysylki);
  stan.timerWysylki = null;
  if (!stan.doWyslania) return true;
  if (stan.synchronizacja) {
    zaplanujWysylke(); // trwa inna wymiana z Dyskiem - wysyłka zaraz po niej
    return false;
  }
  stan.doWyslania = false; // zmiany w trakcie wysyłki ustawią to od nowa
  const ok = await dysk.synchronizuj(true);
  if (!ok) stan.doWyslania = true;
  return ok;
}

// --- gdzie zapisywać: „Zapisuj lokalnie”, „Usuń z komputera” ------------

// Bez zapisu lokalnego i bez Dysku dane są tylko w pamięci - tabela wyszarzona, informacja u góry.
function odswiezMiejsceZapisu() {
  const bezZapisu = !stan.zablokowany && !stan.lokalnie && !czyPolaczony();
  $('lokalnie-wlacz').checked = stan.lokalnie;
  $('lokalnie-wlacz').disabled = stan.zablokowany || stan.synchronizacja;
  $('usun-lokalnie').disabled = stan.zablokowany || stan.synchronizacja || !stan.lokalnie;
  $('bez-zapisu').hidden = !bezZapisu;
  document.querySelector('.kartka').inert = bezZapisu;
  document.body.classList.toggle('bez-zapisu', bezZapisu);
  if (!stan.zablokowany) $('dodaj').disabled = bezZapisu;
}

const zapiszMojeUstawienia = () => zapiszUstawienia(stan.plikUstawien, { lokalnie: stan.lokalnie, motyw: stan.motyw }).catch(console.error);

// Włączenie zapisu lokalnego: obecne dane (np. pobrane z Dysku) trafiają do pliku na komputerze.
// Plik, który mimo wszystko jeszcze jest (np. nie dał się usunąć), najpierw idzie do kopii.
async function wlaczZapisLokalny() {
  const stary = await wczytajPlikDanych(stan.plik).catch(() => null);
  if (stary) await zrobKopie(stan.folderKopii, stary.tresc).catch(console.error);
  stan.lokalnie = true;
  await zapiszMojeUstawienia();
  stan.wczytano = true;
  stan.niezapisane = true;
  await zapiszTeraz();
  odswiezMiejsceZapisu();
}

// Wyłączenie zapisu lokalnego: najpierw wysyłka na Dysk, potem plik danych i kopie znikają z komputera.
// Zwraca false, gdy autor zrezygnował albo wysyłka się nie udała (zapis lokalny zostaje włączony).
async function wylaczZapisLokalny() {
  const polaczony = czyPolaczony();
  const pytanie = polaczony
    ? 'Przestać zapisywać dane na tym komputerze? Najpierw zostaną wysłane na Google Dysk, potem plik danych i kopie zapasowe zostaną usunięte z komputera. Każda zmiana będzie od razu wysyłana na Dysk.'
    : 'Synchronizacja z Google Dyskiem jest wyłączona - bez zapisu na komputerze dane znikną po zamknięciu aplikacji. Usunąć plik danych i kopie zapasowe z komputera?';
  if (!confirm(pytanie)) return false;
  if (polaczony && !(await dysk.synchronizuj(true))) {
    pokazStatus('Nie udało się wysłać na Dysk - dane zostają na komputerze.', true);
    return false;
  }
  clearTimeout(stan.timer);
  stan.niezapisane = false;
  await stan.zapis;
  stan.lokalnie = false;
  await zapiszMojeUstawienia();
  try {
    await usunDaneLokalne(stan.plik, stan.folderKopii);
    pokazStatus('dane usunięte z komputera');
  } catch (e) {
    pokazStatus('Nie udało się usunąć wszystkich plików z komputera.', true);
    console.error(e);
  }
  return true;
}

// „Usuń z komputera”: lista, plik danych i kopie. Przy połączonym Dysku dane najpierw idą na Dysk
// i tam zostają, a synchronizacja na tym komputerze się wyłącza (inaczej wróciłyby przy pobraniu).
async function usunZKomputera() {
  if (stan.zablokowany || stan.synchronizacja || !stan.lokalnie) return;
  const polaczony = czyPolaczony();
  const pytanie = 'Usunąć wszystkie dane z tego komputera - listę, plik danych i kopie zapasowe? '
    + (polaczony ? 'Najpierw zostaną wysłane na Google Dysk i tam zostaną, a synchronizacja na tym komputerze się wyłączy. ' : 'Synchronizacja z Dyskiem jest wyłączona, więc dane znikną całkiem. ')
    + 'Tego nie da się cofnąć.';
  if (!confirm(pytanie)) return;
  if (polaczony && !(await dysk.synchronizuj(true))) {
    pokazStatus('Nie udało się wysłać na Dysk - nic nie zostało usunięte.', true);
    return;
  }
  clearTimeout(stan.timer);
  stan.niezapisane = false;
  await stan.zapis;
  if (polaczony) await dysk.wylacz().catch(console.error);
  try {
    await usunDaneLokalne(stan.plik, stan.folderKopii);
  } catch (e) {
    pokazStatus('Nie udało się usunąć wszystkich plików z komputera.', true);
    console.error(e);
    return;
  }
  stan.wpisy = [];
  stan.usuniete = [];
  renderujTabele();
  odswiezDodatki();
  pokazStatus('dane usunięte z komputera');
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
$('usun-lokalnie').addEventListener('click', usunZKomputera);

// Numer wersji wpisuje instaluj.ps1 (wersja.js); przy „neu run” to wersja z ostatniej instalacji albo „robocza”.
$('wersja').textContent = 'wersja ' + (window.WERSJA_APLIKACJI || 'robocza');
$('o-aplikacji').addEventListener('click', () => pokazOAplikacji('pc', (adres) => Neutralino.os.open(adres).catch(console.error)));

// --- widok ------------------------------------------------------------

function pokazStatus(tekst, blad = false) {
  const el = $('status');
  el.textContent = tekst;
  el.classList.toggle('status--blad', blad);
}

function pokazBlad(tekst) {
  const el = $('blad');
  el.textContent = tekst;
  el.hidden = false;
}

const akcjeWiersza = {
  onZmiana() {
    zaplanujZapis();
    zaplanujDodatki();
  },
  onUsun(wpis) {
    // Pusty, niewypełniony wiersz znika od razu - nie ma czego tracić.
    const pusty = !wpis.nazwa.trim() && !wpis.opis.trim() && !wpis.link.trim() && !wpis.od && wpis.przedluzac !== 'nie'
      && wpis.koszt === null && wpis.prognoza === null;
    if (pusty) {
      usunWpis(wpis);
      return;
    }
    stan.doUsuniecia = wpis;
    $('okno-usun-tekst').textContent = `Na pewno wykreślić „${nazwaWpisu(wpis)}”? Tego nie da się cofnąć.`;
    $('okno-usun').showModal();
  },
  onOtworz(adres) {
    Neutralino.os.open(adres).catch(console.error);
  },
  // Strzałki: wiersz o jedno miejsce wyżej / niżej, fokus zostaje w tym samym polu.
  onPrzesun(wpis, kierunek, fokus) {
    const i = stan.wpisy.indexOf(wpis);
    const j = i + kierunek;
    if (i < 0 || j < 0 || j >= stan.wpisy.length) return;
    [stan.wpisy[i], stan.wpisy[j]] = [stan.wpisy[j], stan.wpisy[i]];
    const tr = tbody.rows[i];
    if (kierunek < 0) tbody.rows[j].before(tr);
    else tbody.rows[j].after(tr);
    fokus?.focus();
    kolejnoscReczna();
  },
};

// Po ręcznym przesunięciu obowiązuje kolejność użytkownika (zapamiętana w pliku) - także na paragonie.
function kolejnoscReczna() {
  numeruj(tbody);
  akcjeWiersza.onZmiana();
}

przeciaganieWierszy(tbody, (kolejnosc) => {
  if (kolejnosc.every((id, i) => id === stan.wpisy[i]?.id)) return; // upuszczony w tym samym miejscu
  const pozycja = new Map(kolejnosc.map((id, i) => [id, i]));
  stan.wpisy.sort((a, b) => pozycja.get(a.id) - pozycja.get(b.id));
  kolejnoscReczna();
});

// Upuszczony link albo plik poza polem tekstowym nie przenosi okna aplikacji na inną stronę
// (przeglądarka domyślnie otwiera wtedy upuszczony adres w miejscu aplikacji).
for (const typ of ['dragover', 'drop']) {
  document.addEventListener(typ, (e) => {
    const doPola = e.target.closest?.('input, textarea') && !e.dataTransfer?.types.includes('Files');
    if (!doPola) e.preventDefault();
  });
}

// Kursy NBP od nowa - przy starcie i przyciskiem „odśwież” (bez restartu aplikacji).
async function odswiezWszystko() {
  const przycisk = $('odswiez');
  if (przycisk.disabled) return;
  przycisk.disabled = true;
  try {
    await odswiezKursy(true);
  } finally {
    przycisk.disabled = false;
  }
}

function renderujTabele() {
  tbody.replaceChildren(...stan.wpisy.map((w) => utworzWiersz(w, akcjeWiersza)));
  $('pusto').hidden = stan.wpisy.length > 0;
  numeruj(tbody);
}

// Powiadomienia Windows o pozycjach do wycofania - tylko gdy aplikacja jest otwarta (przy starcie,
// po zmianie i co 30 minut). Każde raz; zaległe progi zastępuje ostatni.
let pamiecPowiadomien = null;

async function sprawdzPowiadomienia() {
  if (!pamiecPowiadomien || stan.zablokowany) return;
  for (const p of rozplanuj(stan.wpisy, pamiecPowiadomien).teraz) {
    Neutralino.os.showNotification(tytul(p), tresc(p, dzis())).catch(console.error);
  }
  await zapiszPamiec(pamiecPowiadomien).catch(console.error);
}

function odswiezDodatki() {
  const { roczne, jednorazowe } = zbierzAlarmy(stan.wpisy);
  wypelnijListe($('alarmy-roczne'), roczne, 'Żadna roczna płatność w ciągu 3 miesięcy.', false);
  wypelnijListe($('alarmy-jednorazowe'), jednorazowe, 'Nic do wycofania.', true);
  renderujMiarke($('miarka'), [...roczne, ...jednorazowe]);
  renderujPodsumowanie($('podsumowanie'), stan.wpisy);
  sprawdzPowiadomienia();
  $('dzisiaj').textContent = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Przy pisaniu dodatki (paragon, spisy, miarka) liczą się raz po krótkiej przerwie, a nie przy każdym znaku.
let timerDodatkow = null;
function zaplanujDodatki() {
  clearTimeout(timerDodatkow);
  timerDodatkow = setTimeout(odswiezDodatki, OPOZNIENIE_DODATKOW);
}

// --- zdarzenia --------------------------------------------------------

$('dodaj').addEventListener('click', () => {
  const wpis = nowyWpis();
  stan.wpisy.push(wpis);
  const tr = utworzWiersz(wpis, akcjeWiersza);
  tbody.append(tr);
  $('pusto').hidden = true;
  numeruj(tbody);
  tr.querySelector('.pole--nazwa').focus();
  akcjeWiersza.onZmiana();
});

function ustawMotyw(motyw) {
  stan.motyw = motyw;
  document.documentElement.dataset.motyw = motyw;
  $('motyw').setAttribute('aria-label', motyw === 'ciemny' ? 'Tło ciemne - przełącz na jasne' : 'Tło jasne - przełącz na ciemne');
}

$('odswiez').addEventListener('click', odswiezWszystko);

$('motyw').addEventListener('click', () => {
  ustawMotyw(stan.motyw === 'ciemny' ? 'jasny' : 'ciemny');
  zapiszMojeUstawienia(); // motyw w ustawieniach - zostaje także bez zapisu lokalnego
  if (stan.lokalnie) zaplanujZapis();
});

$('okno-anuluj').addEventListener('click', () => $('okno-usun').close());
$('okno-potwierdz').addEventListener('click', () => {
  const wpis = stan.doUsuniecia;
  $('okno-usun').close();
  if (wpis) usunWpis(wpis);
});

function usunWpis(wpis) {
  usun(stan, wpis);
  tbody.querySelector(`tr[data-id="${CSS.escape(wpis.id)}"]`)?.remove();
  $('pusto').hidden = stan.wpisy.length > 0;
  numeruj(tbody);
  akcjeWiersza.onZmiana();
}
$('okno-usun').addEventListener('close', () => { stan.doUsuniecia = null; });

// Nagłówek tabeli zostaje na górze przy przewijaniu kartki w pionie. Samo position: sticky tu nie
// działa, bo tabela ma własny poziomy pasek przewijania (.zeszyt-ramka).
const kartka = document.querySelector('.kartka');
const ramkaTabeli = document.querySelector('.zeszyt-ramka');
const naglowekTabeli = document.querySelector('.zeszyt thead');
function przyklejNaglowekTabeli() {
  const wysuniecie = kartka.getBoundingClientRect().top - ramkaTabeli.getBoundingClientRect().top;
  const maks = Math.max(ramkaTabeli.clientHeight - naglowekTabeli.offsetHeight, 0); // nie niżej niż koniec tabeli
  const y = Math.min(Math.max(wysuniecie, 0), maks);
  naglowekTabeli.style.transform = y ? `translateY(${y}px)` : '';
}
kartka.addEventListener('scroll', przyklejNaglowekTabeli, { passive: true });

let timerMiarki = null;
window.addEventListener('resize', () => {
  clearTimeout(timerMiarki);
  timerMiarki = setTimeout(() => ulozTory($('miarka').querySelector('.miarka__znaczniki')), 150);
});

// Kursy w nagłówku: USD 3,9473 · EUR 4,3951 · NBP 29.10.2026 (+ stan pobierania).
function renderujKursy() {
  const el = $('kursy');
  const kursy = pobierzKursy();
  const czesci = [];
  if (kursy) {
    const opis = document.createElement('span');
    opis.className = 'kursy__opis';
    opis.textContent = 'kurs średni w zł:';
    czesci.push(opis);
    for (const kod of ['USD', 'EUR']) {
      const k = document.createElement('span');
      k.className = 'kursy__kurs';
      k.textContent = kod + ' ';
      const wartosc = document.createElement('strong');
      wartosc.textContent = kursy[kod].toFixed(4).replace('.', ',');
      k.append(wartosc);
      czesci.push(k);
    }
    const zrodlo = document.createElement('span');
    zrodlo.textContent = 'NBP ' + formatujDate(parsujDate(kursy.data));
    czesci.push(zrodlo);
  }
  const uwagi = { pobieram: 'pobieram kursy…', offline: kursy ? 'bez internetu - kurs zapamiętany' : 'brak kursów - bez internetu' };
  if (uwagi[stan.kursyStatus]) {
    const uwaga = document.createElement('span');
    uwaga.className = 'kursy__uwaga' + (stan.kursyStatus === 'offline' ? ' kursy__uwaga--offline' : '');
    uwaga.textContent = uwagi[stan.kursyStatus];
    uwaga.title = uwagi[stan.kursyStatus]; // pełny tekst, gdy w wąskim oknie jest skrócony
    czesci.push(uwaga);
  }
  el.replaceChildren(...czesci);
}

// Kursy NBP: przy każdym uruchomieniu (wymus) i raz dziennie, gdy okno jest długo otwarte.
// Bez internetu nic się nie zmienia - zostają ostatnie zapamiętane kursy.
async function odswiezKursy(wymus = false) {
  if (!stan.plikKursow || (!wymus && czyAktualne())) return;
  stan.kursyStatus = 'pobieram';
  renderujKursy();
  try {
    const zmiana = await odswiezZNbp(stan.plikKursow);
    stan.kursyStatus = 'ok';
    // Kwoty w złotych przeliczane tylko, gdy kursy są inne niż dotąd.
    if (zmiana) {
      odswiezWiersze(tbody);
      odswiezDodatki();
    }
  } catch (e) {
    stan.kursyStatus = 'offline';
    console.error(e);
  }
  renderujKursy();
}

// Kolory, alarmy i kursy liczone od dzisiejszej daty - odświeżane, gdy okno długo wisi otwarte.
setInterval(() => {
  odswiezWiersze(tbody);
  odswiezDodatki();
  odswiezKursy();
}, 30 * 60 * 1000);

async function start() {
  try {
    await przygotujFolder();
    if (!(await zajmijBlokadeOkna())) {
      stan.zablokowany = true;
      pokazBlad('Mikropłatności są już otwarte w innym oknie (sprawdź pasek zadań). To okno zaraz się zamknie. Jeśli żadnego okna nie ma (aplikacja się zawiesiła), uruchom ją ponownie za 2 minuty.');
      $('dodaj').disabled = true;
      setTimeout(() => Neutralino.app.exit(), 4000);
      return;
    }
  } catch (e) {
    stan.zablokowany = true;
    pokazBlad('Nie udało się przygotować folderu na dane. Zmiany nie będą zapisywane.');
    console.error(e);
  }

  if (stan.plikKursow) await wczytajZapamietane(stan.plikKursow);
  const ustawienia = stan.plikUstawien ? await wczytajUstawienia(stan.plikUstawien) : { lokalnie: true, motyw: '' };
  stan.lokalnie = ustawienia.lokalnie;

  let tresc = null;
  if (!stan.zablokowany && stan.lokalnie) {
    try {
      tresc = await wczytaj();
      stan.wczytano = true;
    } catch (e) {
      // Nie nadpisujemy pliku, którego nie umiemy odczytać.
      stan.zablokowany = true;
      pokazBlad(`Nie udało się odczytać pliku danych (${stan.plik}). Zmiany NIE będą zapisywane, żeby go nie nadpisać. Kopie są w folderze „kopie”.`);
      console.error(e);
    }
  }

  if (!stan.zablokowany) pamiecPowiadomien = await wczytajPamiec(stan.plikPowiadomien);
  if (ustawienia.motyw) stan.motyw = ustawienia.motyw;
  ustawMotyw(stan.motyw);
  renderujTabele();
  odswiezDodatki();
  // Kopia zapasowa po pokazaniu danych, ale zawsze przed pierwszym zapisem (zapisy czekają w kolejce za nią).
  if (stan.wczytano && tresc !== null) stan.zapis = zrobKopie(stan.folderKopii, tresc).catch(console.error);
  if (!stan.zablokowany) pokazStatus('pozycji: ' + stan.wpisy.length);
  dysk.odswiez();
  // Bez zapisu lokalnego dane są tylko na Dysku - pobierane przy każdym starcie.
  if (!stan.lokalnie && !stan.zablokowany) dysk.synchronizuj(false);
  odswiezWszystko();
}

Neutralino.events.on('ready', start);
Neutralino.events.on('windowClose', async () => {
  await zapiszTeraz();
  // Bez zapisu lokalnego niewysłane zmiany idą na Dysk przed zamknięciem (najwyżej 15 s).
  if (stan.doWyslania) await Promise.race([wyslijZaleglosci(), new Promise((r) => setTimeout(r, LIMIT_WYSYLKI_PRZY_ZAMKNIECIU))]);
  await zwolnijBlokade(); // druga kopia (bez zajętej blokady) niczego nie usuwa
  Neutralino.app.exit();
});
Neutralino.init();
