// Pliki na urządzeniu (PC i telefon): odczyt i zapis danych, kopie zapasowe, usuwanie danych,
// blokada drugiej kopii aplikacji (tylko PC). Ścieżki przychodzą z main.js / aplikacja.js - dzięki temu
// testy działają na udawanych plikach.

import { odczytajTresc } from './dane.js';

export const ILE_KOPII = 5;
// Zminimalizowane okno WebView2 spowalnia liczniki nawet do raz na minutę - stąd zapas 2 minut.
export const BLOKADA_WAZNA = 120000;
const WZOR_KOPII = /^mikroplatnosci-\d{8}-\d{6}\.json$/;
const WZOR_USZKODZONEGO = /^uszkodzony-\d{8}-\d{6}\.json$/;

// Tylko „nie ma takiej ścieżki” znaczy brak pliku. Inny błąd (uprawnienia, plik zajęty przez inny
// program) idzie dalej - inaczej aplikacja wystartowałaby z pustą listą i nadpisała dane.
export async function istnieje(sciezka) {
  try {
    await Neutralino.filesystem.getStats(sciezka);
    return true;
  } catch (e) {
    if (e?.code === 'NE_FS_NOPATHE') return false;
    throw e;
  }
}

// Zapis do pliku danych tylko po wczytaniu (inaczej pusta lista nadpisałaby dane), bez blokady
// po błędzie odczytu i tylko przy włączonym „Zapisuj lokalnie”.
export const czyZapisywac = (stan) => Boolean(!stan.zablokowany && stan.wczytano && stan.lokalnie && stan.plik && stan.niezapisane);

// { tresc, odczytane } albo null, gdy pliku jeszcze nie ma. Pusty albo obcy plik = błąd (blokada zapisu).
export async function wczytajPlikDanych(plik) {
  if (!(await istnieje(plik))) {
    // Telefon (Capacitor) podmienia plik w dwóch krokach: usuwa stary, potem zmienia nazwę tymczasowego.
    // Przerwanie między nimi zostawia tylko pełny plik tymczasowy - dane z niego, a nie pusta lista.
    if (!(await istnieje(plik + '.tmp'))) return null;
    const tresc = await Neutralino.filesystem.readFile(plik + '.tmp');
    try {
      return { tresc, odczytane: odczytajTresc(tresc) };
    } catch {
      return null; // ucięty plik tymczasowy z pierwszego zapisu - jak brak danych
    }
  }
  const tresc = await Neutralino.filesystem.readFile(plik);
  return { tresc, odczytane: odczytajTresc(tresc) };
}

// Start (PC i telefon): odczyt pliku danych. null - pliku nie ma; błąd odczytu idzie dalej (aplikacja blokuje
// wtedy zapis i nie robi kopii). kopia() - kopia zapasowa treści wczytanej teraz (nawet gdy plik zdążył się
// zmienić); wywołać przed pierwszym zapisem.
export async function wczytajNaStart(plik, folderKopii) {
  const wynik = await wczytajPlikDanych(plik);
  return wynik && { odczytane: wynik.odczytane, kopia: () => zrobKopie(folderKopii, wynik.tresc) };
}

