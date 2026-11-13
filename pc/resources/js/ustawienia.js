// Ustawienia urządzenia (PC i telefon) w osobnym pliku obok danych - zostają, nawet gdy danych
// na urządzeniu nie ma („Zapisuj lokalnie” wyłączone, dane tylko na Google Dysku).
// Zakładka „Ustawienia” (PC): funkcje do włączania i wyłączania (funkcje.js), rodzaje powiadomień
// i powiadomienia przy zamkniętej aplikacji (wTle - zadanie w Harmonogramie zadań Windows).

import { poprawneFunkcje, poprawneWaluty } from './funkcje.js';
import { poprawnyJezyk } from './teksty.js';

const DOMYSLNE = { lokalnie: true, motyw: '', prowizja: 0, funkcje: poprawneFunkcje(), powiadomienia: null, wTle: false, jezyk: '', wprowadzenie: false, kolejnosc: 'termin', budzet: 0, waluty: null, dawneWalutyObce: false };

// Rodzaje powiadomień; null = jeszcze nie ustawione (plik sprzed zakładki „Ustawienia”) - main.js decyduje,
// czy to pierwsze uruchomienie (wszystko wyłączone), czy aplikacja już używana („Wycofaj” i „Zapłać” zostają).
export function poprawnePowiadomienia(p) {
  if (!p || typeof p !== 'object') return null;
  const prog = typeof p.progDrogich === 'number' && Number.isFinite(p.progDrogich) && p.progDrogich >= 0 && p.progDrogich <= 1000000
    ? Math.round(p.progDrogich * 100) / 100 : 100;
  return { wycofaj: p.wycofaj === true, zaplac: p.zaplac === true, drogie: p.drogie === true, podwyzka: p.podwyzka === true, progDrogich: prog };
}

// D19: budżet miesięczny w zł (0 = bez limitu).
export const poprawnyBudzet = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 10000000 ? Math.round(v * 100) / 100 : 0);

// Brak albo uszkodzony plik = ustawienia domyślne (zapis lokalny włączony).
export async function wczytajUstawienia(plik) {
  try {
    const u = JSON.parse(await Neutralino.filesystem.readFile(plik));
    return {
      lokalnie: u?.lokalnie !== false,
      motyw: u?.motyw === 'ciemny' || u?.motyw === 'jasny' ? u.motyw : '',
      prowizja: typeof u?.prowizja === 'number' && u.prowizja >= 0 && u.prowizja <= 10 ? u.prowizja : 0, // % banku za przewalutowanie
      funkcje: poprawneFunkcje(u?.funkcje),
      powiadomienia: poprawnePowiadomienia(u?.powiadomienia),
      wTle: u?.wTle === true,
      jezyk: poprawnyJezyk(u?.jezyk), // F27: pusty = język systemu
      wprowadzenie: u?.wprowadzenie === true, // F25: notatki „pierwsze kroki” jeszcze nie zmazane
      kolejnosc: u?.kolejnosc === 'moja' ? 'moja' : 'termin', // telefon: karty wg terminu albo w kolejności użytkownika
      budzet: poprawnyBudzet(u?.budzet),
      // Lista walut; null = plik sprzed listy - main.js / aplikacja.js ustalają ją z dawnego „Waluty obce”
      // (domyślnie było włączone) i walut z pozycji (walutyNaStart).
      waluty: Array.isArray(u?.waluty) ? poprawneWaluty(u.waluty) : null,
      dawneWalutyObce: u?.funkcje?.waluty !== false,
    };
  } catch {
    return { ...DOMYSLNE, funkcje: poprawneFunkcje() };
  }
}

// Pola, których urządzenie nie podaje (telefon zapisuje tylko „lokalnie”), nie trafiają do pliku.
export async function zapiszUstawienia(plik, ustawienia) {
  await Neutralino.filesystem.writeFile(plik, JSON.stringify({
    lokalnie: ustawienia.lokalnie !== false,
    motyw: ustawienia.motyw || undefined,
    prowizja: ustawienia.prowizja || undefined,
    funkcje: ustawienia.funkcje ? poprawneFunkcje(ustawienia.funkcje) : undefined,
    powiadomienia: poprawnePowiadomienia(ustawienia.powiadomienia) ?? undefined,
    wTle: ustawienia.wTle === true || undefined,
    jezyk: poprawnyJezyk(ustawienia.jezyk) || undefined,
    wprowadzenie: ustawienia.wprowadzenie === true || undefined,
    kolejnosc: ustawienia.kolejnosc === 'moja' ? 'moja' : undefined,
    budzet: poprawnyBudzet(ustawienia.budzet) || undefined,
    waluty: ustawienia.waluty ? poprawneWaluty(ustawienia.waluty) : undefined,
  }));
}
