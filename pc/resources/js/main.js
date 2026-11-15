// Start aplikacji, odczyt i zapis danych (plik JSON w %APPDATA%\Mikroplatnosci).

import { zbierzAlarmy, formatujDate, parsujDate, dzis, przeniesNastepnaCene, isoDnia } from './alarmy.js';
import { renderujPodsumowanie } from './podsumowanie.js';
import { utworzWiersz, odswiezWiersze, numeruj, przeciaganieWierszy } from './tabela.js';
import { renderujMiarke, ulozTory } from './miarka.js';
import { nowyWpis, doZapisu, usun, nazwaWpisu, noweId, normalizuj, odczytajTresc, zastapZKopii, dodajPrzyklad, nicDoStracenia, czasZmiany, oznaczUlozenie, MAKS_WPISOW_Z_DYSKU, WERSJA_DANYCH } from './dane.js';
import { wypelnijListe } from './spisy.js';
import { przygotujDysk, czyPolaczony } from './dysk.js';
import { polaczSynchronizacje, OPOZNIENIE_WYSYLKI, poWymianie } from './synchronizacja.js';
import { obrazKoduQr } from './kodQrObraz.js';
import { rozplanuj, tytul, tresc, wczytajPamiec, zapiszPamiec, DOMYSLNE_RODZAJE } from './powiadomienia.js';
import { wczytajZapamietane, odswiezZNbp, czyAktualne, pobierzKursy, ustawProwizje, pobierzProwizje, poprawnaProwizja, WALUTY } from './waluty.js';
import { renderujHistorie } from './historia.js';
import { istnieje, czyZapisywac, wczytajPlikDanych, wczytajNaStart, zrobKopie, zapiszPlik, usunDaneLokalne, odlozUszkodzony, zajmijBlokade, utrzymajBlokade, czyBlokadaZajeta, znacznikCzasu } from './magazyn.js';
import { wczytajUstawienia, zapiszUstawienia, poprawnyBudzet } from './ustawienia.js';
import { pokazOAplikacji } from './oAplikacji.js';
import { funkcja, ustawFunkcje, pobierzFunkcje, anulowana, ustawWaluty, pobierzWaluty, uzyteWaluty, walutyNaStart } from './funkcje.js';
import { pokazUstawienia } from './ustawieniaOkno.js';
import { ARG_TLA, czyZadanie, dodajZadanie, usunZadanie } from './harmonogram.js';
import { renderujAnulowane } from './anulowane.js';
import { podepnijPomocStrony, przetlumaczPomoc } from './pomoc.js';
import { pustyFiltr, pasuje, poprawFiltr, renderujFiltr } from './filtr.js';
import { doCsv } from './eksport.js';
import { dekoduj, odczytajWyciag, znajdzPowtarzajace } from './wyciag.js';
import { pokazWyciag } from './wyciagOkno.js';
import { pokazPlynnie, trescObokKrzyzyka, zamienPlynnie } from './dom.js';
import { pokazPierwszeKroki } from './pierwszeKroki.js';
import { t, tn, ustawJezyk, jezyk, przetlumaczStrone, dataDluga, godzina, liczba, liczbaKrotka } from './teksty.js';

const NAZWA_PLIKU = 'mikroplatnosci.json';
const OPOZNIENIE_ZAPISU = 400;
const LIMIT_WYSYLKI_PRZY_ZAMKNIECIU = 15000;
const OPOZNIENIE_DODATKOW = 150;
const BLOKADA_CO = 30000; // ważność blokady: magazyn.js

