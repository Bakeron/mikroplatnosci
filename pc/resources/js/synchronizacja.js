// Wymiana danych z Google Dyskiem - wspólna dla PC i telefonu. „Pobierz” scala dane z Dysku z tymi
// na urządzeniu, „Wyślij” robi to samo, a wynik zapisuje na Dysku - wysłanie nigdy nie kasuje
// zmian z drugiego urządzenia. Obie aplikacje mają te same id elementów (dysk-*, okno-dysk*, okno-google*).

import { scal } from './scalanie.js';
import { odczytajDane, doZapisu, WERSJA_DANYCH, pobierzKategorie, ustawKategorie } from './dane.js';
import { t, tn, godzina } from './teksty.js';
import { czyBladSieci, czyPolaczony, czySkonfigurowany, czyWpisany, wpisanyProjekt, ustawIdentyfikator, zacznijLogowanie, rozlacz, pobierzZDysku, wyslijNaDysk, usunZDysku, STRONA_KODU } from './dysk.js';
import { trescKodu, CZAS_POKAZU } from './kodQr.js';
import { pokazPlynnie } from './dom.js';

const $ = (id) => document.getElementById(id);
// Kilka zmian = jedna wysyłka na Dysk (PC bez zapisu lokalnego i telefon).
export const OPOZNIENIE_WYSYLKI = 3000;

// Czeka, aż skończy się trwająca wymiana z Dyskiem (pobranie albo inna wysyłka) - przy zamykaniu okna.
export async function poWymianie(stan, co = 100) {
  while (stan.synchronizacja) await new Promise((r) => setTimeout(r, co));
}
// Bez internetu fetch rzuca TypeError z angielskim opisem, a CapacitorHttp na telefonie - opis z Androida;
// dysk.js zamienia błędy sieci na tekst w języku aplikacji, a tu na wszelki wypadek TypeError też.
const opisBledu = (e) => (czyBladSieci(e) && !e.siec ? t('brak połączenia z Google - sprawdź internet') : e.message);
// Chwilowy brak sieci (start aplikacji albo powrót z tła, zanim Android odda jej sieć): kolejne próby
// po tych przerwach, zanim pojawi się komunikat o błędzie.
export const PONOWIENIA = [3000, 6000, 10000];
// „1 pozycję”, „3 pozycje”, „5 pozycji”, „22 pozycje” (polska liczba mnoga w bierniku).
function ilePozycji(n) {
  return tn(n, '{n} pozycję', '{n} pozycje', '{n} pozycji');
}

