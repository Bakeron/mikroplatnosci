// Waluty w ustawieniach (lista zamiast przełącznika „Waluty obce”) i osobna waluta ceny następnej (10.11.2026):
// domyślne waluty, przeniesienie ceny razem z walutą, historia wydatków w walucie każdej wpłaty, formularz, plik.
// Stały „dziś”: wtorek 10.11.2026. Neutralino udawane w pamięci (kursy NBP z pliku).
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { wczytajZapamietane } from '../resources/js/waluty.js';
import { funkcja, ustawWaluty, pobierzWaluty, uzyteWaluty, walutyNaStart, walutyWyboru, walutaNastepnej, zmianaNastepnej } from '../resources/js/funkcje.js';
import { przeniesNastepnaCene, oznaczZaplate } from '../resources/js/alarmy.js';
import { normalizuj, zastosujFormularz, odczytajDane, doZapisu } from '../resources/js/dane.js';
import { wydatkiRoku, zmianyCen } from '../resources/js/historia.js';
import { policz } from '../resources/js/podsumowanie.js';

mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 10, 10, 0).getTime() });

const pliki = new Map();
globalThis.Neutralino = {
  filesystem: {
    readFile: async (p) => { if (!pliki.has(p)) throw new Error('brak'); return pliki.get(p); },
    writeFile: async (p, d) => { pliki.set(p, d); },
  },
};

beforeEach(async () => {
  pliki.set('kursy.json', JSON.stringify({ USD: 3.9, EUR: 4.2, GBP: 5, data: '2026-11-09', pobrano: '2026-11-10' }));
  await wczytajZapamietane('kursy.json');
  ustawWaluty(['PLN']);
});

const wpis = (extra) => normalizuj({ nazwa: 'x', od: '2026-10-05', okres: 'M', przedluzac: 'tak', ...extra });

test('waluty: same złote = „waluty” wyłączone; złote zawsze, kolejność stała, nieznane pominięte', () => {
  assert.equal(funkcja('waluty'), false);
  ustawWaluty(['EUR', 'XYZ', 'USD']);
  assert.deepEqual(pobierzWaluty(), ['PLN', 'USD', 'EUR']);
  assert.equal(funkcja('waluty'), true);
  ustawWaluty('zle');
  assert.deepEqual(pobierzWaluty(), ['PLN']);
});

test('waluty na start: nowa osoba i wyłączone „Waluty obce” - same złote; włączone - USD, EUR i waluty z pozycji', () => {
  assert.deepEqual(walutyNaStart(false, []), ['PLN']);
  assert.deepEqual(walutyNaStart(true, []), ['PLN', 'USD', 'EUR']);
  const wpisy = [wpis({ waluta: 'GBP', koszt: 5 }), wpis({ koszt: 20, prognoza: 30, walutaNastepna: 'CHF' })];
  assert.deepEqual(walutyNaStart(false, wpisy), ['PLN']);
  assert.deepEqual(walutyNaStart(true, wpisy), ['PLN', 'USD', 'EUR', 'GBP', 'CHF']);
});

test('waluty z pozycji: koszt i cena następna (tylko wpisana), ile pozycji; wybór przy pozycji', () => {
  const uzyte = uzyteWaluty([
    wpis({ waluta: 'USD', koszt: 5 }),
    wpis({ waluta: 'USD', koszt: 5, prognoza: 6, walutaNastepna: 'EUR' }),
    wpis({ koszt: 5, walutaNastepna: 'GBP' }), // bez ceny następnej - jej waluta się nie liczy
  ]);
  assert.deepEqual([...uzyte], [['USD', 2], ['EUR', 1]]);
  ustawWaluty(['PLN', 'EUR']);
  assert.deepEqual(walutyWyboru('JPY'), ['PLN', 'EUR', 'JPY']);
  assert.deepEqual(walutyWyboru('PLN', 'USD'), ['PLN', 'USD', 'EUR']);
});

test('waluta ceny następnej: puste = jak koszt; różnica w złotych przy innej walucie', () => {
  assert.equal(walutaNastepnej(wpis({ waluta: 'USD', koszt: 20, prognoza: 25 })), 'USD');
  assert.deepEqual(zmianaNastepnej(wpis({ koszt: 20, prognoza: 25 })), { roznica: 5, kod: 'PLN' });
  assert.deepEqual(zmianaNastepnej(wpis({ waluta: 'USD', koszt: 20, prognoza: 18 })), { roznica: -2, kod: 'USD' });
  // Perplexity: zapłacone 20 zł, następna 200 USD (kurs 3,9) - drożej o 760 zł.
  assert.deepEqual(zmianaNastepnej(wpis({ koszt: 20, prognoza: 200, walutaNastepna: 'USD' })), { roznica: 760, kod: 'PLN' });
  assert.equal(zmianaNastepnej(wpis({ koszt: 20, prognoza: 200, walutaNastepna: 'JPY' })), null, 'brak kursu');
  // Paragon: prognoza po kursie waluty ceny następnej.
  const s = policz([wpis({ koszt: 20, prognoza: 200, walutaNastepna: 'USD' })]);
  assert.equal(s.prognozaNaMiesiac, 780);
});

