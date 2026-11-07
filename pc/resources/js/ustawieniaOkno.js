// Okno „Ustawienia” (PC i telefon): wewnętrzna strona okładki zeszytu - co widać w zeszycie (funkcje.js),
// które powiadomienia przychodzą i czy także przy zamkniętej aplikacji (harmonogram.js, tylko PC).
// Czego urządzenie nie obsługuje, tego nie przekazuje - zdarzenie bez funkcji = brak tej części okna.
// Treść wstawiana przez textContent (element z dom.js) - bez innerHTML.

import { element, krzyzykOkna } from './dom.js';
import { FUNKCJE } from './funkcje.js';
import { formatujKoszt, parsujKoszt } from './dane.js';
import { t, tekst, JEZYKI } from './teksty.js';

const RODZAJE = [
  ['wycofaj', tekst('Wycofaj'), tekst('Pozycje „nie przedłużać” - przed odnowieniem (rocznie: 3, 2, 1 miesiąc i 3, 2, 1 tydzień, miesięcznie: od 2 tygodni).')],
  ['zaplac', tekst('Zapłać'), tekst('„Płacę sam” - 7, 3 i 1 dzień przed „zapłać do”.')],
  ['drogie', tekst('Przygotuj pieniądze'), tekst('Tydzień przed płatnością, która pobiera się sama, gdy wynosi co najmniej:')],
  ['podwyzka', tekst('Podwyżka'), tekst('Przed płatnością, od której obowiązuje wyższa cena następna - „dalej chcesz?”.')],
];

// Na telefonie nie ma „⋯”, tabeli ani nagłówka z kursami - te opisy funkcji mówią o jego ekranie.
const OPISY_TELEFONU = {
  platnosc: tekst('Wybór „pobiera się sama / płacę sam” przy edycji pozycji. Wyłączone - wszystko liczone jak „pobiera się sama”.'),
  waluty: tekst('Waluta przy kwocie, kursy NBP i prowizja banku pod paragonem.'),
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

// stan: { telefon, funkcje, powiadomienia, wTle, jezyk, budzet }; zdarzenia: naFunkcje(funkcje), naJezyk(kod), naBudzet(kwota),
// naPowiadomienia(p) (może zwrócić Promise<false>: urządzenie nie pozwala na powiadomienia),
// naWprowadzenie(), naWTle(wlacz) -> Promise<string> (pusty tekst = udało się, inaczej opis błędu),
// sprawdzWTle() -> Promise<boolean|null>, naUstawieniaTelefonu() - telefon: strona aplikacji w ustawieniach Androida.
// PC: czesci [{ klucz, nazwa, element }] - dalsze zakładki z gotowych części strony (synchronizacja, kopia),
// dolCzesc - element do dolnego wiersza („o aplikacji”), schowek - tam części wracają po zamknięciu okna
// (razem ze zdarzeniami), naZamkniecie(). Bez czesci (telefon) - dwie kolumny jak dotąd.
export function pokazUstawienia(stan, { naFunkcje, naPowiadomienia, naJezyk, naBudzet, naWprowadzenie, naWTle, sprawdzWTle, naUstawieniaTelefonu, czesci, dolCzesc, schowek, naZamkniecie }) {
  document.getElementById('okno-ustawienia')?.remove(); // jego części przejdą niżej do nowego okna
  const okno = element('dialog', 'okno okno--szersze okno--ustawienia' + (czesci ? ' okno--zakladki' : ''));
  okno.id = 'okno-ustawienia';
  okno.setAttribute('closedby', 'any'); // kliknięcie w tło obok okna zamyka je (jak Esc)
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
  for (const [klucz, nazwa, opis, zalezy] of FUNKCJE) {
    const w = wiersz(klucz, t(nazwa), t((stan.telefon && OPISY_TELEFONU[klucz]) || opis), funkcje[klucz] !== false, (wlacz) => {
      funkcje[klucz] = wlacz;
      odswiezZalezne();
      naFunkcje({ ...funkcje });
    }, zalezy ? 'ustawienia__wiersz--zalezny' : '');
    if (zalezy) zalezne.push([zalezy, w.pole, w.label]);
    sekcjaFunkcji.append(w.label);
  }
  // Funkcja zależna (np. „Weekend i święta”) bez tej, od której zależy, nic nie robi - przygaszona.
  function odswiezZalezne() {
    for (const [zalezy, pole, label] of zalezne) {
      pole.disabled = funkcje[zalezy] === false;
      label.classList.toggle('ustawienia__wiersz--wylaczony', pole.disabled);
    }
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
      budzetTeraz = kwota ?? 0;
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
          powiadomienia.progDrogich = kwota;
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
    // Zmiana zakładki bez skoku, po kolei: stara treść gaśnie (wysokość stoi), potem wysokość płynnie
    // do nowej i nowa treść się pojawia - razem ok. 0,3 s. Bez animacji przy otwarciu okna i przy
    // „ogranicz ruch” w systemie.
    let animacje = [];
    function wybierz(klucz, animuj = false) {
      const widoczny = zakladki.find((z) => !z.element.hidden && panele.contains(z.element))?.element;
      const nowy = zakladki.find((z) => z.klucz === klucz).element;
      const ruch = animuj && widoczny && widoczny !== nowy && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Szybkie klikanie: start od tego, co widać teraz (wysokość i przezroczystość w środku poprzedniej zmiany).
      const wysokoscPrzed = ruch ? panele.offsetHeight : 0;
      const jasnosc = ruch ? getComputedStyle(widoczny).opacity : '1';
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
      const gasnie = widoczny.animate([{ opacity: jasnosc }, { opacity: 0 }], { duration: 110, easing: 'ease-in', fill: 'forwards' });
      gasnie.addEventListener('finish', () => {
        gasnie.cancel();
        pokazNowa();
        // Nowa część od początku - tytuł i zakładki i tak stoją na górze okna.
        const tresc = panele.closest('.okno__tresc');
        if (tresc) tresc.scrollTop = 0;
        const wysokoscPo = panele.offsetHeight;
        const czas = { duration: 180, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' };
        // W trakcie treść przycięta do rosnącej / malejącej wysokości (nie wchodzi na dolny wiersz okna).
        panele.style.overflow = 'hidden';
        const wysokosc = panele.animate([{ height: wysokoscPrzed + 'px' }, { height: wysokoscPo + 'px' }], czas);
        const odslon = () => { panele.style.overflow = ''; };
        wysokosc.addEventListener('finish', odslon);
        wysokosc.addEventListener('cancel', odslon);
        animacje = [wysokosc, nowy.animate([{ opacity: 0 }, { opacity: 1 }], { ...czas, easing: 'ease-out' })];
      });
      animacje = [gasnie];
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
  wprowadzenie.addEventListener('click', () => {
    okno.close();
    naWprowadzenie();
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
  okno.querySelector('.ustawienia__zakladki [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // telefon: pasek przewijany w bok
}
