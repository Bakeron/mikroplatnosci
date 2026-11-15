// Screenshots for the user guide (instrukcja/index.html), taken automatically on the browser demo
// (demo/dist, invented data) - so they refresh after app changes: node demo/zbuduj.mjs && node instrukcja/zrodla/zrzuty.mjs
// Own headless Edge over CDP (no dependencies), own static server for demo/dist. Numbered markers are put on the
// page before each shot; their numbers match the lists in index.html.
// Usage: node instrukcja/zrodla/zrzuty.mjs [scene...]   (no scenes = all)

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TU = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.resolve(TU, '../../demo/dist');
const WYJSCIE = path.resolve(TU, '../zrzuty');
const PORT_CDP = Number(process.env.INSTRUKCJA_PORT_CDP || 9418);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));
if (!fs.existsSync(path.join(DEMO, 'index.html'))) throw new Error('Najpierw: node demo/zbuduj.mjs');
fs.mkdirSync(WYJSCIE, { recursive: true });

// --- static server for demo/dist ---
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const serwer = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const plik = path.join(DEMO, path.normalize(p).replace(/^([\\/]|\.\.)+/, ''));
  if (!plik.startsWith(DEMO) || !fs.existsSync(plik)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPY[path.extname(plik)] || 'application/octet-stream' });
  res.end(fs.readFileSync(plik));
});
await new Promise((r) => serwer.listen(0, '127.0.0.1', r));
const ADRES = `http://127.0.0.1:${serwer.address().port}`;

// --- Edge over CDP ---
const profil = path.join(os.tmpdir(), 'instrukcja-edge-' + Date.now());
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT_CDP}`, `--user-data-dir=${profil}`, '--no-first-run',
  '--disable-extensions', '--hide-scrollbars', '--lang=pl', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; ; i++) {
  await czekaj(200);
  try {
    const v = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/version`)).json();
    if (!/Edg\//.test(v['User-Agent'] || '')) throw new Error('na porcie nie ma mojego Edge');
    break;
  } catch (e) {
    if (/mojego Edge/.test(e.message) || i > 50) throw e;
  }
}

