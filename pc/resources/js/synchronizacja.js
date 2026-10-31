// Wymiana danych z Google Dyskiem - wspólna dla PC i telefonu. „Pobierz” scala dane z Dysku z tymi
// na urządzeniu, „Wyślij” robi to samo, a wynik zapisuje na Dysku - wysłanie nigdy nie kasuje
// zmian z drugiego urządzenia. Obie aplikacje mają te same id elementów (dysk-*, okno-dysk*, okno-google*).

import { scal } from './scalanie.js';
import { odczytajDane, doZapisu } from './dane.js';
import { czyPolaczony, czySkonfigurowany, ustawIdentyfikator, zacznijLogowanie, rozlacz, pobierzZDysku, wyslijNaDysk, STRONA_KODU } from './dysk.js';

const $ = (id) => document.getElementById(id);
const godzina = () => new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
// Bez internetu fetch rzuca TypeError z angielskim opisem.
const opisBledu = (e) => (e instanceof TypeError ? 'brak połączenia z Google - sprawdź internet' : e.message);

// stan: { wpisy, usuniete, zablokowany, synchronizacja }; poScaleniu: zapis i odświeżenie widoku;
// klasaBledu: klasa stanu przy błędzie; otworzOdRazu: strona Google otwierana razem z oknem kodu.
export function polaczSynchronizacje({ stan, poScaleniu, klasaBledu, otworzOdRazu }) {
  let logowanie = null;

  function pokaz(tekst, blad = false) {
    $('dysk-stan').textContent = tekst;
    $('dysk-stan').classList.toggle(klasaBledu, blad);
  }

  function odswiez() {
    const polaczony = czyPolaczony();
    $('dysk-wlacz').checked = polaczony || stan.synchronizacja;
    $('dysk-wlacz').disabled = stan.zablokowany || stan.synchronizacja;
    for (const id of ['dysk-pobierz', 'dysk-wyslij']) {
      $(id).hidden = !polaczony;
      $(id).disabled = stan.zablokowany || stan.synchronizacja;
    }
  }

  // klikniete: „Wyślij” przyciskiem (nie sama wysyłka po zmianie na telefonie) - tylko wtedy pytanie o zastąpienie pliku.
  async function synchronizuj(wyslij, klikniete = false) {
    if (stan.zablokowany || stan.synchronizacja || !czyPolaczony()) return;
    stan.synchronizacja = true;
    odswiez();
    pokaz('pobieram z Dysku…');
    try {
      const tekst = await pobierzZDysku();
      const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
      const zdalne = tekst === null ? null : odczytajDane(json(tekst), true);
      // Nieczytelny plik na Dysku: dane na urządzeniu zostają; kliknięte „Wyślij” może go zastąpić -
      // inaczej synchronizacja byłaby zablokowana na stałe (ukrytego folderu nie widać w Dysku).
      if (tekst !== null && !zdalne) {
        if (!wyslij || !klikniete || !confirm('Plik na Google Dysku jest uszkodzony albo ma nieznany format. Zastąpić go danymi z tego urządzenia?')) {
          throw new Error('plik na Dysku jest uszkodzony - „Wyślij na Dysk” może go zastąpić');
        }
      }
      if (zdalne) {
        const przed = JSON.stringify([stan.wpisy, stan.usuniete]);
        const wynik = scal(stan, zdalne);
        // Dysk usuwa z urządzenia kilka pozycji naraz (podmieniony plik, zegar drugiego urządzenia
        // mocno do przodu) - tylko po potwierdzeniu.
        const zostaja = new Set(wynik.wpisy.map((w) => w.id));
        const ileUsuwa = stan.wpisy.filter((w) => !zostaja.has(w.id)).length;
        if (ileUsuwa > 2 && !confirm(`Dane z Google Dysku usuwają z tego urządzenia ${ileUsuwa} pozycji. Usunąć je?`)) {
          throw new Error('przerwano - dane na tym urządzeniu bez zmian');
        }
        Object.assign(stan, wynik);
        // Zapis i odświeżenie widoku tylko, gdy Dysk coś zmienił (zwykle nic - pobranie przy każdym starcie telefonu).
        if (JSON.stringify([stan.wpisy, stan.usuniete]) !== przed) await poScaleniu();
      }
      if (wyslij) {
        pokaz('wysyłam na Dysk…');
        await wyslijNaDysk(JSON.stringify(doZapisu(stan)));
      }
      pokaz((wyslij ? 'wysłano na Dysk ✓ ' : tekst === null ? 'na Dysku jeszcze nic nie ma · ' : 'pobrano z Dysku ✓ ') + godzina());
    } catch (e) {
      pokaz(opisBledu(e) || 'błąd połączenia z Google Dyskiem', true);
      console.error(e);
    } finally {
      stan.synchronizacja = false;
      odswiez();
    }
  }

  async function polacz() {
    if (stan.zablokowany) return odswiez();
    if (!czySkonfigurowany()) {
      pokaz('wpisz identyfikator projektu Google');
      $('okno-google-blad').hidden = true;
      $('okno-google').showModal();
      odswiez();
      return;
    }
    stan.synchronizacja = true;
    odswiez();
    pokaz('łączę z Google…');
    try {
      logowanie = await zacznijLogowanie();
      $('okno-dysk-kod').textContent = logowanie.kod;
      $('okno-dysk').showModal();
      if (otworzOdRazu) Neutralino.os.open(STRONA_KODU).catch(console.error);
      await logowanie.czekaj();
      $('okno-dysk').close();
      stan.synchronizacja = false;
      await synchronizuj(true);
    } catch (e) {
      $('okno-dysk').close();
      pokaz(opisBledu(e), Boolean(e.message));
      console.error(e);
    } finally {
      logowanie = null;
      stan.synchronizacja = false;
      odswiez();
    }
  }

  $('dysk-wlacz').addEventListener('change', async (e) => {
    if (e.target.checked) {
      await polacz();
    } else {
      await rozlacz();
      pokaz('synchronizacja wyłączona');
      odswiez();
    }
  });
  $('dysk-pobierz').addEventListener('click', () => synchronizuj(false));
  $('dysk-wyslij').addEventListener('click', () => synchronizuj(true, true));
  // Kod trafia też do schowka - na stronie Google wystarczy go wkleić.
  $('okno-dysk-otworz').addEventListener('click', async () => {
    await navigator.clipboard?.writeText($('okno-dysk-kod').textContent).catch(() => {});
    Neutralino.os.open(STRONA_KODU).catch(console.error);
  });
  $('okno-dysk-anuluj').addEventListener('click', () => $('okno-dysk').close());
  $('okno-dysk').addEventListener('close', () => logowanie?.anuluj());
  // Okno identyfikatora projektu Google: po zapisaniu od razu logowanie kodem.
  $('okno-google-zapisz').addEventListener('click', async () => {
    const blad = await ustawIdentyfikator($('okno-google-id').value, $('okno-google-sekret').value)
      .catch(() => 'nie udało się zapisać identyfikatora');
    $('okno-google-blad').textContent = blad;
    $('okno-google-blad').hidden = !blad;
    if (blad) return;
    $('okno-google-sekret').value = '';
    $('okno-google').close();
    await polacz();
  });
  $('okno-google-anuluj').addEventListener('click', () => $('okno-google').close());
  $('okno-google').addEventListener('close', () => {
    if (!czySkonfigurowany()) pokaz('');
  });
  $('okno-google-konsola').addEventListener('click', () => Neutralino.os.open('https://console.cloud.google.com/').catch(console.error));

  return { synchronizuj, odswiez, pokaz, trwaLogowanie: () => logowanie !== null };
}
