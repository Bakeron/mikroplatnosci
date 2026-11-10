// Klatki do obrazków poglądowych - własny Edge bez okna (CDP) + serwer testowy Neutralino na każdy scenariusz.
// Użycie (z folderu Podgląd): PODGLAD_DANE=<folder testowy> PODGLAD_KLATKI=<folder na klatki> node zrodla/zrzuty.mjs [scenariusz...]
// Bez scenariuszy - wszystkie. Prawdziwych danych z %APPDATA%\Mikroplatnosci nie rusza: skrypt startowy
// (strony-testowe.js) podmienia folder danych, a bezpiecznik sprawdza to przed otwarciem aplikacji i po nim.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TU = path.dirname(fileURLToPath(import.meta.url));
const PC = path.resolve(TU, '../../pc');
const BAZA = process.env.PODGLAD_DANE;
const KLATKI = process.env.PODGLAD_KLATKI;
const PORT_CDP = Number(process.env.PODGLAD_PORT_CDP || 9417);
const PORT_APP = 58321;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!BAZA || /roaming/i.test(BAZA) || !KLATKI) throw new Error('Ustaw PODGLAD_DANE (folder testowy poza %APPDATA%) i PODGLAD_KLATKI.');
fs.mkdirSync(KLATKI, { recursive: true });
const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

async function wolnyPort(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(800) });
    return false;
  } catch (e) {
    return e.cause?.code === 'ECONNREFUSED';
  }
}

// --- Edge i CDP ---
let edge;
async function uruchomEdge() {
  if (!(await wolnyPort(PORT_CDP))) throw new Error(`port ${PORT_CDP} zajęty - inny proces (np. adb forward), nie łączę się`);
  const profil = path.join(os.tmpdir(), 'podglad-edge-profil');
  edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT_CDP}`, `--user-data-dir=${profil}`, '--no-first-run',
    '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1', '--lang=pl', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    await czekaj(200);
    try {
      const v = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/version`)).json();
      if (!/Edg\//.test(v['User-Agent'] || '')) throw new Error('na porcie nie ma mojego Edge: ' + v['User-Agent']);
      return;
    } catch (e) {
      if (/mojego Edge/.test(e.message)) throw e;
    }
  }
  throw new Error('Edge nie wystartował');
}

