// Start aplikacji, odczyt i zapis danych (plik JSON w %APPDATA%\Mikroplatnosci).

import { zbierzAlarmy, formatujDate, parsujDate, dzis, przeniesNastepnaCene, isoDnia, dodajMiesiace } from './alarmy.js';
import { renderujPodsumowanie } from './podsumowanie.js';
import { utworzWiersz, odswiezWiersze, numeruj, przeciaganieWierszy } from './tabela.js';
import { renderujMiarke, ulozTory } from './miarka.js';
import { nowyWpis, doZapisu, usun, nazwaWpisu, noweId, normalizuj, odczytajTresc } from './dane.js';
import { wypelnijListe } from './spisy.js';
import { przygotujDysk, czyPolaczony } from './dysk.js';
import { polaczSynchronizacje } from './synchronizacja.js';
import { rozplanuj, tytul, tresc, wczytajPamiec, zapiszPamiec, DOMYSLNE_RODZAJE } from './powiadomienia.js';
import { wczytajZapamietane, odswiezZNbp, czyAktualne, pobierzKursy, ustawProwizje, pobierzProwizje, poprawnaProwizja, waluta } from './waluty.js';
import { renderujHistorie } from './historia.js';
import { istnieje, czyZapisywac, wczytajPlikDanych, zrobKopie, zapiszPlik, usunDaneLokalne, zajmijBlokade, odswiezBlokade, czyBlokadaZajeta, znacznikCzasu } from './magazyn.js';
import { wczytajUstawienia, zapiszUstawienia, poprawnyBudzet } from './ustawienia.js';
import { pokazOAplikacji } from './oAplikacji.js';
import { funkcja, ustawFunkcje, pobierzFunkcje, anulowana } from './funkcje.js';
import { pokazUstawienia } from './ustawieniaOkno.js';
import { ARG_TLA, czyZadanie, dodajZadanie, usunZadanie } from './harmonogram.js';
import { renderujAnulowane } from './anulowane.js';
import { podepnijPomocStrony, przetlumaczPomoc } from './pomoc.js';
import { pustyFiltr, pasuje, poprawFiltr, renderujFiltr } from './filtr.js';
import { doCsv } from './eksport.js';
import { dekoduj, odczytajWyciag, znajdzPowtarzajace } from './wyciag.js';
import { pokazWyciag } from './wyciagOkno.js';
import { trescObokKrzyzyka } from './dom.js';
import { t, tn, ustawJezyk, jezyk, przetlumaczStrone, dataDluga, godzina, liczba, liczbaKrotka } from './teksty.js';

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
  folder: '', // %APPDATA%\Mikroplatnosci
  powiadomienia: { ...DOMYSLNE_RODZAJE }, // rodzaje powiadomień z „Ustawień”
  wTle: false, // B10: powiadomienia przy zamkniętej aplikacji (zadanie w Harmonogramie zadań)
  jezyk: '', // F27: wybrany w „Ustawieniach”; pusty - język systemu
  wprowadzenie: false, // F25: notatki „pierwsze kroki” nad tabelą (do zmazania)
  budzet: 0, // D19: budżet miesięczny w zł (0 = bez limitu)
  filtr: pustyFiltr(), // D17: filtr nad tabelą (niezapamiętywany)
};

const $ = (id) => document.getElementById(id);
const tbody = $('wiersze');

// --- dane -------------------------------------------------------------

// Same ścieżki - także przy uruchomieniu w tle, które niczego nie zakłada.
async function ustawSciezki() {
  const folder = (await Neutralino.os.getPath('data')).replace(/\\/g, '/') + '/Mikroplatnosci';
  stan.folder = folder;
  stan.plik = folder + '/' + NAZWA_PLIKU;
  stan.plikBlokady = folder + '/otwarta.lock';
  stan.plikKursow = folder + '/kursy.json';
  stan.plikPowiadomien = folder + '/powiadomienia.json';
  stan.plikUstawien = folder + '/ustawienia.json';
  stan.folderKopii = folder + '/kopie';
  return folder;
}

async function przygotujFolder() {
  const folder = await ustawSciezki();
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
    pokazStatus(t('zapisano ✓ {godzina}', { godzina: godzina(new Date()) }));
  } catch (e) {
    stan.niezapisane = true;
    pokazStatus(t('Błąd zapisu! Ponowię przy następnej zmianie'), true);
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
  pokazStatus(t('zapisuję…'));
  stan.timer = setTimeout(zapiszTeraz, OPOZNIENIE_ZAPISU);
}

// --- Google Dysk ------------------------------------------------------

