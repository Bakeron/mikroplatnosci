// Start aplikacji, odczyt i zapis danych (plik JSON w %APPDATA%\Mikroplatnosci).

import { zbierzAlarmy, formatujDate, parsujDate, dzis } from './alarmy.js';
import { renderujPodsumowanie } from './podsumowanie.js';
import { utworzWiersz, odswiezWiersze, bezpiecznyLink, numeruj } from './tabela.js';
import { odczytajCene, stanCen } from './ceny.js';
import { renderujMiarke, ulozTory } from './miarka.js';
import { nowyWpis, odczytajDane, doZapisu } from './dane.js';
import { wypelnijListe } from './spisy.js';
import { przygotujDysk } from './dysk.js';
import { polaczSynchronizacje } from './synchronizacja.js';
import { rozplanuj, tytul, tresc, wczytajPamiec, zapiszPamiec } from './powiadomienia.js';
import { waluta, wczytajZapamietane, odswiezZNbp, czyAktualne, pobierzKursy } from './waluty.js';

const NAZWA_PLIKU = 'mikroplatnosci.json';
const ILE_KOPII = 5;
const OPOZNIENIE_ZAPISU = 400;
const BLOKADA_CO = 5000;
const BLOKADA_WAZNA = 20000;

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
  synchronizacja: false, // trwa logowanie albo wymiana danych z Google Dyskiem
  timer: null,
  doUsuniecia: null,
  sort: { klucz: 'termin', kierunek: 1 },
};

const $ = (id) => document.getElementById(id);
const tbody = $('wiersze');

// --- dane -------------------------------------------------------------

