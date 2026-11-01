# Podgląd - obrazki poglądowe aplikacji Mikropłatności

Cztery obrazki zbiorcze pokazują wszystkie możliwości i stany aplikacji. **Obrazki odświeża się tylko na prośbę autora** - nie przy aktualizacji aplikacji (`pc\instalacja\instaluj.ps1`) ani po zmianach. Wtedy renderuje się od nowa te, które przestały pasować (tabela „Zależy od” poniżej mówi, które). Ostatnie odświeżenie: 01.11.2026.

| Plik | Co pokazuje | Zależy od |
|---|---|---|
| `01-noc-pelny-widok.png` | Cały ekran w motywie noc, 17 różnorodnych wierszy: data zakupu z przełącznikiem mies. / rok, termin pod lontem (także przesunięty o kolejne okresy), jednorazowe z „!” (aktywne i zakończona „sprawdź, czy anulowano”), nazwa i opis w jednej kolumnie, link skrócony do domeny, USD/EUR z „≈ zł”, cena od następnej płatności pod zapłaconą („NASTĘPNA”, drożej / bez zmian / koniec promocji), płatność ręczna (po terminie - mocno czerwony wiersz, „N dni po terminie” i pole ☐ zapłacone; za 2 dni - jaśniejsza czerwień i „zapłać do …”; zapłacona - zwykłe odliczanie), przycisk „⋯” na końcu wiersza, niebezpieczny link (zablokowana strzałka), wiersz bez dat; lont w wielu kolorach, miarka z etykietami na dwóch piętrach, spisy alarmów, paragon z prognozą i kursami NBP | wszystko: `index.html`, `wyglad.css`, wszystkie pliki `js/` |
| `02-dzien-pelny-widok.png` | To samo w motywie dzień | jak wyżej |
| `03-stany-i-dzialania.png` | (1) wykreślanie: przekreślony wiersz i okno „Na pewno wykreślić…?”; (2) przeciąganie wiersza za Lp. i błędna kwota; (3) płatność ręczna i otwarta karteczka „⋯” (przedłużać, sposób płatności); (4) bez internetu: kurs NBP zapamiętany | `tabela.js`, `main.js` (wykreślanie, przesuwanie, kursy), `alarmy.js` (terminy, płatność ręczna), `waluty.js`, `wyglad.css` |
| `04-sytuacje-szczegolne.png` | (1) pierwsze uruchomienie - pusty zeszyt; (2) uszkodzony plik danych - ostrzeżenie i blokada zapisu; (3) druga kopia aplikacji - komunikat | `main.js` (start, odczyt, blokada), `index.html`, `wyglad.css` |

**`dodatkowo/`** (na prośbę autora 01.11.2026, poza gitem) - sama tabela, bez reszty ekranu, tylko jasne tło (motyw dzień): cała tabela (`tabela-zeszyt-dzien.png`) i tabela z otwartą karteczką „⋯” (`tabela-zeszyt-karteczka-dzien.png`). Do tego sama karteczka „⋯” przy Spotify w każdym wariancie (skala 2×, kadr dokładnie do ramki karteczki): `karteczka-1-pobiera-sama-przedluzac-tak.png`, `karteczka-2-pobiera-sama-przedluzac-nie.png`, `karteczka-3-place-sam-przedluzac-tak.png`, `karteczka-4-place-sam-koniec-miesiaca.png`, `karteczka-5-place-sam-przedluzac-nie.png` - stany ustawiane kliknięciami w karteczce (dane testowe).

Daty w danych przykładowych liczą się od dnia renderowania, więc lont, miarka, alarmy i płatność ręczna zawsze wyglądają „aktualnie”.

## Jak wyrenderować od nowa