export function znacznikCzasu(t = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`;
}

// Brak folderu (telefon przed pierwszą kopią) = brak kopii; zapis kopii sam go tworzy.
const nazwyKopii = async (folder, wzor = WZOR_KOPII) => (!(await istnieje(folder)) ? [] : (await Neutralino.filesystem.readDirectory(folder))
  .filter((e) => e.type === 'FILE' && wzor.test(e.entry))
  .map((e) => e.entry)
  .sort());

// Kopia przy uruchomieniu, zostaje ILE_KOPII najnowszych. Plik taki sam jak w najnowszej kopii -
// bez nowej kopii, żeby starty „tylko popatrzeć” nie wypierały starszych wersji.
export async function zrobKopie(folder, tresc) {
  const pliki = await nazwyKopii(folder);
  const najnowsza = pliki.at(-1);
  if (najnowsza && (await Neutralino.filesystem.readFile(`${folder}/${najnowsza}`).catch(() => null)) === tresc) return;
  // Kopia z treści wczytanej przy starcie - nawet gdyby plik zdążył się już zmienić.
  const nowa = `mikroplatnosci-${znacznikCzasu()}.json`;
  await Neutralino.filesystem.writeFile(`${folder}/${nowa}`, tresc);
  // Nowa kopia nigdy nie jest usuwana - nawet gdy zegar był kiedyś do przodu i starsze kopie mają nazwy „z przyszłości”.
  for (const nazwa of (await nazwyKopii(folder)).filter((n) => n !== nowa).slice(0, -(ILE_KOPII - 1))) {
    await Neutralino.filesystem.remove(`${folder}/${nazwa}`);
  }
}

// Zapis do pliku tymczasowego i podmiana - zanik prądu w trakcie zapisu nie zostawia uciętego pliku danych.
export async function zapiszPlik(plik, tresc) {
  const tymczasowy = plik + '.tmp';
  await Neutralino.filesystem.writeFile(tymczasowy, tresc);
  try {
    await Neutralino.filesystem.move(tymczasowy, plik);
  } catch (e) {
    // Podmiana się nie udała - zapis wprost, jak dawniej (zapisane dane ważniejsze niż sposób zapisu).
    console.error(e);
    await Neutralino.filesystem.writeFile(plik, tresc);
    await Neutralino.filesystem.remove(tymczasowy).catch(() => {});
  }
}

// Uszkodzony plik danych przed przywróceniem kopii: przeniesiony do folderu kopii jako uszkodzony-….json
// (nic nie przepada; inna nazwa niż kopie - nie wypiera ich przy sprzątaniu). Folder kopii tworzy start aplikacji.
// Błąd idzie dalej - wtedy nic nie zmieniamy.
export async function odlozUszkodzony(plik, folderKopii) {
  const nazwa = `uszkodzony-${znacznikCzasu()}.json`;
  await Neutralino.filesystem.move(plik, `${folderKopii}/${nazwa}`);
  return nazwa;
}

// „Usuń z komputera” i wyłączenie „Zapisuj lokalnie”: plik danych, plik tymczasowy, wszystkie kopie i odłożone
// uszkodzone pliki. Brak pliku nie jest błędem; każdy inny błąd idzie dalej (użytkownik musi wiedzieć, że coś zostało).
export async function usunDaneLokalne(plik, folderKopii) {
  const usunPlik = async (p) => {
    if (await istnieje(p)) await Neutralino.filesystem.remove(p);
  };
  await usunPlik(plik);
  await usunPlik(plik + '.tmp');
  const nazwy = [...(await nazwyKopii(folderKopii)), ...(await nazwyKopii(folderKopii, WZOR_USZKODZONEGO))];
  for (const nazwa of nazwy) await Neutralino.filesystem.remove(`${folderKopii}/${nazwa}`);
}

// Jedna kopia aplikacji naraz: otwarta odświeża znacznik w pliku, druga go widzi i się zamyka.
// Zwraca true, gdy blokada zajęta przez tę kopię (pid). Odświeżanie co 30 s robi main.js.
export async function zajmijBlokade(plik, pid) {
  const czytaj = async () => JSON.parse(await Neutralino.filesystem.readFile(plik));
  let blokada = null;
  try {
    blokada = await czytaj();
  } catch {
    // Pusty albo uszkodzony plik - może akurat zapisuje go druga kopia; drugie podejście po chwili.
    if (await istnieje(plik).catch(() => false)) {
      await new Promise((r) => setTimeout(r, 300));
      blokada = await czytaj().catch(() => null);
    }
  }
  // Math.abs: czas „z przyszłości” (cofnięty zegar) nie blokuje startu na godziny.
  if (blokada && blokada.pid !== pid && Math.abs(Date.now() - blokada.czas) < BLOKADA_WAZNA) return false;
  await odswiezBlokade(plik, pid);
  // Dwa uruchomienia w tej samej chwili: obie kopie zapisały blokadę - zostaje ta, której zapis jest w pliku.
  // Nieczytelny plik - start jak dawniej (błąd tu nie może blokować uruchomienia).
  await new Promise((r) => setTimeout(r, 300));
  const zapisana = await czytaj().catch(() => null);
  return !zapisana || zapisana.pid === pid;
}

// Odświeżanie co 30 s: najpierw odczyt - świeża blokada innej kopii (ta wróciła np. z uśpienia, a w tym
// czasie uruchomiono drugą) znaczy false, bez zapisu. Nieczytelny plik - zapis jak dawniej.
export async function utrzymajBlokade(plik, pid) {
  const blokada = await Neutralino.filesystem.readFile(plik).then(JSON.parse).catch(() => null);
  if (blokada && blokada.pid !== pid && Math.abs(Date.now() - blokada.czas) < BLOKADA_WAZNA) return false;
  await odswiezBlokade(plik, pid);
  return true;
}

// Czy okno aplikacji jest otwarte (świeża blokada) - bez zajmowania blokady (uruchomienie w tle, B10).
export async function czyBlokadaZajeta(plik) {
  try {
    const blokada = JSON.parse(await Neutralino.filesystem.readFile(plik));
    return Math.abs(Date.now() - blokada.czas) < BLOKADA_WAZNA;
  } catch {
    return false;
  }
}

export const odswiezBlokade = (plik, pid) => Neutralino.filesystem.writeFile(plik, JSON.stringify({ pid, czas: Date.now() }));
