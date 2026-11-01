// Ustawienia urządzenia (PC i telefon) w osobnym pliku obok danych - zostają, nawet gdy danych
// na urządzeniu nie ma („Zapisuj lokalnie” wyłączone, dane tylko na Google Dysku).

const DOMYSLNE = { lokalnie: true, motyw: '' };

// Brak albo uszkodzony plik = ustawienia domyślne (zapis lokalny włączony).
export async function wczytajUstawienia(plik) {
  try {
    const u = JSON.parse(await Neutralino.filesystem.readFile(plik));
    return {
      lokalnie: u?.lokalnie !== false,
      motyw: u?.motyw === 'ciemny' || u?.motyw === 'jasny' ? u.motyw : '',
    };
  } catch {
    return { ...DOMYSLNE };
  }
}

export async function zapiszUstawienia(plik, ustawienia) {
  await Neutralino.filesystem.writeFile(plik, JSON.stringify({ lokalnie: ustawienia.lokalnie !== false, motyw: ustawienia.motyw || undefined }));
}