const stan = {
  wpisy: [],
  usuniete: [], // { id, kiedy } - żeby scalanie z Google Dyskiem nie przywróciło usuniętych pozycji
  ulozono: '', // czas ostatniego ręcznego przesunięcia - przy scalaniu z Dyskiem wygrywa nowsza kolejność
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
  bladOdczytu: false, // zapis zablokowany, bo plik danych jest nieczytelny - „Wczytaj kopię” go zastąpi
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
  wprowadzenie: false, // F25: dymki „pierwsze kroki” do obejrzenia (po „Pomiń” / „Gotowe” - false)
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

// Jedna kopia aplikacji naraz (magazyn.js); znacznik odświeżany co 30 s. Blokada przejęta przez inną kopię
// (to okno wróciło z uśpienia) - to okno przestaje zapisywać i nie usuwa cudzej blokady przy zamknięciu.
async function zajmijBlokadeOkna() {
  if (!(await zajmijBlokade(stan.plikBlokady, NL_PID))) return false;
  stan.timerBlokady = setInterval(async () => {
    if (await utrzymajBlokade(stan.plikBlokady, NL_PID).catch((e) => (console.error(e), true))) return;
    clearInterval(stan.timerBlokady);
    stan.timerBlokady = null;
    clearTimeout(stan.timer);
    clearTimeout(stan.timerWysylki);
    stan.zablokowany = true;
    odswiezMiejsceZapisu();
    $('dodaj').disabled = true;
    pokazBlad(t('Mikropłatności otwarto w innym oknie. To okno przestało zapisywać zmiany, żeby nie nadpisać tamtych - zamknij je i pracuj w tamtym oknie.'));
  }, BLOKADA_CO);
  return true;
}

// Tylko kopia, która zajęła blokadę; licznik stop, żeby nie odtworzył pliku tuż po usunięciu.
async function zwolnijBlokade() {
  if (!stan.timerBlokady) return;
  clearInterval(stan.timerBlokady);
  await Neutralino.filesystem.remove(stan.plikBlokady).catch(() => {});
}

// Zwraca kopia() (kopia zapasowa wczytanej treści) albo null, gdy pliku jeszcze nie ma (pierwsze uruchomienie).
async function wczytaj() {
  const plik = await wczytajNaStart(stan.plik, stan.folderKopii);
  if (!plik) {
    stan.wpisy = [];
    return null;
  }
  const { odczytane } = plik;
  if (odczytane.motyw === 'ciemny' || odczytane.motyw === 'jasny') stan.motyw = odczytane.motyw;
  stan.wpisy = odczytane.wpisy;
  stan.usuniete = odczytane.usuniete;
  stan.ulozono = odczytane.ulozono;
  return plik.kopia;
}

// Wynik czynności (wczytana kopia, dopisane z wyciągu) - zapis zaraz po niej dopisuje „zapisano ✓” obok, nie zamiast.
let ostatniKomunikat = { tekst: '', do: 0 };
function pokazKomunikat(tekst) {
  ostatniKomunikat = { tekst, do: Date.now() + 5000 };
  pokazStatus(tekst);
}

async function zapiszZmiany() {
  if (!czyZapisywac(stan)) return;
  stan.niezapisane = false; // zmiany zrobione w trakcie zapisu ustawią to od nowa
  try {
    await zapiszPlik(stan.plik, JSON.stringify(doZapisu(stan, { motyw: stan.motyw }), null, 2));
    const zapisano = t('zapisano ✓ {godzina}', { godzina: godzina(new Date()) });
    pokazStatus(Date.now() < ostatniKomunikat.do ? `${ostatniKomunikat.tekst} · ${zapisano}` : zapisano);
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
  klasaBledu: 'status--blad',
  obrazKodu: obrazKoduQr,
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
  $('plik-bank').disabled = stan.zablokowany || stan.synchronizacja;
  $('plik-wczytaj').disabled = (stan.zablokowany && !stan.bladOdczytu) || stan.synchronizacja;
  $('bez-zapisu').hidden = !bezZapisu;
  document.querySelector('.kartka').inert = bezZapisu;
  document.body.classList.toggle('bez-zapisu', bezZapisu);
  if (!stan.zablokowany) $('dodaj').disabled = bezZapisu;
}

const zapiszMojeUstawienia = () => zapiszUstawienia(stan.plikUstawien, {
  lokalnie: stan.lokalnie, motyw: stan.motyw, prowizja: pobierzProwizje(), funkcje: pobierzFunkcje(), powiadomienia: stan.powiadomienia, wTle: stan.wTle,
  jezyk: stan.jezyk, wprowadzenie: stan.wprowadzenie, budzet: stan.budzet, waluty: pobierzWaluty(),
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
  // Nieudany zapis (pełny dysk, plik zajęty) rzuca błąd - „Usuń z Dysku” nie usunie wtedy jedynej kopii danych.
  if (stan.niezapisane) {
    stan.lokalnie = false;
    await zapiszMojeUstawienia();
  }
  odswiezMiejsceZapisu();
  if (stan.niezapisane) throw new Error(t('Nie udało się zapisać danych na komputerze.'));
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
    await usunDaneLokalne(stan.plik, stan.folderKopii, [stan.plikPowiadomien]);
  } catch (e) {
    pokazStatus(t('Nie udało się usunąć wszystkich plików z komputera.'), true);
    console.error(e);
    return;
  }
  stan.wpisy = [];
  stan.usuniete = [];
  stan.ulozono = '';
  renderujTabele();
  odswiezDodatki();
  pokazStatus(t('dane usunięte z komputera'));
}

$('lokalnie-wlacz').addEventListener('change', async (e) => {
  const pole = e.target;
  pole.disabled = true;
  try {
    if (pole.checked) {
      await wlaczZapisLokalny();
      // Udana kolejna próba - czerwony pasek z poprzedniej nieudanej znika.
      if (!$('blad').hidden && $('blad').textContent === t('Nie udało się zapisać danych na komputerze.')) pokazPlynnie($('blad'), false);
    } else if (!(await wylaczZapisLokalny())) pole.checked = true;
  } catch (blad) {
    pole.checked = false;
    pokazBlad(t('Nie udało się zapisać danych na komputerze.')); // not the raw system message (English, technical)
    console.error(blad);
  } finally {
    odswiezMiejsceZapisu();
  }
});
$('usun-lokalnie').addEventListener('click', usunZKomputera);

// --- E23, E24: kopia, eksport, import (zakładka „Kopia i import” w ustawieniach) ---

// Czynność z zakładki zamyka ustawienia - wynik (status u góry, okno wyciągu) widać bez przyciemnienia.
const zamknijUstawienia = () => $('okno-ustawienia')?.close();

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
  if (!sciezka.toLowerCase().endsWith('.' + rozszerzenie)) {
    sciezka += '.' + rozszerzenie;
    // Okno Windows pytało o nazwę bez rozszerzenia - o plik z rozszerzeniem trzeba zapytać tutaj.
    if (await istnieje(sciezka) && !confirm(t('Plik „{plik}” już istnieje. Zastąpić go?', { plik: sciezka.split(/[\\/]/).pop() }))) return;
  }
  try {
    await Neutralino.filesystem.writeFile(sciezka, tresc);
    // Gdzie trafił plik: folder, w którym leży (Dokumenty po polsku, korzeń dysku z „\”, np. pendrive „E:\”).
    const czesci = sciezka.split(/[\\/]/);
    const plik = czesci.pop();
    const wDokumentach = folder && czesci.join('/').toLowerCase() === folder.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    const ostatni = czesci.at(-1) ?? '';
    const nazwaFolderu = wDokumentach ? t('Dokumenty') : ostatni.endsWith(':') ? ostatni + '\\' : ostatni;
    pokazStatus(t('zapisano w folderze „{folder}”: {plik}', { folder: nazwaFolderu, plik }));
  } catch (e) {
    pokazStatus(t('Nie udało się zapisać pliku.'), true);
    console.error(e);
  }
}

$('plik-zapisz').addEventListener('click', () => {
  zamknijUstawienia();
  zapiszDoPliku(t('Zapisz kopię danych'), `mikroplatnosci-kopia-${znacznikCzasu()}.json`, 'json', t('Dane Mikropłatności'), trescDanych()).catch(console.error);
});
$('plik-csv').addEventListener('click', () => {
  zamknijUstawienia();
  zapiszDoPliku(t('Eksport do Excela (CSV)'), `mikroplatnosci-${znacznikCzasu().slice(0, 8)}.csv`, 'csv', t('Arkusz CSV'), doCsv(stan.wpisy)).catch(console.error);
});

// Wybór pliku przez przeglądarkę (pole <input type="file">) - plik czyta tylko ta strona, bez uprawnień do dysku.
let rodzajPliku = '';
function wybierzPlik(rodzaj, typy) {
  rodzajPliku = rodzaj;
  $('plik-wybor').accept = typy;
  zamknijUstawienia();
  $('plik-wybor').click();
}
$('plik-wczytaj').addEventListener('click', () => wybierzPlik('kopia', '.json,application/json'));
$('plik-bank').addEventListener('click', () => wybierzPlik('bank', '.csv,.txt,text/csv'));
$('plik-wybor').addEventListener('change', (e) => {
  const plik = e.target.files?.[0];
  e.target.value = ''; // ten sam plik drugi raz też wywoła „change”
  if (!plik || (stan.zablokowany && !(stan.bladOdczytu && rodzajPliku === 'kopia'))) return;
  if (stan.synchronizacja) {
    pokazStatus(t('Trwa synchronizacja z Dyskiem - wybierz plik jeszcze raz za chwilę.'), true);
    return;
  }
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
    const tresc = await plik.text();
    // Kopia z nowszej wersji aplikacji straciłaby tu nieznane pola - a potem wygrała na Dysku jako „najnowsza”.
    if (Number(JSON.parse(tresc)?.wersja) > WERSJA_DANYCH) {
      alert(t('Kopię „{plik}” zapisała nowsza wersja aplikacji - najpierw zaktualizuj aplikację na tym komputerze.', { plik: plik.name }));
      return;
    }
    dane = odczytajTresc(tresc, MAKS_WPISOW_Z_DYSKU);
  } catch (e) {
    alert(t('„{plik}” to nie jest kopia danych Mikropłatności (albo plik jest uszkodzony).', { plik: plik.name }));
    console.error(e);
    return;
  }
  const obecne = ilePozycji(widoczne().length); // jak „pozycji: N” u góry - bez anulowanych
  const nowe = ilePozycji(dane.wpisy.filter((w) => !anulowana(w)).length); // counted the same way
  if (stan.bladOdczytu) {
    await przywrocPoBledzie(plik.name, dane, nowe);
    return;
  }
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
  zastapZKopii(stan, dane);
  stan.filtr = pustyFiltr();
  przeniesCeny();
  renderujTabele();
  odswiezDodatki();
  zaplanujZapis();
  pokazKomunikat(t('wczytano kopię: {ile}', { ile: nowe }));
}

// Nieczytelny plik danych (zapis zablokowany od startu): kopia go zastępuje. Uszkodzony plik najpierw trafia
// do folderu kopii (uszkodzony-….json) - nie da się go przenieść, nic się nie zmienia. Potem zapis jak zwykle.
async function przywrocPoBledzie(nazwaPliku, dane, nowe) {
  if (!confirm(t('Plik danych jest uszkodzony. Przywrócić dane z pliku „{plik}” ({nowe})? Uszkodzony plik nie zostanie usunięty - trafi do folderu „kopie”.', { plik: nazwaPliku, nowe }))) return;
  try {
    await odlozUszkodzony(stan.plik, stan.folderKopii);
  } catch (e) {
    pokazStatus(t('Nie udało się przenieść uszkodzonego pliku - nic nie zmieniono.'), true);
    console.error(e);
    return;
  }
  stan.bladOdczytu = false;
  stan.zablokowany = false;
  stan.wczytano = true;
  pamiecPowiadomien = await wczytajPamiec(stan.plikPowiadomien);
  pokazPlynnie($('blad'), false);
  zastapZKopii(stan, dane);
  stan.filtr = pustyFiltr();
  przeniesCeny();
  renderujTabele();
  odswiezDodatki();
  odswiezMiejsceZapisu();
  dysk.odswiez();
  zaplanujZapis();
  pokazKomunikat(t('przywrócono kopię: {ile}', { ile: nowe }));
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
  pokazWyciag(znajdzPowtarzajace(operacje, widoczne(), stan.wpisy.filter(anulowana)), info, dopiszZWyciagu);
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
  pokazKomunikat(tn(lista.length, 'dopisano {n} pozycję z wyciągu', 'dopisano {n} pozycje z wyciągu', 'dopisano {n} pozycji z wyciągu'));
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
  pokazPlynnie(el, true); // wysuwa się, a nie wskakuje
}

// Wiersze w tabeli - bez anulowanych (C15), które są w „Anulowanych” pod tabelą.
const widoczne = () => stan.wpisy.filter((w) => !anulowana(w));

const akcjeWiersza = {
  onZmiana() {
    zaplanujZapis();
    zaplanujDodatki();
  },
  onUsun(wpis) {
    if (nicDoStracenia(wpis)) {
      usunWpis(wpis, true);
      return;
    }
    // C15: z „Anulowanymi” wykreślenie da się cofnąć; bez nich - usuwa na zawsze.
    const archiwum = funkcja('archiwum');
    stan.doUsuniecia = { wpis, naZawsze: !archiwum };
    $('okno-usun-tekst').textContent = archiwum
      ? t('Wykreślić „{nazwa}”? Trafi do „Anulowanych” pod tabelą - stamtąd można ją przywrócić.', { nazwa: nazwaWpisu(wpis) })
      : t('Na pewno wykreślić „{nazwa}”? Tego nie da się cofnąć.', { nazwa: nazwaWpisu(wpis) });
    $('okno-potwierdz').textContent = t('Wykreśl');
    $('okno-usun').showModal();
  },
  onOtworz(adres) {
    Neutralino.os.open(adres).catch(console.error);
  },
  // Strzałki: wiersz o jedno miejsce wyżej / niżej, fokus zostaje w tym samym polu.
  // Anulowane i schowane filtrem (D17) zostają na swoich miejscach - wiersz przeskakuje nad sąsiedni widoczny.
  onPrzesun(wpis, kierunek, fokus) {
    // Sąsiedzi z wierszy faktycznie widocznych - nowy wiersz zostaje widoczny, choć nie pasuje do filtra.
    const lista = widoczne().filter((w) => wierszWpisu(w) && !wierszWpisu(w).hidden);
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
  oznaczUlozenie(stan); // wspólna kolejność z telefonem - nowsze ułożenie wygrywa przy scalaniu
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
    if (doPola) return;
    e.preventDefault();
    // Poza tabelą nic nie da się upuścić - przeciągany wiersz wraca na swoje miejsce (tabela.js, dragend).
    if (typ === 'dragover' && e.dataTransfer && !e.target.closest?.('#wiersze')) e.dataTransfer.dropEffect = 'none';
  });
}

