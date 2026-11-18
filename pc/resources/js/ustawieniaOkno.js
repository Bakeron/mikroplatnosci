// Okno „Ustawienia” (PC i telefon): wewnętrzna strona okładki zeszytu - co widać w zeszycie (funkcje.js),
// które powiadomienia przychodzą i czy także przy zamkniętej aplikacji (harmonogram.js, tylko PC).
// Czego urządzenie nie obsługuje, tego nie przekazuje - zdarzenie bez funkcji = brak tej części okna.
// Treść wstawiana przez textContent (element z dom.js) - bez innerHTML.

import { element, krzyzykOkna } from './dom.js';
import { FUNKCJE } from './funkcje.js';
import { formatujKoszt, parsujKoszt, KATEGORIE, kolejnoscKategorii, nazwaKategorii, oznaczKategorie, pobierzKategorie, wlaczKategorie, dodajKategorie, zmienNazweKategorii, MAKS_KATEGORII, MAKS_NAZWY_KATEGORII } from './dane.js';
import { t, tekst, JEZYKI } from './teksty.js';
import { WALUTY } from './waluty.js';

const RODZAJE = [
  ['wycofaj', tekst('Wycofaj'), tekst('Pozycje „nie przedłużać” - przed odnowieniem (rocznie: 3, 2, 1 miesiąc i 3, 2, 1 tydzień, miesięcznie: od 2 tygodni).')],
  ['zaplac', tekst('Zapłać'), tekst('„Płacę sam” - 7, 3 i 1 dzień przed „zapłać do”.')],
  ['drogie', tekst('Przygotuj pieniądze'), tekst('Tydzień przed płatnością, która pobiera się sama, gdy wynosi co najmniej:')],
  ['podwyzka', tekst('Podwyżka'), tekst('Przed płatnością, od której obowiązuje wyższa cena następna - „dalej chcesz?”.')],
];

// Na telefonie nie ma „⋯”, tabeli ani nagłówka z kursami - te opisy funkcji mówią o jego ekranie.
const OPISY_TELEFONU = {
  platnosc: tekst('Wybór „pobiera się sama / płacę sam” przy edycji pozycji. Wyłączone - wszystko liczone jak „pobiera się sama”.'),
  historia: tekst('Wykres i zmiany cen pod paragonem.'),
  archiwum: tekst('Wykreślone pozycje trafiają do „Anulowanych” pod listą (do przywrócenia), a paragon liczy, ile oszczędzasz. Wyłączone - wykreślenie usuwa na zawsze.'),
  kategorie: tekst('Kategoria przy edycji pozycji (rozrywka, praca, AI…), zakładki z filtrem nad listą i paragon z podziałem na kategorie.'),
  firma: tekst('Znacznik „na firmę” przy edycji pozycji, osobna suma kosztów firmowych na paragonie i „pobierz fakturę” po każdej płatności.'),
};

// Zakładka, na której okno zamknięto - przy następnym otwarciu (do zamknięcia aplikacji) wraca tam.
let otwartaZakladka = 'zeszyt';

// Wiersz: nazwa i opis po lewej, przełącznik tak / nie po prawej. Etykieta wskazuje przełącznik przez id -
// pole kwoty w opisie (próg „drogiej” płatności) nie przejmuje kliknięć w etykietę.
function wiersz(id, nazwa, opis, zaznaczone, onZmiana, klasa = '') {
  const pole = element('input', 'przelacznik przelacznik--zwykly');
  pole.type = 'checkbox';
  pole.id = 'ustawienia-' + id;
  pole.setAttribute('role', 'switch');
  pole.checked = zaznaczone;
  const label = element('label', 'ustawienia__wiersz' + (klasa ? ' ' + klasa : ''));
  label.htmlFor = pole.id;
  const teksty = element('span', 'ustawienia__teksty');
  const opisEl = element('span', 'ustawienia__opis', opis);
  teksty.append(element('span', 'ustawienia__nazwa', nazwa), opisEl);
  label.append(teksty, pole);
  pole.addEventListener('change', () => onZmiana(pole.checked, pole));
  return { label, pole, teksty, opisEl };
}

