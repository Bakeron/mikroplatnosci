// B10 (tylko PC): powiadomienia przy zamkniętej aplikacji. Zadanie w Harmonogramie zadań Windows
// uruchamia aplikację raz dziennie o 9:00 (albo zaraz po włączeniu komputera, jeśli o 9:00 był wyłączony)
// bez okna, z argumentem ARG_TLA - main.js pokazuje wtedy zaległe powiadomienia i zamyka aplikację.
// Wyłączenie usuwa zadanie z Windows.
// Drugie zadanie (autor 18.11.2026): „Uruchamiaj z Windows” - po zalogowaniu aplikacja startuje schowana
// w zasobniku przy zegarze (ARG_ZASOBNIKA, zasobnik.js) i czuwa cały dzień. Polecenie „whoami” - stały tekst.
//
// Bezpieczeństwo: polecenia schtasks składane tylko ze stałych tekstów i ścieżek sprawdzonych wzorcem
// (bez cudzysłowów i znaków specjalnych cmd) - żadnych danych wpisanych przez użytkownika ani z pliku.
// Zadanie działa na koncie zalogowanego użytkownika, bez uprawnień administratora (LeastPrivilege).

import { t } from './teksty.js';

export const ARG_TLA = '--tlo';
const NAZWA_ZADANIA = 'Mikroplatnosci - powiadomienia';
const PROGRAM = 'Mikroplatnosci.exe'; // nazwa po instalacji (instaluj.ps1, instalator.iss)
// Bez okna, bez paska zadań i bez zapisu położenia okna (zwykłe okno otwiera się dalej jak dotąd).
const ARGUMENTY = `${ARG_TLA} --window-hidden=true --window-skip-taskbar=true --window-use-saved-state=false`;
export const ARG_ZASOBNIKA = '--zasobnik';
const ZADANIE_STARTU = 'Mikroplatnosci - start z Windows';
// Okno schowane od startu (pokazuje je ikona w zasobniku); na pasku zadań pojawi się po pokazaniu.
const ARGUMENTY_STARTU = `${ARG_ZASOBNIKA} --window-hidden=true`;