// Kursy NBP od nowa - przy starcie i przyciskiem „odśwież” (bez restartu aplikacji).
async function odswiezWszystko() {
  const przycisk = $('odswiez');
  if (przycisk.disabled) return;
  przycisk.disabled = true;
  // Ikonka kręci się co najmniej jeden obrót - szybka odpowiedź NBP nie wygląda jak mrugnięcie.
  przycisk.classList.add('odswiez--pobiera');
  przycisk.setAttribute('aria-busy', 'true');
  const obrot = new Promise((r) => setTimeout(r, 700));
  try {
    await odswiezKursy(true);
  } finally {
    await obrot;
    przycisk.classList.remove('odswiez--pobiera');
    przycisk.removeAttribute('aria-busy');
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
    if (wynik === 'cena') w.zmieniono = czasZmiany(w);
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
    zamienPlynnie(tbody, zastosujFiltr); // wiersze nie znikają skokiem: tabela gaśnie i pojawia się już przefiltrowana
  });
}

// C15: przywrócenie z „Anulowanych” - wiersz wraca na swoje miejsce w tabeli.
function przywrocWpis(wpis) {
  wpis.anulowano = '';
  wpis.zmieniono = czasZmiany(wpis);
  renderujTabele();
  akcjeWiersza.onZmiana();
  // Fokus i widok na przywróconym wierszu; schowany przez filtr - fokus zostaje przy „Anulowanych” (nie ginie).
  const wiersz = wierszWpisu(wpis);
  if (wiersz && !wiersz.hidden) wiersz.querySelector('input')?.focus();
  else {
    clearTimeout(timerDodatkow); // drawn now - a later redraw would drop the focus
    odswiezDodatki();
    (($('anulowane').hidden ? null : $('anulowane').querySelector('summary')) ?? $('dodaj')).focus();
  }
}

