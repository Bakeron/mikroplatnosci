// Start aplikacji, odczyt i zapis danych (plik JSON w %APPDATA%\Mikroplatnosci).

import { zbierzAlarmy, formatujDate, parsujDate, dzis } from './alarmy.js';
import { renderujPodsumowanie } from './podsumowanie.js';
import { utworzWiersz, odswiezWiersze, odswiezWiersz, numeruj, przeciaganieWierszy, stanCen } from './tabela.js';
import { odczytajCene, przyjmijCene } from './ceny.js';
import { renderujMiarke, ulozTory } from './miarka.js';
import { nowyWpis, odczytajTresc, doZapisu, usun, bezpiecznyLink, nazwaWpisu } from './dane.js';
import { wypelnijListe } from './spisy.js';
import { przygotujDysk } from './dysk.js';
import { polaczSynchronizacje } from './synchronizacja.js';
import { rozplanuj, tytul, tresc, wczytajPamiec, zapiszPamiec } from './powiadomienia.js';
import { waluta, wczytajZapamietane, odswiezZNbp, czyAktualne, pobierzKursy } from './waluty.js';

const NAZWA_PLIKU = 'mikroplatnosci.json';
const ILE_KOPII = 5;
const OPOZNIENIE_ZAPISU = 400;
const OPOZNIENIE_DODATKOW = 150;
// Zminimalizowane okno WebView2 spowalnia liczniki nawet do raz na minutę - stąd zapas 2 minut.
const BLOKADA_CO = 30000;
const BLOKADA_WAZNA = 120000;
const CENY_NARAZ = 3; // tyle wpisów czytanych naraz; strony jednego wpisu - po kolei