async function karta({ szer, wys, telefon = false }) {
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
  // Pytania confirm() (np. „Wyłączyć…?”) - „Anuluj”, żeby nic się nie zmieniło.
  sluchacze.push((d) => {
    if (d.method === 'Page.javascriptDialogOpening') wyslij('Page.handleJavaScriptDialog', { accept: false });
    if (d.method === 'Runtime.exceptionThrown') console.log('  [błąd strony]', d.params.exceptionDetails?.exception?.description?.split('\n')[0]);
  });
  await wyslij('Page.enable');
  await wyslij('Runtime.enable');
  await wyslij('Emulation.setDeviceMetricsOverride', { width: szer, height: wys, deviceScaleFactor: telefon ? 2 : 1, mobile: telefon });
  if (telefon) await wyslij('Emulation.setTouchEmulationEnabled', { enabled: true });
  await wyslij('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }] });
  const ev = async (expr, gest = false) => {
    const r = await wyslij('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: gest });
    if (r.exceptionDetails) throw new Error('evaluate: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const s = {
    ev,
    async otworz(adres) {
      await wyslij('Page.navigate', { url: ADRES + adres });
      for (let i = 0; i < 50 && !(await ev(`!!document.querySelector('.kroki-dymek')`).catch(() => false)); i++) await czekaj(200);
      await czekaj(500);
      await ev(POMOCNIKI);
    },
    pomin: () => ev(`document.querySelector('.kroki-dymek__pomin')?.click()`).then(() => czekaj(400)),
    async zrzut(plik, clip) {
      await czekaj(350);
      const p = { format: 'webp', quality: 82, captureBeyondViewport: false };
      if (clip) p.clip = { ...clip, scale: 1 };
      const r = await wyslij('Page.captureScreenshot', p);
      fs.writeFileSync(path.join(WYJSCIE, plik), Buffer.from(r.data, 'base64'));
      console.log('  zrzut', plik);
      await ev(`window.__instr.czysc()`);
    },
    // Rectangle around elements (selectors, or element expressions with ramkaE) with a margin, clipped to the window.
    ramka: (selektory, m = 10) => ev(`window.__instr.ramka(${JSON.stringify(selektory)}, ${m})`),
    ramkaE: (wyrazenia, m = 10) => ev(`window.__instr.ramkaEl([${wyrazenia.join(',')}], ${m})`),
    async rozmiar(szer, wys) {
      await wyslij('Emulation.setDeviceMetricsOverride', { width: szer, height: wys, deviceScaleFactor: 1, mobile: false });
      await czekaj(400);
    },
    znaczniki: (lista) => ev(`window.__instr.znaczniki([${lista.map(([e, nr, gdzie = 'tl']) => `[${e}, ${nr}, '${gdzie}']`).join(',')}])`),
    async wybierzPlik(przycisk, plik) {
      await wyslij('Page.setInterceptFileChooserDialog', { enabled: true });
      const otwarte = new Promise((r) => sluchacze.push((d) => { if (d.method === 'Page.fileChooserOpened') r(d.params); }));
      await ev(`document.querySelector(${JSON.stringify(przycisk)}).click()`, true);
      const { backendNodeId } = await otwarte;
      await wyslij('DOM.setFileInputFiles', { files: [plik], backendNodeId });
      await wyslij('Page.setInterceptFileChooserDialog', { enabled: false });
      await czekaj(1200);
    },
    async zamknij() {
      try { await fetch(`http://127.0.0.1:${PORT_CDP}/json/close/${cel.id}`); } catch { /* already closed */ }
      ws.close();
    },
  };
  return s;
}

// In-page helpers: markers (numbered red circles), hiding the demo strip and demo notifications for clean shots.
// Markers go inside the open dialog / popover that holds the element - otherwise the top layer covers them.
const POMOCNIKI = `(() => {
  const ukryj = (s) => document.querySelectorAll(s).forEach((e) => e.style.setProperty('display', 'none', 'important'));
  ukryj('.demo-pasek'); ukryj('.demo-powiadomienia');
  new MutationObserver(() => ukryj('.demo-powiadomienia')).observe(document.body, { childList: true });
  window.__instr = {
    znaczniki(lista) {
      for (const [el, nr, gdzie] of lista) {
        if (!el) { console.log('brak elementu dla znacznika ' + nr); continue; }
        const r = el.getBoundingClientRect();
        const pojemnik = el.closest('dialog[open], [popover]:popover-open') || document.body;
        const c = pojemnik === document.body ? { left: 0, top: 0 } : pojemnik.getBoundingClientRect();
        // Kept inside the window - a marker at the screen edge (phone cards) would be cut in half.
        const x = Math.min(Math.max({ tl: r.left - 10, l: r.left - 30, r: r.right + 4, t: r.left + r.width / 2 - 13, tr: r.right - 16 }[gdzie] ?? r.left - 10, 4), innerWidth - 30);
        const y = Math.min(Math.max({ tl: r.top - 10, l: r.top + r.height / 2 - 13, r: r.top + r.height / 2 - 13, t: r.top - 28, tr: r.top - 10 }[gdzie] ?? r.top - 10, 4), innerHeight - 30);
        const z = document.createElement('div');
        z.className = 'instr-znacznik';
        z.textContent = nr;
        Object.assign(z.style, { position: pojemnik === document.body ? 'fixed' : 'absolute', left: (x - c.left + (pojemnik.scrollLeft || 0)) + 'px', top: (y - c.top + (pojemnik.scrollTop || 0)) + 'px',
          width: '26px', height: '26px', borderRadius: '50%', background: '#c0392b', color: '#fff', font: '700 15px/26px Arial, sans-serif', textAlign: 'center',
          zIndex: 99999, boxShadow: '0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.45)', pointerEvents: 'none' });
        pojemnik.append(z);
      }
    },
    czysc() { document.querySelectorAll('.instr-znacznik').forEach((e) => e.remove()); },
    ramka(selektory, m) { return this.ramkaEl(selektory.flatMap((s) => [...document.querySelectorAll(s)]), m); },
    ramkaEl(lista, m) {
      const r = lista.filter((e) => e && e.getClientRects().length).map((e) => e.getBoundingClientRect());
      if (!r.length) return null;
      const x = Math.max(0, Math.min(...r.map((a) => a.left)) - m), y = Math.max(0, Math.min(...r.map((a) => a.top)) - m);
      return { x, y, width: Math.min(innerWidth, Math.max(...r.map((a) => a.right)) + m) - x, height: Math.min(innerHeight, Math.max(...r.map((a) => a.bottom)) + m) - y };
    },
    wiersz(nazwa) { return [...document.querySelectorAll('#wiersze tr')].find((tr) => [...tr.querySelectorAll('input, textarea')].some((p) => p.value === nazwa)) || null; },
    karta(nazwa) { return [...document.querySelectorAll('#karty > li')].find((li) => li.textContent.includes(nazwa)) || null; },
  };
})()`;

const W = (nazwa, sel) => `window.__instr.wiersz(${JSON.stringify(nazwa)})?.querySelector(${JSON.stringify(sel)})`;
const Wk = (nazwa, nr) => `window.__instr.wiersz(${JSON.stringify(nazwa)})?.cells[${nr}]`;
const Q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;

const SCENY = {
  // --- computer ---
  async pc() {
    const s = await karta({ szer: 1280, wys: 800 });
    await s.otworz('/?pc');
    await s.zrzut('pc-pierwsze-kroki.webp');
    await s.pomin();

    await s.ev(`${Q('.kartka')}.scrollTop = 0`);
    await s.znaczniki([[Q('#kursy'), 1], [Q('#prowizja'), 2], [Q('#odswiez'), 3], [Q('#motyw'), 4], [Q('#ustawienia'), 5, 'tr'], [Q('#filtr'), 6, 'l']]);
    await s.zrzut('pc-glowny.webp', { x: 0, y: 0, width: 1280, height: 330 });

    await s.ev(`${Q('.kartka')}.scrollTop = 0`);
    await s.znaczniki([[Wk('Netflix', 0), 1], [Wk('Netflix', 1), 2], [Wk('Netflix', 2), 3], [Wk('Netflix', 3), 4], [Wk('Netflix', 4), 5], [Wk('Netflix', 5), 6], [Wk('Netflix', 6), 7], [Wk('Netflix', 7), 8, 'tr']]);
    await s.zrzut('pc-wiersz.webp', await s.ramka(['thead', 'tbody tr:first-child'], 14));

    // New row: "+ dopisz nową pozycję…"
    await s.ev(`${Q('#dodaj')}.click()`, true);
    await czekaj(500);
    await s.ev(`(() => { const tr = [...document.querySelectorAll('#wiersze tr')].at(-1); tr.scrollIntoView({ block: 'center' }); })()`);
    await czekaj(300);
    const nowy = `[...document.querySelectorAll('#wiersze tr')].at(-1)`;
    await s.znaczniki([[`${nowy}.cells[2]`, 1], [`${nowy}.cells[3]`, 2], [`${nowy}.cells[4]`, 3], [`${nowy}.cells[7]`, 4, 'tr']]);
    await s.zrzut('pc-dopisz.webp', await s.ramka(['#wiersze tr:last-child', '.dopisz-wiersz'], 16));
    await s.otworz('/?pc'); // the empty new row would show up on the receipt - fresh demo data
    await s.pomin();

    // "⋯" card of Spotify (charged automatically, cost shared), all groups open.
    await s.ev(`${W('Spotify', '.wiecej')}.scrollIntoView({ block: 'center' })`);
    await s.ev(`${W('Spotify', '.wiecej')}.click()`, true);
    await czekaj(400);
    await s.ev(`document.querySelectorAll('.karteczka:popover-open .karteczka__grupa').forEach((d) => { d.open = true; })`);
    await czekaj(400);
    await s.ev(`(() => { const k = document.querySelector('.karteczka:popover-open'); window.__pola = [...k.querySelectorAll('.karteczka__pole:not([hidden]), .karteczka__grupa:not([hidden]) > summary')]; return window.__pola.map((p) => p.textContent.trim().slice(0, 40)); })()`).then((p) => console.log('  karteczka:', p));
    await s.znaczniki(Array.from({ length: 7 }, (_, i) => [`window.__pola[${i}]`, i + 1, 'l']));
    await s.zrzut('pc-wiecej.webp', await s.ramka(['.karteczka:popover-open'], 40));
    await s.ev(`document.querySelectorAll('.karteczka:popover-open').forEach((k) => k.hidePopover())`);

    // Manual payment: "Energia elektryczna" (pay myself, amount differs every time).
    await s.ev(`${W('Energia elektryczna', '.wiecej')}.closest('tr').scrollIntoView({ block: 'center' })`);
    await czekaj(300);
    await s.znaczniki([[`${Wk('Energia elektryczna', 5)}.querySelector('.lont')`, 1], [`${Wk('Energia elektryczna', 5)}.querySelector('.zaplac, [class*=zaplac]')`, 2, 'l']]);
    await s.zrzut('pc-reczna.webp', await s.ramkaE([`window.__instr.wiersz('Energia elektryczna')`, `window.__instr.wiersz('Internet domowy')`], 14));

    // Cross out: hover over "×" and the question.
    await s.ev(`${W('Netflix', '.wiecej')}.closest('tr').scrollIntoView({ block: 'center' })`);
    await s.ev(`${Wk('Netflix', 1)}.querySelector('button').click()`, true);
    await czekaj(500);
    await s.zrzut('pc-wykresl.webp', await s.ramka(['#okno-usun'], 30));
    await s.ev(`${Q('#okno-anuluj')}.click()`);

    // Cancelled + savings.
    await s.ev(`(() => { const a = ${Q('#anulowane')}; a.open = true; a.scrollIntoView({ block: 'center' }); })()`);
    await czekaj(500);
    await s.zrzut('pc-anulowane.webp', await s.ramka(['#anulowane'], 14));
    await s.ev(`${Q('#anulowane')}.open = false`);

    // Ruler and lists of upcoming payments.
    await s.ev(`${Q('.miarka-ramka')}.scrollIntoView({ block: 'start' })`);
    await czekaj(400);
    await s.znaczniki([[Q('#miarka'), 1, 'tl'], [Q('#alarmy-roczne'), 2, 'l'], [Q('#alarmy-jednorazowe'), 3, 'l']]);
    await s.zrzut('pc-terminy.webp', await s.ramka(['.miarka-ramka', '.spisy'], 20));

    // Receipt - taller window, the whole receipt in one shot.
    await s.rozmiar(1280, 1900);
    await s.ev(`${Q('#podsumowanie')}.scrollIntoView({ block: 'start' })`);
    await czekaj(400);
    await s.znaczniki([[Q('.paragon__pozycja--suma'), 1, 'l'], [Q('.paragon__pozycja--alarm'), 2, 'l'], [Q('.paragon__pozycja--firma'), 3, 'l'], [Q('.paragon__pozycja--oszczednosc'), 4, 'l']]);
    await s.zrzut('pc-paragon.webp', await s.ramka(['.paragon-cien'], 40));
    await s.rozmiar(1280, 800);

    // Spending history.
    await s.ev(`${Q('#historia')}.scrollIntoView({ block: 'start' })`);
    await czekaj(400);
    await s.zrzut('pc-historia.webp', await s.ramka(['#historia'], 14));

    // Settings: four tabs.
    await s.ev(`${Q('.kartka')}.scrollTop = 0`);
    await s.ev(`${Q('#ustawienia')}.click()`, true);
    await czekaj(600);
    for (const [zakladka, plik] of [['Zeszyt', 'pc-ust-zeszyt'], ['Powiadomienia', 'pc-ust-powiadomienia'], ['Synchronizacja', 'pc-ust-synchronizacja'], ['Kopia i import', 'pc-ust-kopia']]) {
      await s.ev(`[...document.querySelectorAll('#okno-ustawienia .zakladka')].find((b) => b.textContent === ${JSON.stringify(zakladka)}).click()`, true);
      await czekaj(700);
      await s.zrzut(plik + '.webp', await s.ramka(['#okno-ustawienia'], 24));
    }
    await s.ev(`${Q('#okno-ustawienia')}.close()`);

    // Import from a bank statement (sample statement from the demo).
    const csv = path.join(os.tmpdir(), 'przykladowy-wyciag-mbank.csv');
    fs.writeFileSync(csv, await s.ev('window.__demo.wyciag()'));
    await s.ev(`${Q('#ustawienia')}.click()`, true);
    await czekaj(600);
    await s.ev(`[...document.querySelectorAll('#okno-ustawienia .zakladka')].find((b) => b.textContent === 'Kopia i import').click()`, true);
    await czekaj(600);
    await s.wybierzPlik('#plik-bank', csv);
    await s.zrzut('pc-wyciag.webp', await s.ramka(['#okno-wyciag'], 24));
    fs.rmSync(csv, { force: true });
    await s.zamknij();
  },

  // --- phone ---
  async telefon() {
    const s = await karta({ szer: 390, wys: 844, telefon: true });
    await s.otworz('/telefon/');
    await s.zrzut('tel-pierwsze-kroki.webp');
    await s.pomin();
    await s.znaczniki([[Q('#suma-miesiac'), 1, 'r'], [Q('#ustawienia'), 2, 'l'], [Q('#kolejnosc'), 3, 'l'], [Q('#filtr'), 4, 'l'], [`window.__instr.karta('Energia')`, 5, 'l'], [Q('.t-zakladki'), 6, 't']]);
    await s.zrzut('tel-lista.webp');

    // Edit sheet: tap the Netflix card.
    await s.ev(`window.__instr.karta('Netflix').scrollIntoView({ block: 'center' })`);
    await s.ev(`window.__instr.karta('Netflix').querySelector('.karta').click()`, true);
    await czekaj(700);
    await s.zrzut('tel-edycja.webp');
    await s.ev(`${Q('#arkusz-anuluj')}.click()`);
    await czekaj(500);

    for (const [z, plik] of [['terminy', 'tel-terminy'], ['paragon', 'tel-paragon']]) {
      await s.ev(`${Q(`[data-zakladka="${z}"]`)}.click()`, true);
      await czekaj(700);
      await s.zrzut(plik + '.webp');
    }
    await s.ev(`${Q('[data-zakladka="lista"]')}.click()`, true);
    await czekaj(500);
    await s.ev(`${Q('#uloz')}.click()`, true);
    await czekaj(600);
    await s.zrzut('tel-uloz.webp');
    await s.zamknij();
  },
};

const wybrane = process.argv.slice(2);
try {
  for (const [nazwa, scena] of Object.entries(SCENY)) {
    if (wybrane.length && !wybrane.includes(nazwa)) continue;
    console.log('scena', nazwa);
    await scena();
  }
} finally {
  edge.kill();
  serwer.close();
  await czekaj(500);
  fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
