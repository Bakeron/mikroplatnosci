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
      getEnv: async (nazwa) => String(window.GOOGLE_KLUCZE?.[nazwa] ?? ''),
      open: async (adres) => {
        if (!/^https:\/\//i.test(adres)) throw new Error('otwierane są tylko adresy https');
        await Browser.open({ url: adres });
      },
    },
    filesystem: {
      readFile: async (p) => (await Filesystem.readFile({ path: sciezka(p), directory: DATA, encoding: 'utf8' })).data,
      writeFile: async (p, dane) => {
        await Filesystem.writeFile({ path: sciezka(p), data: dane, directory: DATA, encoding: 'utf8', recursive: true });
      },
      getStats: async (p) => Filesystem.stat({ path: sciezka(p), directory: DATA }),
      remove: async (p) => {
        await Filesystem.deleteFile({ path: sciezka(p), directory: DATA });
      },
    },
  };
})();
