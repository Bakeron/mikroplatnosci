// Okno „Ustawienia” (PC): wewnętrzna strona okładki zeszytu - co widać w zeszycie (funkcje.js),
// które powiadomienia przychodzą i czy także przy zamkniętej aplikacji (harmonogram.js).
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

// stan: { funkcje, powiadomienia, wTle, jezyk, budzet }; zdarzenia: naFunkcje(funkcje), naPowiadomienia(p), naJezyk(kod), naBudzet(kwota),
// naWprowadzenie(), naWTle(wlacz) -> Promise<string> (pusty tekst = udało się, inaczej opis błędu),
// sprawdzWTle() -> Promise<boolean|null>.
export function pokazUstawienia(stan, { naFunkcje, naPowiadomienia, naJezyk, naBudzet, naWprowadzenie, naWTle, sprawdzWTle }) {
  document.getElementById('okno-ustawienia')?.remove();
  const okno = element('dialog', 'okno okno--szersze okno--ustawienia');
  okno.id = 'okno-ustawienia';
  okno.setAttribute('closedby', 'any'); // kliknięcie w tło obok okna zamyka je (jak Esc)
  okno.setAttribute('aria-labelledby', 'ustawienia-tytul');
  const tytul = element('h2', 'okno__tytul', t('Ustawienia'));
  tytul.id = 'ustawienia-tytul';
  okno.append(tytul, element('p', 'okno__uwaga', t('Tylko na tym komputerze. Wyłączona funkcja znika z ekranu, a to, co już wpisane, zostaje w pliku - po ponownym włączeniu wraca.')));

  // --- co widać w zeszycie ---
  const funkcje = { ...stan.funkcje };
  const sekcjaFunkcji = element('section', 'ustawienia__sekcja');
  sekcjaFunkcji.append(element('h3', 'ustawienia__naglowek', t('Co widać w zeszycie')));
  const zalezne = [];
  for (const [klucz, nazwa, opis, zalezy] of FUNKCJE) {
    const w = wiersz(klucz, t(nazwa), t(opis), funkcje[klucz] !== false, (wlacz) => {
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
  sekcjaFunkcji.append(budzet);

  // --- powiadomienia ---
  const powiadomienia = { ...stan.powiadomienia };
  const sekcjaPowiadomien = element('section', 'ustawienia__sekcja');
  sekcjaPowiadomien.append(element('h3', 'ustawienia__naglowek', t('Powiadomienia Windows')));
  for (const [klucz, nazwa, opis] of RODZAJE) {
    const w = wiersz('p-' + klucz, t(nazwa), t(opis), powiadomienia[klucz] === true, (wlacz) => {
      powiadomienia[klucz] = wlacz;
      naPowiadomienia({ ...powiadomienia });
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
          naPowiadomienia({ ...powiadomienia });
        }
        prog.value = formatujKoszt(powiadomienia.progDrogich);
      });
      const kwota = element('span', 'ustawienia__kwota');
      kwota.append(prog, ' ' + t('zł'));
      w.opisEl.append(' ', kwota);
    }
    sekcjaPowiadomien.append(w.label);
  }

  // B10: także przy zamkniętej aplikacji - zadanie w Harmonogramie zadań Windows.
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

  const kolumny = element('div', 'ustawienia__kolumny');
  kolumny.append(sekcjaFunkcji, sekcjaPowiadomien);
  okno.append(kolumny);

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
  przyciski.append(jezykPole, wprowadzenie);
  const zamknij = element('button', 'przycisk-tekst', t('Zamknij'));
  zamknij.type = 'button';
  zamknij.addEventListener('click', () => okno.close());
  przyciski.append(zamknij);
  okno.append(przyciski);
  krzyzykOkna(okno, t('Zamknij')); // widoczne także po przewinięciu okna (obok „Zamknij” na dole)
  okno.addEventListener('close', () => okno.remove());
  document.body.append(okno);
  okno.showModal();
}
