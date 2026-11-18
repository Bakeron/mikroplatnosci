// Zasobnik przy zegarze (tylko PC, autor 18.11.2026): krzyżyk okna chowa aplikację do ikony na dole po prawej -
// dalej działa (zapis, Dysk, powiadomienia co 30 min), a całkiem zamyka ją dopiero „Zamknij” w menu ikony
// (lewy albo prawy przycisk). Ustawienie „zasobnik” w ustawienia.json, domyślnie włączone.
// Druga kopia aplikacji (np. skrót z menu Start, gdy okno jest schowane) zostawia w folderze danych plik
// PLIK_POKAZ - pierwsza obserwuje folder i pokazuje swoje okno.

import { t } from './teksty.js';

export const PLIK_POKAZ = 'pokaz-okno';
const IKONA = '/resources/icons/zasobnik.png';

// Ikona z menu; ponownie wywołana (np. po zmianie języka) podmienia napisy.
export const ustawIkone = async () => Neutralino.os.setTray({
  icon: IKONA,
  menuItems: [
    { id: 'pokaz', text: t('Otwórz Mikropłatności') },
    { id: 'kreska', text: '-' },
    { id: 'zamknij', text: t('Zamknij') },
  ],
});

export async function pokazOkno() {
  await Neutralino.window.show();
  await Neutralino.window.unminimize().catch(() => {});
  await Neutralino.window.focus().catch(() => {});
}

export const schowajOkno = () => Neutralino.window.hide();

// naPokaz - prośba drugiej kopii o pokazanie okna; plik prośby usuwany od razu.
export async function obserwujProsby(folder, naPokaz) {
  const plik = `${folder}/${PLIK_POKAZ}`;
  await Neutralino.filesystem.remove(plik).catch(() => {}); // stara prośba (np. po zawieszeniu)
  const id = await Neutralino.filesystem.createWatcher(folder);
  Neutralino.events.on('watchFile', (e) => {
    const { id: watcher, action, filename } = e.detail ?? {};
    if (watcher !== id || filename !== PLIK_POKAZ || action === 'delete') return;
    Neutralino.filesystem.remove(plik).catch(() => {});
    naPokaz();
  });
}

// Druga kopia: prośba do pierwszej o pokazanie jej okna.
export const poprosOPokazanie = (folder) => Neutralino.filesystem.writeFile(`${folder}/${PLIK_POKAZ}`, String(Date.now()));
