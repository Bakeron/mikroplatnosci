// Opcje z propozycji 02.11.2026 (PC): inne okresy, zmienna kwota przy „płacę sam” i historia wpłat,
// wspólne subskrypcje, pauza, więcej walut, prowizja banku, historia wydatków.
// Stały „dziś”: wtorek 10.11.2026.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { termin, okres, nazwaOkresu, czyWstrzymana, zbierzAlarmy, dniPlatnosci, ostatniaPlatnosc, oznaczZaplate, doZaplaty, isoDnia, zakupBiezacegoOkresu, przeniesNastepnaCene } from '../resources/js/alarmy.js';
import { policz } from '../resources/js/podsumowanie.js';
import { normalizuj, zapiszZmianeCeny, zastosujFormularz, nowyWpis } from '../resources/js/dane.js';
import { przypomnienia } from '../resources/js/powiadomienia.js';
import { wczytajZapamietane, odswiezZNbp, przeliczNaPln, ustawProwizje } from '../resources/js/waluty.js';
import { wydatkiRoku, cenaWDniu, zmianyCen } from '../resources/js/historia.js';

mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 10, 10, 0).getTime() });
const iso = (d) => (d ? isoDnia(d) : null);
const wpis = (extra) => normalizuj({ id: 'x', nazwa: 'x', przedluzac: 'tak', waluta: 'PLN', ...extra });

test('okresy: kwartał, co 2 lata, co tydzień, co 4 tygodnie - termin i nazwa', () => {
  assert.equal(iso(termin(wpis({ od: '2026-01-15', okres: 'M', coIle: 3 })).data), '2027-01-15'); // 15.04, 15.07, 15.10 minęły
  assert.equal(iso(termin(wpis({ od: '2025-03-01', okres: 'R', coIle: 2 })).data), '2027-03-01');
  assert.equal(iso(termin(wpis({ od: '2026-11-02', okres: 'T' })).data), '2026-11-16'); // 02.11 + 7 = 09.11 minął
  assert.equal(iso(termin(wpis({ od: '2026-10-01', okres: 'T', coIle: 4 })).data), '2026-11-26');
  assert.deepEqual(['M1', 'M3', 'M6', 'R2', 'T1', 'T4', 'M5', 'R5', 'T22'].map((k) => nazwaOkresu({ okres: k[0], coIle: Number(k.slice(1)) })),
    ['co miesiąc', 'co kwartał', 'co pół roku', 'co 2 lata', 'co tydzień', 'co 4 tygodnie', 'co 5 miesięcy', 'co 5 lat', 'co 22 tygodnie']);
  assert.equal(normalizuj({ okres: 'T', coIle: 0 }).coIle, 1);
  assert.equal(normalizuj({ okres: 'Q', coIle: 2.5 }).coIle, 1);
});

test('okresy na paragonie: kwartał i tydzień przeliczone na miesiąc, 2 lata na rok', () => {
  const s = policz([
    wpis({ koszt: 300, okres: 'M', coIle: 3, od: '2026-10-01' }),
    wpis({ koszt: 7, okres: 'T', od: '2026-10-01' }),
    wpis({ koszt: 240, okres: 'R', coIle: 2, od: '2026-01-01' }),
  ]);
  assert.equal(s.miesieczne, 100 + (7 * 365.25) / 7 / 12);
  assert.equal(s.roczne, 120);
  assert.equal(s.listaMiesieczne[0].dopisek, 'co kwartał 300,00 zł');
  assert.equal(s.listaRoczne.length, 1); // 2 lata - w „Roczne”
});

test('okres 2 lata alarmuje jak roczne, „nie” co tydzień bez progów dłuższych niż okres', () => {
  const { roczne } = zbierzAlarmy([wpis({ od: '2024-12-01', okres: 'R', coIle: 2 })]);
  assert.equal(roczne.length, 1); // 01.12.2026 - za niecały miesiąc
  const p = przypomnienia([wpis({ od: '2026-11-08', okres: 'T', przedluzac: 'nie' })]);
  assert.ok(p.every((x) => !/tydzień|tygodnie/.test(x.napis)));
});

