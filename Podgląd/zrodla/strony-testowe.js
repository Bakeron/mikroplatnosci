// Skrypt startowy dla przeglądarki testowej (initScript): dane aplikacji tylko w folderze testowym,
// bez powiadomień Windows; opcjonalnie brak internetu (kursy NBP).
// Ustaw window.__TRYB = 'bez-internetu' PRZED tym kodem, żeby zasymulować brak sieci.
// Ustaw window.__DANE = '<folder testowy>' PRZED tym kodem - aplikacja czyta i zapisuje tylko tam.
// Bez __DANE albo przy ścieżce do %APPDATA% (Roaming) każdy dostęp do plików jest blokowany.
(() => {
  const folder = window.__DANE;
  let neutralino;
  Object.defineProperty(window, 'Neutralino', {
    configurable: true,
    get: () => neutralino,
    set: (v) => {
      neutralino = v;
      const getPath = v.os.getPath;
      v.os.getPath = (nazwa) => (nazwa === 'data' ? Promise.resolve(folder || 'BRAK-FOLDERU-TESTOWEGO') : getPath(nazwa));
      // Serwer testowy to prawdziwy Neutralino - powiadomienie z danych przykładowych („Wycofaj: YouTube
      // Premium”) trafiłoby na pulpit autora jak prawdziwe. Tylko zapis w konsoli.
      v.os.showNotification = (tytul, tresc) => {
        console.log('[powiadomienie testowe]', tytul, '-', tresc);
        return Promise.resolve();
      };
      for (const [klucz, f] of Object.entries(v.filesystem)) {
        if (typeof f !== 'function') continue;
        v.filesystem[klucz] = (...a) => (!folder || a.some((x) => typeof x === 'string' && /roaming/i.test(x))
          ? Promise.reject(new Error('zablokowane: prawdziwe dane'))
          : f(...a));
      }
    },
  });
})();
(() => {
  // Tryb „bez internetu”: każde połączenie (kursy NBP) kończy się błędem sieci.
  const oryginalny = window.fetch.bind(window);
  window.fetch = (adres, opcje) => (window.__TRYB === 'bez-internetu'
    ? Promise.reject(new TypeError('Failed to fetch'))
    : oryginalny(adres, opcje));
})();