// Ścieżka Windows bez znaków, które cmd albo XML mogłyby zinterpretować.
const bezpiecznaSciezka = (s) => typeof s === 'string' && /^[A-Za-z]:\\[^"%&|<>^!\r\n]*$/.test(s) && !s.includes('..');
const windowsowa = (s) => String(s).replace(/\//g, '\\').replace(/\\+$/, '');

// Program zainstalowany obok resources.neu (NL_PATH) albo null - przy „neu run” zadanie nie ma czego uruchomić.
async function sciezkaProgramu() {
  // NL_PATH bywa względna („.” - zależnie od sposobu uruchomienia), wtedy względem folderu roboczego.
  const sciezka = windowsowa(window.NL_PATH || '.');
  const folder = /^[A-Za-z]:\\/.test(sciezka) ? sciezka : windowsowa(window.NL_CWD || '') + (sciezka === '.' ? '' : '\\' + sciezka.replace(/^\.\\/, ''));
  const exe = folder + '\\' + PROGRAM;
  if (!bezpiecznaSciezka(exe)) return null;
  try {
    await Neutralino.filesystem.getStats(exe);
    return { exe, folder };
  } catch {
    return null;
  }
}

const xml = (exe, folder) => `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Mikropłatności: powiadomienia o terminach przy zamkniętej aplikacji. Wyłączysz w aplikacji: Ustawienia.</Description></RegistrationInfo>
  <Triggers><CalendarTrigger><StartBoundary>2026-01-01T09:00:00</StartBoundary><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger></Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT5M</ExecutionTimeLimit><Enabled>true</Enabled></Settings>
  <Actions Context="Author"><Exec><Command>${exe}</Command><Arguments>${ARGUMENTY}</Arguments><WorkingDirectory>${folder}</WorkingDirectory></Exec></Actions>
</Task>
`;

// Start z Windows: po zalogowaniu tego użytkownika (pół minuty później - pasek zadań i zasobnik już są),
// bez limitu czasu (aplikacja czuwa cały dzień), zwykły priorytet (domyślny w zadaniach jest niższy).
const xmlStartu = (exe, folder, sid) => `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Mikropłatności: start po zalogowaniu, schowane w zasobniku przy zegarze. Wyłączysz w aplikacji: Ustawienia.</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>${sid}</UserId><Delay>PT30S</Delay></LogonTrigger></Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Priority>5</Priority><Enabled>true</Enabled></Settings>
  <Actions Context="Author"><Exec><Command>${exe}</Command><Arguments>${ARGUMENTY_STARTU}</Arguments><WorkingDirectory>${folder}</WorkingDirectory></Exec></Actions>
</Task>
`;

// Konto zalogowanego użytkownika jako SID (np. S-1-5-21-…, konto służbowe S-1-12-1-…) z „whoami /user” - Windows
// rozpoznaje go przy każdym rodzaju konta (lokalne, Microsoft, firmowe), a to same cyfry, bez nazw i polskich znaków.
// Wynik: "komputer\nazwa","S-1-…" - brany tylko SID pasujący do wzoru na końcu linii; inaczej null.
const WZOR_SID = /"(S-1-\d{1,3}(?:-\d{1,10}){1,14})"\s*$/;
async function sidUzytkownika() {
  const wynik = await Neutralino.os.execCommand('whoami /user /fo csv /nh');
  return wynik.exitCode === 0 ? WZOR_SID.exec(String(wynik.stdOut).trim())?.[1] ?? null : null;
}

// schtasks przyjmuje plik zadania tylko w UTF-16 (z UTF-8: „nie można przełączyć kodowania”) - z BOM.
function utf16(tekst) {
  const bufor = new Uint16Array(tekst.length + 1);
  bufor[0] = 0xfeff;
  for (let i = 0; i < tekst.length; i++) bufor[i + 1] = tekst.charCodeAt(i);
  return bufor.buffer;
}

const schtasks = (argumenty) => Neutralino.os.execCommand(`schtasks ${argumenty}`);

// Opis błędu od Windows - bez niego, gdy polskie znaki przyszły zepsute (strona kodowa konsoli → „�”).
const opisBledu = (wynik) => {
  const opis = (wynik.stdErr || wynik.stdOut || '').trim();
  return opis && !opis.includes('\uFFFD') ? opis.slice(0, 200) : t('kod {kod}', { kod: wynik.exitCode });
};

// Czy zadanie jest w Windows: true / false, null - nie da się sprawdzić.
async function czyJest(nazwa) {
  try {
    return (await schtasks(`/Query /TN "${nazwa}"`)).exitCode === 0;
  } catch {
    return null;
  }
}
export const czyZadanie = () => czyJest(NAZWA_ZADANIA);
export const czyStart = () => czyJest(ZADANIE_STARTU);

// Dodaje (albo podmienia) zadanie. folderDanych - %APPDATA%\Mikroplatnosci (plik zadania tylko na chwilę).
// Zwraca pusty tekst albo opis błędu dla użytkownika.
export const dodajZadanie = (folderDanych) => dodaj(NAZWA_ZADANIA, folderDanych, async (program) => xml(program.exe, program.folder));
// Start z Windows - zadanie po zalogowaniu (xmlStartu).
export const dodajStart = (folderDanych) => dodaj(ZADANIE_STARTU, folderDanych, async (program) => {
  const sid = await sidUzytkownika();
  if (!sid) throw new Error('nieznane konto Windows');
  return xmlStartu(program.exe, program.folder, sid);
});
async function dodaj(nazwa, folderDanych, tresc) {
  const program = await sciezkaProgramu();
  if (!program) return t('Działa tylko w zainstalowanej aplikacji (Mikroplatnosci.exe).');
  const plik = windowsowa(folderDanych) + '\\zadanie.xml';
  if (!bezpiecznaSciezka(plik)) return t('Nietypowa ścieżka folderu danych - nie da się dodać zadania.');
  try {
    await Neutralino.filesystem.writeBinaryFile(plik, utf16(await tresc(program)));
    const wynik = await schtasks(`/Create /F /TN "${nazwa}" /XML "${plik}"`);
    if (wynik.exitCode !== 0) return t('Windows nie dodał zadania: {blad}', { blad: opisBledu(wynik) });
    return '';
  } catch (e) {
    console.error(e);
    return t('Nie udało się dodać zadania do Harmonogramu zadań.');
  } finally {
    await Neutralino.filesystem.remove(plik).catch(() => {});
  }
}

// Usuwa zadanie; brak zadania to nie błąd.
export const usunZadanie = () => usun(NAZWA_ZADANIA);
export const usunStart = () => usun(ZADANIE_STARTU);
async function usun(nazwa) {
  try {
    if ((await czyJest(nazwa)) === false) return '';
    const wynik = await schtasks(`/Delete /F /TN "${nazwa}"`);
    return wynik.exitCode === 0 ? '' : t('Windows nie usunął zadania: {blad}', { blad: opisBledu(wynik) });
  } catch (e) {
    console.error(e);
    return t('Nie udało się usunąć zadania z Harmonogramu zadań.');
  }
}