test('zakupBiezacegoOkresu działa też dla tygodni', () => {
  assert.equal(zakupBiezacegoOkresu({ od: '2026-10-01', okres: 'T', coIle: 2 }), '2026-10-29');
});

test('kwota za każdym razem inna: „zapłacone” z kwotą zapisuje historię i zmienia koszt', () => {
  const w = wpis({ koszt: 200, okres: 'M', od: '2026-10-12', platnoscReczna: true, zmiennaKwota: true });
  assert.equal(doZaplaty(w).dni, 2);
  assert.equal(oznaczZaplate(w, 231.4), true);
  assert.equal(w.koszt, 231.4);
  assert.deepEqual(w.historia, [{ termin: '2026-11-12', dnia: '2026-11-10', kwota: 231.4 }]);
  // Bez zmiennej kwoty: zapłacona cena od następnej płatności - staje się kosztem i znika (A3).
  const s = wpis({ koszt: 50, prognoza: 55, okres: 'M', od: '2026-10-12', platnoscReczna: true });
  oznaczZaplate(s);
  assert.deepEqual([s.koszt, s.prognoza], [55, null]);
  assert.equal(s.historia[0].kwota, 55);
  assert.equal(normalizuj({ historia: [{ termin: 'x', dnia: '2026-01-01', kwota: 1 }, { termin: '2026-01-01', dnia: '2026-01-02', kwota: 5 }] }).historia.length, 1);
});

test('wspólna subskrypcja: na paragonie tylko moja część, ostatnia płatność do odbioru', () => {
  const w = wpis({ koszt: 60, okres: 'M', od: '2026-09-05', osob: 4 });
  const s = policz([w]);
  assert.equal(s.miesieczne, 15);
  assert.equal(s.listaMiesieczne[0].dopisek, 'moja część 1/4');
  assert.equal(iso(ostatniaPlatnosc(w)), '2026-11-05');
  assert.equal(normalizuj({ osob: 50 }).osob, 1);
});

test('pauza: do wznowienia bez alarmów i poza sumą, potem terminy od dnia wznowienia', () => {
  const w = wpis({ koszt: 100, okres: 'M', od: '2026-01-20', wstrzymanaOd: '2026-11-01', wstrzymanaDo: '2027-01-05' });
  assert.equal(czyWstrzymana(w), true);
  assert.equal(iso(termin(w).data), '2027-01-05');
  assert.equal(policz([w]).miesieczne, 0);
  assert.equal(policz([w]).listaMiesieczne[0].wstrzymana, '05.01.2027');
  // Po wznowieniu (w przeszłości): co miesiąc od dnia wznowienia.
  const po = wpis({ okres: 'M', od: '2026-01-20', wstrzymanaOd: '2026-06-01', wstrzymanaDo: '2026-08-03' });
  assert.equal(czyWstrzymana(po), false);
  assert.equal(iso(termin(po).data), '2026-12-03');
  // Płatności: do maja co 20., potem od 03.08.
  assert.deepEqual(dniPlatnosci(po, new Date(2026, 3, 1), new Date(2026, 10, 10)).map(iso), ['2026-04-20', '2026-05-20', '2026-08-03', '2026-09-03', '2026-10-03', '2026-11-03']);
  // Płacę sam po pauzie: dzień wznowienia do zapłaty (w czasie pauzy - nic).
  const reczna = wpis({ okres: 'M', od: '2026-01-20', platnoscReczna: true, zaplaconyTermin: '2026-05-20', wstrzymanaOd: '2026-06-01', wstrzymanaDo: '2026-11-09' });
  assert.equal(iso(doZaplaty(reczna)?.data), '2026-11-09');
  assert.equal(doZaplaty({ ...reczna, wstrzymanaDo: '2026-11-12' }), null);
});

