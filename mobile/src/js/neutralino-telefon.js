// Zamiennik Neutralino na telefonie: te same wywołania co w aplikacji PC, obsłużone przez wtyczki
// Capacitora. Dzięki temu wspólne pliki (waluty.js, dysk.js) działają bez zmian.
// Pliki leżą w prywatnym folderze aplikacji (Directory.Data) - inne aplikacje ich nie widzą.

(() => {
  const Filesystem = Capacitor.registerPlugin('Filesystem');
  const Browser = Capacitor.registerPlugin('Browser');
  const DATA = 'DATA';
  const sciezka = (p) => String(p).replace(/^\/+/, '');

  window.Neutralino = {
    os: {
      getPath: async () => '',
      open: async (adres) => {
        if (!/^https:\/\//i.test(adres)) throw new Error('otwierane są tylko adresy https');
        await Browser.open({ url: adres });
      },
    },
    filesystem: {
      readFile: async (p) => (await Filesystem.readFile({ path: sciezka(p), directory: DATA, encoding: 'utf8' })).data,
      // Podmiana pliku tymczasowego na właściwy (magazyn.js) - przy błędzie magazyn zapisuje wprost.
      move: async (z, doCelu) => {
        await Filesystem.rename({ from: sciezka(z), to: sciezka(doCelu), directory: DATA, toDirectory: DATA });
      },
      readDirectory: async (p) => (await Filesystem.readdir({ path: sciezka(p), directory: DATA })).files
        .map((f) => ({ entry: f.name, type: f.type === 'directory' ? 'DIRECTORY' : 'FILE' })),
      writeFile: async (p, dane) => {
        await Filesystem.writeFile({ path: sciezka(p), data: dane, directory: DATA, encoding: 'utf8', recursive: true });
      },
      // Brak pliku zgłaszany kodem jak na PC (NE_FS_NOPATHE) - inny błąd zostaje błędem i blokuje zapis.
      getStats: async (p) => {
        try {
          return await Filesystem.stat({ path: sciezka(p), directory: DATA });
        } catch (e) {
          if (e?.code === 'OS-PLUG-FILE-0008' || /does not exist/i.test(e?.message ?? '')) {
            throw Object.assign(new Error('Nie ma pliku: ' + sciezka(p)), { code: 'NE_FS_NOPATHE' });
          }
          throw e;
        }
      },
      remove: async (p) => {
        await Filesystem.deleteFile({ path: sciezka(p), directory: DATA });
      },
    },
  };
})();
