// Google Dysk: logowanie kodem (google.com/device) i plik danych w „Moim dysku”.
// Zakres drive.file - aplikacja widzi tylko pliki, które sama utworzyła, nie dokumenty na Dysku.
// Nie drive.appdata (ukryty folder aplikacji): logowanie kodem odrzuca go błędem „invalid_scope”
// (sprawdzone 5.11.2026 w Tablicy Ofert), choć dokumentacja Google wymienia go jako dozwolony.
// Identyfikator i tajny klucz projektu Google: wpisane w aplikacji (plik google.json obok danych,
// nie w plikach projektu) albo wbudowane przy budowaniu ze zmiennych MIKROPLATNOSCI_GOOGLE_* (google.js).

import { t } from './teksty.js';

const ZAKRES = 'https://www.googleapis.com/auth/drive.file';
const ADRES_TOKENU = 'https://oauth2.googleapis.com/token';
export const STRONA_KODU = 'https://www.google.com/device';
const NAZWA_PLIKU = 'mikroplatnosci.json';
const MAKS_ROZMIAR = 5 * 1024 * 1024;
export const WZOR_ID = /^[\w-]{5,100}\.apps\.googleusercontent\.com$/;
export const WZOR_SEKRETU = /^[\w-]{10,100}$/;
const MAKS_BLEDOW_SIECI = 3; // pod rząd, przy czekaniu na zgodę w Google

// wpisane: identyfikator pochodzi z aplikacji (zapisywany w google.json), nie ze zmiennych.
const dysk = { id: '', sekret: '', wpisane: false, plikDostepu: '', odswiezajacy: '', dostep: '', wazneDo: 0, idPliku: '' };

// Identyfikator aplikacji wbudowany przy budowaniu (js/google.js z instaluj.ps1 albo przygotuj.mjs,
// ze zmiennych autora MIKROPLATNOSCI_GOOGLE_*). To identyfikator aplikacji, nie konta - każdy
// użytkownik loguje się swoim kontem Google. Bez niego: okno „wpisz identyfikator” w aplikacji.
const wbudowany = (nazwa) => String(globalThis.GOOGLE_KLUCZE?.[nazwa] ?? '').trim();

// Zapamiętany dostęp leży w osobnym pliku obok danych (nie w pliku z wpisami).
export async function przygotujDysk(folder) {
  dysk.plikDostepu = folder + '/google.json';
  dysk.id = wbudowany('MIKROPLATNOSCI_GOOGLE_ID');
  dysk.sekret = wbudowany('MIKROPLATNOSCI_GOOGLE_SECRET');
  try {
    const d = JSON.parse(await Neutralino.filesystem.readFile(dysk.plikDostepu));
    if (typeof d.odswiezajacy === 'string' && d.odswiezajacy.length < 2000) dysk.odswiezajacy = d.odswiezajacy;
    if (WZOR_ID.test(d.id) && WZOR_SEKRETU.test(d.sekret)) Object.assign(dysk, { id: d.id, sekret: d.sekret, wpisane: true });
  } catch {
    // brak pliku - synchronizacja wyłączona
  }
}

export const czyPolaczony = () => Boolean(dysk.odswiezajacy);
export const czySkonfigurowany = () => Boolean(dysk.id && dysk.sekret);
// Projekt Google wpisany w aplikacji (nie wbudowany) - można go zmienić, a Google w trybie
// testowym kończy połączenie co ok. 7 dni.
export const czyWpisany = () => dysk.wpisane;
export const wpisanyProjekt = () => (dysk.wpisane ? { id: dysk.id, sekret: dysk.sekret } : { id: '', sekret: '' });

async function zapiszPlik() {
  const d = { odswiezajacy: dysk.odswiezajacy || undefined };
  if (dysk.wpisane) Object.assign(d, { id: dysk.id, sekret: dysk.sekret });
  if (d.odswiezajacy || d.id) await Neutralino.filesystem.writeFile(dysk.plikDostepu, JSON.stringify(d));
  else await Neutralino.filesystem.remove(dysk.plikDostepu).catch(() => {});
}

// Wklejone z komunikatora mają często spacje, nowe linie i niewidoczne znaki także w środku -
// w identyfikatorze i kluczu nie ma ich nigdy, więc znikają wszystkie.
const bezOdstepow = (tekst) => String(tekst).replace(/[\s­᠎​-‍⁠]/g, '');