test('historia cen: zmiana zapamiętana od dziś, literówka tego samego dnia nie robi drugiej zmiany', () => {
  const w = wpis({ koszt: 49 });
  zapiszZmianeCeny(w, 43);
  assert.deepEqual(w.ceny, [{ od: '', kwota: 43 }, { od: '2026-11-10', kwota: 49 }]);
  w.koszt = 52;
  zapiszZmianeCeny(w, 49);
  assert.deepEqual(w.ceny.at(-1), { od: '2026-11-10', kwota: 52 });
  w.koszt = 43;
  zapiszZmianeCeny(w, 52);
  assert.deepEqual(w.ceny, []); // powrót do ceny początkowej tego samego dnia - bez zmian
  assert.equal(cenaWDniu(wpis({ koszt: 49, ceny: [{ od: '', kwota: 43 }, { od: '2026-06-01', kwota: 49 }] }), new Date(2026, 4, 1)), 43);
});

test('historia wydatków: miesiące roku, dokładne wpłaty z historii i szacunek z harmonogramu', () => {
  const netflix = wpis({ id: 'n', nazwa: 'Netflix', koszt: 49, okres: 'M', od: '2026-08-15', ceny: [{ od: '', kwota: 43 }, { od: '2026-10-01', kwota: 49 }] });
  const prad = wpis({ id: 'p', nazwa: 'Prąd', koszt: 230, okres: 'M', od: '2026-08-10', platnoscReczna: true, zmiennaKwota: true, zaplaconyTermin: '2026-10-10',
    historia: [{ termin: '2026-09-10', dnia: '2026-09-08', kwota: 180 }, { termin: '2026-10-10', dnia: '2026-10-11', kwota: 230 }] });
  const w = wydatkiRoku([netflix, prad], 2026);
  assert.deepEqual(w.miesiace.map((m) => m.suma).slice(7, 11), [43 + 230, 43 + 180, 49 + 230, 0]); // listopad: Netflix dopiero 15.11
  assert.equal(w.pozycje[0].nazwa, 'Prąd');
  assert.equal(w.szacunek, true);
  const zmiany = zmianyCen([netflix, prad]);
  assert.ok(zmiany.some((z) => z.nazwa === 'Netflix' && z.z === 43 && z.na === 49));
  assert.ok(zmiany.some((z) => z.nazwa === 'Prąd' && z.min === 180 && z.max === 230));
});

test('telefon (formularz bez tygodni): edycja zostawia okres i „co ile”, zmiana okresu wraca do 1', () => {
  const wpisy = [wpis({ okres: 'T', coIle: 4, koszt: 10 })];
  zastosujFormularz(wpisy, wpisy[0], { nazwa: 'x', opis: '', koszt: '12', waluta: 'PLN', od: '', okres: '', przedluzac: 'tak', prognoza: '', platnosc: '', link: '' });
  assert.deepEqual([wpisy[0].okres, wpisy[0].coIle, wpisy[0].ceny.length], ['T', 4, 2]);
  zastosujFormularz(wpisy, wpisy[0], { nazwa: 'x', opis: '', koszt: '12', waluta: 'PLN', od: '', okres: 'R', przedluzac: 'tak', prognoza: '', platnosc: '', link: '' });
  assert.deepEqual([wpisy[0].okres, wpisy[0].coIle], ['R', 1]);
  assert.deepEqual(normalizuj(nowyWpis()).historia, []);
});