// „usuń na zawsze” w „Anulowanych” - to samo okno z pieczątką, co przy wykreślaniu.
function pytajOUsuniecie(wpis) {
  stan.doUsuniecia = { wpis, naZawsze: true };
  $('okno-usun-tekst').textContent = t('Usunąć „{nazwa}” na zawsze? Tego nie da się cofnąć.', { nazwa: nazwaWpisu(wpis) });
  $('okno-potwierdz').textContent = t('Usuń'); // pieczątka mówi to samo, co pytanie
  $('okno-usun').showModal();
}

// F25: pierwsze uruchomienie - dymki „pierwsze kroki” (pierwszeKroki.js) i przykładowy wiersz do wykreślenia.
const dodajPrzykladowy = () => dodajPrzyklad(stan.wpisy, t('wykreśl mnie „×”, gdy dopiszesz własne'));
// Pierwszy widoczny wiersz - dymki pokazują na nim okres, lont i „⋯”.
const pierwszyWiersz = () => [...tbody.rows].find((tr) => !tr.hidden) ?? null;

function pokazWprowadzenie() {
  if (!stan.wprowadzenie) return;
  pokazPierwszeKroki([
    { cel: () => $('dodaj'), tytul: t('Dopisz pozycję'), tresc: t('Nazwa, koszt i data zakupu - tu dopisujesz każdą subskrypcję i rachunek.') },
    { cel: () => pierwszyWiersz()?.cells[4] ?? null, tytul: t('Ustaw okres'), tresc: t('Przy dacie zakupu wybierz „mies.”, „rok” albo „inny” - od tego liczy się termin płatności.') },
    { cel: () => pierwszyWiersz()?.cells[5] ?? null, tytul: t('Lont do płatności'), tresc: t('Liczba dni do terminu i pasek, który się skraca - od zielonego do czerwonego, im bliżej płatności.') },
    { cel: () => pierwszyWiersz()?.cells[7] ?? null, tytul: t('Więcej przy pozycji'), tresc: t('„⋯” - czy płatność pobiera się sama, czy płacisz sam, czy ją przedłużać, podział kosztu i pauza.') },
    { cel: () => $('podsumowanie').querySelector('.paragon__pozycja--suma') ?? $('podsumowanie'), tytul: t('Paragon'), tresc: t('Ile płacisz miesięcznie i rocznie - wszystko w złotych. Znaki „?” wyjaśniają kolory, a zębatka u góry otwiera ustawienia.') },
  ], () => {
    stan.wprowadzenie = false;
    zapiszMojeUstawienia();
    $('dodaj').focus({ preventScroll: true });
  });
}