// Waluty do wyboru: zaznaczone w ustawieniach, złote zawsze, a waluty z pozycji nie do odznaczenia
// (stan.uzyteWaluty: kod -> w ilu pozycjach). Zmiana - naWaluty(lista kodów).
function wyborWalut(stan, naWaluty) {
  const wybrane = new Set(stan.waluty ?? ['PLN']);
  const uzyte = stan.uzyteWaluty ?? new Map();
  const blok = element('div', 'ustawienia__wiersz ustawienia__wiersz--waluty');
  blok.setAttribute('role', 'group');
  const nazwa = element('span', 'ustawienia__nazwa', t('Waluty'));
  nazwa.id = 'ustawienia-waluty';
  blok.setAttribute('aria-labelledby', nazwa.id);
  const teksty = element('span', 'ustawienia__teksty');
  teksty.append(nazwa, element('span', 'ustawienia__opis', stan.telefon
    ? t('Do wyboru przy kwocie - dla zaznaczonych kursy NBP i prowizja banku pod paragonem. Same złote - bez wyboru waluty.')
    : t('Do wyboru przy kwocie - dla zaznaczonych kursy NBP i prowizja banku w nagłówku. Same złote - bez wyboru waluty.')));
  const lista = element('div', 'ustawienia__waluty');
  for (const kod of WALUTY) {
    const ile = uzyte.get(kod) || 0;
    const pole = element('input');
    pole.type = 'checkbox';
    pole.checked = kod === 'PLN' || wybrane.has(kod) || ile > 0;
    // Zaznaczona na stałe: aria-disabled zamiast disabled - przygaszona kratka była w jasnym motywie prawie niewidoczna.
    const stala = kod === 'PLN' || ile > 0;
    if (stala) {
      pole.setAttribute('aria-disabled', 'true');
      pole.addEventListener('click', (e) => e.preventDefault());
    }
    const etykieta = element('label', 'ustawienia__waluta');
    etykieta.append(pole, element('span', 'ustawienia__kod', kod === 'PLN' ? t('zł') : kod));
    if (ile) {
      etykieta.append(element('span', 'ustawienia__uzyta', t('w użyciu: {n}', { n: ile })));
      etykieta.title = t('Pozycji w tej walucie: {n} - nie da się jej wyłączyć, dopóki jej używają.', { n: ile });
    }
    if (!stala) pole.addEventListener('change', () => {
      if (pole.checked) wybrane.add(kod);
      else wybrane.delete(kod);
      naWaluty([...wybrane]);
    });
    lista.append(etykieta);
  }
  blok.append(teksty, lista);
  return blok;
}