test('więcej walut z NBP i prowizja banku doliczana do kursu', async () => {
  const pliki = new Map();
  globalThis.Neutralino = { filesystem: { readFile: async (p) => pliki.get(p), writeFile: async (p, d) => { pliki.set(p, d); } } };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [{ effectiveDate: '2026-11-10', rates: [
    { code: 'USD', mid: 3.9 }, { code: 'EUR', mid: 4.2 }, { code: 'GBP', mid: 5 }, { code: 'HUF', mid: 0.011 }, { code: 'CZK', mid: 500 },
  ] }] });
  await odswiezZNbp('k.json');
  assert.equal(przeliczNaPln(10, 'GBP'), 50);
  assert.equal(przeliczNaPln(1000, 'HUF'), 11);
  assert.equal(przeliczNaPln(10, 'CZK'), null); // kurs spoza zakresu odrzucony
  ustawProwizje(2);
  assert.equal(przeliczNaPln(10, 'GBP'), 51);
  assert.equal(przeliczNaPln(10, 'PLN'), 10);
  ustawProwizje(50); // poza zakresem - 0
  assert.equal(przeliczNaPln(10, 'GBP'), 50);
  // Stary plik kursów (tylko USD i EUR) dalej się wczytuje.
  pliki.set('s.json', JSON.stringify({ USD: 3.95, EUR: 4.39, data: '2026-10-30', pobrano: '2026-10-30' }));
  await wczytajZapamietane('s.json');
  assert.equal(przeliczNaPln(1, 'EUR'), 4.39);
  assert.equal(przeliczNaPln(1, 'GBP'), null);
});

test('A3: cena następna staje się zapłaconą w dniu następnej płatności (pobiera się sama)', () => {
  const w = wpis({ koszt: 43, prognoza: 49, okres: 'M', od: '2026-10-15' });
  assert.equal(przeniesNastepnaCene(w), 'termin'); // dzień zapamiętany: najbliższa płatność 15.11
  assert.equal(w.prognozaOd, '2026-11-15');
  assert.equal(przeniesNastepnaCene(w), ''); // przed tym dniem nic się nie zmienia
  assert.equal(w.koszt, 43);
  mock.timers.setTime(new Date(2026, 10, 15, 8, 0).getTime());
  try {
    assert.equal(przeniesNastepnaCene(w), 'cena');
    assert.deepEqual([w.koszt, w.prognoza, w.prognozaOd], [49, null, '']);
    assert.deepEqual(w.ceny, [{ od: '', kwota: 43 }, { od: '2026-11-15', kwota: 49 }]);
    // Cena wpisana w dniu płatności - obowiązuje od kolejnej (dzisiejsza zeszła po starej).
    const dzis = wpis({ koszt: 10, prognoza: 12, okres: 'M', od: '2026-10-15' });
    przeniesNastepnaCene(dzis);
    assert.equal(dzis.prognozaOd, '2026-12-15');
  } finally {
    mock.timers.setTime(new Date(2026, 10, 10, 10, 0).getTime());
  }
});

test('A3: płacę sam - nowa cena przy „zapłacone” za jej termin, nie za starszą zaległość; „nie” i pauza bez zmian', () => {
  const w = wpis({ koszt: 100, prognoza: 120, prognozaOd: '2026-11-12', okres: 'M', od: '2026-09-12', platnoscReczna: true });
  oznaczZaplate(w); // zaległość z 12.10 - jeszcze po starej cenie
  assert.deepEqual([w.historia[0].kwota, w.koszt, w.prognoza], [100, 100, 120]);
  assert.equal(przeniesNastepnaCene(w), ''); // przy „płacę sam” nie zmienia się sama
  oznaczZaplate(w); // 12.11 - już nowa
  assert.deepEqual([w.historia[1].kwota, w.koszt, w.prognoza], [120, 120, null]);
  assert.equal(przeniesNastepnaCene(wpis({ koszt: 5, prognoza: 6, okres: 'M', od: '2026-10-15', przedluzac: 'nie' })), '');
  assert.equal(przeniesNastepnaCene(wpis({ koszt: 5, prognoza: 6, okres: 'M', od: '2026-10-15', wstrzymanaDo: '2027-01-01' })), '');
});