async function nowaKarta() {
  const cel = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(cel.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const czekajace = new Map();
  const sluchacze = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && czekajace.has(d.id)) {
      const { r, j } = czekajace.get(d.id);
      czekajace.delete(d.id);
      if (d.error) j(new Error(d.error.message));
      else r(d.result);
    } else if (d.method) for (const s of sluchacze) s(d);
  };
  const wyslij = (method, params = {}) => new Promise((r, j) => {
    const n = ++id;
    czekajace.set(n, { r, j });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  sluchacze.push((d) => {
    if (d.method === 'Page.javascriptDialogOpening') wyslij('Page.handleJavaScriptDialog', { accept: false });
    if (d.method === 'Runtime.exceptionThrown') console.log('  [błąd strony]', d.params.exceptionDetails?.exception?.description?.split('\n')[0]);
  });
  return { wyslij, sluchacze, cel, zamknij: () => ws.close() };
}

// --- serwer testowy ---
let serwer;
async function uruchomSerwer() {
  if (!(await wolnyPort(PORT_APP))) throw new Error(`port ${PORT_APP} zajęty`);
  serwer = spawn(path.join(PC, 'bin/neutralino-win_x64.exe'), ['--load-dir-res', '--path=.', '--mode=cloud', `--port=${PORT_APP}`], { cwd: PC, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    await czekaj(200);
    if (!(await wolnyPort(PORT_APP))) return;
  }
  throw new Error('serwer Neutralino nie wystartował');
}
function zatrzymajSerwer() {
  if (serwer && serwer.exitCode === null) {
    try { execFileSync('taskkill', ['/PID', String(serwer.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* już zamknięty */ }
  }
  serwer = null;
}

function przygotuj(scenariusz) {
  execFileSync(process.execPath, [path.join(TU, 'przygotuj.mjs'), scenariusz], { env: { ...process.env, PODGLAD_DANE: BAZA }, stdio: 'inherit' });
}

// --- strona ---
const FOLDER = BAZA.replace(/\\/g, '/');
function skryptStartowy(tryb, dodatek = '') {
  return `window.__DANE = ${JSON.stringify(FOLDER)};` + (tryb ? `window.__TRYB = ${JSON.stringify(tryb)};` : '') + dodatek
    + fs.readFileSync(path.join(TU, 'strony-testowe.js'), 'utf8');
}

async function otworz(scenariusz, { tryb = '', dodatek = '', szer = 1500, wys = 860 } = {}) {
  przygotuj(scenariusz);
  await uruchomSerwer();
  const k = await nowaKarta();
  const { wyslij } = k;
  await wyslij('Page.enable');
  await wyslij('Runtime.enable');
  await wyslij('Emulation.setDeviceMetricsOverride', { width: szer, height: wys, deviceScaleFactor: 1, mobile: false });
  await wyslij('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await wyslij('Page.addScriptToEvaluateOnNewDocument', { source: skryptStartowy(tryb, dodatek) });
  const ev = async (expr, gest = false) => {
    const r = await wyslij('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: gest });
    if (r.exceptionDetails) throw new Error('evaluate: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const idz = async (adres) => {
    await wyslij('Page.navigate', { url: adres });
    await czekaj(1500);
  };
  // Bezpiecznik 1: strona bez aplikacji - skrypt startowy działa (folder testowy, podmiana Neutralino).
  await idz(`http://127.0.0.1:${PORT_APP}/brak-strony-test`);
  const proba = await ev(`({ dane: window.__DANE, podmiana: typeof Object.getOwnPropertyDescriptor(window, 'Neutralino')?.set })`);
  if (proba.dane !== FOLDER || proba.podmiana !== 'function') throw new Error('STOP: skrypt startowy nie działa ' + JSON.stringify(proba));
  await idz(`http://127.0.0.1:${PORT_APP}/`);
  // Bezpiecznik 2: aplikacja widzi folder testowy.
  const folder = await ev(`Neutralino.os.getPath('data')`);
  if (folder !== FOLDER) throw new Error('STOP: aplikacja widzi inny folder danych: ' + folder);
  await czekaj(1500);
  const strona = {
    ...k, ev,
    czekaj,
    async rozmiar(s, w) { await wyslij('Emulation.setDeviceMetricsOverride', { width: s, height: w, deviceScaleFactor: 1, mobile: false }); await czekaj(300); },
    // Prostokąt obejmujący elementy (selektory) z marginesem.
    async ramka(selektory, m = 0) {
      return ev(`(() => { const r = ${JSON.stringify(selektory)}.flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect());
        if (!r.length) return null; const x = Math.max(0, Math.min(...r.map((a) => a.left)) - ${m}), y = Math.max(0, Math.min(...r.map((a) => a.top)) - ${m});
        return { x, y, width: Math.min(innerWidth, Math.max(...r.map((a) => a.right)) + ${m}) - x, height: Math.max(...r.map((a) => a.bottom)) + ${m} - y }; })()`);
    },
    async zrzut(plik, clip) {
      // Wycinek z widocznej części okna - captureBeyondViewport przelicza układ i karteczki „⋯” (kotwice) wypadały z kadru.
      const p = { format: 'png', captureBeyondViewport: !clip };
      if (clip) p.clip = { ...clip, scale: 1 };
      const r = await wyslij('Page.captureScreenshot', p);
      fs.writeFileSync(path.join(KLATKI, plik), Buffer.from(r.data, 'base64'));
      console.log('  klatka', plik);
    },
    // Ruch myszy i kliknięcie w środek elementu (najechanie zmienia wygląd, np. „×” przekreśla wiersz).
    async mysz(selektor, klik = true) {
      const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(selektor)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
      if (!r) throw new Error('brak elementu ' + selektor);
      await wyslij('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
      if (klik) {
        await wyslij('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
        await wyslij('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      }
      await czekaj(400);
    },
    // Cała strona bez przewijania kartki (CSP blokuje <style> - przez CSSOM), okno wysokie jak strona.
    async calaStrona(plik) {
      await ev(`for (const [s, w] of [['html', 'height:auto'], ['body', 'height:auto'], ['.kartka', 'overflow:visible;flex:none']]) for (const e of document.querySelectorAll(s)) for (const p of w.split(';')) { const [k, v] = p.split(':'); e.style.setProperty(k, v, 'important'); }`);
      await czekaj(300);
      const h = await ev('Math.ceil(document.documentElement.scrollHeight)');
      await strona.rozmiar(1500, h);
      await czekaj(500);
      await strona.zrzut(plik);
      await ev(`for (const s of ['html', 'body', '.kartka']) for (const e of document.querySelectorAll(s)) e.removeAttribute('style')`);
      await strona.rozmiar(1500, 860);
    },
    async wybierzPlik(selektorPrzycisku, plik) {
      await wyslij('Page.setInterceptFileChooserDialog', { enabled: true });
      const otwarte = new Promise((r) => k.sluchacze.push((d) => { if (d.method === 'Page.fileChooserOpened') r(d.params); }));
      await ev(`document.querySelector(${JSON.stringify(selektorPrzycisku)}).click()`, true);
      const { backendNodeId } = await otwarte;
      await wyslij('DOM.setFileInputFiles', { files: [plik], backendNodeId });
      await wyslij('Page.setInterceptFileChooserDialog', { enabled: false });
      await czekaj(1200);
    },
  };
  return strona;
}

async function zamknijStrone(s) {
  try { await s.wyslij('Page.navigate', { url: 'about:blank' }); } catch { /* bez znaczenia */ }
  await czekaj(300);
  try { await fetch(`http://127.0.0.1:${PORT_CDP}/json/close/${s.cel.id}`); } catch { /* już zamknięta */ }
  s.zamknij();
  zatrzymajSerwer();
}

// --- scenariusze ---
const wiersz = (nazwa) => `[...document.querySelectorAll('#wiersze tr')].find((tr) => [...tr.querySelectorAll('input, textarea')].some((p) => p.value === ${JSON.stringify(nazwa)}))`;
const wWierszu = (nazwa, sel) => `${wiersz(nazwa)}?.querySelector(${JSON.stringify(sel)})`;
// Znacznik na elemencie, żeby wskazać go myszą selektorem.
const oznacz = (s, expr, znak) => s.ev(`(() => { document.querySelectorAll('[data-podglad="${znak}"]').forEach((e) => e.removeAttribute('data-podglad')); const e = ${expr}; if (e) e.dataset.podglad = '${znak}'; return !!e; })()`);

const SCENARIUSZE = {
  async 'pelny-noc'() {
    const s = await otworz('pelny-noc');
    await s.calaStrona('01.png');

    // 03a: wykreślanie - najechanie na „×” przy Netflix i okno z pytaniem.
    await s.rozmiar(1500, 640);
    await oznacz(s, wWierszu('Netflix', '.kol-akcje button, button.wykresl, .wykresl'), 'x');
    await s.mysz('[data-podglad="x"]');
    await s.zrzut('03a.png');
    await s.ev(`document.getElementById('okno-anuluj').click()`);
    await s.czekaj(400);

    // 03b: błędna kwota i przeciąganie wiersza za Lp. (Spotify pod Netflix, jeszcze nie upuszczony).
    await s.mysz('.naglowek h1', false);
    await s.ev(`(() => { const p = ${wWierszu('ChatGPT Plus', '.pole--koszt')}; p.focus(); p.value = '20,5,1'; p.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await s.ev(`(() => { const u = ${wWierszu('Spotify', '.uchwyt')}; const tr = u.closest('tr'); tr.draggable = true; const cel = ${wiersz('Netflix')}; const dt = new DataTransfer();
      u.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); const b = cel.getBoundingClientRect();
      cel.querySelector('td').dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: b.left + 40, clientY: b.top + 4 })); })()`);
    await s.czekaj(400);
    await s.zrzut('03b.png');
    await s.ev(`(() => { const u = document.querySelector('tr.przeciagany .uchwyt'); u?.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: new DataTransfer() }));
      const p = ${wWierszu('ChatGPT Plus', '.pole--koszt')}; p.value = '20,00'; for (const t of ['input', 'change']) p.dispatchEvent(new Event(t, { bubbles: true })); })()`);

    // 03c: karteczka „⋯” w trzech wariantach (pobiera się sama + podział kosztu, płacę sam, nie przedłużać), wszystkie grupy rozwinięte.
    await s.rozmiar(1500, 1800);
    let nr = 0;
    for (const nazwa of ['Spotify', 'Internet domowy', 'Próbny AI']) {
      nr++;
      await s.ev(`${wiersz(nazwa)}.scrollIntoView({ block: 'center' })`);
      await oznacz(s, wWierszu(nazwa, '.wiecej'), 'w');
      await s.mysz('[data-podglad="w"]');
      await s.ev(`document.querySelectorAll('.karteczka:popover-open').forEach((k) => { k.style.setProperty('max-height', 'none', 'important'); k.querySelectorAll('.karteczka__grupa').forEach((d) => { d.open = true; }); })`);
      await s.czekaj(300);
      await s.zrzut(`03c${nr}.png`, await s.ramka(['.karteczka:popover-open'], 6));
      await s.ev(`document.querySelectorAll('.karteczka:popover-open').forEach((k) => k.hidePopover())`);
    }
    await s.rozmiar(1500, 860);

    // 03d: „zapłacone” przy kwocie za każdym razem innej - pytanie „ile?”.
    await s.ev(`${wiersz('Energia elektryczna')}.scrollIntoView({ block: 'center' })`);
    await oznacz(s, wWierszu('Energia elektryczna', '.zaplac__pole input'), 'z');
    await s.mysz('[data-podglad="z"]');
    await s.mysz('.naglowek h1', false);
    await s.zrzut('03d.png', await s.ramka(['#wiersze tr:has([data-podglad="z"])'], 60));
    await s.ev(`document.querySelector('[data-podglad="z"]')?.click()`);

    // 03e: filtr „dom i rachunki” i rozwinięte „Anulowane”.
    await s.ev(`document.querySelector('#filtr .zakladka[data-klucz="k-dom"]').click(); document.getElementById('anulowane').open = true; document.querySelector('.kartka').scrollTop = 0`);
    await s.rozmiar(1500, 1000);
    await s.zrzut('03e.png', await s.ramka(['#filtr', '.zeszyt-ramka', '#anulowane'], 8));
    await s.ev(`document.querySelector('#filtr .zakladka[data-klucz="k-dom"]').click(); document.getElementById('anulowane').open = false`);
    await s.rozmiar(1500, 860);

    // 03f: prowizja banku i objaśnienie „?”.
    await s.mysz('#prowizja');
    await s.mysz('.kol-termin [data-pomoc]', false);
    await s.czekaj(600);
    await s.zrzut('03f.png', { x: 0, y: 0, width: 1500, height: 330 });
    await s.ev(`document.getElementById('prowizja-okno').hidePopover()`);
    await s.mysz('.naglowek h1', false);

    // 04: okno „Ustawienia” - cztery zakładki.
    await s.rozmiar(1500, 1300);
    await s.mysz('#ustawienia');
    const zakladki = await s.ev(`[...document.querySelectorAll('#okno-ustawienia .ustawienia__zakladki .zakladka')].map((b) => b.textContent)`);
    for (let i = 0; i < zakladki.length; i++) {
      await s.ev(`document.querySelectorAll('#okno-ustawienia .ustawienia__zakladki .zakladka')[${i}].click()`);
      await s.czekaj(500);
      await s.zrzut(`04${'abcd'[i]}.png`, await s.ramka(['#okno-ustawienia'], 14));
    }
    // 04e: wyciąg bankowy (zakładka „Kopia i import” jest otwarta).
    await s.wybierzPlik('#plik-bank', path.join(BAZA, 'wyciag-mbank.csv').replace(/\//g, '\\'));
    await s.zrzut('04e.png', await s.ramka(['.okno--wyciag'], 14));
    await s.ev(`document.querySelector('.okno--wyciag')?.close()`);
    await s.czekaj(400);
    // 04f: „o aplikacji” z licencjami.
    if (!(await s.ev(`!!document.querySelector('#okno-ustawienia[open]')`))) await s.mysz('#ustawienia');
    await s.ev(`document.getElementById('o-aplikacji').click()`);
    await s.czekaj(500);
    await s.ev(`document.querySelector('.okno--o-aplikacji details').open = true`);
    await s.czekaj(300);
    await s.zrzut('04f.png', await s.ramka(['.okno--o-aplikacji'], 14));
    await s.ev(`document.querySelector('.okno--o-aplikacji').close()`);
    await s.czekaj(400);
    // 04g: synchronizacja - pierwszy raz: okno z identyfikatorem projektu Google i instrukcją.
    if (!(await s.ev(`!!document.querySelector('#okno-ustawienia[open]')`))) await s.mysz('#ustawienia');
    await s.ev(`document.querySelectorAll('#okno-ustawienia .ustawienia__zakladki .zakladka')[2].click()`);
    await s.czekaj(400);
    await s.ev(`document.getElementById('dysk-wlacz').click()`);
    await s.czekaj(600);
    await s.ev(`(() => { const c = document.querySelector('#okno-google .okno__pomoc input'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await s.rozmiar(1500, 1500);
    await s.czekaj(500);
    await s.zrzut('04g.png', await s.ramka(['#okno-google'], 14));
    await s.ev(`document.getElementById('okno-google-anuluj').click()`);
    return s;
  },

  async 'bez-internetu'() {
    const s = await otworz('bez-internetu', { tryb: 'bez-internetu' });
    await s.czekaj(1500);
    await s.zrzut('03g.png', { x: 0, y: 0, width: 1500, height: 330 });
    return s;
  },

  async 'pelny-dzien'() {
    const s = await otworz('pelny-dzien');
    await s.calaStrona('02.png');
    return s;
  },

  async angielski() {
    const s = await otworz('angielski');
    await s.zrzut('05e.png');
    return s;
  },

  async 'bez-funkcji'() {
    const s = await otworz('bez-funkcji');
    await s.zrzut('05f.png');
    return s;
  },

  async pusty() {
    const s = await otworz('pusty', { wys: 780 });
    await s.zrzut('05a.png');
    return s;
  },

  async uszkodzony() {
    const s = await otworz('uszkodzony', { wys: 460 });
    await s.zrzut('05b.png');
    return s;
  },

  async 'druga-kopia'() {
    // Samozamknięcie po 4 s wstrzymane - inaczej app.exit zamknie serwer testowy.
    const s = await otworz('druga-kopia', { wys: 460, dodatek: 'const __s = setTimeout; window.setTimeout = (f, ms, ...a) => (ms === 4000 ? 0 : __s(f, ms, ...a));' });
    await s.zrzut('05c.png');
    return s;
  },

  async 'bez-zapisu'() {
    const s = await otworz('bez-zapisu', { wys: 560 });
    await s.zrzut('05d.png');
    return s;
  },
};

// Obrazki zbiorcze w folderze Podgląd: 01 i 02 to całe strony, 03-05 składa zestaw.html z klatek.
const ZESTAWY = { '03': '03-stany-i-dzialania.png', '04': '04-ustawienia-i-okna.png', '05': '05-sytuacje-szczegolne.png' };
async function zestawy() {
  const PODGLAD = path.resolve(TU, '..');
  fs.copyFileSync(path.join(KLATKI, '01.png'), path.join(PODGLAD, '01-noc-pelny-widok.png'));
  fs.copyFileSync(path.join(KLATKI, '02.png'), path.join(PODGLAD, '02-dzien-pelny-widok.png'));
  const k = await nowaKarta();
  await k.wyslij('Page.enable');
  const adres = (p) => 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');
  for (const [nr, plik] of Object.entries(ZESTAWY)) {
    await k.wyslij('Emulation.setDeviceMetricsOverride', { width: 1580, height: 900, deviceScaleFactor: 1, mobile: false });
    await k.wyslij('Page.navigate', { url: `${adres(path.join(TU, 'zestaw.html'))}?zestaw=${nr}&klatki=${encodeURIComponent(adres(KLATKI) + '/')}` });
    await czekaj(1500);
    const h = (await k.wyslij('Runtime.evaluate', { expression: 'Math.ceil(document.documentElement.scrollHeight)', returnByValue: true })).result.value;
    await k.wyslij('Emulation.setDeviceMetricsOverride', { width: 1580, height: h, deviceScaleFactor: 1, mobile: false });
    await czekaj(500);
    const r = await k.wyslij('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(PODGLAD, plik), Buffer.from(r.data, 'base64'));
    console.log('  obrazek', plik);
  }
  k.zamknij();
}

const wybrane = process.argv.slice(2);
await uruchomEdge();
try {
  for (const nazwa of wybrane.length ? wybrane : [...Object.keys(SCENARIUSZE), 'zestawy']) {
    console.log('scenariusz', nazwa);
    if (nazwa === 'zestawy') {
      await zestawy();
      continue;
    }
    const s = await SCENARIUSZE[nazwa]();
    await zamknijStrone(s);
  }
} finally {
  zatrzymajSerwer();
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* zamknięty */ }
}
