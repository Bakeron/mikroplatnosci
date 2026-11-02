// B10 (tylko PC): powiadomienia przy zamkniętej aplikacji. Zadanie w Harmonogramie zadań Windows
// uruchamia aplikację raz dziennie o 9:00 (albo zaraz po włączeniu komputera, jeśli o 9:00 był wyłączony)
// bez okna, z argumentem ARG_TLA - main.js pokazuje wtedy zaległe powiadomienia i zamyka aplikację.
// Bez autostartu i bez działania w tle przez cały dzień. Wyłączenie usuwa zadanie z Windows.
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

// schtasks przyjmuje plik zadania tylko w UTF-16 (z UTF-8: „nie można przełączyć kodowania”) - z BOM.
function utf16(tekst) {
  const bufor = new Uint16Array(tekst.length + 1);
  bufor[0] = 0xfeff;
  for (let i = 0; i < tekst.length; i++) bufor[i + 1] = tekst.charCodeAt(i);
  return bufor.buffer;
}

const schtasks = (argumenty) => Neutralino.os.execCommand(`schtasks ${argumenty}`);

// Czy zadanie jest w Windows: true / false, null - nie da się sprawdzić.
export async function czyZadanie() {
  try {
    return (await schtasks(`/Query /TN "${NAZWA_ZADANIA}"`)).exitCode === 0;
  } catch {
    return null;
  }
}

// Dodaje (albo podmienia) zadanie. folderDanych - %APPDATA%\Mikroplatnosci (plik zadania tylko na chwilę).
// Zwraca pusty tekst albo opis błędu dla użytkownika.
export async function dodajZadanie(folderDanych) {
  const program = await sciezkaProgramu();
  if (!program) return t('Działa tylko w zainstalowanej aplikacji (Mikroplatnosci.exe).');
  const plik = windowsowa(folderDanych) + '\\zadanie.xml';
  if (!bezpiecznaSciezka(plik)) return t('Nietypowa ścieżka folderu danych - nie da się dodać zadania.');
  try {
    await Neutralino.filesystem.writeBinaryFile(plik, utf16(xml(program.exe, program.folder)));
    const wynik = await schtasks(`/Create /F /TN "${NAZWA_ZADANIA}" /XML "${plik}"`);
    if (wynik.exitCode !== 0) return t('Windows nie dodał zadania: {blad}', { blad: (wynik.stdErr || wynik.stdOut || t('kod {kod}', { kod: wynik.exitCode })).trim().slice(0, 200) });
    return '';
  } catch (e) {
    console.error(e);
    return t('Nie udało się dodać zadania do Harmonogramu zadań.');
  } finally {
    await Neutralino.filesystem.remove(plik).catch(() => {});
  }
}

// Usuwa zadanie; brak zadania to nie błąd.
export async function usunZadanie() {
  try {
    if ((await czyZadanie()) === false) return '';
    const wynik = await schtasks(`/Delete /F /TN "${NAZWA_ZADANIA}"`);
    return wynik.exitCode === 0 ? '' : t('Windows nie usunął zadania: {blad}', { blad: (wynik.stdErr || wynik.stdOut || '').trim().slice(0, 200) });
  } catch (e) {
    console.error(e);
    return t('Nie udało się usunąć zadania z Harmonogramu zadań.');
  }
}
