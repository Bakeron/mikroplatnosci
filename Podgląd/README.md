# Podgląd - obrazki poglądowe aplikacji Mikropłatności

Cztery obrazki zbiorcze pokazują wszystkie możliwości i stany aplikacji. **Przy każdej aktualizacji aplikacji (`instalacja\instaluj.ps1`) obrazek, który przestał pasować, trzeba wyrenderować od nowa** (tabela „Zależy od” poniżej mówi, który) - nie po każdej drobnej zmianie.

| Plik | Co pokazuje | Zależy od |
|---|---|---|
| `01-noc-pelny-widok.png` | Cały ekran w motywie noc, 14 różnorodnych wierszy: data zakupu z przełącznikiem mies. / rok, termin pod lontem (także przesunięty o kolejne okresy), jednorazowe z „!” (aktywne i zakończona „sprawdź, czy anulowano”), nazwa i opis w jednej kolumnie, link skrócony do domeny, USD/EUR z „≈ zł”, prognozy (ręcznie drożej / bez zmian, ze strony drożej / taniej, nieudany odczyt), niebezpieczny link (zablokowana strzałka), wiersz bez dat; lont w wielu kolorach, miarka z etykietami na dwóch piętrach, spisy alarmów, paragon z prognozą i kursami NBP | wszystko: `index.html`, `wyglad.css`, wszystkie pliki `js/` |
| `02-dzien-pelny-widok.png` | To samo w motywie dzień | jak wyżej |
| `03-stany-i-dzialania.png` | (1) wykreślanie: przekreślony wiersz i okno „Na pewno wykreślić…?”; (2) przeciąganie wiersza za Lp. i błędna kwota; (3) bez internetu: kurs zapamiętany, „sprawdzam stronę…”, błędy odczytu ceny | `tabela.js`, `main.js` (wykreślanie, przesuwanie, kursy), `ceny.js`, `waluty.js`, `wyglad.css` |
| `04-sytuacje-szczegolne.png` | (1) pierwsze uruchomienie - pusty zeszyt; (2) uszkodzony plik danych - ostrzeżenie i blokada zapisu; (3) druga kopia aplikacji - komunikat | `main.js` (start, odczyt, blokada), `index.html`, `wyglad.css` |

Daty w danych przykładowych liczą się od dnia renderowania, więc lont, miarka i alarmy zawsze wyglądają „aktualnie”.

## Jak wyrenderować od nowa

Pliki pomocnicze są w `zrodla/`:
- `przygotuj.mjs` - dane przykładowe **w folderze testowym** podanym w zmiennej `PODGLAD_DANE` (scenariusze `pelny-noc`, `pelny-dzien`, `pusty`, `uszkodzony`, `druga-kopia`, `usun`). Prawdziwych danych z `%APPDATA%\Mikroplatnosci` nigdy nie rusza - bez `PODGLAD_DANE` odmawia.
- `strony-testowe.js` - skrypt startowy przeglądarki: przekierowuje dane aplikacji do folderu testowego (`window.__DANE = '<folder testowy>';` na początku - bez tego każdy dostęp do plików jest blokowany) i podstawia strony sklepów (Spotify z JSON-LD, ESET z ceną w tekście, siłownia bez ceny), żeby kolumna „Prognoza” pokazała wszystkie przypadki. Z `window.__TRYB = 'bez-internetu';` na początku symuluje brak sieci.
- `zestaw.html` - składa klatki w obrazek zbiorczy: `zestaw.html?zestaw=03&klatki=<adres folderu z klatkami>` (klatki `03a/03b/03c.png`, `04a/04b/04c.png`).

Kroki:
1. Serwer testowy z katalogu projektu: `bin\neutralino-win_x64.exe --load-dir-res --path=. --mode=cloud --port=58321`.
2. Dla każdego obrazka: `PODGLAD_DANE=<folder testowy> node zrodla/przygotuj.mjs <scenariusz>`, potem przeglądarka testowa (chrome-devtools, szerokość 1500 px) otwiera `http://127.0.0.1:58321/` **nawigacją z initScript** = `window.__DANE = '<folder testowy>';` + treść `strony-testowe.js` (samo przeładowanie strony gubi skrypt startowy i zamyka serwer testowy).
   - 01 / 02: `pelny-noc` / `pelny-dzien`, wysokość okna tak, żeby nic się nie przewijało (ok. 1830 px), zrzut całego okna.
   - 03a: `pelny-noc`, najechanie i kliknięcie „×” przy Netflix (okno 1500×640).
   - 03b: ten sam stan po „Zostaw”: w ChatGPT Plus koszt `20,5,1`, Spotify przeciągany pod Netflix (zdarzenia `dragstart` + `dragover` bez `dragend`).
   - 03c: `pelny-noc` + tryb `bez-internetu` (okno 1500×720).
   - 04a: `pusty` (1500×780); 04b: `uszkodzony` (1500×460); 04c: `druga-kopia` (1500×460) z initScript wstrzymującym samozamknięcie: `const s = setTimeout; window.setTimeout = (f, ms, ...a) => (ms === 4000 ? 0 : s(f, ms, ...a));` - inaczej `app.exit` zamknie serwer testowy.
3. Klatki 03*/04* do folderu tymczasowego, potem `zestaw.html` → zrzut całej strony (szerokość 1580 px) do `Podgląd/03-…png` / `04-…png`.
4. Na koniec: `PODGLAD_DANE=<folder testowy> node zrodla/przygotuj.mjs usun`, zamknięcie serwera testowego i przeglądarki testowej.
