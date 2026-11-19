// Demo data (invented) - dates are counted from today, so the fuse, ruler and alarms always look "current".
// Loaded before atrapa.js; atrapa.js puts these files into the in-memory file system.
// Based on the preview data (Podgląd/zrodla/przygotuj.mjs) - every feature of the app is visible.
(() => {
  const p = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const dzis = new Date();
  const dzien = (przesuniecie) => iso(new Date(dzis.getFullYear(), dzis.getMonth(), dzis.getDate() + przesuniecie));
  // Purchase date (offset from today) + 1 month - first due date of a monthly manual payment.
  const poMiesiacu = (od) => {
    const z = new Date(dzis.getFullYear(), dzis.getMonth(), dzis.getDate() + od);
    return iso(new Date(z.getFullYear(), z.getMonth() + 1, z.getDate()));
  };

  function wpis(id, od, doDnia, nazwa, opis, koszt, waluta, link, przedluzac, dodatki = {}) {
    const { prognoza, reczna, zaplacony, ...reszta } = dodatki;
    return {
      id, od: od === null ? '' : dzien(od), do: doDnia === null ? '' : dzien(doDnia), nazwa, opis, koszt, waluta, link, przedluzac,
      prognoza: prognoza ?? null, platnoscReczna: reczna ?? false, zaplaconyTermin: zaplacony ?? '', ...reszta,
    };
  }

  const WPISY = [
    wpis('d01', -19, 12, 'Netflix', 'plan Standard', 43, 'PLN', 'https://www.netflix.com/pl/', 'tak', { prognoza: 49, kategoria: 'rozrywka', ceny: [{ od: '', kwota: 37 }, { od: dzien(-200), kwota: 43 }] }),
    wpis('d02', -85, -54, 'Spotify', 'Premium Family - 4 osoby', 37.99, 'PLN', 'https://www.spotify.com/pl/premium/', 'tak', { kategoria: 'rozrywka', osob: 4, ktoOddaje: 'Ania, Tomek, Ola' }),
    wpis('d03', -17, 14, 'ChatGPT Plus', 'subskrypcja AI', 20, 'USD', 'https://chat.openai.com', 'tak', { prognoza: 20, kategoria: 'ai', firmowa: true }),
    wpis('d04', -28, 3, 'Próbny AI', 'anulować przed końcem testu!', 9.99, 'USD', 'https://example.com/konto', 'nie', { kategoria: 'ai' }),
    wpis('d05', -292, 73, 'Chmura 2 TB', 'promocja na pierwszy rok', 399, 'PLN', '', 'nie', { kategoria: 'praca' }),
    wpis('d06', -58, -28, 'Stara próbna', 'test edytora wideo', 15, 'PLN', '', 'nie', { kategoria: 'praca' }),
    wpis('d07', -318, 47, 'Domena .com', 'rejestrator zagraniczny', 12.99, 'EUR', 'https://www.namecheap.com', 'tak', { kategoria: 'praca', firmowa: true }),
    wpis('d08', -343, 22, 'Antywirus', 'licencja na 3 urządzenia', 149, 'PLN', 'https://www.eset.com/pl/', 'tak', { kategoria: 'dom' }),
    wpis('d09', -242, 123, 'Hosting VPS', 'serwer dla bloga', 300, 'PLN', 'hosting.pl', 'tak', { kategoria: 'praca', firmowa: true }),
    wpis('d10', -340, 25, 'Pakiet graficzny', 'licencja roczna', 120, 'PLN', 'https://example.com/licencja', 'tak', { kategoria: 'praca', firmowa: true }),
    wpis('d11', -23, 7, 'YouTube Premium', 'okres próbny', 25.99, 'PLN', 'https://www.youtube.com/premium', 'nie', { kategoria: 'rozrywka' }),
    wpis('d12', -12, 19, 'Siłownia', 'karnet open - koniec promocji', 89, 'PLN', '', 'tak', { prognoza: 159, kategoria: 'zdrowie' }),
    wpis('d13', -5, 26, 'Gazeta online', 'link wklejony z błędem', 19.9, 'PLN', 'javascript:alert(1)', '', { kategoria: 'nauka' }),
    wpis('d14', null, null, 'Bez dat', 'uzupełnij datę zakupu', 10, 'PLN', '', ''),
    wpis('d15', -34, -3, 'Energia elektryczna', 'płacę przelewem, kwota co miesiąc inna', 186.4, 'PLN', '', 'tak', { reczna: true, zmiennaKwota: true, kategoria: 'dom' }),
    wpis('d16', -29, 2, 'Internet domowy', 'faktura co miesiąc', 69, 'PLN', '', 'tak', { reczna: true, prognoza: 79, kategoria: 'dom' }),
    // Paid in advance (the due date in 5 days is ticked) - green "opłacone" instead of the day count.
    wpis('d17', -26, 5, 'Czynsz', 'przelew do spółdzielni', 640, 'PLN', '', 'tak', { reczna: true, zaplacony: poMiesiacu(-26), kategoria: 'dom' }),
    // Due at the end of the month, more than a week away - the "zapłacone" box is already there, greyed out.
    wpis('d23', -10, null, 'Gaz', 'rachunek przychodzi w różne dni', 132.5, 'PLN', '', 'tak', { reczna: true, koniecMiesiaca: true, kategoria: 'dom' }),
    wpis('d18', -3, 4, 'Lekcje gitary', 'co tydzień, płatne z góry', 60, 'PLN', '', 'tak', { okres: 'T', coIle: 1, kategoria: 'nauka' }),
    wpis('d19', -61, 31, 'Ubezpieczenie auta', 'rata co kwartał', 210, 'PLN', '', 'tak', { okres: 'M', coIle: 3, kategoria: 'dom' }),
    wpis('d20', -70, null, 'Basen', 'karnet - przerwa wakacyjna', 120, 'PLN', '', 'tak', { kategoria: 'zdrowie', wstrzymanaOd: dzien(-10), wstrzymanaDo: dzien(40) }),
    wpis('d21', -150, -120, 'Disney+', 'anulowany po serialu', 37.99, 'PLN', '', 'tak', { kategoria: 'rozrywka', anulowano: dzien(-14) }),
    wpis('d22', -200, -170, 'Audiobooki', 'za mało czasu na słuchanie', 39.9, 'PLN', '', 'tak', { kategoria: 'nauka', anulowano: dzien(-40) }),
  ];

  const WSZYSTKIE = ['platnosc', 'weekend', 'kwotaZmienna', 'okresy', 'nastepna', 'dzielenie', 'pauza', 'waluty', 'historia', 'archiwum', 'kategorie', 'firma'];

  // Bank statement in mBank layout - for "Import z wyciągu bankowego" (recurring payments to the same payees).
  function wyciag() {
    const linie = ['mBank S.A. Bankowość Detaliczna;', 'Lista operacji;', '#Za okres:;' + dzien(-120) + ';' + dzien(-1) + ';', '', '#Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;'];
    const co = (nazwa, kwota, start, krok, ile) => {
      for (let i = 0; i < ile; i++) linie.push(`${dzien(start - i * krok)};"ZAKUP PRZY UŻYCIU KARTY ${nazwa}";"eKonto 1234";"Rozrywka";"-${kwota.toFixed(2).replace('.', ',')} PLN";`);
    };
    co('NETFLIX.COM', 43, -19, 30, 4);
    co('HBO MAX', 29.99, -8, 30, 4);
    co('DUOLINGO', 54.99, -15, 30, 4);
    co('TIDAL MUSIC', 26.99, -95, 30, 3);
    co('APPLE.COM/BILL ICLOUD', 12.99, -4, 30, 4);
    for (let i = 0; i < 4; i++) linie.push(`${dzien(-6 - i * 30)};"PRZELEW ZEWNĘTRZNY PGNIG OBRÓT";"eKonto 1234";"Rachunki";"-${(118.4 + i * 9.35).toFixed(2).replace('.', ',')} PLN";`);
    linie.push(`${dzien(-12)};"ZAKUP PRZY UŻYCIU KARTY BIEDRONKA";"eKonto 1234";"Jedzenie";"-87,12 PLN";`);
    linie.push(`${dzien(-33)};"ZAKUP PRZY UŻYCIU KARTY ORLEN";"eKonto 1234";"Paliwo";"-240,00 PLN";`);
    return linie.join('\r\n');
  }

  window.__demo = {
    pliki: () => ({
      'Mikroplatnosci/mikroplatnosci.json': JSON.stringify({ wersja: 3, zapisano: new Date().toISOString(), sort: { klucz: 'termin', kierunek: 1 }, motyw: 'jasny', wpisy: WPISY, usuniete: [] }),
      'Mikroplatnosci/ustawienia.json': JSON.stringify({
        lokalnie: true, motyw: 'jasny', prowizja: 2, budzet: 1200, jezyk: 'pl', wprowadzenie: true, // dymki „pierwsze kroki” od razu
        funkcje: Object.fromEntries(WSZYSTKIE.map((k) => [k, true])),
        powiadomienia: { wycofaj: true, zaplac: true, drogie: true, podwyzka: true, progDrogich: 100 },
      }),
      // Fallback rates - the app downloads the current NBP table anyway (api.nbp.pl allows browser requests).
      'Mikroplatnosci/kursy.json': JSON.stringify({ USD: 3.95, EUR: 4.39, data: dzien(-1), pobrano: dzien(-1) }),
    }),
    wyciag,
  };
})();