// stan: { wpisy, usuniete, zablokowany, synchronizacja }; poScaleniu: zapis i odświeżenie widoku;
// klasaBledu: klasa stanu przy błędzie; strona Google otwiera się dopiero przyciskiem „Kopiuj kod i otwórz Google”;
// czyLokalnie / wlaczLokalnie: „Zapisuj lokalnie” (przed usunięciem z Dysku zapis na urządzeniu
// musi być włączony, inaczej dane znikną); naOdswiez: po każdej zmianie stanu przycisków;
// obrazKodu(tekst): element z kodem QR projektu Google dla telefonu (tylko PC - telefon go skanuje).
export function polaczSynchronizacje({ stan, poScaleniu, klasaBledu, czyLokalnie = () => true, wlaczLokalnie = async () => {}, naOdswiez = () => {}, obrazKodu = null }) {
  let logowanie = null;
  let timerKodu = null;

  // Kod QR z tajnym kluczem widać tylko na żądanie, do zamknięcia okna albo przez 2 min.
  function schowajKod() {
    if (!obrazKodu) return;
    clearTimeout(timerKodu);
    timerKodu = null;
    $('okno-google-qr').hidden = true;
    $('okno-google-qr-obraz').replaceChildren();
    $('okno-google-qr-pokaz').hidden = !czyWpisany();
  }

  function pokazKod() {
    const { id, sekret } = wpisanyProjekt();
    if (!id) return;
    $('okno-google-qr-obraz').replaceChildren(obrazKodu(trescKodu(id, sekret)));
    $('okno-google-qr-pokaz').hidden = true;
    pokazPlynnie($('okno-google-qr'), true); // kod rozwija się pod przyciskiem, a nie wskakuje
    clearTimeout(timerKodu);
    timerKodu = setTimeout(schowajKod, CZAS_POKAZU);
  }

  // PC: stan także w zakładce „Synchronizacja” ustawień (dysk-stan-ustawienia), nie tylko u góry strony.
  function pokaz(tekst, blad = false) {
    for (const el of [$('dysk-stan'), $('dysk-stan-ustawienia')]) {
      if (!el) continue;
      el.textContent = tekst;
      el.title = tekst; // pełny tekst, gdy u góry strony jest skrócony
      el.classList.toggle(klasaBledu, blad);
    }
  }

  function odswiez() {
    const polaczony = czyPolaczony();
    $('dysk-wlacz').checked = polaczony || stan.synchronizacja;
    $('dysk-wlacz').disabled = stan.zablokowany || stan.synchronizacja;
    for (const id of ['dysk-pobierz', 'dysk-wyslij', 'dysk-usun']) {
      $(id).hidden = !polaczony;
      $(id).disabled = stan.zablokowany || stan.synchronizacja;
    }
    // „Zmień projekt Google” - tylko przy projekcie wpisanym w aplikacji (wbudowanego się nie zmienia).
    $('dysk-projekt').hidden = !czyWpisany();
    $('dysk-projekt').disabled = stan.zablokowany || stan.synchronizacja;
    // Przycisk kodu QR od razu po wpisaniu projektu (o ile kod nie jest właśnie pokazany).
    if (obrazKodu && $('okno-google-qr').hidden) $('okno-google-qr-pokaz').hidden = !czyWpisany();
    naOdswiez();
  }

  // klikniete: „Wyślij” przyciskiem (nie sama wysyłka po zmianie) - tylko wtedy pytanie o zastąpienie pliku.
  // Zwraca true, gdy wymiana z Dyskiem się udała.
  async function synchronizuj(wyslij, klikniete = false) {
    if (stan.zablokowany || stan.synchronizacja || !czyPolaczony()) return false;
    stan.synchronizacja = true;
    odswiez();
    pokaz(t('pobieram z Dysku…'));
    try {
      for (let proba = 0; ; proba++) {
        try {
          return await wymiana(wyslij, klikniete);
        } catch (e) {
          console.error(e);
          if (czyBladSieci(e) && proba < PONOWIENIA.length) {
            await new Promise((r) => setTimeout(r, PONOWIENIA[proba]));
            pokaz(t('pobieram z Dysku…'));
            continue;
          }
          pokaz(opisBledu(e) || t('błąd połączenia z Google Dyskiem'), true);
          return false;
        }
      }
    } finally {
      stan.synchronizacja = false;
      odswiez();
    }
  }

  // Jedna próba: pobranie, scalenie i (wyslij) wysyłka. Błąd - wyjątek (synchronizuj decyduje, czy ponowić).
  async function wymiana(wyslij, klikniete) {
    const tekst = await pobierzZDysku();
    const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
    const plik = tekst === null ? null : json(tekst);
    // Plik z nowszej wersji aplikacji (drugie urządzenie już zaktualizowane): bez scalania i bez wysyłki -
    // ta wersja zgubiłaby pola, których nie zna, i odesłała plik w starym formacie.
    if (Number(plik?.wersja) > WERSJA_DANYCH) throw new Error(t('dane na Dysku zapisała nowsza wersja aplikacji - zaktualizuj ją na tym urządzeniu'));
    const zdalne = tekst === null ? null : odczytajDane(plik, true);
    // Nieczytelny plik na Dysku: dane na urządzeniu zostają; kliknięte „Wyślij” może go zastąpić -
    // inaczej synchronizacja byłaby zablokowana na stałe.
    if (tekst !== null && !zdalne) {
      if (!wyslij || !klikniete || !confirm(t('Plik na Google Dysku jest uszkodzony albo ma nieznany format. Zastąpić go danymi z tego urządzenia (pozycji: {n})?', { n: stan.wpisy.filter((w) => !w.anulowano).length }))) {
        throw new Error(t('plik na Dysku jest uszkodzony - „Wyślij na Dysk” może go zastąpić'));
      }
    }
    if (zdalne) {
      // Lista kategorii (dane.js) scalana razem z pozycjami.
      const stanTeraz = () => JSON.stringify([stan.wpisy, stan.usuniete, stan.ulozono, pobierzKategorie()]);
      const przed = stanTeraz();
      const { kategorie, ...wynik } = scal({ wpisy: stan.wpisy, usuniete: stan.usuniete, ulozono: stan.ulozono, kategorie: pobierzKategorie() }, zdalne);
      // Dysk usuwa z urządzenia kilka pozycji naraz (podmieniony plik, zegar drugiego urządzenia
      // mocno do przodu) - tylko po potwierdzeniu.
      const zostaja = new Set(wynik.wpisy.map((w) => w.id));
      const ileUsuwa = stan.wpisy.filter((w) => !zostaja.has(w.id)).length;
      if (ileUsuwa > 2 && !confirm(t('Dane z Google Dysku usuwają z tego urządzenia {ile}. Usunąć je?', { ile: ilePozycji(ileUsuwa) }))) {
        throw new Error(t('przerwano - dane na tym urządzeniu bez zmian'));
      }
      Object.assign(stan, wynik);
      ustawKategorie(kategorie);
      // Zapis i odświeżenie widoku tylko, gdy Dysk coś zmienił (zwykle nic - pobranie przy każdym starcie telefonu).
      if (stanTeraz() !== przed) await poScaleniu();
    }
    if (wyslij) {
      pokaz(t('wysyłam na Dysk…'));
      await wyslijNaDysk(JSON.stringify(doZapisu(stan)));
    }
    const teraz = { godzina: godzina(new Date()) };
    pokaz(wyslij ? t('wysłano na Dysk ✓ {godzina}', teraz) : tekst === null ? t('na Dysku jeszcze nic nie ma · {godzina}', teraz) : t('pobrano z Dysku ✓ {godzina}', teraz));
    return true;
  }

  // Okno identyfikatora projektu Google; zmiana = pola wypełnione obecnym projektem i uwaga o rozłączeniu.
  function oknoProjektu(zmiana) {
    const { id, sekret } = zmiana ? wpisanyProjekt() : { id: $('okno-google-id').value, sekret: $('okno-google-sekret').value };
    $('okno-google-id').value = id;
    $('okno-google-sekret').value = sekret;
    $('okno-google-zmiana').hidden = !zmiana;
    $('okno-google-blad').hidden = true;
    schowajKod();
    $('okno-google').showModal();
  }

  async function polacz() {
    if (stan.zablokowany) return odswiez();
    if (!czySkonfigurowany()) {
      pokaz(t('wpisz identyfikator projektu Google'));
      oknoProjektu(false);
      odswiez();
      return;
    }
    stan.synchronizacja = true;
    odswiez();
    pokaz(t('łączę z Google…'));
    try {
      logowanie = await zacznijLogowanie();
      $('okno-dysk-kod').textContent = logowanie.kod;
      $('okno-dysk-7dni').hidden = !czyWpisany();
      $('okno-dysk').showModal();
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

  // Wyłączenie synchronizacji: aplikacja zapomina dostęp do Google (także przy „Usuń z komputera”).
  async function wylacz(tekst = t('synchronizacja wyłączona')) {
    await rozlacz();
    pokaz(tekst);
    odswiez();
  }

  // „Usuń z Dysku”: plik danych znika z Dysku, synchronizacja na tym urządzeniu się wyłącza.
  async function usunDysk() {
    if (stan.zablokowany || stan.synchronizacja || !czyPolaczony()) return;
    const lokalnie = czyLokalnie();
    const pytanie = t('Usunąć dane z Google Dysku? Synchronizacja na tym urządzeniu zostanie wyłączona.') + ' '
      + (lokalnie ? t('Dane na tym urządzeniu zostają.') : t('Włączy się zapis na tym urządzeniu, żeby dane z niego nie zniknęły.')) + ' '
      + t('Na drugim urządzeniu też wyłącz synchronizację - inaczej wyśle swoje dane na Dysk od nowa.');
    if (!confirm(pytanie)) return;
    stan.synchronizacja = true;
    odswiez();
    pokaz(t('usuwam z Dysku…'));
    try {
      if (!lokalnie) await wlaczLokalnie();
      await usunZDysku();
      stan.synchronizacja = false;
      await wylacz(t('usunięto z Dysku · synchronizacja wyłączona'));
    } catch (e) {
      pokaz(opisBledu(e) || t('nie udało się usunąć z Dysku'), true);
      console.error(e);
    } finally {
      stan.synchronizacja = false;
      odswiez();
    }
  }

  $('dysk-wlacz').addEventListener('change', async (e) => {
    if (e.target.checked) {
      await polacz();
    } else if (czyLokalnie()
      ? confirm(t('Wyłączyć synchronizację z Google Dyskiem? Aplikacja zapomni połączenie z kontem Google - żeby włączyć ją znowu, trzeba jeszcze raz wpisać kod na stronie Google. Dane na tym urządzeniu i na Dysku zostają.'))
      : confirm(t('Zapis na tym urządzeniu jest wyłączony - bez synchronizacji dane będą tylko w pamięci i znikną po zamknięciu aplikacji. Wyłączyć synchronizację?'))) {
      await wylacz();
    } else {
      e.target.checked = true;
    }
  });
  $('dysk-usun').addEventListener('click', usunDysk);
  $('dysk-pobierz').addEventListener('click', () => synchronizuj(false));
  $('dysk-wyslij').addEventListener('click', () => synchronizuj(true, true));
  // Kod trafia też do schowka - na stronie Google wystarczy go wkleić.
  $('okno-dysk-otworz').addEventListener('click', async () => {
    await navigator.clipboard?.writeText($('okno-dysk-kod').textContent).catch(() => {});
    Neutralino.os.open(STRONA_KODU).catch(console.error);
  });
  $('okno-dysk-anuluj').addEventListener('click', () => $('okno-dysk').close());
  $('okno-dysk').addEventListener('close', () => logowanie?.anuluj());
  $('dysk-projekt').addEventListener('click', () => {
    if (!stan.zablokowany && !stan.synchronizacja) oknoProjektu(true);
  });
  // Okno identyfikatora projektu Google: po zapisaniu od razu logowanie kodem. Ten sam projekt
  // przy połączonym Dysku - bez zmian; inny - dysk.js najpierw rozłącza konto Google.
  $('okno-google-zapisz').addEventListener('click', async () => {
    const blad = await ustawIdentyfikator($('okno-google-id').value, $('okno-google-sekret').value)
      .catch(() => t('nie udało się zapisać identyfikatora'));
    $('okno-google-blad').textContent = blad;
    $('okno-google-blad').hidden = !blad;
    if (blad) return;
    $('okno-google-sekret').value = '';
    $('okno-google').close();
    if (czyPolaczony()) return odswiez();
    await polacz();
  });
  $('okno-google-anuluj').addEventListener('click', () => $('okno-google').close());
  $('okno-google').addEventListener('close', () => {
    schowajKod();
    if (!czySkonfigurowany()) pokaz('');
  });
  if (obrazKodu) $('okno-google-qr-pokaz').addEventListener('click', pokazKod);
  $('okno-google-konsola').addEventListener('click', () => Neutralino.os.open('https://console.cloud.google.com/').catch(console.error));

  return { synchronizuj, odswiez, pokaz, wylacz, schowajKod, trwaLogowanie: () => logowanie !== null };
}
