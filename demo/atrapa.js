// Demo mode (browser, no install): a stand-in for the Neutralino API (and Capacitor on the phone version)
// with files kept only in page memory. Refresh = the invented example data again. No localStorage, no server.
// Features that need the outside world (Google Drive, Windows Task Scheduler, phone notifications) say
// "W wersji demonstracyjnej nie działa - w prawdziwej aplikacji tak"; Windows notifications become
// notes in the corner of the page, saved files go to the browser's Downloads.
(() => {
  const TELEFON = document.documentElement.dataset.demo === 'telefon';

  // Narrow screen (phone opening the demo window) - the phone version; "?pc" keeps the computer version.
  if (!TELEFON && window.innerWidth < 760 && !/[?&]pc\b/.test(location.search)) {
    location.replace('/telefon/');
    return;
  }

  const ang = () => document.documentElement.lang === 'en';
  const NIE_DZIALA = () => (ang() ? 'Does not work in the demo version - it does in the real app.' : 'W wersji demonstracyjnej nie działa - w prawdziwej aplikacji tak.');

  // --- files in memory -------------------------------------------------
  const pliki = new Map(Object.entries(window.__demo.pliki()));
  const foldery = new Set(['', 'Mikroplatnosci', 'Mikroplatnosci/kopie']);
  const POBRANE = 'Pobrane/';
  const norm = (s) => String(s).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const brak = (s) => Object.assign(new Error('Nie ma pliku: ' + s), { code: 'NE_FS_NOPATHE' });

  function pobierz(nazwa, tresc) {
    const typ = nazwa.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'application/json';
    const adres = URL.createObjectURL(new Blob([tresc], { type: typ }));
    const a = Object.assign(document.createElement('a'), { href: adres, download: nazwa });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(adres), 10000);
  }

  // --- Windows notifications as notes in the corner of the page ----------
  // The start of the demo produces several at the same moment - one by one, at most 2 visible, so the table stays readable.
  let stos = null;
  let kolejka = Promise.resolve();
  // "Pierwsze kroki" bubbles first - notifications wait until they are closed.
  const czekajNaKoniecKrokow = () => new Promise((r) => {
    const sprawdz = () => (document.querySelector('.kroki-dymek') ? setTimeout(sprawdz, 500) : r());
    sprawdz();
  });
  const powiadomienie = (tytul, tresc) => {
    kolejka = kolejka.then(() => new Promise((r) => setTimeout(r, 1500))).then(czekajNaKoniecKrokow).then(() => pokazPowiadomienie(tytul, tresc));
  };
  function pokazPowiadomienie(tytul, tresc) {
    if (!stos) {
      stos = Object.assign(document.createElement('div'), { className: 'demo-powiadomienia' });
      stos.setAttribute('aria-live', 'polite');
      document.body.append(stos);
    }
    if (stos.children.length >= 2) stos.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'demo-powiadomienie';
    const naglowek = document.createElement('span');
    naglowek.className = 'demo-powiadomienie__skad';
    naglowek.textContent = ang() ? 'Windows notification (in the demo - here)' : 'Powiadomienie Windows (w demie - tutaj)';
    const t = document.createElement('b');
    t.textContent = tytul;
    const opis = document.createElement('span');
    opis.textContent = tresc;
    el.append(naglowek, t, opis);
    stos.append(el);
    setTimeout(() => el.remove(), 7000);
  }

  window.NL_PID = 1;
  window.NL_ARGS = [];
  const gotowe = [];
  window.Neutralino = {
    init: () => setTimeout(() => gotowe.forEach((f) => f()), 0),
    events: { on: (nazwa, f) => { if (nazwa === 'ready') gotowe.push(f); } },
    app: { exit: () => {} },
    // PC: zasobnik przy zegarze - w przeglądarce go nie ma (okna nie da się schować).
    window: { show: async () => {}, hide: async () => {}, focus: async () => {}, unminimize: async () => {} },
    os: {
      getPath: async (nazwa) => {
        if (nazwa === 'data') return '';
        throw new Error('demo');
      },
      // Links from the table and "o aplikacji" - https only, in a new tab.
      open: async (adres) => {
        if (!/^https:\/\//i.test(adres)) throw new Error('otwierane są tylko adresy https');
        window.open(adres, '_blank', 'noopener');
      },
      showSaveDialog: async (_tytul, opcje) => POBRANE + norm(opcje?.defaultPath ?? 'plik').split('/').pop(),
      showNotification: async (tytul, tresc) => powiadomienie(tytul, tresc),
      execCommand: async () => ({ exitCode: 1, stdOut: '', stdErr: NIE_DZIALA() }),
      setTray: async () => {},
      // Phone: backup and CSV "to Documents" - in the demo to the browser's Downloads.
      zapiszDokument: async (nazwa, tresc) => pobierz(nazwa, tresc),
    },
    filesystem: {
      readFile: async (s) => {
        const k = norm(s);
        if (!pliki.has(k)) throw brak(k);
        return pliki.get(k);
      },
      writeFile: async (s, tresc) => {
        const k = norm(s);
        if (k.startsWith(POBRANE)) return pobierz(k.slice(POBRANE.length), tresc);
        pliki.set(k, String(tresc));
      },
      writeBinaryFile: async () => { throw new Error('demo'); },
      createWatcher: async () => 1,
      move: async (z, doCelu) => {
        const k = norm(z);
        if (!pliki.has(k)) throw brak(k);
        pliki.set(norm(doCelu), pliki.get(k));
        pliki.delete(k);
      },
      remove: async (s) => {
        const k = norm(s);
        if (!pliki.delete(k) && !foldery.delete(k)) throw brak(k);
      },
      createDirectory: async (s) => { foldery.add(norm(s)); },
      getStats: async (s) => {
        const k = norm(s);
        if (foldery.has(k)) return { size: 0, isFile: false, isDirectory: true };
        if (pliki.has(k)) return { size: pliki.get(k).length, isFile: true, isDirectory: false };
        throw brak(k);
      },
      readDirectory: async (s) => {
        const k = norm(s);
        if (!foldery.has(k)) throw brak(k);
        const przed = k ? k + '/' : '';
        return [...pliki.keys()].filter((p) => p.startsWith(przed) && !p.slice(przed.length).includes('/'))
          .map((p) => ({ entry: p.slice(przed.length), type: 'FILE' }));
      },
    },
  };
  // Phone version: Capacitor without the native platform - the app then skips scanner, notifications and the Back button plugin.
  if (TELEFON) window.Capacitor = { isNativePlatform: () => false, registerPlugin: () => ({}) };
  // Phone version in its own tab: the browser Back button works like Android Back (closes the open window,
  // returns to the list...) and leaves the page only when there is nothing to undo. Not inside the demo window
  // on the home page - there Back belongs to that page (it closes the window with the demo).
  if (TELEFON && window.top === window) {
    if (!history.state?.demo) history.pushState({ demo: 1 }, ''); // after a reload the entry is already there
    addEventListener('popstate', () => {
      if (window.wsteczDemo?.()) history.pushState({ demo: 1 }, '');
      else history.back();
    });
  }

  // --- what the visitor sees -----------------------------------------------
  function uwaga(tekst, klasa = '') {
    const el = document.createElement('span');
    el.className = 'demo-uwaga' + (klasa ? ' ' + klasa : '');
    el.textContent = tekst;
    return el;
  }

  function pasek() {
    const el = document.createElement('div');
    el.className = 'demo-pasek';
    el.setAttribute('role', 'note');
    const tekst = document.createElement('span');
    const inna = document.createElement('a');
    inna.className = 'demo-pasek__link';
    const odswiez = () => {
      tekst.textContent = TELEFON
        ? (ang() ? 'Demo: invented data, changes vanish on refresh.' : 'Demo: dane wymyślone, zmiany znikają po odświeżeniu.')
        : (ang() ? 'Demo version - invented data; changes disappear when you refresh the page.'
          : 'Wersja demonstracyjna - dane są wymyślone, a zmiany znikają po odświeżeniu strony.');
      inna.textContent = TELEFON ? (ang() ? 'computer version' : 'wersja na komputer') : (ang() ? 'phone version' : 'wersja na telefon');
      instrukcja.textContent = ang() ? 'user guide (Polish)' : 'instrukcja';
    };
    inna.href = TELEFON ? '/?pc' : '/telefon/';
    const instrukcja = document.createElement('a');
    instrukcja.className = 'demo-pasek__link';
    instrukcja.href = '/instrukcja/';
    odswiez();
    el.append(tekst, ' ', inna, ' ', instrukcja);
    document.body.prepend(el);
    return odswiez;
  }

  const PRZELACZNIKI_WINDOWS = ['ustawienia-tlo', 'ustawienia-zasobnik', 'ustawienia-autostart'];
  // Notes next to the switches in Settings (the window is built anew each time it opens).
  function uwagiWUstawieniach() {
    // Harmonogram zadań, zasobnik przy zegarze i start z Windows - tylko w prawdziwej aplikacji.
    for (const id of PRZELACZNIKI_WINDOWS) {
      const pole = document.getElementById(id);
      if (!pole || pole.dataset.demo) continue;
      pole.dataset.demo = '1';
      pole.closest('label')?.querySelector('.ustawienia__opis')?.append(' ', uwaga(NIE_DZIALA()));
    }
    const wycofaj = document.getElementById('ustawienia-p-wycofaj');
    const sekcja = wycofaj?.closest('section');
    if (sekcja && !sekcja.dataset.demo) {
      sekcja.dataset.demo = '1';
      const tekst = TELEFON ? NIE_DZIALA()
        : (ang() ? 'In the demo, notifications appear in the corner of this page.' : 'W wersji demonstracyjnej powiadomienia pokazują się w rogu tej strony.');
      sekcja.querySelector('h3')?.after(uwaga(tekst, 'demo-uwaga--blok'));
    }
  }

  function uwagiStale() {
    // Google Drive: the switch stays off and explains why.
    const dysk = document.querySelector('label[for="dysk-wlacz"] .ustawienia__opis');
    if (dysk && !dysk.querySelector('.demo-uwaga')) dysk.append(' ', uwaga(NIE_DZIALA()));
    const zapisz = document.getElementById('plik-zapisz');
    if (zapisz && !zapisz.previousElementSibling?.classList.contains('demo-uwaga')) {
      zapisz.before(uwaga(ang() ? 'In the demo, files go to the browser\'s Downloads folder.' : 'W wersji demonstracyjnej pliki trafiają do folderu Pobrane przeglądarki.', 'demo-uwaga--blok'));
    }
    const bank = document.getElementById('plik-bank');
    if (bank && !bank.nextElementSibling?.classList.contains('demo-wyciag')) {
      const p = document.createElement('span'); // span like the other demo notes - dialog paragraphs have their own larger font
      p.className = 'demo-uwaga demo-uwaga--blok demo-wyciag';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'przycisk-tekst';
      b.textContent = ang() ? 'download a sample statement (CSV)' : 'pobierz przykładowy wyciąg (CSV)';
      b.addEventListener('click', () => pobierz('przykladowy-wyciag-mbank.csv', window.__demo.wyciag()));
      p.append(ang() ? 'No statement at hand? ' : 'Nie masz wyciągu pod ręką? ', b, ang() ? ', then choose it in "Import from bank statement…".' : ', potem wybierz go w „Import z wyciągu bankowego…”.');
      bank.after(p);
    }
  }

  // The Google Drive switch never starts signing in - it only shows the note.
  window.addEventListener('change', (e) => {
    if (e.target?.id !== 'dysk-wlacz' && !PRZELACZNIKI_WINDOWS.includes(e.target?.id)) return;
    e.stopImmediatePropagation();
    e.target.checked = false;
    const opis = e.target.closest('label')?.querySelector('.demo-uwaga');
    if (opis) {
      opis.classList.remove('demo-uwaga--mignij');
      void opis.offsetWidth;
      opis.classList.add('demo-uwaga--mignij');
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    const odswiezPasek = pasek();
    uwagiStale();
    // Language change (Settings) rebuilds the texts - the demo notes follow it.
    new MutationObserver(() => {
      odswiezPasek();
      document.querySelectorAll('.demo-uwaga:not(.demo-wyciag)').forEach((el) => el.remove());
      document.querySelectorAll('[data-demo="1"]').forEach((el) => delete el.dataset.demo);
      document.querySelector('.demo-wyciag')?.remove();
      uwagiStale();
      uwagiWUstawieniach();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    new MutationObserver(uwagiWUstawieniach).observe(document.body, { childList: true, subtree: true });
  });
})();
