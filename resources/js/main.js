// Start aplikacji, odczyt i zapis danych (plik JSON w %APPDATA%\Mikroplatnosci).

import { zbierzAlarmy, formatujDate, parsujDate, roznicaDni, dzis, okresZDat } from './alarmy.js';
import { renderujPodsumowanie } from './podsumowanie.js';
import { utworzWiersz, odswiezWiersze, bezpiecznyLink, numeruj } from './tabela.js';
import { odczytajCene, stanCen } from './ceny.js';
import { renderujMiarke, ulozTory } from './miarka.js';
import { WALUTY, waluta, naPln, formatujKwote, wczytajZapamietane, odswiezZNbp, czyAktualne, pobierzKursy } from './waluty.js';

const NAZWA_PLIKU = 'mikroplatnosci.json';
const ILE_KOPII = 5;
const OPOZNIENIE_ZAPISU = 400;
const BLOKADA_CO = 5000;
const BLOKADA_WAZNA = 20000;

const stan = {
  wpisy: [],
  plik: '',
  plikBlokady: '',
  plikKursow: '',
  kursyStatus: '', // pobieram / ok / offline
  motyw: 'ciemny', // ciemny / jasny
  folderKopii: '',
  zablokowany: false,
  timer: null,
  doUsuniecia: null,
  sort: { klucz: 'termin', kierunek: 1 },
};

const $ = (id) => document.getElementById(id);
const tbody = $('wiersze');

// --- dane -------------------------------------------------------------

function noweId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function nowyWpis() {
  return {
    id: noweId(), od: '', do: '', okres: 'M', nazwa: '', opis: '', koszt: null, waluta: 'PLN', link: '', przedluzac: '',
    prognoza: null, prognozaZeStrony: false, prognozaZrodlo: '', prognozaData: '',
  };
}

// Dane z pliku traktowane jak dane z zewnątrz - każde pole sprawdzane.
function normalizuj(w) {
  const tekst = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const data = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  return {
    id: typeof w.id === 'string' && w.id ? w.id.slice(0, 64) : noweId(),
    od: data(w.od),
    do: data(w.do),
    // Stare wpisy: okres z różnicy dat „od” i „do”, a gdy jest tylko jedna z nich - miesięczny.
    okres: w.okres === 'M' || w.okres === 'R' ? w.okres : okresZDat(data(w.od), data(w.do)) || 'M',
    nazwa: tekst(w.nazwa, 200),
    opis: tekst(w.opis, 300),
    koszt: typeof w.koszt === 'number' && Number.isFinite(w.koszt) && w.koszt >= 0 ? w.koszt : null,
    waluta: WALUTY.includes(w.waluta) ? w.waluta : 'PLN',
    link: tekst(w.link, 2000),
    przedluzac: w.przedluzac === 'tak' || w.przedluzac === 'nie' ? w.przedluzac : '',
    prognoza: typeof w.prognoza === 'number' && Number.isFinite(w.prognoza) && w.prognoza >= 0 ? w.prognoza : null,
    prognozaZeStrony: w.prognozaZeStrony === true,
    prognozaZrodlo: w.prognozaZrodlo === 'strona' || w.prognozaZrodlo === 'reczna' ? w.prognozaZrodlo : '',
    prognozaData: data(w.prognozaData),
  };
}

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
  stan.folderKopii = folder + '/kopie';
  if (!(await istnieje(folder))) await Neutralino.filesystem.createDirectory(folder);
  if (!(await istnieje(stan.folderKopii))) await Neutralino.filesystem.createDirectory(stan.folderKopii);
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
  if (!dane || !Array.isArray(dane.wpisy)) throw new Error('nieprawidłowy format pliku');
  // Zapamiętana kolejność: kolumna sortowania albo „reczna” (wiersze przesuwane przez użytkownika).
  const s = dane.sort;
  if (s && typeof s.klucz === 'string' && /^[a-z]{1,20}$/.test(s.klucz) && (s.kierunek === 1 || s.kierunek === -1)) {
    stan.sort = { klucz: s.klucz, kierunek: s.kierunek };
  }
  if (dane.motyw === 'ciemny' || dane.motyw === 'jasny') stan.motyw = dane.motyw;
  return dane.wpisy.filter((w) => w && typeof w === 'object').map(normalizuj);
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
    const dane = { wersja: 1, zapisano: new Date().toISOString(), sort: stan.sort, motyw: stan.motyw, wpisy: stan.wpisy };
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
    const cena = await odczytajCene(adres, waluta(wpis), wpis.koszt);
    // W międzyczasie mogła zniknąć zgoda albo cały wpis.
    if (!wpis.prognozaZeStrony || !stan.wpisy.includes(wpis)) return;
    Object.assign(wpis, { prognoza: cena, prognozaZrodlo: 'strona', prognozaData: dzisIso() });
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

