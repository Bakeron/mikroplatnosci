// Scalanie danych z komputera i z Google Dysku: wiersz po wierszu po id, wygrywa nowsza zmiana,
// usunięte pozycje nie wracają. Obie strony to { wpisy, usuniete } po sprawdzeniu (normalizuj).

const czas = (iso) => Date.parse(iso) || 0; // brak albo zły czas = 0

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

  // Kolejność ze strony, na której później ręcznie przesunięto pozycje (przy równych - z tego urządzenia);
  // pozycje dopisane tylko po drugiej stronie - na końcu. Z dwóch wersji pozycji wygrywa nowsza zmiana.
  const zdalnaKolejnosc = czas(zdalne.ulozono) > czas(lokalne.ulozono);
  const [pierwsze, drugie] = zdalnaKolejnosc ? [zdalne.wpisy, lokalne.wpisy] : [lokalne.wpisy, zdalne.wpisy];
  const drugieWgId = new Map(drugie.map((w) => [w.id, w]));
  for (const w of pierwsze) {
    const d = drugieWgId.get(w.id);
    dodaj(d && czas(d.zmieniono) > czas(w.zmieniono) ? d : w);
  }
  const pierwszeId = new Set(pierwsze.map((w) => w.id));
  for (const d of drugie) if (!pierwszeId.has(d.id)) dodaj(d);

  const obecne = new Set(wynik.map((w) => w.id));
  const ulozono = zdalnaKolejnosc ? zdalne.ulozono : lokalne.ulozono || '';
  return { wpisy: wynik, usuniete: [...usuniete.values()].filter((u) => !obecne.has(u.id)), ulozono, kategorie: scalKategorie(lokalne.kategorie, zdalne.kategorie) };
}

// Lista kategorii: rekord po kluczu, wygrywa nowsza zmiana (włączenie, odznaczenie, nazwa); kolejność z tego
// urządzenia, kategorie dopisane tylko po drugiej stronie - na końcu. Brak listy po obu stronach - null.
export function scalKategorie(lokalne, zdalne) {
  if (!lokalne && !zdalne) return null;
  const wynik = new Map();
  for (const k of [...(lokalne ?? []), ...(zdalne ?? [])]) {
    const jest = wynik.get(k.klucz);
    if (!jest || czas(k.zmieniono) > czas(jest.zmieniono)) wynik.set(k.klucz, k);
  }
  return [...wynik.values()];
}
