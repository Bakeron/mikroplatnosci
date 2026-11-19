// Scalanie danych z komputera i z Google Dysku: wiersz po wierszu po id, a w wierszu pole po polu -
// wygrywa nowsza zmiana pola, usunięte pozycje nie wracają. Obie strony to { wpisy, usuniete } po sprawdzeniu (normalizuj).

const czas = (iso) => Date.parse(iso) || 0; // brak albo zły czas = 0

// Pola wpisu bez własnego czasu zmiany.
const BEZ_CZASU = new Set(['id', 'zmieniono', 'pola']);

// Krótki skrót wartości pola (FNV-1a, 32 bity) - po nim widać, że pole się zmieniło.
function skrot(wartosc) {
  const tekst = JSON.stringify(wartosc) ?? '';
  let h = 0x811c9dc5;
  for (let i = 0; i < tekst.length; i++) h = Math.imul(h ^ tekst.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

// Czas zmiany każdego pola: wpis.pola = { pole: { h: skrót wartości, t: czas zmiany } }. Pole, którego
// wartość różni się od zapamiętanej (albo jeszcze bez wpisu), dostaje czas ostatniej zmiany wiersza.
// Wywoływane przy każdym zapisie i przed scaleniem - mąż zmienia cenę, żona datę, a przy scalaniu
// zostają obie zmiany. Dane ze starszej wersji (bez pól) dostają czas wiersza - jak dawne scalanie całych wierszy.
export function oznaczPola(wpisy) {
  for (const w of wpisy) {
    if (!w.pola || typeof w.pola !== 'object') w.pola = {};
    for (const [pole, wartosc] of Object.entries(w)) {
      if (BEZ_CZASU.has(pole)) continue;
      const h = skrot(wartosc);
      if (w.pola[pole]?.h !== h) w.pola[pole] = { h, t: w.zmieniono };
    }
  }
}

// Dwie wersje tej samej pozycji: podstawą nowsza zmiana wiersza, a z drugiej wersji pola zmienione później.
function polacz(a, b) {
  const [nowsza, starsza] = czas(b.zmieniono) > czas(a.zmieniono) ? [b, a] : [a, b];
  const wynik = { ...nowsza, pola: { ...nowsza.pola } };
  for (const [pole, p] of Object.entries(starsza.pola ?? {})) {
    if (BEZ_CZASU.has(pole) || !(pole in wynik)) continue;
    if (czas(p.t) > czas(wynik.pola[pole]?.t)) {
      wynik[pole] = starsza[pole];
      wynik.pola[pole] = p;
    }
  }
  return wynik;
}

export function scal(lokalne, zdalne) {
  oznaczPola(lokalne.wpisy);
  oznaczPola(zdalne.wpisy);
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
  // pozycje dopisane tylko po drugiej stronie - na końcu. Z dwóch wersji pozycji - nowsza zmiana każdego pola.
  const zdalnaKolejnosc = czas(zdalne.ulozono) > czas(lokalne.ulozono);
  const [pierwsze, drugie] = zdalnaKolejnosc ? [zdalne.wpisy, lokalne.wpisy] : [lokalne.wpisy, zdalne.wpisy];
  const drugieWgId = new Map(drugie.map((w) => [w.id, w]));
  for (const w of pierwsze) {
    const d = drugieWgId.get(w.id);
    dodaj(d ? polacz(w, d) : w);
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