async function istnieje(sciezka) {
  try {
    await Neutralino.filesystem.getStats(sciezka);
    return true;
  } catch {
    return false;
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
  try {
    const blokada = JSON.parse(await Neutralino.filesystem.readFile(stan.plikBlokady));
    if (blokada.pid !== NL_PID && Date.now() - blokada.czas < BLOKADA_WAZNA) return false;
  } catch {
    // brak pliku blokady albo uszkodzony - można zająć
  }
  const odswiez = () => Neutralino.filesystem.writeFile(stan.plikBlokady, JSON.stringify({ pid: NL_PID, czas: Date.now() }));
  await odswiez();
  setInterval(() => odswiez().catch(console.error), BLOKADA_CO);
  return true;
}

async function zwolnijBlokade() {
  if (stan.plikBlokady) await Neutralino.filesystem.remove(stan.plikBlokady).catch(() => {});
}

async function wczytaj() {
  if (!(await istnieje(stan.plik))) return [];
  const tresc = await Neutralino.filesystem.readFile(stan.plik);
  if (!tresc.trim()) return [];
  const dane = JSON.parse(tresc);
  const odczytane = odczytajDane(dane);
  if (!odczytane) throw new Error('nieprawidłowy format pliku');
  // Zapamiętana kolejność: kolumna sortowania albo „reczna” (wiersze przesuwane przez użytkownika).
  const s = dane.sort;
  if (s && typeof s.klucz === 'string' && /^[a-z]{1,20}$/.test(s.klucz) && (s.kierunek === 1 || s.kierunek === -1)) {
    stan.sort = { klucz: s.klucz, kierunek: s.kierunek };
  }
  if (dane.motyw === 'ciemny' || dane.motyw === 'jasny') stan.motyw = dane.motyw;
  stan.usuniete = odczytane.usuniete;
  return odczytane.wpisy;
}

// Kopia przy każdym uruchomieniu, zostaje ILE_KOPII najnowszych.
async function zrobKopie() {
  if (!(await istnieje(stan.plik))) return;
  await Neutralino.filesystem.copy(stan.plik, `${stan.folderKopii}/mikroplatnosci-${znacznikCzasu()}.json`);
  const pliki = (await Neutralino.filesystem.readDirectory(stan.folderKopii))
    .filter((e) => e.type === 'FILE' && /^mikroplatnosci-\d{8}-\d{6}\.json$/.test(e.entry))
    .map((e) => e.entry)
    .sort();
  for (const nazwa of pliki.slice(0, Math.max(0, pliki.length - ILE_KOPII))) {
    await Neutralino.filesystem.remove(`${stan.folderKopii}/${nazwa}`);
  }
}

async function zapiszTeraz() {
  clearTimeout(stan.timer);
  stan.timer = null;
  if (stan.zablokowany || !stan.plik) return;
  try {
    const dane = doZapisu(stan, { sort: stan.sort, motyw: stan.motyw });
    await Neutralino.filesystem.writeFile(stan.plik, JSON.stringify(dane, null, 2));
    pokazStatus('zapisano ✓ ' + new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    pokazStatus('Błąd zapisu!', true);
    console.error(e);
  }
}

function zaplanujZapis() {
  if (stan.zablokowany) return;
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
    odswiezDodatki();
  },
  onUsun(wpis) {
    // Pusty, niewypełniony wiersz znika od razu - nie ma czego tracić.
    const pusty = !wpis.nazwa.trim() && !wpis.opis.trim() && !wpis.link.trim() && !wpis.od && !wpis.przedluzac
      && wpis.koszt === null && wpis.prognoza === null;
    if (pusty) {
      usunWpis(wpis);
      return;
    }
    stan.doUsuniecia = wpis;
    $('okno-usun-tekst').textContent = `Na pewno wykreślić „${wpis.nazwa.trim() || 'bez nazwy'}”? Tego nie da się cofnąć.`;
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

// Po ręcznym przesunięciu obowiązuje kolejność użytkownika (zapamiętana w pliku).
function kolejnoscReczna() {
  stan.sort = { klucz: 'reczna', kierunek: 1 };
  numeruj(tbody);
  zaplanujZapis();
}

// Przeciąganie za numer Lp. - wiersz przesuwa się na żywo pod kursorem.
let przeciagany = null;
tbody.addEventListener('dragstart', (e) => {
  przeciagany = e.target.closest?.('tr');
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
  const pozycja = new Map([...tbody.rows].map((tr, i) => [tr.dataset.id, i]));
  stan.wpisy.sort((a, b) => pozycja.get(a.id) - pozycja.get(b.id));
  kolejnoscReczna();
});

function dzisIso() {
  const t = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

// Odczyt ceny ze strony - tylko wpisy ze zgodą „ze strony”. Błąd zostawia poprzednią
// prognozę bez zmian i prosi o wpis ręczny.
async function sprawdzCene(wpis) {
  const adres = bezpiecznyLink(wpis.link);
  if (!wpis.prognozaZeStrony || !adres) {
    odswiezWiersze(tbody);
    return;
  }
  stanCen.set(wpis.id, { stan: 'sprawdzam' });
  odswiezWiersze(tbody);
  try {
    const { cena, vat, cennik } = await odczytajCene(adres, waluta(wpis), wpis.koszt, wpis.prognozaCennik);
    // W międzyczasie mogła zniknąć zgoda, zmienić się link albo zniknąć cały wpis.
    if (!wpis.prognozaZeStrony || bezpiecznyLink(wpis.link) !== adres || !stan.wpisy.includes(wpis)) return;
    Object.assign(wpis, {
      prognoza: cena, prognozaZrodlo: 'strona', prognozaData: dzisIso(), prognozaVat: vat,
      prognozaCennik: cennik === adres ? '' : cennik, // znaleziony cennik - następnym razem od niego
      zmieniono: new Date().toISOString(),
    });
    stanCen.delete(wpis.id);
    zaplanujZapis();
  } catch (e) {
    stanCen.set(wpis.id, { stan: 'blad', tekst: e.message || 'nie udało się odczytać strony' });
  } finally {
    if (stanCen.get(wpis.id)?.stan === 'sprawdzam') stanCen.delete(wpis.id);
    odswiezWiersze(tbody);
    odswiezDodatki();
  }
}

// Przy każdym uruchomieniu i przyciskiem „odśwież” - po kolei, żeby nie obciążać łącza.
async function sprawdzCeny() {
  for (const wpis of stan.wpisy.filter((w) => w.prognozaZeStrony)) await sprawdzCene(wpis);
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
  stan.wpisy = stan.wpisy.filter((w) => w !== wpis);
  stan.usuniete.push({ id: wpis.id, kiedy: new Date().toISOString() });
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
    await odswiezZNbp(stan.plikKursow);
    stan.kursyStatus = 'ok';
    odswiezWiersze(tbody);
    odswiezDodatki();
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

let drugaKopia = false;

async function start() {
  try {
    await przygotujFolder();
    if (!(await zajmijBlokade())) {
      drugaKopia = true;
      stan.zablokowany = true;
      pokazBlad('Mikropłatności są już otwarte w innym oknie (sprawdź pasek zadań). To okno zaraz się zamknie.');
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

  if (!stan.zablokowany) {
    try {
      stan.wpisy = await wczytaj();
      await zrobKopie().catch(console.error);
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
  if (!stan.zablokowany) pokazStatus('pozycji: ' + stan.wpisy.length);
  dysk.odswiez();
  renderujKursy();
  odswiezWszystko();
}

Neutralino.events.on('ready', start);
Neutralino.events.on('windowClose', async () => {
  await zapiszTeraz();
  if (!drugaKopia) await zwolnijBlokade();
  Neutralino.app.exit();
});
Neutralino.init();
