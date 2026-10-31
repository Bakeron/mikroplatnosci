// Scalanie danych z komputera i z Google Dysku: wiersz po wierszu po id, wygrywa nowsza zmiana,
// usunięte pozycje nie wracają. Obie strony to { wpisy, usuniete } po sprawdzeniu (normalizuj).

const czas = (iso) => (iso ? Date.parse(iso) || 0 : 0);

export function scal(lokalne, zdalne) {
  // Z dwóch usunięć tej samej pozycji liczy się późniejsze.
  const usuniete = new Map();
  for (const u of [...lokalne.usuniete, ...zdalne.usuniete]) {
    if (!usuniete.has(u.id) || czas(u.kiedy) > czas(usuniete.get(u.id).kiedy)) usuniete.set(u.id, u);
  }
  // Pozycja znika, gdy usunięto ją po ostatniej zmianie; zmieniona później wraca.
  const wynik = [];
  const dodaj = (w) => {
    const u = usuniete.get(w.id);
    if (!u || czas(w.zmieniono) > czas(u.kiedy)) wynik.push(w);
  };

  // Kolejność z komputera, pozycje dopisane tylko na drugim urządzeniu - na końcu.
  const zdalneWgId = new Map(zdalne.wpisy.map((w) => [w.id, w]));
  for (const w of lokalne.wpisy) {
    const z = zdalneWgId.get(w.id);
    dodaj(z && czas(z.zmieniono) > czas(w.zmieniono) ? z : w);
  }
  const lokalneId = new Set(lokalne.wpisy.map((w) => w.id));
  for (const z of zdalne.wpisy) if (!lokalneId.has(z.id)) dodaj(z);

  const obecne = new Set(wynik.map((w) => w.id));
  return { wpisy: wynik, usuniete: [...usuniete.values()].filter((u) => !obecne.has(u.id)) };
}