const dysk = polaczSynchronizacje({
  stan,
  poScaleniu: async () => {
    przeniesCeny();
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
  dysk.pokaz(t('zmiany czekają na wysłanie…'));
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
  for (const id of ['plik-zapisz', 'plik-csv']) $(id).disabled = stan.zablokowany;
  for (const id of ['plik-wczytaj', 'plik-bank']) $(id).disabled = stan.zablokowany || stan.synchronizacja;
  $('bez-zapisu').hidden = !bezZapisu;
  document.querySelector('.kartka').inert = bezZapisu;
  document.body.classList.toggle('bez-zapisu', bezZapisu);
  if (!stan.zablokowany) $('dodaj').disabled = bezZapisu;
}

const zapiszMojeUstawienia = () => zapiszUstawienia(stan.plikUstawien, {
  lokalnie: stan.lokalnie, motyw: stan.motyw, prowizja: pobierzProwizje(), funkcje: pobierzFunkcje(), powiadomienia: stan.powiadomienia, wTle: stan.wTle,
  jezyk: stan.jezyk, wprowadzenie: stan.wprowadzenie, budzet: stan.budzet,
}).catch(console.error);

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
    ? t('Przestać zapisywać dane na tym komputerze? Najpierw zostaną wysłane na Google Dysk, potem plik danych i kopie zapasowe zostaną usunięte z komputera. Każda zmiana będzie od razu wysyłana na Dysk.')
    : t('Synchronizacja z Google Dyskiem jest wyłączona - bez zapisu na komputerze dane znikną po zamknięciu aplikacji. Usunąć plik danych i kopie zapasowe z komputera?');
  if (!confirm(pytanie)) return false;
  if (polaczony && !(await dysk.synchronizuj(true))) {
    pokazStatus(t('Nie udało się wysłać na Dysk - dane zostają na komputerze.'), true);
    return false;
  }
  clearTimeout(stan.timer);
  stan.niezapisane = false;
  await stan.zapis;
  stan.lokalnie = false;
  await zapiszMojeUstawienia();
  try {
    await usunDaneLokalne(stan.plik, stan.folderKopii);
    pokazStatus(t('dane usunięte z komputera'));
  } catch (e) {
    pokazStatus(t('Nie udało się usunąć wszystkich plików z komputera.'), true);
    console.error(e);
  }
  return true;
}

// „Usuń z komputera”: lista, plik danych i kopie. Przy połączonym Dysku dane najpierw idą na Dysk
// i tam zostają, a synchronizacja na tym komputerze się wyłącza (inaczej wróciłyby przy pobraniu).
async function usunZKomputera() {
  if (stan.zablokowany || stan.synchronizacja || !stan.lokalnie) return;
  const polaczony = czyPolaczony();
  const pytanie = polaczony
    ? t('Usunąć wszystkie dane z tego komputera - listę, plik danych i kopie zapasowe? Najpierw zostaną wysłane na Google Dysk i tam zostaną, a synchronizacja na tym komputerze się wyłączy. Tego nie da się cofnąć.')
    : t('Usunąć wszystkie dane z tego komputera - listę, plik danych i kopie zapasowe? Synchronizacja z Dyskiem jest wyłączona, więc dane znikną całkiem. Tego nie da się cofnąć.');
  if (!confirm(pytanie)) return;
  if (polaczony && !(await dysk.synchronizuj(true))) {
    pokazStatus(t('Nie udało się wysłać na Dysk - nic nie zostało usunięte.'), true);
    return;
  }
  clearTimeout(stan.timer);
  stan.niezapisane = false;
  await stan.zapis;
  if (polaczony) await dysk.wylacz().catch(console.error);
  try {
    await usunDaneLokalne(stan.plik, stan.folderKopii);
  } catch (e) {
    pokazStatus(t('Nie udało się usunąć wszystkich plików z komputera.'), true);
    console.error(e);
    return;
  }
  stan.wpisy = [];
  stan.usuniete = [];
  renderujTabele();
  odswiezDodatki();
  pokazStatus(t('dane usunięte z komputera'));
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

// --- E23, E24: kopia, eksport, import (karteczka „kopia i import…” w stopce) ---

const MAKS_PLIKU = 20 * 1024 * 1024;
const trescDanych = () => JSON.stringify(doZapisu(stan, { motyw: stan.motyw }), null, 2);
const ilePozycji = (n) => tn(n, '{n} pozycja', '{n} pozycje', '{n} pozycji');

// Zapis w miejscu wybranym w oknie Windows (domyślnie Dokumenty) - np. pendrive, inny dysk.
async function zapiszDoPliku(tytulOkna, nazwa, rozszerzenie, opisTypu, tresc) {
  const folder = await Neutralino.os.getPath('documents').catch(() => '');
  let sciezka = await Neutralino.os.showSaveDialog(tytulOkna, {
    defaultPath: folder ? `${folder}/${nazwa}` : nazwa,
    filters: [{ name: opisTypu, extensions: [rozszerzenie] }],
  });
  if (!sciezka) return;
  if (!sciezka.toLowerCase().endsWith('.' + rozszerzenie)) sciezka += '.' + rozszerzenie;
  try {
    await Neutralino.filesystem.writeFile(sciezka, tresc);
    pokazStatus(t('zapisano: {plik}', { plik: sciezka.split(/[\\/]/).pop() }));
  } catch (e) {
    pokazStatus(t('Nie udało się zapisać pliku.'), true);
    console.error(e);
  }
}

$('plik-zapisz').addEventListener('click', () => {
  $('plik-okno').hidePopover();
  zapiszDoPliku(t('Zapisz kopię danych'), `mikroplatnosci-kopia-${znacznikCzasu()}.json`, 'json', t('Dane Mikropłatności'), trescDanych()).catch(console.error);
});
$('plik-csv').addEventListener('click', () => {
  $('plik-okno').hidePopover();
  zapiszDoPliku(t('Eksport do Excela (CSV)'), `mikroplatnosci-${znacznikCzasu().slice(0, 8)}.csv`, 'csv', t('Arkusz CSV'), doCsv(stan.wpisy)).catch(console.error);
});

// Wybór pliku przez przeglądarkę (pole <input type="file">) - plik czyta tylko ta strona, bez uprawnień do dysku.
let rodzajPliku = '';
function wybierzPlik(rodzaj, typy) {
  rodzajPliku = rodzaj;
  $('plik-wybor').accept = typy;
  $('plik-okno').hidePopover();
  $('plik-wybor').click();
}
$('plik-wczytaj').addEventListener('click', () => wybierzPlik('kopia', '.json,application/json'));
$('plik-bank').addEventListener('click', () => wybierzPlik('bank', '.csv,.txt,text/csv'));
$('plik-wybor').addEventListener('change', (e) => {
  const plik = e.target.files?.[0];
  e.target.value = ''; // ten sam plik drugi raz też wywoła „change”
  if (!plik || stan.zablokowany || stan.synchronizacja) return;
  if (plik.size > MAKS_PLIKU) {
    alert(t('Plik jest za duży (ponad 20 MB).'));
    return;
  }
  (rodzajPliku === 'kopia' ? wczytajKopie(plik) : wczytajWyciagBankowy(plik)).catch((blad) => {
    pokazStatus(t('Nie udało się wczytać pliku.'), true);
    console.error(blad);
  });
});

// E23: kopia z pliku zastępuje dane. Obecne najpierw do kopii zapasowej; pozycje, których w kopii nie ma, są
// usuwane jak zwykle (zapamiętane dla scalania z Dyskiem), a wczytane dostają czas zmiany „teraz” - wygrywają na Dysku.
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
    ? t('Zastąpić obecne dane ({obecne}) danymi z pliku „{plik}” ({nowe})? Obecne dane najpierw trafią do kopii zapasowej w folderze „kopie”.', { obecne, nowe, plik: plik.name })
    : t('Zastąpić obecne dane ({obecne}) danymi z pliku „{plik}” ({nowe})? Zapis na komputerze jest wyłączony, więc obecne dane nie trafią do kopii zapasowej.', { obecne, nowe, plik: plik.name });
  if (!confirm(pytanie)) return;
  if (stan.lokalnie && stan.wczytano) {
    const kopia = stan.zapis.then(() => zrobKopie(stan.folderKopii, trescDanych()));
    stan.zapis = kopia.catch(() => {});
    try {
      await kopia;
    } catch (e) {
      pokazStatus(t('Nie udało się zrobić kopii zapasowej - nic nie zmieniono.'), true);
      console.error(e);
      return;
    }
  }
  const wKopii = new Set(dane.wpisy.map((w) => w.id));
  for (const w of [...stan.wpisy]) if (!wKopii.has(w.id)) usun(stan, w);
  stan.usuniete = stan.usuniete.filter((u) => !wKopii.has(u.id));
  const teraz = new Date().toISOString();
  for (const w of dane.wpisy) w.zmieniono = teraz;
  stan.wpisy = dane.wpisy;
  stan.filtr = pustyFiltr();
  przeniesCeny();
  renderujTabele();
  odswiezDodatki();
  zaplanujZapis();
  pokazStatus(t('wczytano kopię: {ile}', { ile: nowe }));
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
  pokazWyciag(znajdzPowtarzajace(operacje, widoczne()), info, dopiszZWyciagu);
}

// Data ostatniej płatności = data zakupu - termin następnej liczy się sam.
function dopiszZWyciagu(lista) {
  if (!lista.length || stan.zablokowany) return;
  const teraz = new Date().toISOString();
  for (const p of lista) {
    stan.wpisy.push(normalizuj({
      id: noweId(), nazwa: p.nazwa, opis: t('z wyciągu bankowego'), koszt: p.kwota, waluta: p.waluta,
      od: p.ostatnia, okres: p.okres, coIle: p.coIle, przedluzac: 'tak', zmieniono: teraz,
    }));
  }
  stan.filtr = pustyFiltr();
  renderujTabele();
  akcjeWiersza.onZmiana();
  pokazStatus(tn(lista.length, 'dopisano {n} pozycję z wyciągu', 'dopisano {n} pozycje z wyciągu', 'dopisano {n} pozycji z wyciągu'));
}

// Numer wersji wpisuje instaluj.ps1 (wersja.js); przy „neu run” to wersja z ostatniej instalacji albo „robocza”.
const pokazWersje = () => { $('wersja').textContent = t('wersja {numer}', { numer: window.WERSJA_APLIKACJI || t('robocza') }); };
pokazWersje();
podepnijPomocStrony();
$('o-aplikacji').addEventListener('click', () => pokazOAplikacji('pc', (adres) => Neutralino.os.open(adres).catch(console.error)));

// --- widok ------------------------------------------------------------

function pokazStatus(tekst, blad = false) {
  const el = $('status');
  el.textContent = tekst;
  el.title = tekst; // pełny tekst, gdy w wąskim oknie jest skrócony
  el.classList.toggle('status--blad', blad);
}

function pokazBlad(tekst) {
  const el = $('blad');
  el.textContent = tekst;
  el.hidden = false;
}

// Wiersze w tabeli - bez anulowanych (C15), które są w „Anulowanych” pod tabelą.
const widoczne = () => stan.wpisy.filter((w) => !anulowana(w));

// Przykładowy wiersz z pierwszego uruchomienia (F25) - wykreślenie usuwa go od razu, bez „Anulowanych”.
const PRZYKLAD = 'przyklad-';

const akcjeWiersza = {
  onZmiana() {
    zaplanujZapis();
    zaplanujDodatki();
  },
  onUsun(wpis) {
    // Pusty, niewypełniony wiersz znika od razu - nie ma czego tracić.
    const pusty = !wpis.nazwa.trim() && !wpis.opis.trim() && !wpis.link.trim() && !wpis.od && wpis.przedluzac !== 'nie'
      && wpis.koszt === null && wpis.prognoza === null;
    if (pusty || wpis.id.startsWith(PRZYKLAD)) {
      usunWpis(wpis, true);
      return;
    }
    // C15: z „Anulowanymi” wykreślenie da się cofnąć; bez nich - usuwa na zawsze.
    const archiwum = funkcja('archiwum');
    stan.doUsuniecia = { wpis, naZawsze: !archiwum };
    $('okno-usun-tekst').textContent = archiwum
      ? t('Wykreślić „{nazwa}”? Trafi do „Anulowanych” pod tabelą - stamtąd można ją przywrócić.', { nazwa: nazwaWpisu(wpis) })
      : t('Na pewno wykreślić „{nazwa}”? Tego nie da się cofnąć.', { nazwa: nazwaWpisu(wpis) });
    $('okno-usun').showModal();
  },
  onOtworz(adres) {
    Neutralino.os.open(adres).catch(console.error);
  },
  // Strzałki: wiersz o jedno miejsce wyżej / niżej, fokus zostaje w tym samym polu.
  // Anulowane i schowane filtrem (D17) zostają na swoich miejscach - wiersz przeskakuje nad sąsiedni widoczny.
  onPrzesun(wpis, kierunek, fokus) {
    const lista = widoczne().filter((w) => pasuje(w, stan.filtr));
    const i = lista.indexOf(wpis);
    const j = i + kierunek;
    if (i < 0 || j < 0 || j >= lista.length) return;
    const sasiad = lista[j];
    stan.wpisy.splice(stan.wpisy.indexOf(wpis), 1);
    stan.wpisy.splice(stan.wpisy.indexOf(sasiad) + (kierunek > 0 ? 1 : 0), 0, wpis);
    const tr = wierszWpisu(wpis);
    if (kierunek < 0) wierszWpisu(sasiad).before(tr);
    else wierszWpisu(sasiad).after(tr);
    fokus?.focus();
    kolejnoscReczna();
  },
};

const wierszWpisu = (wpis) => tbody.querySelector(`tr[data-id="${CSS.escape(wpis.id)}"]`);

// Po ręcznym przesunięciu obowiązuje kolejność użytkownika (zapamiętana w pliku) - także na paragonie.
function kolejnoscReczna() {
  numeruj(tbody);
  akcjeWiersza.onZmiana();
}

przeciaganieWierszy(tbody, (kolejnosc) => {
  const lista = widoczne();
  if (kolejnosc.every((id, i) => id === lista[i]?.id)) return; // upuszczony w tym samym miejscu
  // Widoczne w nowej kolejności na miejscach widocznych; anulowane zostają, gdzie były.
  const wgId = new Map(lista.map((w) => [w.id, w]));
  const nowe = kolejnosc.map((id) => wgId.get(id)).filter(Boolean);
  if (nowe.length !== lista.length) return;
  let k = 0;
  stan.wpisy = stan.wpisy.map((w) => (anulowana(w) ? w : nowe[k++]));
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

// A3: ceny od następnej płatności, których dzień już nadszedł, stają się zapłaconymi (alarmy.js).
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

function renderujTabele() {
  const lista = widoczne();
  tbody.replaceChildren(...lista.map((w) => utworzWiersz(w, akcjeWiersza)));
  $('pusto').hidden = lista.length > 0;
  numeruj(tbody);
  zastosujFiltr();
}

// D17: filtr chowa wiersze tylko przy zmianie filtra i przebudowie tabeli - wiersz, który przestał pasować
// w trakcie edycji (np. zmieniona kategoria), nie znika spod ręki.
function zastosujFiltr() {
  stan.filtr = poprawFiltr(stan.filtr);
  const wgId = new Map(stan.wpisy.map((w) => [w.id, w]));
  for (const tr of tbody.rows) tr.hidden = !pasuje(wgId.get(tr.dataset.id) ?? {}, stan.filtr);
  pokazFiltr();
}

function pokazFiltr() {
  renderujFiltr($('filtr'), widoczne(), stan.filtr, [...tbody.rows].filter((tr) => !tr.hidden).length, (f) => {
    stan.filtr = f;
    zastosujFiltr();
  });
}

// C15: przywrócenie z „Anulowanych” - wiersz wraca na swoje miejsce w tabeli.
function przywrocWpis(wpis) {
  wpis.anulowano = '';
  wpis.zmieniono = new Date().toISOString();
  renderujTabele();
  akcjeWiersza.onZmiana();
}

// „usuń na zawsze” w „Anulowanych” - to samo okno z pieczątką, co przy wykreślaniu.
function pytajOUsuniecie(wpis) {
  stan.doUsuniecia = { wpis, naZawsze: true };
  $('okno-usun-tekst').textContent = t('Usunąć „{nazwa}” na zawsze? Tego nie da się cofnąć.', { nazwa: nazwaWpisu(wpis) });
  $('okno-usun').showModal();
}

// F25: pierwsze uruchomienie - notatki „pierwsze kroki” nad tabelą i przykładowy wiersz do wykreślenia.
function dodajPrzyklad() {
  const zakup = dodajMiesiace(dzis(), -1);
  zakup.setDate(zakup.getDate() + 9); // płatność za 9 dni - lont już trochę wypalony
  stan.wpisy.push(normalizuj({
    id: PRZYKLAD + noweId(),
    nazwa: t('Przykład: serwis muzyczny'),
    opis: t('wykreśl mnie „×”, gdy dopiszesz własne'),
    koszt: 23.99,
    od: isoDnia(zakup),
    okres: 'M',
    przedluzac: 'tak',
    zmieniono: new Date().toISOString(),
  }));
}

function pokazWprowadzenie() {
  $('wprowadzenie').hidden = !stan.wprowadzenie;
}

$('wprowadzenie-zmaz').addEventListener('click', () => {
  stan.wprowadzenie = false;
  pokazWprowadzenie();
  zapiszMojeUstawienia();
  $('dodaj').focus();
});

// Powiadomienia Windows o pozycjach do wycofania - tylko gdy aplikacja jest otwarta (przy starcie,
// po zmianie i co 30 minut). Każde raz; zaległe progi zastępuje ostatni.
let pamiecPowiadomien = null;

async function sprawdzPowiadomienia() {
  if (!pamiecPowiadomien || stan.zablokowany) return;
  for (const p of rozplanuj(stan.wpisy, pamiecPowiadomien, new Date(), stan.powiadomienia).teraz) {
    Neutralino.os.showNotification(tytul(p), tresc(p, dzis())).catch(console.error);
  }
  await zapiszPamiec(pamiecPowiadomien).catch(console.error);
}

function odswiezDodatki() {
  const { roczne, jednorazowe } = zbierzAlarmy(stan.wpisy);
  wypelnijListe($('alarmy-roczne'), roczne, t('Żadna roczna płatność w ciągu 3 miesięcy.'), false);
  wypelnijListe($('alarmy-jednorazowe'), jednorazowe, t('Nic do wycofania.'), true);
  renderujMiarke($('miarka'), [...roczne, ...jednorazowe]);
  pokazWaluty();
  renderujPodsumowanie($('podsumowanie'), stan.wpisy, { budzet: stan.budzet });
  pokazFiltr();
  renderujAnulowane($('anulowane'), stan.wpisy, { naPrzywroc: przywrocWpis, naUsun: pytajOUsuniecie });
  // Wyłączona „Historia wydatków” - sekcja znika (nic nie jest liczone).
  $('historia').hidden = !funkcja('historia');
  if (funkcja('historia')) renderujHistorie($('historia'), stan.wpisy);
  else $('historia').replaceChildren();
  sprawdzPowiadomienia();
  $('dzisiaj').textContent = dataDluga(new Date());
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
  $('motyw').setAttribute('aria-label', motyw === 'ciemny' ? t('Tło ciemne - przełącz na jasne') : t('Tło jasne - przełącz na ciemne'));
}

$('odswiez').addEventListener('click', odswiezWszystko);

// Prowizja banku za przewalutowanie (ustawienie tego komputera): zmienia „≈ zł”, paragon i historię.
function pokazProwizje() {
  const p = pobierzProwizje();
  $('prowizja-wartosc').textContent = liczbaKrotka(p) + '%';
  $('prowizja').classList.toggle('prowizja--ustawiona', p > 0);
  if (document.activeElement !== $('prowizja-pole')) $('prowizja-pole').value = String(p);
}
$('prowizja-pole').addEventListener('change', (e) => {
  const wartosc = Number(String(e.target.value).replace(',', '.'));
  ustawProwizje(poprawnaProwizja(wartosc));
  e.target.value = String(pobierzProwizje());
  pokazProwizje();
  zapiszMojeUstawienia();
  odswiezWiersze(tbody);
  odswiezDodatki();
});

// Wyłączone „Waluty obce” - kursy, prowizja i „odśwież” znikają z nagłówka (bez pobierania kursów NBP),
// chyba że któraś pozycja już ma walutę obcą (jej „≈ zł” dalej potrzebuje kursu).
const uzywaWalut = () => funkcja('waluty') || stan.wpisy.some((w) => waluta(w) !== 'PLN');
function pokazWaluty() {
  const widac = uzywaWalut();
  for (const id of ['kursy', 'prowizja', 'odswiez']) $(id).hidden = !widac;
}

// --- Ustawienia: funkcje, powiadomienia, powiadomienia przy zamkniętej aplikacji (B10) ---

function zastosujFunkcje(funkcje) {
  ustawFunkcje(funkcje);
  zapiszMojeUstawienia();
  if (przeniesCeny()) zaplanujZapis(); // ponownie włączona „Cena następna” - cena, której dzień minął, staje się zapłaconą
  renderujTabele();
  odswiezDodatki();
  odswiezKursy(); // włączone waluty - kursy, jeśli dziś jeszcze nie pobrane
}

// F27: język strony - teksty z index.html (teksty.js) i wszystko, co rysuje kod, od nowa.
function zastosujJezyk() {
  ustawJezyk(stan.jezyk);
  document.documentElement.lang = jezyk();
  // Napisy w przełącznikach tak / nie pochodzą z CSS (::after) - tu jako zmienne CSS.
  document.documentElement.style.setProperty('--napis-tak', JSON.stringify(t('tak')));
  document.documentElement.style.setProperty('--napis-nie', JSON.stringify(t('nie')));
  przetlumaczStrone();
  przetlumaczPomoc();
  pokazWersje();
  ustawMotyw(stan.motyw);
}

function zmienJezyk(j) {
  stan.jezyk = j;
  zastosujJezyk();
  zapiszMojeUstawienia();
  renderujTabele();
  odswiezDodatki();
  renderujKursy();
  pokazProwizje();
  dysk.odswiez();
  if (!stan.zablokowany) pokazStatus(t('pozycji: {n}', { n: widoczne().length }));
  otworzUstawienia(); // okno ustawień od razu w nowym języku
}

const otworzUstawienia = () => pokazUstawienia(
  { funkcje: pobierzFunkcje(), powiadomienia: stan.powiadomienia, wTle: stan.wTle, jezyk: jezyk(), budzet: stan.budzet },
  {
    naFunkcje: zastosujFunkcje,
    naJezyk: zmienJezyk,
    naBudzet(kwota) {
      stan.budzet = poprawnyBudzet(kwota);
      zapiszMojeUstawienia();
      odswiezDodatki();
    },
    // F25: notatki „pierwsze kroki” jeszcze raz (przykładowy wiersz tylko w pustym zeszycie).
    naWprowadzenie() {
      stan.wprowadzenie = true;
      zapiszMojeUstawienia();
      if (!widoczne().length && !stan.zablokowany && !$('dodaj').disabled) {
        dodajPrzyklad();
        renderujTabele();
        akcjeWiersza.onZmiana();
      }
      pokazWprowadzenie();
    },
    naPowiadomienia(p) {
      stan.powiadomienia = p;
      zapiszMojeUstawienia();
      sprawdzPowiadomienia();
    },
    async naWTle(wlacz) {
      const blad = wlacz ? await dodajZadanie(stan.folder) : await usunZadanie();
      if (!blad) {
        stan.wTle = wlacz;
        await zapiszMojeUstawienia();
      }
      return blad;
    },
    // Zadanie usunięte poza aplikacją (ręcznie, przy odinstalowaniu) - ustawienie idzie za stanem Windows.
    async sprawdzWTle() {
      const jest = await czyZadanie();
      if (jest !== null && jest !== stan.wTle) {
        stan.wTle = jest;
        zapiszMojeUstawienia();
      }
      return jest;
    },
  },
);
$('ustawienia').addEventListener('click', otworzUstawienia);

$('motyw').addEventListener('click', () => {
  ustawMotyw(stan.motyw === 'ciemny' ? 'jasny' : 'ciemny');
  zapiszMojeUstawienia(); // motyw w ustawieniach - zostaje także bez zapisu lokalnego
  if (stan.lokalnie) zaplanujZapis();
});

$('okno-anuluj').addEventListener('click', () => $('okno-usun').close());
$('okno-potwierdz').addEventListener('click', () => {
  const doUsuniecia = stan.doUsuniecia;
  $('okno-usun').close();
  if (doUsuniecia) usunWpis(doUsuniecia.wpis, doUsuniecia.naZawsze);
});

// naZawsze: usunięcie z pliku (zapamiętane dla scalania z Dyskiem); inaczej - do „Anulowanych” z dzisiejszą datą (C15).
function usunWpis(wpis, naZawsze) {
  if (naZawsze) usun(stan, wpis);
  else {
    wpis.anulowano = isoDnia(dzis());
    wpis.zmieniono = new Date().toISOString();
  }
  tbody.querySelector(`tr[data-id="${CSS.escape(wpis.id)}"]`)?.remove();
  $('pusto').hidden = widoczne().length > 0;
  numeruj(tbody);
  akcjeWiersza.onZmiana();
}
$('okno-usun').addEventListener('close', () => { stan.doUsuniecia = null; });
// „×” w rogu okien z index.html (pytanie o wykreślenie, Google) - zamyka jak Esc albo kliknięcie w tło.
for (const x of document.querySelectorAll('dialog > .okno__x')) {
  x.addEventListener('click', () => x.closest('dialog').close());
  trescObokKrzyzyka(x.closest('dialog'), x);
}

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
    opis.textContent = t('kurs średni w zł:');
    czesci.push(opis);
    for (const kod of ['USD', 'EUR']) {
      const k = document.createElement('span');
      k.className = 'kursy__kurs';
      k.textContent = kod + ' ';
      const wartosc = document.createElement('strong');
      wartosc.textContent = liczba(kursy[kod], 4);
      k.append(wartosc);
      czesci.push(k);
    }
    const zrodlo = document.createElement('span');
    zrodlo.textContent = 'NBP ' + formatujDate(parsujDate(kursy.data));
    czesci.push(zrodlo);
  }
  const uwagi = { pobieram: t('pobieram kursy…'), offline: kursy ? t('bez internetu - kurs zapamiętany') : t('brak kursów - bez internetu') };
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
  if (!stan.plikKursow || !uzywaWalut() || (!wymus && czyAktualne())) return;
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
  if (przeniesCeny()) zaplanujZapis();
  odswiezWiersze(tbody);
  odswiezDodatki();
  odswiezKursy();
}, 30 * 60 * 1000);

