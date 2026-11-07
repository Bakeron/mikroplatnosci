// Kod QR z projektem Google (PC → telefon): identyfikator i tajny klucz własnego projektu Google,
// żeby nie przepisywać ich palcem w telefonie. Nie loguje - konto Google telefon łączy sam, kodem.
// Wspólne dla PC (pokazuje kod) i telefonu (skanuje i sprawdza treść).

import { WZOR_ID, WZOR_SEKRETU } from './dysk.js';

const PREFIKS = 'mikroplatnosci:google:1:';
const MAKS_DLUGOSC = 1000;
export const CZAS_POKAZU = 2 * 60 * 1000; // kod z tajnym kluczem znika po 2 min

export const trescKodu = (id, sekret) => `${PREFIKS}${id}:${sekret}`;

// Zeskanowany tekst → { id, sekret } albo null, gdy to nie kod projektu z Mikropłatności
// (identyfikator i klucz nie mają dwukropków, więc dwukropek je rozdziela).
export function odczytajKod(tekst) {
  if (typeof tekst !== 'string' || tekst.length > MAKS_DLUGOSC || !tekst.startsWith(PREFIKS)) return null;
  const czesci = tekst.slice(PREFIKS.length).split(':');
  if (czesci.length !== 2) return null;
  const [id, sekret] = czesci;
  return WZOR_ID.test(id) && WZOR_SEKRETU.test(sekret) ? { id, sekret } : null;
}