// Identyfikator wpisany w aplikacji; zwraca opis błędu albo '' po zapisaniu.
// Połączenie z Dyskiem należy do jednego projektu - inny identyfikator albo klucz najpierw rozłącza konto Google.
export async function ustawIdentyfikator(id, sekret) {
  id = bezOdstepow(id);
  sekret = bezOdstepow(sekret);
  if (!WZOR_ID.test(id)) return t('identyfikator klienta kończy się na .apps.googleusercontent.com');
  if (!WZOR_SEKRETU.test(sekret)) return t('tajny klucz to ciąg liter, cyfr i myślników (zwykle zaczyna się od GOCSPX-)');
  if (dysk.odswiezajacy && (id !== dysk.id || sekret !== dysk.sekret)) await rozlacz();
  Object.assign(dysk, { id, sekret, wpisane: true });
  await zapiszPlik();
  return '';
}

// Google odrzucił identyfikator albo klucz - aplikacja zapomina je, żeby można było wpisać nowe.
async function zlyIdentyfikator() {
  const byloWpisane = dysk.wpisane;
  Object.assign(dysk, { id: '', sekret: '', wpisane: false });
  if (byloWpisane) await zapiszPlik().catch(console.error);
  return new Error(t('Google nie rozpoznał identyfikatora albo tajnego klucza - wpisz je jeszcze raz'));
}

// Każde zapytanie do Google: bez pamięci podręcznej przeglądarki i z limitem czasu -
// zawieszone połączenie nie blokuje przycisków Dysku aż do ponownego uruchomienia aplikacji.
const LIMIT_CZASU = 30000;
async function siec(adres, opcje) {
  const signal = AbortSignal.timeout(LIMIT_CZASU);
  // Na telefonie CapacitorHttp wysyła POST, PATCH i DELETE natywnie, bez limitu czasu i z pominięciem
  // signal - dlatego dodatkowo wyścig z tym samym limitem.
  const limit = new Promise((_, nie) => signal.addEventListener('abort', () => nie(signal.reason), { once: true }));
  try {
    return await Promise.race([fetch(adres, { cache: 'no-store', signal, ...opcje }), limit]);
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new Error(t('Google nie odpowiada - spróbuj za chwilę'));
    throw e;
  }
}

async function formularz(adres, pola) {
  const odp = await siec(adres, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(pola),
  });
  return { ok: odp.ok, dane: await odp.json().catch(() => ({})) };
}

const opisBledu = (dane) => 'Google: ' + (typeof dane.error === 'string' ? dane.error.slice(0, 80) : t('nieznany błąd'));

function przyjmijToken(d) {
  if (typeof d.access_token !== 'string') throw new Error(t('Google nie oddał dostępu'));
  dysk.dostep = d.access_token;
  dysk.wazneDo = Date.now() + ((Number(d.expires_in) || 3600) - 60) * 1000;
  if (typeof d.refresh_token === 'string') dysk.odswiezajacy = d.refresh_token;
}

// Kod do wpisania na google.com/device; czekaj() kończy się po zgodzie w przeglądarce.
export async function zacznijLogowanie() {
  const { ok, dane } = await formularz('https://oauth2.googleapis.com/device/code', { client_id: dysk.id, scope: ZAKRES });
  if (dane.error === 'invalid_client') throw await zlyIdentyfikator();
  if (!ok|| typeof dane.device_code !== 'string' || typeof dane.user_code !== 'string') throw new Error(opisBledu(dane));
  let anulowane = false;
  // Co najmniej 5 s między pytaniami. Pojedyncze błędy sieci nie przerywają logowania - na telefonie
  // aplikacja jest wtedy w tle (użytkownik w przeglądarce), a Android potrafi na chwilę odciąć jej sieć.
  const czekaj = async () => {
    let odstep = Math.max(Number(dane.interval) || 5, 5) * 1000;
    let bledySieci = 0;
    const koniec = Date.now() + (Number(dane.expires_in) || 1800) * 1000;
    while (!anulowane && Date.now() < koniec) {
      await new Promise((r) => setTimeout(r, odstep));
      if (anulowane) break;
      let w;
      try {
        w = await formularz(ADRES_TOKENU, {
          client_id: dysk.id, client_secret: dysk.sekret, device_code: dane.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        });
        bledySieci = 0;
      } catch (e) {
        if (++bledySieci >= MAKS_BLEDOW_SIECI) throw e;
        continue;
      }
      if (w.ok) {
        przyjmijToken(w.dane);
        await zapiszPlik();
        return;
      }
      if (w.dane.error === 'authorization_pending') continue;
      if (w.dane.error === 'slow_down') { odstep += 5000; continue; }
      if (w.dane.error === 'access_denied') throw new Error(t('w Google nie było zgody na dostęp'));
      if (w.dane.error === 'expired_token') break; // Google uznał kod za wygasły przed czasem
      if (w.dane.error === 'invalid_client') throw await zlyIdentyfikator();
      throw new Error(opisBledu(w.dane));
    }
    throw new Error(anulowane ? '' : t('kod wygasł - włącz synchronizację jeszcze raz'));
  };
  return { kod: dane.user_code.slice(0, 20), czekaj, anuluj: () => { anulowane = true; } };
}