test('cena następna w innej walucie przechodzi do kosztu razem z walutą; dawna cena zostaje w dawnej walucie', () => {
  const w = wpis({ koszt: 20, prognoza: 200, walutaNastepna: 'USD', prognozaOd: '2026-11-05' });
  assert.equal(przeniesNastepnaCene(w), 'cena');
  assert.equal(w.waluta, 'USD');
  assert.equal(w.koszt, 200);
  assert.equal(w.prognoza, null);
  assert.equal(w.walutaNastepna, '');
  assert.deepEqual(w.ceny, [{ od: '', kwota: 20, waluta: 'PLN' }, { od: '2026-11-05', kwota: 200 }]);
  // Historia wydatków: październik 20 zł, listopad 200 USD = 780 zł (nie 20 USD i nie 200 zł).
  const rok = wydatkiRoku([w], 2026);
  assert.equal(rok.miesiace[9].suma, 20);
  assert.equal(rok.miesiace[10].suma, 780);
  // „Zmiany cen”: z walutą przed i po.
  const [zmiana] = zmianyCen([w]);
  assert.deepEqual([zmiana.z, zmiana.kodZ, zmiana.na, zmiana.kod], [20, 'PLN', 200, 'USD']);
  // Ta sama waluta - jak dotąd, bez pola waluta.
  const t = wpis({ koszt: 20, prognoza: 25, prognozaOd: '2026-11-05' });
  przeniesNastepnaCene(t);
  assert.deepEqual(t.ceny, [{ od: '', kwota: 20 }, { od: '2026-11-05', kwota: 25 }]);
});

test('płacę sam: zapłata po cenie następnej w innej walucie - dawne wpłaty w dawnej walucie, ta w nowej', () => {
  const w = wpis({
    od: '2026-10-12', koszt: 20, prognoza: 50, walutaNastepna: 'EUR', platnoscReczna: true,
    historia: [{ termin: '2026-10-12', dnia: '2026-10-12', kwota: 20 }],
  });
  assert.equal(oznaczZaplate(w), true);
  assert.equal(w.waluta, 'EUR');
  assert.equal(w.koszt, 50);
  assert.deepEqual(w.historia, [
    { termin: '2026-10-12', dnia: '2026-10-12', kwota: 20, waluta: 'PLN' },
    { termin: '2026-11-12', dnia: '2026-11-10', kwota: 50 },
  ]);
  const rok = wydatkiRoku([w], 2026);
  assert.equal(rok.miesiace[9].suma, 20);
  assert.equal(rok.miesiace[10].suma, 210); // 50 EUR × 4,2
});

test('plik i formularz: waluta ceny następnej i waluty przy wpłatach zapisane; ta sama co koszt = puste', () => {
  const w = wpis({ koszt: 20, prognoza: 200, walutaNastepna: 'USD', historia: [{ termin: '2026-10-05', dnia: '2026-10-05', kwota: 20, waluta: 'PLN' }], ceny: [{ od: '', kwota: 20, waluta: 'XYZ' }] });
  assert.equal(w.walutaNastepna, 'USD');
  assert.equal(w.historia[0].waluta, 'PLN');
  assert.equal('waluta' in w.ceny[0], false, 'nieznana waluta pominięta');
  assert.equal(normalizuj({ walutaNastepna: 'XYZ' }).walutaNastepna, '');
  const stan = { wpisy: [w], usuniete: [] };
  assert.deepEqual(odczytajDane(JSON.parse(JSON.stringify(doZapisu(stan)))).wpisy, [w]);

  const pola = { nazwa: 'a', opis: '', koszt: '20', waluta: 'PLN', prognoza: '200', od: '2026-10-05', link: '' };
  const wpisy = [];
  const { wpis: nowy } = zastosujFormularz(wpisy, null, { ...pola, walutaNastepna: 'USD' });
  assert.equal(nowy.walutaNastepna, 'USD');
  zastosujFormularz(wpisy, nowy, { ...pola, walutaNastepna: 'PLN' });
  assert.equal(nowy.walutaNastepna, '', 'ta sama co koszt');
  nowy.walutaNastepna = 'EUR';
  zastosujFormularz(wpisy, nowy, pola);
  assert.equal(nowy.walutaNastepna, 'EUR', 'formularz bez pola - bez zmian');
});