// Kategorie do wyboru (autor 18.11.2026): gotowe propozycje do odznaczenia i własne - do dopisania, zmiany nazwy
// (pozycje zostają przy niej) i odznaczenia. Lista jest w pliku danych (dane.js) - wspólna z drugim urządzeniem.
// Kategorii z pozycji nie da się odznaczyć (stan.uzyteKategorie: klucz -> w ilu pozycjach); odznaczona własna
// znika z listy przy następnym otwarciu okna. Po każdej zmianie - naKategorie() (zapis i odświeżenie).
function wyborKategorii(stan, naKategorie) {
  const uzyte = stan.uzyteKategorie ?? new Map();
  const wlaczona = (klucz) => pobierzKategorie().some((r) => r.klucz === klucz && r.wl);
  const pokazane = kolejnoscKategorii([...KATEGORIE.map(([k]) => k), ...pobierzKategorie().filter((r) => r.wl).map((r) => r.klucz), ...uzyte.keys()]);
  const blok = element('div', 'ustawienia__wiersz ustawienia__wiersz--waluty ustawienia__wiersz--kategorie');
  blok.setAttribute('role', 'group');
  const nazwa = element('span', 'ustawienia__nazwa', t('Kategorie do wyboru'));
  nazwa.id = 'ustawienia-kategorie';
  blok.setAttribute('aria-labelledby', nazwa.id);
  const teksty = element('span', 'ustawienia__teksty');
  teksty.append(nazwa, element('span', 'ustawienia__opis', stan.telefon
    ? t('Gotowe propozycje i własne - zaznaczone są do wyboru przy edycji pozycji. Nazwę własnej zmienisz, dotykając jej. Lista jest wspólna z komputerem (przez Google Dysk).')
    : t('Gotowe propozycje i własne - zaznaczone są do wyboru w „⋯” przy pozycji. Nazwę własnej zmienisz, klikając w nią. Lista jest wspólna z telefonem (przez Google Dysk).')));
  const lista = element('div', 'ustawienia__waluty');
  const komunikat = element('p', 'ustawienia__stan ustawienia__stan--blad');
  komunikat.setAttribute('aria-live', 'polite');
  const kratki = new Map(); // klucz -> pole wyboru
  function dodajKratke(klucz) {
    const ile = uzyte.get(klucz) || 0;
    const wlasna = !KATEGORIE.some(([k]) => k === klucz);
    const pole = element('input');
    pole.type = 'checkbox';
    pole.checked = wlaczona(klucz) || ile > 0;
    kratki.set(klucz, pole);
    if (ile) {
      pole.setAttribute('aria-disabled', 'true');
      pole.addEventListener('click', (e) => e.preventDefault());
    } else pole.addEventListener('change', () => {
      wlaczKategorie(klucz, pole.checked);
      naKategorie();
    });
    // Własna: nazwa w polu do poprawienia - etykieta (label) przejmowałaby kliknięcia w pole, więc zwykły element.
    const etykieta = element(wlasna ? 'span' : 'label', 'ustawienia__waluta ustawienia__kategoria');
    oznaczKategorie(etykieta, klucz);
    if (wlasna) {
      const nazwaPole = element('input', 'pole ustawienia__nazwa-kategorii');
      nazwaPole.type = 'text';
      nazwaPole.maxLength = MAKS_NAZWY_KATEGORII;
      nazwaPole.value = nazwaKategorii(klucz);
      nazwaPole.autocomplete = 'off';
      nazwaPole.spellcheck = false;
      const opisz = () => {
        nazwaPole.setAttribute('aria-label', t('Nazwa kategorii {nazwa}', { nazwa: nazwaKategorii(klucz) }));
        pole.setAttribute('aria-label', nazwaKategorii(klucz));
      };
      opisz();
      nazwaPole.addEventListener('change', () => {
        komunikat.textContent = '';
        if (zmienNazweKategorii(klucz, nazwaPole.value)) {
          opisz();
          naKategorie();
        } else komunikat.textContent = t('„{nazwa}” - taka kategoria już jest albo nazwa jest pusta.', { nazwa: nazwaPole.value.trim() });
        nazwaPole.value = nazwaKategorii(klucz);
      });
      etykieta.append(pole, nazwaPole);
    } else etykieta.append(pole, element('span', 'ustawienia__kod', nazwaKategorii(klucz)));
    if (ile) {
      etykieta.append(element('span', 'ustawienia__uzyta', t('w użyciu: {n}', { n: ile })));
      etykieta.title = t('Pozycji w tej kategorii: {n} - nie da się jej wyłączyć, dopóki jej używają.', { n: ile });
    }
    lista.append(etykieta);
  }
  for (const klucz of pokazane) dodajKratke(klucz);

  // Dopisanie własnej: nazwa gotowej (np. „praca”) albo już dopisanej - ta kategoria wraca na listę wyboru.
  const dopisz = element('form', 'ustawienia__dopisz');
  const pole = element('input', 'pole pole--male ustawienia__nowa-kategoria');
  pole.type = 'text';
  pole.maxLength = MAKS_NAZWY_KATEGORII;
  pole.placeholder = t('własna kategoria');
  pole.setAttribute('aria-label', t('Nazwa własnej kategorii'));
  pole.autocomplete = 'off';
  const dodaj = element('button', 'przycisk-tekst', t('+ dodaj'));
  dodaj.type = 'submit';
  dopisz.append(pole, dodaj);
  dopisz.addEventListener('submit', (e) => {
    e.preventDefault();
    komunikat.textContent = '';
    if (!pole.value.trim()) return;
    const klucz = dodajKategorie(pole.value);
    if (!klucz) {
      komunikat.textContent = t('Najwyżej {n} kategorii.', { n: MAKS_KATEGORII });
      return;
    }
    if (kratki.has(klucz)) kratki.get(klucz).checked = true;
    else dodajKratke(klucz);
    pole.value = '';
    naKategorie();
  });
  blok.append(teksty, lista, dopisz, komunikat);
  return blok;
}