// Powiadomienia Windows o pozycjach do wycofania - tylko gdy aplikacja jest otwarta (przy starcie,
// po zmianie i co 30 minut). Każde raz; zaległe progi zastępuje ostatni.
let pamiecPowiadomien = null;

async function sprawdzPowiadomienia() {
  if (!pamiecPowiadomien || stan.zablokowany) return;
  // Zadanie w tle (B10) mogło w międzyczasie pokazać powiadomienia (np. po wybudzeniu komputera) -
  // pamięć doczytana z pliku, żeby okno nie pokazało ich drugi raz.
  const zPliku = await wczytajPamiec(stan.plikPowiadomien);
  for (const k of zPliku.pokazane) pamiecPowiadomien.pokazane.add(k);
  for (const k of zPliku.zaplanowane) pamiecPowiadomien.zaplanowane.add(k);
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
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) tr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' }); // nowy wiersz pojawia się, a nie wskakuje
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
  const tekst = String(e.target.value).trim().replace(',', '.');
  const wartosc = Number(tekst);
  // Puste = 0 (sam kurs NBP); ponad 10% - 10%; nie liczba - zostaje poprzednia (pole liczbowe oddaje
  // wtedy pusty tekst, ale z badInput).
  if (e.target.validity?.badInput) { /* keep the previous value */ } else if (tekst === '') ustawProwizje(0);
  else if (Number.isFinite(wartosc)) ustawProwizje(poprawnaProwizja(Math.min(Math.max(wartosc, 0), 10)));
  e.target.value = String(pobierzProwizje());
  pokazProwizje();
  zapiszMojeUstawienia();
  odswiezWiersze(tbody);
  odswiezDodatki();
});

// Same złote w ustawieniach - kursy, prowizja i „odśwież” znikają z nagłówka (bez pobierania kursów NBP),
// chyba że któraś pozycja już ma walutę obcą (jej „≈ zł” dalej potrzebuje kursu).
const uzywaWalut = () => funkcja('waluty') || uzyteWaluty(stan.wpisy).size > 0;
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

// Waluty do wyboru (zakładka „Zeszyt”): pole waluty, kursy w nagłówku i na paragonie.
function zastosujWaluty(lista) {
  ustawWaluty(lista);
  zapiszMojeUstawienia();
  renderujTabele();
  odswiezDodatki();
  renderujKursy();
  odswiezKursy(); // kursy, jeśli dziś jeszcze nie pobrane
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
  document.querySelector('#okno-ustawienia select')?.focus();
}