async function start() {
  try {
    await przygotujFolder();
    if (!(await zajmijBlokadeOkna())) {
      stan.zablokowany = true;
      ustawJezyk((await wczytajUstawienia(stan.plikUstawien)).jezyk); // komunikat w języku aplikacji
      pokazBlad(t('Mikropłatności są już otwarte w innym oknie (sprawdź pasek zadań). To okno zaraz się zamknie. Jeśli żadnego okna nie ma (aplikacja się zawiesiła), uruchom ją ponownie za 2 minuty.'));
      $('dodaj').disabled = true;
      setTimeout(() => Neutralino.app.exit(), 4000);
      return;
    }
  } catch (e) {
    stan.zablokowany = true;
    pokazBlad(t('Nie udało się przygotować folderu na dane. Zmiany nie będą zapisywane.'));
    console.error(e);
  }

  if (stan.plikKursow) await wczytajZapamietane(stan.plikKursow);
  const ustawienia = stan.plikUstawien ? await wczytajUstawienia(stan.plikUstawien) : { lokalnie: true, motyw: '' };
  stan.lokalnie = ustawienia.lokalnie;
  ustawFunkcje(ustawienia.funkcje);
  stan.wTle = ustawienia.wTle === true;
  stan.jezyk = ustawienia.jezyk || '';
  stan.wprowadzenie = ustawienia.wprowadzenie === true;
  stan.budzet = poprawnyBudzet(ustawienia.budzet);
  zastosujJezyk();

  let tresc = null;
  if (!stan.zablokowany && stan.lokalnie) {
    try {
      tresc = await wczytaj();
      stan.wczytano = true;
    } catch (e) {
      // Nie nadpisujemy pliku, którego nie umiemy odczytać.
      stan.zablokowany = true;
      pokazBlad(t('Nie udało się odczytać pliku danych ({plik}). Zmiany NIE będą zapisywane, żeby go nie nadpisać. Kopie są w folderze „kopie”.', { plik: stan.plik }));
      console.error(e);
    }
  }

  if (!stan.zablokowany) pamiecPowiadomien = await wczytajPamiec(stan.plikPowiadomien);
  if (ustawienia.motyw) stan.motyw = ustawienia.motyw;
  ustawProwizje(ustawienia.prowizja);
  pokazProwizje();
  ustawMotyw(stan.motyw);
  // Pierwsze uruchomienie z zakładką „Ustawienia”: kto już używa aplikacji (jest plik danych albo dane
  // na Dysku), zachowuje „Wycofaj” i „Zapłać”; nowa osoba - wszystkie powiadomienia wyłączone.
  if (ustawienia.powiadomienia) stan.powiadomienia = ustawienia.powiadomienia;
  else if (!stan.zablokowany) {
    const uzywana = tresc !== null || !stan.lokalnie;
    stan.powiadomienia = { ...DOMYSLNE_RODZAJE, wycofaj: uzywana, zaplac: uzywana };
    // F25: nowa osoba - notatki „pierwsze kroki” i przykładowy wiersz (zapisany jak każdy inny).
    if (!uzywana && stan.wczytano && !stan.wpisy.length) {
      stan.wprowadzenie = true;
      dodajPrzyklad();
      stan.niezapisane = true;
    }
    zapiszMojeUstawienia();
  }
  pokazWprowadzenie();
  const zmienioneCeny = przeniesCeny(); // przed pokazaniem - tabela od razu z aktualną ceną
  renderujTabele();
  odswiezDodatki();
  // Kopia zapasowa po pokazaniu danych, ale zawsze przed pierwszym zapisem (zapisy czekają w kolejce za nią).
  if (stan.wczytano && tresc !== null) stan.zapis = zrobKopie(stan.folderKopii, tresc).catch(console.error);
  if (zmienioneCeny || stan.niezapisane) zaplanujZapis(); // po kopii zapasowej - zapis czeka za nią w kolejce
  if (!stan.zablokowany) pokazStatus(t('pozycji: {n}', { n: widoczne().length }));
  dysk.odswiez();
  // Bez zapisu lokalnego dane są tylko na Dysku - pobierane przy każdym starcie.
  if (!stan.lokalnie && !stan.zablokowany) dysk.synchronizuj(false);
  odswiezWszystko();
}

