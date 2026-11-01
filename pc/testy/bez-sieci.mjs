// Bezpiecznik ładowany przed każdym plikiem testów (npm test, --import): test, który zapomni
// podmienić fetch, dostaje błąd zamiast łączyć się z prawdziwym internetem (NBP, Google, strony).
// Pojedyncze testy dalej podmieniają globalThis.fetch po swojemu.
globalThis.fetch = async (adres) => {
  throw new Error(`Test próbował połączyć się z siecią: ${String(adres).slice(0, 80)}`);
};