const otworzUstawienia = () => pokazUstawienia(
  { funkcje: pobierzFunkcje(), powiadomienia: stan.powiadomienia, wTle: stan.wTle, jezyk: jezyk(), budzet: stan.budzet, waluty: pobierzWaluty(), uzyteWaluty: uzyteWaluty(stan.wpisy) },
  {
    naFunkcje: zastosujFunkcje,
    naWaluty: zastosujWaluty,
    naJezyk: zmienJezyk,
    naBudzet(kwota) {
      stan.budzet = poprawnyBudzet(kwota);
      zapiszMojeUstawienia();
      odswiezDodatki();
    },
    // F25: dymki „pierwsze kroki” jeszcze raz (przykładowy wiersz tylko w pustym zeszycie).
    naWprowadzenie() {
      stan.wprowadzenie = true;
      zapiszMojeUstawienia();
      if (!widoczne().length && !stan.zablokowany && !$('dodaj').disabled) {
        dodajPrzykladowy();
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
      if (wlacz && !stan.lokalnie) return t('Działa tylko z włączonym „Zapisuj lokalnie” (zakładka „Synchronizacja”) - bez pliku na komputerze nie ma czego sprawdzić.');
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
    // Zakładki z częściami z index.html (#ustawienia-czesci) - po zamknięciu wracają tam razem ze zdarzeniami.
    czesci: [
      { klucz: 'synchronizacja', nazwa: t('Synchronizacja'), element: $('czesc-synchronizacja') },
      { klucz: 'plik', nazwa: t('Kopia i import'), element: $('czesc-plik') },
    ],
    dolCzesc: $('czesc-o-aplikacji'),
    schowek: $('ustawienia-czesci'),
    naZamkniecie: () => dysk.schowajKod(), // kod QR z tajnym kluczem nie czeka na następne otwarcie
  },
);
$('ustawienia').addEventListener('click', otworzUstawienia);
// Wiersz ustawień przełącza się tylko samym przełącznikiem „tak / nie” - kliknięcie w nazwę albo opis
// nic nie zmienia (np. przypadkowe wyłączenie synchronizacji). Telefon zostawia cały wiersz (palec).
document.addEventListener('click', (e) => {
  if (e.target.closest?.('label.ustawienia__wiersz') && !e.target.closest('input, select, button, textarea')) e.preventDefault();
}, true);

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
  // „usuń na zawsze” w „Anulowanych”: fokus zostaje w tej sekcji (na tym samym miejscu listy), a nie na „+ dopisz”.
  const przyciskiUsun = () => [...$('anulowane').querySelectorAll('.anulowane__przycisk--usun')];
  const miejsceWAnulowanych = naZawsze && anulowana(wpis) ? przyciskiUsun().indexOf(document.activeElement) : -1;
  if (naZawsze) usun(stan, wpis);
  else {
    wpis.anulowano = isoDnia(dzis());
    wpis.zmieniono = czasZmiany(wpis);
  }
  if (miejsceWAnulowanych >= 0) {
    zaplanujZapis();
    clearTimeout(timerDodatkow); // the list is drawn now - a later redraw would drop the focus
    odswiezDodatki();
    const przyciski = przyciskiUsun();
    (przyciski[Math.min(miejsceWAnulowanych, przyciski.length - 1)] ?? $('dodaj')).focus();
    return;
  }
  const tr = wierszWpisu(wpis);
  // Fokus był na wykreślanym wierszu (albo wrócił z okna na jego „×”) - przechodzi na „×” sąsiada, nie na początek strony.
  const fokusTu = !tr || tr.contains(document.activeElement) || document.activeElement === document.body;
  const sasiad = [tr?.nextElementSibling, tr?.previousElementSibling].find((w) => w && !w.hidden);
  if (fokusTu) {
    (sasiad?.querySelector('.wykresl') ?? $('dodaj')).focus();
    // Fokus na „×” sąsiada pokazuje podgląd przekreślenia (tabela.js) - tu go nikt nie wskazał, więc bez podglądu.
    sasiad?.classList.remove('wykreslany');
  }
  // Nie skokiem: wiersz gaśnie, a wiersze pod nim podjeżdżają na jego miejsce. Przy „ogranicz ruch” - od razu.
  const zabierz = () => {
    const ponizej = tr?.isConnected ? [...tbody.rows].filter((w) => !w.hidden && tr.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) : [];
    const przed = ponizej.map((w) => w.getBoundingClientRect().top);
    tr?.remove();
    $('pusto').hidden = widoczne().length > 0;
    numeruj(tbody);
    ponizej.forEach((w, i) => {
      const o = przed[i] - w.getBoundingClientRect().top;
      if (o) w.animate([{ translate: `0 ${o}px` }, { translate: '0 0' }], { duration: 180, easing: 'cubic-bezier(0.2, 0, 0.2, 1)' });
    });
  };
  if (tr && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    tr.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-in', fill: 'forwards' }).finished.then(zabierz, zabierz);
  } else zabierz();
  akcjeWiersza.onZmiana();
}
$('okno-usun').addEventListener('close', () => { stan.doUsuniecia = null; });
// „×” w rogu okien z index.html (pytanie o wykreślenie, Google) - zamyka jak Esc albo kliknięcie w tło.
for (const x of document.querySelectorAll('dialog > .okno__x')) {
  x.addEventListener('click', () => x.closest('dialog').close());
  trescObokKrzyzyka(x.closest('dialog'), x);
}

// Nagłówek tabeli zostaje na górze przy przewijaniu kartki w pionie. Samo position: sticky tu nie
// działa, bo tabela ma własny poziomy pasek przewijania (.zeszyt-ramka). Przesuwa go animacja związana
// z przewijaniem kartki (wyglad.css) - liczona razem z przewinięciem, więc nagłówek nie zostaje w tyle
// i nic nie prześwituje (skrypt przy zdarzeniu „scroll” spóźniał się o klatkę). Tu tylko zakres:
// od miejsca tabeli w kartce do jej końca.
const kartka = document.querySelector('.kartka');
const ramkaTabeli = document.querySelector('.zeszyt-ramka');
const naglowekTabeli = document.querySelector('.zeszyt thead');
const przewijanieWCss = CSS.supports('animation-timeline: scroll()');
function przyklejNaglowekTabeli() {
  const od = ramkaTabeli.getBoundingClientRect().top - kartka.getBoundingClientRect().top + kartka.scrollTop;
  const maks = Math.max(ramkaTabeli.clientHeight - naglowekTabeli.offsetHeight, 0); // nie niżej niż koniec tabeli
  if (przewijanieWCss) {
    naglowekTabeli.style.setProperty('--przyklej-od', `${od}px`);
    naglowekTabeli.style.setProperty('--przyklej-do', `${od + Math.max(maks, 1)}px`);
    naglowekTabeli.style.setProperty('--przyklej-maks', `${maks}px`);
    // Edge/Chromium zostawia czasem zakres z pierwszego ustawienia (nagłówek przyklejał się o „od” za wysoko
    // i nad nim prześwitywały wiersze) - animacja od nowa bierze aktualne liczby.
    naglowekTabeli.style.animationName = 'none';
    void naglowekTabeli.offsetWidth;
    naglowekTabeli.style.animationName = '';
    return;
  }
  const y = Math.min(Math.max(kartka.scrollTop - od, 0), maks);
  naglowekTabeli.style.transform = y ? `translateY(${y}px)` : '';
}
if (przewijanieWCss) {
  const obserwator = new ResizeObserver(przyklejNaglowekTabeli);
  for (const el of [kartka, ramkaTabeli, $('filtr')]) obserwator.observe(el);
} else kartka.addEventListener('scroll', przyklejNaglowekTabeli, { passive: true });

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
    const dopisek = document.createElement('span');
    dopisek.className = 'kursy__opis-dopisek';
    dopisek.textContent = t('ani kupna, ani sprzedaży');
    opis.append(t('kurs średni w zł:'), dopisek);
    czesci.push(opis);
    // Włączone waluty i te z pozycji (bez kursu w tabeli NBP - pominięte).
    const wlaczone = pobierzWaluty();
    const uzyte = uzyteWaluty(stan.wpisy);
    for (const kod of WALUTY.filter((k) => k !== 'PLN' && kursy[k] && (wlaczone.includes(k) || uzyte.has(k)))) {
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
  const uwagi = {
    // Są już kursy - zostają bez dopisku do końca pobierania (widać je po kręcącym się „odśwież”);
    // dopisek „pobieram kursy…” przesuwał cały nagłówek.
    pobieram: kursy ? '' : t('pobieram kursy…'),
    offline: kursy ? t('bez internetu - kurs zapamiętany') : t('brak kursów - bez internetu'),
    nbp: kursy ? t('błąd serwera NBP - kurs zapamiętany') : t('brak kursów - błąd serwera NBP'),
    zapis: t('kurs pobrany, ale nie zapisał się na dysku'),
  };
  if (uwagi[stan.kursyStatus]) {
    const uwaga = document.createElement('span');
    uwaga.className = 'kursy__uwaga' + (stan.kursyStatus !== 'pobieram' ? ' kursy__uwaga--offline' : '');
    uwaga.textContent = uwagi[stan.kursyStatus];
    czesci.push(uwaga);
  }
  el.replaceChildren(...czesci);
}

// Nagłówek bez wielokropków: pierwszy z układów (wyglad.css, .naglowek--1…5), w którym nic nie wystaje
// poza swoje miejsce. Liczone od nowa przy zmianie szerokości okna i treści (kursy, stan zapisu i Dysku).
const naglowek = document.querySelector('.naglowek');
const UKLADY_NAGLOWKA = ['naglowek--1', 'naglowek--2', 'naglowek--3', 'naglowek--4', 'naglowek--5'];
function ulozNaglowek() {
  // Każdy element w granicach swojej grupy - z obu stron (kursy dosunięte do prawej wystawały w lewo,
  // a tego scrollWidth nie widzi).
  const miesci = () => naglowek.scrollWidth <= naglowek.clientWidth + 1 && [...naglowek.children].every((g) => {
    const r = g.getBoundingClientRect();
    return [...g.querySelectorAll('*')].every((e) => {
      if (e.closest('[popover]') || !e.getClientRects().length) return true;
      const b = e.getBoundingClientRect();
      return b.left >= r.left - 1 && b.right <= r.right + 1;
    });
  });
  for (const uklad of UKLADY_NAGLOWKA) {
    naglowek.classList.remove(...UKLADY_NAGLOWKA);
    naglowek.classList.add(uklad);
    if (miesci()) return;
  }
}
let szerokoscNaglowka = 0;
new ResizeObserver(() => {
  if (naglowek.clientWidth === szerokoscNaglowka) return; // sama zmiana wysokości (inny układ) - bez pętli
  szerokoscNaglowka = naglowek.clientWidth;
  ulozNaglowek();
}).observe(naglowek);
new MutationObserver(ulozNaglowek).observe(naglowek, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });

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
    // Bez sieci - „offline”; zła odpowiedź NBP albo nieudany zapis kursy.json - osobny napis.
    stan.kursyStatus = e?.rodzaj === 'nbp' || e?.rodzaj === 'zapis' ? e.rodzaj : 'offline';
    if (e?.rodzaj === 'zapis' && e.zmiana) {
      odswiezWiersze(tbody);
      odswiezDodatki();
    }
    console.error(e);
  }
  renderujKursy();
}

