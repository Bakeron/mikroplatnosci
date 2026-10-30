// Skrypt startowy dla przeglądarki testowej (initScript): podstawia strony z cenami, żeby
// kolumna „Prognoza” pokazała wszystkie przypadki bez łączenia się z prawdziwymi sklepami.
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
  const oryginalny = window.fetch.bind(window);
  let u = '';
  // Jak prawdziwa odpowiedź: z adresem strony w Response.url.
  const html = (tresc) => {
    const odp = new Response('<!doctype html><html><body>' + tresc + '</body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    Object.defineProperty(odp, 'url', { value: u });
    return Promise.resolve(odp);
  };
  const brakSieci = () => Promise.reject(new TypeError('Failed to fetch'));
  window.fetch = (adres, opcje) => {
    u = String(adres);
    const offline = window.__TRYB === 'bez-internetu';
    if (u.includes('api.nbp.pl')) return offline ? brakSieci() : oryginalny(adres, opcje);
    if (u.includes('spotify.com')) {
      if (offline) return brakSieci();
      return html('<script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","price":"26.99","priceCurrency":"PLN"}}</script><h1>Premium Individual</h1>');
    }
    if (u.includes('eset.com')) {
      if (offline) return new Promise(() => {}); // wisi (sprawdzana ostatnia) - widać „sprawdzam stronę…”
      return html('<h2>Internet Security</h2><p>Cena: 139,00 zł / rok</p><p>Pakiet rodzinny 249,00 zł</p>');
    }
    if (u.includes('silownia-przyklad.pl')) return html('<h1>Zapisz się już dziś!</h1><p>Zadzwoń po ofertę.</p>');
    return oryginalny(adres, opcje);
  };
})();