const stan = {
  wpisy: [],
  usuniete: [], // { id, kiedy } - żeby scalanie z Google Dyskiem nie przywróciło usuniętych pozycji
  plik: '',
  plikBlokady: '',
  plikKursow: '',
  plikPowiadomien: '',
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

// Tylko „nie ma takiej ścieżki” znaczy brak pliku. Inny błąd (uprawnienia, plik zajęty przez inny
// program) idzie dalej - inaczej aplikacja wystartowałaby z pustą listą i nadpisała dane.
async function istnieje(sciezka) {
  try {
    await Neutralino.filesystem.getStats(sciezka);
    return true;
  } catch (e) {
    if (e?.code === 'NE_FS_NOPATHE') return false;
    throw e;
  }
}

function znacznikCzasu() {
  const t = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`;
}

async function przygotujFolder() {
  const folder = (await Neutralino.os.getPath('data')).replace(/\\/g, '/') + '/Mikroplatnosci';
  stan.plik = folder + '/' + NAZWA_PLIKU;
  stan.plikBlokady = folder + '/otwarta.lock';
  stan.plikKursow = folder + '/kursy.json';
  stan.plikPowiadomien = folder + '/powiadomienia.json';
  stan.folderKopii = folder + '/kopie';
  if (!(await istnieje(folder))) await Neutralino.filesystem.createDirectory(folder);
  if (!(await istnieje(stan.folderKopii))) await Neutralino.filesystem.createDirectory(stan.folderKopii);
  await przygotujDysk(folder);
}

// Jedna kopia aplikacji naraz: otwarta odświeża znacznik w pliku, druga go widzi i się zamyka.
async function zajmijBlokade() {
  const czytaj = async () => JSON.parse(await Neutralino.filesystem.readFile(stan.plikBlokady));
  let blokada = null;
  try {
    blokada = await czytaj();
  } catch {
    // Pusty albo uszkodzony plik - może akurat zapisuje go druga kopia; drugie podejście po chwili.
    if (await istnieje(stan.plikBlokady).catch(() => false)) {
      await new Promise((r) => setTimeout(r, 300));
      blokada = await czytaj().catch(() => null);
    }
  }
  // Math.abs: czas „z przyszłości” (cofnięty zegar) nie blokuje startu na godziny.
  if (blokada && blokada.pid !== NL_PID && Math.abs(Date.now() - blokada.czas) < BLOKADA_WAZNA) return false;
  const odswiez = () => Neutralino.filesystem.writeFile(stan.plikBlokady, JSON.stringify({ pid: NL_PID, czas: Date.now() }));
  await odswiez();
  stan.timerBlokady = setInterval(() => odswiez().catch(console.error), BLOKADA_CO);
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
  if (!(await istnieje(stan.plik))) {
    stan.wpisy = [];
    return null;
  }
  const tresc = await Neutralino.filesystem.readFile(stan.plik);
  const odczytane = odczytajTresc(tresc);
  if (odczytane.motyw === 'ciemny' || odczytane.motyw === 'jasny') stan.motyw = odczytane.motyw;
  stan.wpisy = odczytane.wpisy;
  stan.usuniete = odczytane.usuniete;
  return tresc;
}

const nazwyKopii = async () => (await Neutralino.filesystem.readDirectory(stan.folderKopii))
  .filter((e) => e.type === 'FILE' && /^mikroplatnosci-\d{8}-\d{6}\.json$/.test(e.entry))
  .map((e) => e.entry)
  .sort();

// Kopia przy uruchomieniu, zostaje ILE_KOPII najnowszych. Plik taki sam jak w najnowszej kopii -
// bez nowej kopii, żeby starty „tylko popatrzeć” nie wypierały starszych wersji.
async function zrobKopie(tresc) {
  const pliki = await nazwyKopii();
  const najnowsza = pliki.at(-1);
  if (najnowsza && (await Neutralino.filesystem.readFile(`${stan.folderKopii}/${najnowsza}`).catch(() => null)) === tresc) return;
  // Kopia z treści wczytanej przy starcie - nawet gdyby plik zdążył się już zmienić.
  await Neutralino.filesystem.writeFile(`${stan.folderKopii}/mikroplatnosci-${znacznikCzasu()}.json`, tresc);
  for (const nazwa of (await nazwyKopii()).slice(0, -ILE_KOPII)) {
    await Neutralino.filesystem.remove(`${stan.folderKopii}/${nazwa}`);
  }
}

// Zapis do pliku tymczasowego i podmiana - zanik prądu w trakcie zapisu nie zostawia uciętego pliku danych.
async function zapiszPlik(tresc) {
  const tymczasowy = stan.plik + '.tmp';
  await Neutralino.filesystem.writeFile(tymczasowy, tresc);
  try {
    await Neutralino.filesystem.move(tymczasowy, stan.plik);
  } catch (e) {
    // Podmiana się nie udała - zapis wprost, jak dawniej (zapisane dane ważniejsze niż sposób zapisu).
    console.error(e);
    await Neutralino.filesystem.writeFile(stan.plik, tresc);
    await Neutralino.filesystem.remove(tymczasowy).catch(() => {});
  }
}

async function zapiszZmiany() {
  if (stan.zablokowany || !stan.wczytano || !stan.plik || !stan.niezapisane) return;
  stan.niezapisane = false; // zmiany zrobione w trakcie zapisu ustawią to od nowa
  try {
    await zapiszPlik(JSON.stringify(doZapisu(stan, { motyw: stan.motyw }), null, 2));
    pokazStatus('zapisano ✓ ' + new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    stan.niezapisane = true;
    pokazStatus('Błąd zapisu!', true);
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
});

// Numer wersji wpisuje instaluj.ps1 (wersja.js); przy „neu run” to wersja z ostatniej instalacji albo „robocza”.
$('wersja').textContent = 'wersja ' + (window.WERSJA_APLIKACJI || 'robocza');

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
  onSprawdzCene(wpis) {
    sprawdzCene(wpis);
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

// Numer ostatniego odczytu każdego wpisu - wynik starszego odczytu (np. z innym kosztem albo walutą) jest pomijany.
const numerOdczytu = new Map();

// Odczyt ceny ze strony - tylko wpisy ze zgodą „ze strony”. Błąd zostawia poprzednią
// prognozę bez zmian i prosi o wpis ręczny.
async function sprawdzCene(wpis) {
  const nr = (numerOdczytu.get(wpis.id) ?? 0) + 1;
  numerOdczytu.set(wpis.id, nr);
  const adres = bezpiecznyLink(wpis.link);
  if (!wpis.prognozaZeStrony || !adres) {
    stanCen.delete(wpis.id);
    odswiezWiersz(tbody, wpis.id);
    return;
  }
  stanCen.set(wpis.id, { stan: 'sprawdzam' });
  odswiezWiersz(tbody, wpis.id);
  const aktualny = () => numerOdczytu.get(wpis.id) === nr;
  // Zgoda, link i sam wpis sprawdzane przed każdą pobieraną stroną i po odczycie.
  const czyWolno = () => aktualny() && wpis.prognozaZeStrony && bezpiecznyLink(wpis.link) === adres && stan.wpisy.includes(wpis);
  try {
    const wynik = await odczytajCene(adres, waluta(wpis), wpis.koszt, wpis.prognozaCennik, czyWolno);
    if (!czyWolno()) return;
    stanCen.delete(wpis.id);
    // Paragon, spisy i miarka od nowa tylko, gdy wynik trafił do wpisu.
    if (przyjmijCene(wpis, wynik, adres)) {
      zaplanujZapis();
      zaplanujDodatki();
    }
  } catch (e) {
    // Odczyt przerwany (odznaczona zgoda, zmieniony link) - bez komunikatu o błędzie.
    if (czyWolno() && !e.przerwane) stanCen.set(wpis.id, { stan: 'blad', tekst: e.message || 'nie udało się odczytać strony' });
  } finally {
    if (aktualny()) {
      if (stanCen.get(wpis.id)?.stan === 'sprawdzam') stanCen.delete(wpis.id);
      odswiezWiersz(tbody, wpis.id);
    }
  }
}

// Przy każdym uruchomieniu i przyciskiem „odśwież” - kilka wpisów naraz,
// strony jednego wpisu po kolei, żeby nie obciążać serwisu.
async function sprawdzCeny() {
  const kolejka = stan.wpisy.filter((w) => w.prognozaZeStrony);
  const watek = async () => {
    while (kolejka.length) await sprawdzCene(kolejka.shift());
  };
  await Promise.all(Array.from({ length: CENY_NARAZ }, watek));
}

// Kursy NBP i ceny ze stron od nowa - przy starcie i przyciskiem „odśwież” (bez restartu aplikacji).
async function odswiezWszystko() {
  const przycisk = $('odswiez');
  if (przycisk.disabled) return;
  przycisk.disabled = true;
  try {
    await Promise.all([odswiezKursy(true), stan.zablokowany ? null : sprawdzCeny()]);
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
  zaplanujZapis();
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
    if (!(await zajmijBlokade())) {
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

  let tresc = null;
  if (!stan.zablokowany) {
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
  ustawMotyw(stan.motyw);
  renderujTabele();
  odswiezDodatki();
  // Kopia zapasowa po pokazaniu danych, ale zawsze przed pierwszym zapisem (zapisy czekają w kolejce za nią).
  if (stan.wczytano && tresc !== null) stan.zapis = zrobKopie(tresc).catch(console.error);
  if (!stan.zablokowany) pokazStatus('pozycji: ' + stan.wpisy.length);
  dysk.odswiez();
  odswiezWszystko();
}

Neutralino.events.on('ready', start);
Neutralino.events.on('windowClose', async () => {
  await zapiszTeraz();
  await zwolnijBlokade(); // druga kopia (bez zajętej blokady) niczego nie usuwa
  Neutralino.app.exit();
});
Neutralino.init();