// stan: { telefon, funkcje, powiadomienia, wTle, zasobnik, jezyk, budzet, waluty, uzyteWaluty, uzyteKategorie }; zdarzenia: naFunkcje(funkcje), naWaluty(lista), naKategorie(), naJezyk(kod), naBudzet(kwota),
// naPowiadomienia(p) (może zwrócić Promise<false>: urządzenie nie pozwala na powiadomienia),
// naWprowadzenie(), naWTle(wlacz) -> Promise<string> (pusty tekst = udało się, inaczej opis błędu),
// sprawdzWTle() -> Promise<boolean|null>, naUstawieniaTelefonu() - telefon: strona aplikacji w ustawieniach Androida.
// PC: czesci [{ klucz, nazwa, element }] - dalsze zakładki z gotowych części strony (synchronizacja, kopia),
// dolCzesc - element do dolnego wiersza („o aplikacji”), schowek - tam części wracają po zamknięciu okna
// (razem ze zdarzeniami), naZamkniecie(). Bez czesci (telefon) - dwie kolumny jak dotąd.
export function pokazUstawienia(stan, { naFunkcje, naWaluty, naKategorie, naPowiadomienia, naJezyk, naBudzet, naWprowadzenie, naWTle, sprawdzWTle, naZasobnik, naAutostart, sprawdzAutostart, naUstawieniaTelefonu, czesci, dolCzesc, schowek, naZamkniecie }) {
  // Stare okno (np. zmiana języka): sprzątanie jak przy zamknięciu (kod QR, nasłuchy), części przejdą niżej do nowego okna.
  const stare = document.getElementById('okno-ustawienia');
  if (stare) {
    stare.dispatchEvent(new Event('close'));
    stare.remove();
  }
  const okno = element('dialog', 'okno okno--szersze okno--ustawienia' + (czesci ? ' okno--zakladki' : ''));
  okno.id = 'okno-ustawienia';
  // Kliknięcie w tło obok okna zamyka je (jak Esc) - dopiero 0,3 s po otwarciu: drugie kliknięcie
  // szybkiego podwójnego kliknięcia w zębatkę trafiało w tło i od razu zamykało okno.
  okno.setAttribute('closedby', 'closerequest');
  okno.setAttribute('aria-labelledby', 'ustawienia-tytul');
  const tytul = element('h2', 'okno__tytul', t('Ustawienia'));
  tytul.id = 'ustawienia-tytul';
  const uwaga = element('p', 'okno__uwaga', stan.telefon
    ? t('Tylko na tym telefonie. Wyłączona funkcja znika z ekranu, a to, co już wpisane, zostaje w pliku - po ponownym włączeniu wraca.')
    : t('Tylko na tym komputerze. Wyłączona funkcja znika z ekranu, a to, co już wpisane, zostaje w pliku - po ponownym włączeniu wraca.'));
  okno.append(tytul);
  if (!czesci) okno.append(uwaga);

  // --- co widać w zeszycie ---
  const funkcje = { ...stan.funkcje };
  const sekcjaFunkcji = element('section', 'ustawienia__sekcja');
  sekcjaFunkcji.append(element('h3', 'ustawienia__naglowek', t('Co widać w zeszycie')));
  const zalezne = [];
  let blokKategorii = null; // lista kategorii - tylko przy włączonych „Kategoriach i filtrze”
  for (const [klucz, nazwa, opis, zalezy] of FUNKCJE) {
    const w = wiersz(klucz, t(nazwa), t((stan.telefon && OPISY_TELEFONU[klucz]) || opis), funkcje[klucz] !== false, (wlacz) => {
      funkcje[klucz] = wlacz;
      odswiezZalezne();
      naFunkcje({ ...funkcje });
    }, zalezy ? 'ustawienia__wiersz--zalezny' : '');
    if (zalezy) zalezne.push([zalezy, w.pole, w.label]);
    sekcjaFunkcji.append(w.label);
    if (klucz === 'pauza' && naWaluty) sekcjaFunkcji.append(wyborWalut(stan, naWaluty)); // tam, gdzie był przełącznik „Waluty obce”
    if (klucz === 'kategorie' && naKategorie) sekcjaFunkcji.append(blokKategorii = wyborKategorii(stan, naKategorie));
  }
  // Funkcja zależna (np. „Weekend i święta”) bez tej, od której zależy, nic nie robi - przygaszona.
  function odswiezZalezne() {
    for (const [zalezy, pole, label] of zalezne) {
      pole.disabled = funkcje[zalezy] === false;
      label.classList.toggle('ustawienia__wiersz--wylaczony', pole.disabled);
    }
    if (blokKategorii) blokKategorii.hidden = funkcje.kategorie === false;
  }
  odswiezZalezne();

  // D19: budżet miesięczny - pusty = bez limitu; ostrzeżenie na paragonie.
  let budzetTeraz = stan.budzet || 0;
  const budzet = element('label', 'ustawienia__wiersz ustawienia__wiersz--budzet');
  const budzetPole = element('input', 'pole pole--male ustawienia__prog');
  budzetPole.type = 'text';
  budzetPole.inputMode = 'decimal';
  budzetPole.placeholder = t('brak');
  budzetPole.setAttribute('aria-label', t('Budżet miesięczny w złotych'));
  const pokazBudzet = () => { budzetPole.value = budzetTeraz ? formatujKoszt(budzetTeraz) : ''; };
  pokazBudzet();
  budzetPole.addEventListener('change', () => {
    const kwota = parsujKoszt(budzetPole.value);
    if (kwota !== undefined) {
      budzetTeraz = Math.min(kwota ?? 0, 10000000);
      naBudzet(budzetTeraz);
    }
    pokazBudzet();
  });
  const budzetTeksty = element('span', 'ustawienia__teksty');
  budzetTeksty.append(element('span', 'ustawienia__nazwa', t('Budżet miesięczny')), element('span', 'ustawienia__opis', t('Własny limit. Gdy RAZEM / MIESIĄC albo PROGNOZA go przekracza - ostrzeżenie na paragonie. Puste = bez limitu.')));
  const budzetKwota = element('span', 'ustawienia__kwota');
  budzetKwota.append(budzetPole, ' ' + t('zł'));
  budzet.append(budzetTeksty, budzetKwota);
  if (naBudzet) sekcjaFunkcji.append(budzet);

  // --- powiadomienia ---
  const powiadomienia = { ...stan.powiadomienia };
  const sekcjaPowiadomien = element('section', 'ustawienia__sekcja');
  sekcjaPowiadomien.append(element('h3', 'ustawienia__naglowek', stan.telefon ? t('Powiadomienia') : t('Powiadomienia Windows')));
  const stanPowiadomien = element('p', 'ustawienia__stan ustawienia__stan--blad');
  stanPowiadomien.setAttribute('aria-live', 'polite');
  // Przełącznik bez zgody Androida nic by nie dał - lepiej to powiedzieć niż milczeć. Obok przycisk
  // do strony aplikacji w ustawieniach telefonu; po powrocie do aplikacji zgoda sprawdzana jeszcze raz.
  const doUstawienTelefonu = element('button', 'przycisk-tekst ustawienia__do-telefonu', t('Otwórz ustawienia telefonu'));
  doUstawienTelefonu.type = 'button';
  doUstawienTelefonu.hidden = true;
  doUstawienTelefonu.addEventListener('click', () => naUstawieniaTelefonu());
  async function zmienPowiadomienia() {
    const wolno = await naPowiadomienia({ ...powiadomienia });
    stanPowiadomien.textContent = wolno === false ? t('Android nie pozwala tej aplikacji na powiadomienia - włącz je w ustawieniach telefonu.') : '';
    doUstawienTelefonu.hidden = wolno !== false || !naUstawieniaTelefonu;
  }
  const poPowrocie = () => {
    if (document.visibilityState === 'visible' && stanPowiadomien.textContent) zmienPowiadomienia();
  };
  for (const [klucz, nazwa, opis] of RODZAJE) {
    const w = wiersz('p-' + klucz, t(nazwa), t(opis), powiadomienia[klucz] === true, (wlacz) => {
      powiadomienia[klucz] = wlacz;
      zmienPowiadomienia();
    });
    if (klucz === 'drogie') {
      // Próg „drogiej” płatności w złotych (waluta obca po kursie NBP).
      const prog = element('input', 'pole pole--male ustawienia__prog');
      prog.type = 'text';
      prog.inputMode = 'decimal';
      prog.value = formatujKoszt(powiadomienia.progDrogich);
      prog.setAttribute('aria-label', t('Przygotuj pieniądze - od kwoty w złotych'));
      prog.addEventListener('change', () => {
        const kwota = parsujKoszt(prog.value);
        if (typeof kwota === 'number') {
          powiadomienia.progDrogich = Math.min(kwota, 1000000);
          zmienPowiadomienia();
        }
        prog.value = formatujKoszt(powiadomienia.progDrogich);
      });
      const kwota = element('span', 'ustawienia__kwota');
      kwota.append(prog, ' ' + t('zł'));
      w.opisEl.append(' ', kwota);
    }
    sekcjaPowiadomien.append(w.label);
  }

  // Zasobnik (PC, zasobnik.js): krzyżyk chowa okno, aplikacja czuwa przy zegarze i dalej pokazuje powiadomienia.
  // Start z Windows (zadanie w Harmonogramie zadań) - schowany w zasobniku, więc idzie w parze z zasobnikiem:
  // włączenie startu włącza zasobnik, wyłączenie zasobnika wyłącza start.
  if (naZasobnik) {
    const zasobnik = wiersz('zasobnik', t('Krzyżyk chowa do zasobnika'), t('Zamknięte okno zostaje ikoną w zasobniku przy zegarze (na dole po prawej, czasem pod strzałką ^) i dalej pokazuje powiadomienia. Całkiem zamkniesz aplikację, klikając ikonę → „Zamknij”. Wyłączone - krzyżyk zamyka aplikację.'), stan.zasobnik === true, async (wlacz) => {
      const blad = await naZasobnik(wlacz);
      if (!wlacz && start.pole.checked) {
        start.pole.checked = !!blad;
        startStan.textContent = blad || t('start z Windows wyłączony razem z zasobnikiem');
        startStan.classList.toggle('ustawienia__stan--blad', !!blad);
      }
    });
    const start = wiersz('autostart', t('Uruchamiaj z Windows'), t('Po zalogowaniu do Windows aplikacja startuje sama, schowana w zasobniku przy zegarze, i przez cały dzień pilnuje powiadomień. Włącza też „Krzyżyk chowa do zasobnika”. Wyłączenie usuwa zadanie z Windows.'), false, async (wlacz, pole) => {
      pole.disabled = true;
      startStan.textContent = wlacz ? t('dodaję zadanie…') : t('usuwam zadanie…');
      startStan.classList.remove('ustawienia__stan--blad');
      const blad = await naAutostart(wlacz);
      if (blad) pole.checked = !wlacz;
      else if (wlacz) zasobnik.pole.checked = true;
      startStan.textContent = blad || (pole.checked ? t('zadanie w Harmonogramie zadań: „Mikroplatnosci - start z Windows”') : t('zadanie usunięte'));
      startStan.classList.toggle('ustawienia__stan--blad', !!blad);
      pole.disabled = false;
    });
    const startStan = element('p', 'ustawienia__stan');
    startStan.setAttribute('aria-live', 'polite');
    sekcjaPowiadomien.append(zasobnik.label, start.label, startStan);
    // Stan zadania w Windows (np. usunięte ręcznie) - przełącznik pokazuje prawdę.
    sprawdzAutostart().then((jest) => {
      if (jest !== null) start.pole.checked = jest;
    }).catch(console.error);
  }

  // B10: także przy zamkniętej aplikacji - zadanie w Harmonogramie zadań Windows. Telefon planuje z wyprzedzeniem - tam tylko komunikat o zgodzie Androida.
  if (!naWTle) sekcjaPowiadomien.append(stanPowiadomien, doUstawienTelefonu);
  else {
    const tlo = wiersz('tlo', t('Także przy zamkniętej aplikacji'), t('Codziennie o 9:00 (albo zaraz po włączeniu komputera, jeśli był wyłączony) Harmonogram zadań Windows uruchamia aplikację bez okna. Pokazuje zaległe powiadomienia i sama się zamyka. Wyłączenie usuwa zadanie z Windows.'), stan.wTle === true, async (wlacz, pole) => {
      pole.disabled = true;
      tloStan.textContent = wlacz ? t('dodaję zadanie…') : t('usuwam zadanie…');
      tloStan.classList.remove('ustawienia__stan--blad');
      const blad = await naWTle(wlacz);
      if (blad) pole.checked = !wlacz;
      tloStan.textContent = blad || (pole.checked ? t('zadanie w Harmonogramie zadań: „Mikroplatnosci - powiadomienia”') : t('zadanie usunięte'));
      tloStan.classList.toggle('ustawienia__stan--blad', !!blad);
      pole.disabled = false;
    }, 'ustawienia__wiersz--tlo');
    const tloStan = element('p', 'ustawienia__stan');
    tloStan.setAttribute('aria-live', 'polite');
    sekcjaPowiadomien.append(tlo.label, tloStan);
    // Stan zadania w Windows (np. usunięte ręcznie albo przy odinstalowaniu) - przełącznik pokazuje prawdę.
    sprawdzWTle().then((jest) => {
      if (jest !== null) tlo.pole.checked = jest;
    }).catch(console.error);
  }

  if (czesci) {
    // PC: zakładki jak przekładki w segregatorze (ten sam wygląd co zakładki kategorii nad tabelą),
    // pod nimi treść jednej części. Uwaga „tylko na tym komputerze” dotyczy zeszytu - stoi w jego zakładce.
    sekcjaFunkcji.firstChild.after(uwaga);
    const zakladki = [
      { klucz: 'zeszyt', nazwa: t('Zeszyt'), element: sekcjaFunkcji },
      { klucz: 'powiadomienia', nazwa: t('Powiadomienia'), element: sekcjaPowiadomien },
      ...czesci,
    ];
    if (!zakladki.some((z) => z.klucz === otwartaZakladka)) otwartaZakladka = 'zeszyt';
    const pasek = element('nav', 'zakladki ustawienia__zakladki');
    pasek.setAttribute('aria-label', t('Części ustawień'));
    const panele = element('div', 'ustawienia__panele');
    const przyciskiZakladek = zakladki.map((z) => {
      const b = element('button', 'zakladka', z.nazwa);
      b.type = 'button';
      b.addEventListener('click', () => { if (z.klucz !== otwartaZakladka) wybierz(z.klucz, true); }); // otwarta - nic
      return b;
    });
    // Zmiana zakładki bez skoku i bez prześwitu, ściśle po kolei: stara treść gaśnie (wysokość stoi), potem
    // (PC) okno płynnie zmienia wysokość, gdy nic nie widać, i dopiero wtedy pojawia się nowa treść - razem
    // ok. 0,35 s. Telefon: okno ma stałą wysokość, więc bez zmiany wysokości, a dolny wiersz (język, „Zamknij”)
    // gaśnie i wraca razem z treścią - nie podjeżdża przez puste miejsce. Bez animacji przy otwarciu okna
    // i przy „ogranicz ruch” w systemie.
    let animacje = [];
    function wybierz(klucz, animuj = false) {
      const widoczny = zakladki.find((z) => !z.element.hidden && panele.contains(z.element))?.element;
      const nowy = zakladki.find((z) => z.klucz === klucz).element;
      const ruch = animuj && widoczny && widoczny !== nowy && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      const dol = stan.telefon ? okno.querySelector('.okno__przyciski') : null;
      // Szybkie klikanie: start od tego, co widać teraz (wysokość i przezroczystość w środku poprzedniej zmiany).
      const wysokoscPrzed = ruch ? panele.offsetHeight : 0;
      const jasnosc = ruch ? getComputedStyle(widoczny).opacity : '1';
      const jasnoscDolu = ruch && dol ? getComputedStyle(dol).opacity : '1';
      for (const a of animacje) a.cancel();
      animacje = [];
      otwartaZakladka = klucz;
      przyciskiZakladek.forEach((b, i) => b.setAttribute('aria-pressed', String(zakladki[i].klucz === klucz)));
      przyciskiZakladek[zakladki.findIndex((z) => z.klucz === klucz)].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const pokazNowa = () => zakladki.forEach((z) => { z.element.hidden = z.element !== nowy; });
      if (!ruch) {
        pokazNowa();
        return;
      }
      const zgas = { duration: 100, easing: 'ease-in', fill: 'forwards' };
      const gasnie = widoczny.animate([{ opacity: jasnosc }, { opacity: 0 }], zgas);
      const gasnieDol = dol?.animate([{ opacity: jasnoscDolu }, { opacity: 0 }], zgas);
      gasnie.addEventListener('finish', () => {
        gasnie.cancel();
        pokazNowa();
        // Nowa część od początku - tytuł i zakładki i tak stoją na górze okna.
        const tresc = panele.closest('.okno__tresc');
        if (tresc) tresc.scrollTop = 0;
        const wysokoscPo = panele.offsetHeight;
        // Najpierw wysokość (nowa treść jeszcze niewidoczna), potem pojawienie - jedna oś czasu, dwie części.
        const czasWysokosci = !dol && Math.abs(wysokoscPo - wysokoscPrzed) > 2 ? 130 : 0;
        const czasPojawienia = 140;
        const granica = czasWysokosci / (czasWysokosci + czasPojawienia);
        const czas = { duration: czasWysokosci + czasPojawienia };
        const pojaw = [{ opacity: 0 }, { opacity: 0, offset: granica, easing: 'ease-out' }, { opacity: 1 }];
        animacje = [nowy.animate(pojaw, czas)];
        if (dol) {
          gasnieDol.cancel();
          animacje.push(dol.animate(pojaw, czas));
        }
        if (czasWysokosci) {
          // W trakcie treść przycięta do rosnącej / malejącej wysokości (nie wchodzi na dolny wiersz okna).
          panele.style.overflow = 'hidden';
          const wysokosc = panele.animate([
            { height: wysokoscPrzed + 'px', easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
            { height: wysokoscPo + 'px', offset: granica },
            { height: wysokoscPo + 'px' },
          ], czas);
          const odslon = () => { panele.style.overflow = ''; };
          wysokosc.addEventListener('finish', odslon);
          wysokosc.addEventListener('cancel', odslon);
          animacje.push(wysokosc);
        }
      });
      animacje = [gasnie, ...(gasnieDol ? [gasnieDol] : [])];
    }
    pasek.append(...przyciskiZakladek);
    panele.append(...zakladki.map((z) => z.element));
    wybierz(otwartaZakladka);
    // Tytuł i zakładki stoją na górze okna (razem z „×”), a przewija się tylko treść części.
    const gora = element('div', 'ustawienia__gora');
    gora.append(tytul, pasek);
    okno.append(gora, panele);
  } else {
    const kolumny = element('div', 'ustawienia__kolumny');
    kolumny.append(sekcjaFunkcji, sekcjaPowiadomien);
    okno.append(kolumny);
  }

  // F27: język - nazwy języków zawsze w ich własnym języku („English”, „Polski”).
  const jezykPole = element('label', 'ustawienia__jezyk');
  const jezykWybor = element('select', 'pole pole--wybor');
  jezykWybor.append(...JEZYKI.map(([kod, nazwa]) => new Option(nazwa, kod)));
  jezykWybor.value = stan.jezyk;
  jezykWybor.addEventListener('change', () => naJezyk(jezykWybor.value));
  jezykPole.append(element('span', 'ustawienia__nazwa', t('Język') + (stan.jezyk === 'en' ? '' : ' / Language')), jezykWybor);

  const przyciski = element('div', 'okno__przyciski');
  // F25: notatki „pierwsze kroki” jeszcze raz - np. gdy z aplikacji ma korzystać ktoś nowy.
  const wprowadzenie = element('button', 'przycisk-tekst', t('Pokaż pierwsze kroki'));
  wprowadzenie.type = 'button';
  // Po kolei, nie skokiem: najpierw okno płynnie gaśnie razem z przyciemnieniem, dopiero potem notatki
  // wysuwają się z góry (naWprowadzenie). Przy „ogranicz ruch” w systemie - od razu.
  let gasnieOkno = false;
  wprowadzenie.addEventListener('click', () => {
    if (gasnieOkno) return; // drugie kliknięcie w trakcie gaśnięcia
    const pokaz = () => {
      okno.close();
      naWprowadzenie();
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return pokaz();
    gasnieOkno = true;
    const czas = { duration: 150, easing: 'ease-in', fill: 'forwards' };
    okno.animate([{ opacity: getComputedStyle(okno).opacity }, { opacity: 0 }], czas);
    okno.animate([{ opacity: 1 }, { opacity: 0 }], { ...czas, pseudoElement: '::backdrop' })
      .finished.then(() => { if (okno.open) pokaz(); }, () => {}); // Esc w trakcie - okno już zamknięte, bez notatek
  });
  if (naJezyk) przyciski.append(jezykPole);
  if (dolCzesc) przyciski.append(dolCzesc);
  if (naWprowadzenie) przyciski.append(wprowadzenie);
  const zamknij = element('button', 'przycisk-tekst', t('Zamknij'));
  zamknij.type = 'button';
  zamknij.addEventListener('click', () => okno.close());
  przyciski.append(zamknij);
  okno.append(przyciski);
  krzyzykOkna(okno, t('Zamknij')); // widoczne także po przewinięciu okna (obok „Zamknij” na dole)
  document.addEventListener('visibilitychange', poPowrocie);
  okno.addEventListener('close', () => {
    document.removeEventListener('visibilitychange', poPowrocie);
    naZamkniecie?.();
    setTimeout(() => {
      // Części strony wracają do schowka, chyba że już są w nowym oknie (szybkie ponowne otwarcie).
      for (const el of [...(czesci || []).map((c) => c.element), dolCzesc]) if (el && okno.contains(el)) schowek.append(el);
      okno.remove();
    }, 200); // po animacji zamykania (wyglad.css)
  });
  document.body.append(okno);
  okno.showModal();
  setTimeout(() => okno.setAttribute('closedby', 'any'), 300);
  okno.querySelector('.ustawienia__zakladki [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // telefon: pasek przewijany w bok
}