async function zapomnij() {
  Object.assign(dysk, { odswiezajacy: '', dostep: '', wazneDo: 0, idPliku: '' });
  await zapiszPlik().catch(console.error);
}

// Wyłączenie synchronizacji: aplikacja zapomina dostęp i prosi Google o jego unieważnienie.
export async function rozlacz() {
  const token = dysk.odswiezajacy;
  await zapomnij();
  if (token) await formularz('https://oauth2.googleapis.com/revoke', { token }).catch(() => {});
}

async function tokenDostepu() {
  if (dysk.dostep && Date.now() < dysk.wazneDo) return dysk.dostep;
  const w = await formularz(ADRES_TOKENU, {
    client_id: dysk.id, client_secret: dysk.sekret, refresh_token: dysk.odswiezajacy, grant_type: 'refresh_token',
  });
  if (!w.ok) {
    // Połączenie skończyło się (cofnięte na koncie Google albo 7 dni projektu w trybie testowym).
    if (w.dane.error === 'invalid_grant') {
      await zapomnij();
      throw new Error(t('Połączenie z Google Dyskiem wygasło (własny projekt Google w trybie testowym kończy je co ok. 7 dni). Włącz synchronizację jeszcze raz i wpisz kod - dane na tym urządzeniu i na Dysku są bezpieczne.'));
    }
    throw new Error(opisBledu(w.dane));
  }
  przyjmijToken(w.dane);
  return dysk.dostep;
}

async function zapytanie(adres, opcje = {}) {
  const odp = await siec(adres, { ...opcje, headers: { ...opcje.headers, Authorization: 'Bearer ' + await tokenDostepu() } });
  if (!odp.ok) {
    // 401 - dostęp odrzucony (np. cofnięty na koncie Google): następnym razem po nowy, a gdy Google
    // odmówi odświeżenia (invalid_grant), aplikacja zapomni dostęp.
    if (odp.status === 401) Object.assign(dysk, { dostep: '', wazneDo: 0 });
    throw new Error(t('Google Dysk odpowiedział błędem {kod}', { kod: odp.status }));
  }
  return odp;
}

// Szukanie pliku danych w „Moim dysku” (z drive.file Google pokazuje tylko pliki utworzone przez aplikację).
const SZUKAJ = 'https://www.googleapis.com/drive/v3/files?spaces=drive&q='
  + encodeURIComponent(`name = '${NAZWA_PLIKU}' and trashed = false`) + '&orderBy=modifiedTime%20desc';

// Treść pliku z Dysku albo null, gdy jeszcze go tam nie ma. Kilka plików (np. skopiowany) - najnowszy.
export async function pobierzZDysku() {
  const lista = await (await zapytanie(`${SZUKAJ}&fields=files(id,size)`)).json();
  const plik = Array.isArray(lista.files) ? lista.files[0] : null;
  if (!plik || typeof plik.id !== 'string') {
    dysk.idPliku = '';
    return null;
  }
  dysk.idPliku = plik.id;
  if (Number(plik.size) > MAKS_ROZMIAR) throw new Error(t('plik na Dysku jest za duży'));
  const tekst = await (await zapytanie(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(plik.id)}?alt=media`)).text();
  if (tekst.length > MAKS_ROZMIAR) throw new Error(t('plik na Dysku jest za duży'));
  return tekst;
}

// „Usuń z Dysku”: kasuje plik danych z Dysku (każdą kopię o tej nazwie utworzoną przez aplikację).
export async function usunZDysku() {
  const lista = await (await zapytanie(`${SZUKAJ}&fields=files(id)`)).json();
  for (const plik of Array.isArray(lista.files) ? lista.files : []) {
    if (typeof plik?.id === 'string') await zapytanie(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(plik.id)}`, { method: 'DELETE' });
  }
  dysk.idPliku = '';
}

// Nadpisuje plik znaleziony przy ostatnim pobraniu albo zakłada nowy w „Moim dysku”.
export async function wyslijNaDysk(tekst) {
  if (dysk.idPliku) {
    await zapytanie(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(dysk.idPliku)}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: tekst,
    });
    return;
  }
  const granica = 'mikroplatnosci-' + Math.random().toString(36).slice(2);
  const opis = JSON.stringify({ name: NAZWA_PLIKU });
  const cialo = `--${granica}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${opis}\r\n`
    + `--${granica}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${tekst}\r\n--${granica}--`;
  const odp = await zapytanie('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${granica}` }, body: cialo,
  });
  const { id } = await odp.json();
  if (typeof id === 'string') dysk.idPliku = id;
}