Pliki pomocnicze są w `zrodla/`:
- `przygotuj.mjs` - dane przykładowe **w folderze testowym** podanym w zmiennej `PODGLAD_DANE` (scenariusze `pelny-noc`, `pelny-dzien`, `pusty`, `uszkodzony`, `druga-kopia`, `usun`). Prawdziwych danych z `%APPDATA%\Mikroplatnosci` nigdy nie rusza - bez `PODGLAD_DANE` odmawia.
- `strony-testowe.js` - skrypt startowy przeglądarki: przekierowuje dane aplikacji do folderu testowego (`window.__DANE = '<folder testowy>';` na początku - bez tego każdy dostęp do plików jest blokowany) i blokuje powiadomienia Windows (serwer testowy to prawdziwy Neutralino - bez tego dane przykładowe dawały na pulpicie autora prawdziwe „Wycofaj: YouTube Premium”, 31.10.2026). Z `window.__TRYB = 'bez-internetu';` na początku symuluje brak sieci.
- `zestaw.html` - składa klatki w obrazek zbiorczy: `zestaw.html?zestaw=03&klatki=<adres folderu z klatkami>` (klatki `03a/03b/03c/03d.png`, `04a/04b/04c.png`).

**Bezpiecznik (obowiązkowo, po wypadku z 01.11.2026):** zanim przeglądarka otworzy aplikację, trzeba sprawdzić, że skrypt startowy działa - najpierw strona bez aplikacji (np. `http://127.0.0.1:58321/brak-strony-test`) i na niej `window.__DANE` = folder testowy oraz podmieniony `Neutralino`; po otwarciu aplikacji `Neutralino.os.getPath('data')` musi zwrócić folder testowy. Gdy coś się nie zgadza - stop. Dla pewności porównać listę plików `%APPDATA%\Mikroplatnosci` (rozmiar, data) przed i po.

Kroki:
1. Serwer testowy z folderu `pc`: `bin\neutralino-win_x64.exe --load-dir-res --path=. --mode=cloud --port=58321` - najlepiej osobno dla każdego scenariusza.
2. Dla każdego obrazka: `PODGLAD_DANE=<folder testowy> node zrodla/przygotuj.mjs <scenariusz>`, potem przeglądarka testowa (szerokość 1500 px) otwiera aplikację **ze skryptem startowym** = `window.__DANE = '<folder testowy>';` + treść `strony-testowe.js` (chrome-devtools: `navigate_page` z `initScript`; własny Edge bez okna przez CDP: `Page.enable`, potem `Page.addScriptToEvaluateOnNewDocument` - bez `Page.enable` skrypt potrafi nie zadziałać).
   - 01 / 02: `pelny-noc` / `pelny-dzien` (motyw przełączyć przyciskiem noc / dzień, jeśli trzeba). Całość jest wyższa niż ekran, więc przed zrzutem wyłączyć przewijanie kartki przez CSSOM (CSP blokuje wstawianie `<style>`): `html` i `body` - `height: auto !important`, `.kartka` - `overflow: visible !important; flex: none !important`, potem okno tak wysokie jak strona i zrzut. Z tego samego stanu (tylko motyw dzień) `dodatkowo/tabela-zeszyt-dzien.png` - zrzut przycięty do `.zeszyt-ramka`; `tabela-zeszyt-karteczka-dzien.png` - zwykłe okno 1500×860, „⋯” przy Spotify, kadr od nagłówka tabeli do dołu karteczki.
   - 03a: `pelny-noc`, fokus i kliknięcie „×” przy Netflix (okno 1500×640).
   - 03b: ten sam stan po „Zostaw”: w ChatGPT Plus koszt `20,5,1`, Spotify przeciągany pod Netflix (zdarzenia `dragstart` + `dragover` bez `dragend`).
   - 03c: `pelny-noc` (okno 1500×720), wiersz „Internet domowy” przewinięty na środek, kliknięte „⋯” przy nim.
   - 03d: `pelny-noc` + tryb `bez-internetu` (okno 1500×720).
   - 04a: `pusty` (1500×780); 04b: `uszkodzony` (1500×460); 04c: `druga-kopia` (1500×460) ze skryptem wstrzymującym samozamknięcie: `const s = setTimeout; window.setTimeout = (f, ms, ...a) => (ms === 4000 ? 0 : s(f, ms, ...a));` - inaczej `app.exit` zamknie serwer testowy.
3. Klatki 03*/04* do folderu tymczasowego, potem `zestaw.html` → zrzut całej strony (szerokość 1580 px) do `Podgląd/03-…png` / `04-…png`.
4. Na koniec: `PODGLAD_DANE=<folder testowy> node zrodla/przygotuj.mjs usun`, zamknięcie serwera testowego i przeglądarki testowej.