// B10: uruchomienie z Harmonogramu zadań (harmonogram.js) - bez okna. Pokazuje zaległe powiadomienia
// i zamyka aplikację. Niczego nie zapisuje poza pamięcią pokazanych powiadomień; nie zajmuje blokady,
// więc nie przeszkadza w otwarciu okna w tym samym czasie. Okno już otwarte - samo pilnuje powiadomień.
async function startWTle() {
  const zamknij = () => Neutralino.app.exit();
  setTimeout(zamknij, 60000); // bezpiecznik - proces nigdy nie zostaje w tle
  try {
    await ustawSciezki();
    const u = await wczytajUstawienia(stan.plikUstawien);
    if (!u.wTle || !u.lokalnie || !u.powiadomienia || (await czyBlokadaZajeta(stan.plikBlokady))) {
      zamknij();
      return;
    }
    ustawFunkcje(u.funkcje);
    ustawProwizje(u.prowizja);
    ustawJezyk(u.jezyk); // powiadomienia w języku aplikacji
    await wczytajZapamietane(stan.plikKursow); // drogie płatności w walucie obcej - po ostatnim kursie
    const plik = await wczytajPlikDanych(stan.plik);
    if (!plik) {
      zamknij();
      return;
    }
    const pamiec = await wczytajPamiec(stan.plikPowiadomien);
    const teraz = rozplanuj(plik.odczytane.wpisy, pamiec, new Date(), u.powiadomienia).teraz;
    for (const p of teraz) await Neutralino.os.showNotification(tytul(p), tresc(p, dzis())).catch(console.error);
    await zapiszPamiec(pamiec);
    // Chwila na wyświetlenie powiadomień przed zamknięciem procesu.
    setTimeout(zamknij, teraz.length ? 8000 : 0);
  } catch (e) {
    console.error(e);
    zamknij();
  }
}

const wTle = Array.isArray(window.NL_ARGS) && window.NL_ARGS.includes(ARG_TLA);
Neutralino.events.on('ready', wTle ? startWTle : start);
Neutralino.events.on('windowClose', async () => {
  await zapiszTeraz();
  // Bez zapisu lokalnego niewysłane zmiany idą na Dysk przed zamknięciem (najwyżej 15 s).
  if (stan.doWyslania) await Promise.race([wyslijZaleglosci(), new Promise((r) => setTimeout(r, LIMIT_WYSYLKI_PRZY_ZAMKNIECIU))]);
  await zwolnijBlokade(); // druga kopia (bez zajętej blokady) niczego nie usuwa
  Neutralino.app.exit();
});
Neutralino.init();