// Kolory, alarmy i kursy liczone od dzisiejszej daty - odświeżane, gdy okno długo wisi otwarte. Po nieudanym
// pobraniu kursów (bez internetu) kolejna próba przy następnym odświeżeniu, a nie dopiero jutro.
let dzienOdswiezenia = isoDnia(dzis());
function odswiezDzien() {
  dzienOdswiezenia = isoDnia(dzis());
  if (przeniesCeny()) zaplanujZapis();
  odswiezWiersze(tbody);
  odswiezDodatki();
  odswiezKursy(stan.kursyStatus === 'offline');
}
setInterval(odswiezDzien, 30 * 60 * 1000);
// Po północy albo po wybudzeniu komputera - od razu przy powrocie do okna, nie po 30 min.
const nowyDzien = () => {
  if (!document.hidden && isoDnia(dzis()) !== dzienOdswiezenia) odswiezDzien();
};
document.addEventListener('visibilitychange', nowyDzien);
window.addEventListener('focus', nowyDzien);

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
    $('dodaj').disabled = true; // nothing would save a new row
    pokazBlad(t('Nie udało się przygotować folderu na dane. Zmiany nie będą zapisywane.'));
    console.error(e);
  }

  if (stan.plikKursow) await wczytajZapamietane(stan.plikKursow);
  const ustawienia = stan.plikUstawien ? await wczytajUstawienia(stan.plikUstawien) : { lokalnie: true, motyw: '' };
  stan.lokalnie = ustawienia.lokalnie;
  ustawFunkcje(ustawienia.funkcje);
  // Plik sprzed listy walut: na razie bez walut z pozycji (dane jeszcze niewczytane) - dopisywane niżej.
  ustawWaluty(ustawienia.waluty ?? walutyNaStart(ustawienia.dawneWalutyObce, []));
  stan.wTle = ustawienia.wTle === true;
  stan.jezyk = ustawienia.jezyk || '';
  stan.wprowadzenie = ustawienia.wprowadzenie === true;
  stan.budzet = poprawnyBudzet(ustawienia.budzet);
  zastosujJezyk();

  let kopia = null;
  if (!stan.zablokowany && stan.lokalnie) {
    try {
      kopia = await wczytaj();
      stan.wczytano = true;
    } catch (e) {
      // Nie nadpisujemy pliku, którego nie umiemy odczytać.
      stan.zablokowany = true;
      stan.bladOdczytu = true;
      $('dodaj').disabled = true; // a new row would be lost - enabled again after restoring a copy (odswiezMiejsceZapisu)
      pokazBlad(t('Nie udało się odczytać pliku danych ({plik}). Zmiany NIE będą zapisywane, żeby go nie nadpisać. Dane przywrócisz w Ustawieniach: Kopia i import → Wczytaj kopię… (kopie są w folderze {folder}).', { plik: stan.plik, folder: stan.folderKopii.replaceAll('/', '\\') }));
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
    // Połączony Dysk też znaczy „już używa” - np. uszkodzony ustawienia.json u osoby z danymi tylko na Dysku
    // (przykładowy wiersz trafiłby wtedy przez scalanie na jej Dysk).
    // Nieczytelny ustawienia.json (uszkodzony albo zajęty) - nie nadpisujemy go domyślnymi przy starcie.
    const uzywana = ustawienia.uszkodzone || kopia !== null || !stan.lokalnie || czyPolaczony();
    stan.powiadomienia = { ...DOMYSLNE_RODZAJE, wycofaj: uzywana, zaplac: uzywana };
    // F25: nowa osoba - notatki „pierwsze kroki” i przykładowy wiersz (zapisany jak każdy inny).
    if (!uzywana && stan.wczytano && !stan.wpisy.length) {
      stan.wprowadzenie = true;
      dodajPrzykladowy();
      stan.niezapisane = true;
    }
    if (!ustawienia.uszkodzone) zapiszMojeUstawienia();
  }
  // Pierwsze uruchomienie z listą walut: dochodzą waluty, których używają pozycje (walutyNaStart).
  if (ustawienia.waluty === null && !stan.zablokowany) {
    ustawWaluty(walutyNaStart(ustawienia.dawneWalutyObce, stan.wpisy));
    if (!ustawienia.uszkodzone) zapiszMojeUstawienia();
  }
  const zmienioneCeny = przeniesCeny(); // przed pokazaniem - tabela od razu z aktualną ceną
  renderujTabele();
  odswiezDodatki();
  pokazWprowadzenie(); // dymki pokazują na wiersze i paragon - po ich narysowaniu
  // Kopia zapasowa po pokazaniu danych, ale zawsze przed pierwszym zapisem (zapisy czekają w kolejce za nią).
  if (stan.wczytano && kopia) stan.zapis = kopia().catch(console.error);
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
    ustawWaluty(u.waluty ?? walutyNaStart(u.dawneWalutyObce, []));
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
  // Zapis się nie udał (plik zajęty, pełny dysk) - zamknięcie nie gubi zmian po cichu.
  if (stan.niezapisane && czyZapisywac(stan) && !confirm(t('Nie udało się zapisać ostatnich zmian. Zamknąć mimo to? Te zmiany przepadną.'))) return;
  // Bez zapisu lokalnego niewysłane zmiany idą na Dysk przed zamknięciem (najwyżej 15 s) - także gdy
  // akurat trwa inna wymiana z Dyskiem (wtedy wysyłka zaraz po niej, a nie dopiero za 3 s).
  if (stan.doWyslania) await Promise.race([poWymianie(stan).then(wyslijZaleglosci), new Promise((r) => setTimeout(r, LIMIT_WYSYLKI_PRZY_ZAMKNIECIU))]);
  // Wysyłka się nie udała (np. brak internetu), a zmian nie ma na komputerze - bez pytania przepadłyby po cichu.
  if (stan.doWyslania && !stan.lokalnie && !confirm(t('Nie udało się wysłać zmian na Google Dysk (brak internetu?). Zamknąć mimo to? Te zmiany przepadną.'))) return;
  await zwolnijBlokade(); // druga kopia (bez zajętej blokady) niczego nie usuwa
  Neutralino.app.exit();
});
Neutralino.init();