// Przy każdym uruchomieniu - po kolei, żeby nie obciążać łącza.
async function sprawdzCeny() {
  for (const wpis of stan.wpisy.filter((w) => w.prognozaZeStrony)) await sprawdzCene(wpis);
}

function renderujTabele() {
  tbody.replaceChildren(...stan.wpisy.map((w) => utworzWiersz(w, akcjeWiersza)));
  $('pusto').hidden = stan.wpisy.length > 0;
  numeruj(tbody);
}

// Części opisu: zwykły tekst albo { w: tekst } - wyróżnione (data i liczba dni).
function opisAlarmu(a, jednorazowa) {
  if (!a.data) return ['brak daty zakupu - uzupełnij'];
  const data = { w: formatujDate(a.data) };
  const dni = roznicaDni(dzis(), a.data);
  if (a.poziom === 'minal') return ['termin minął ', data, ' - sprawdź, czy anulowano'];
  const za = dni === 0 ? ['dziś'] : dni === 1 ? ['jutro'] : ['za ', { w: String(dni) }, ' dni'];
  return [jednorazowa ? 'wycofaj przed ' : 'płatność ', data, ' (', ...za, ')'];
}

function wypelnijListe(lista, alarmy, pustyTekst, jednorazowe) {
  if (!alarmy.length) {
    const li = document.createElement('li');
    li.className = 'alarm alarm--pusty';
    li.textContent = pustyTekst;
    lista.replaceChildren(li);
    return;
  }
  // Linia spisu: nazwa ....... termin   kwota
  lista.replaceChildren(...alarmy.map((a) => {
    const li = document.createElement('li');
    li.className = 'alarm' + (a.poziom ? ' alarm--' + a.poziom : '');
    const nazwa = document.createElement('strong');
    nazwa.textContent = a.wpis.nazwa.trim() || '(bez nazwy)';
    const kropki = document.createElement('span');
    kropki.className = 'alarm__kropki';
    const opis = document.createElement('span');
    opis.className = 'alarm__opis';
    for (const czesc of opisAlarmu(a, jednorazowe)) {
      if (typeof czesc === 'string') {
        opis.append(czesc);
      } else {
        const wyroznienie = document.createElement('span');
        wyroznienie.className = 'alarm__wyroznienie';
        wyroznienie.textContent = czesc.w;
        opis.append(wyroznienie);
      }
    }
    const koszt = document.createElement('span');
    koszt.className = 'alarm__koszt';
    if (typeof a.wpis.koszt === 'number') {
      const kod = waluta(a.wpis);
      const pln = naPln(a.wpis);
      koszt.textContent = formatujKwote(a.wpis.koszt, kod) + (kod !== 'PLN' && pln !== null ? ' ≈ ' + formatujKwote(pln) : '');
    }
    li.append(nazwa, kropki, opis, koszt);
    return li;
  }));
}

function odswiezDodatki() {
  const { roczne, jednorazowe } = zbierzAlarmy(stan.wpisy);
  wypelnijListe($('alarmy-roczne'), roczne, 'Żadna roczna płatność w ciągu 3 miesięcy.', false);
  wypelnijListe($('alarmy-jednorazowe'), jednorazowe, 'Nic do wycofania.', true);
  renderujMiarke($('miarka'), [...roczne, ...jednorazowe]);
  renderujPodsumowanie($('podsumowanie'), stan.wpisy);
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
  tbody.querySelector(`tr[data-id="${CSS.escape(wpis.id)}"]`)?.remove();
  $('pusto').hidden = stan.wpisy.length > 0;
  numeruj(tbody);
  akcjeWiersza.onZmiana();
}
$('okno-usun').addEventListener('close', () => { stan.doUsuniecia = null; });

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

  ustawMotyw(stan.motyw);
  renderujTabele();
  odswiezDodatki();
  if (!stan.zablokowany) pokazStatus('pozycji: ' + stan.wpisy.length);
  renderujKursy();
  odswiezKursy(true);
  if (!stan.zablokowany) sprawdzCeny();
}

Neutralino.events.on('ready', start);
Neutralino.events.on('windowClose', async () => {
  await zapiszTeraz();
  if (!drugaKopia) await zwolnijBlokade();
  Neutralino.app.exit();
});
Neutralino.init();
