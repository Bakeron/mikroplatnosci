# Podgląd - obrazki poglądowe aplikacji Mikropłatności (PC)

Pięć obrazków zbiorczych pokazuje wszystkie możliwości i stany aplikacji na komputerze. **Obrazki odświeża się tylko na prośbę autora** - nie przy aktualizacji aplikacji (`pc\instalacja\instaluj.ps1`) ani po zmianach. Wtedy renderuje się od nowa wszystkie (jedno polecenie, ok. 3 min). Ostatnie odświeżenie: 14.11.2026 (wersja 2026.11.13.2122).

| Plik | Co pokazuje | Zależy od |
|---|---|---|
| `01-noc-pelny-widok.png` | Cały ekran w motywie noc, wszystkie funkcje włączone, 20 różnorodnych wierszy: filtr kategorii nad tabelą, kategorie i „na firmę” (z „pobierz fakturę”), koszt dzielony na 4 osoby („odbierz po … zł”), miesięczne, roczne, co tydzień, co kwartał, pauza („wstrzymana”), jednorazowe z „!” (aktywne i zakończona „sprawdź, czy anulowano”), USD/EUR z „≈ zł” i prowizją banku, cena następna (drożej / bez zmian / koniec promocji), płatność ręczna (po terminie, za 2 dni, zapłacona), niebezpieczny link, wiersz bez dat; „Anulowane” zwinięte, miarka, spisy alarmów, historia wydatków z wykresem i zmianami cen, paragon z budżetem („ponad budżet”), sumą firmową, kategoriami i oszczędnością z anulowanych | wszystko: `index.html`, `wyglad.css`, wszystkie pliki `js/` |
| `02-dzien-pelny-widok.png` | To samo w motywie dzień | jak wyżej |
| `03-stany-i-dzialania.png` | (1) wykreślanie - okno „Wykreślić…?”; (2) przeciąganie wiersza za Lp. i błędna kwota; (3) karteczka „⋯” w trzech wariantach (pobiera się sama + podział, płacę sam, nie przedłużać), grupy rozwinięte; (4) „zapłacone” z pytaniem „ile?”; (5) filtr „dom i rachunki” i rozwinięte „Anulowane”; (6) prowizja banku i objaśnienie „?”; (7) bez internetu - kurs NBP zapamiętany | `tabela.js`, `main.js`, `alarmy.js`, `filtr.js`, `anulowane.js`, `pomoc.js`, `waluty.js`, `wyglad.css` |
| `04-ustawienia-i-okna.png` | Okno „Ustawienia” - zakładki Zeszyt, Powiadomienia, Synchronizacja, Kopia i import; import z wyciągu bankowego; pierwsze połączenie z Google Dyskiem (instrukcja); „o aplikacji” z licencjami | `ustawieniaOkno.js`, `funkcje.js`, `wyciagOkno.js`, `wyciag.js`, `synchronizacja.js`, `oAplikacji.js`, `index.html`, `wyglad.css` |
| `05-sytuacje-szczegolne.png` | (1) pierwsze uruchomienie - „pierwsze kroki” i przykład; (2) uszkodzony plik danych; (3) druga kopia aplikacji; (4) bez zapisu (lokalnie i Dysk wyłączone); (5) wersja angielska (motyw dzień); (6) wszystkie dodatki wyłączone | `main.js` (start, odczyt, blokada), `teksty-en.js`, `funkcje.js`, `index.html`, `wyglad.css` |

Daty w danych przykładowych liczą się od dnia renderowania, więc lont, miarka, alarmy i płatność ręczna zawsze wyglądają „aktualnie”. Telefonu tu nie ma.

## Jak wyrenderować od nowa

Z folderu `Podgląd` (Git Bash):

```
PODGLAD_DANE="C:/Users/Public/Mikroplatnosci-podglad" PODGLAD_KLATKI="<folder tymczasowy>/klatki" node zrodla/zrzuty.mjs
```

Potem sprzątanie: `PODGLAD_DANE=... node zrodla/przygotuj.mjs usun` i usunięcie pustego folderu `C:\Users\Public\Mikroplatnosci-podglad`. Folder danych bez nazwy użytkownika, bo komunikat o uszkodzonym pliku (05) pokazuje pełną ścieżkę.

Pliki w `zrodla/`:
- `zrzuty.mjs` - całość: dla każdego scenariusza dane przykładowe, osobny serwer testowy Neutralino (`--mode=cloud`, port 58321 - token dostaje tylko pierwsze wczytanie), własny Edge bez okna przez CDP (port 9417; skrypt odmawia, gdy port jest zajęty, i sprawdza, że to Edge), kliknięcia i klatki, na koniec obrazki zbiorcze w `Podgląd/`. Same wybrane: `node zrodla/zrzuty.mjs pelny-noc zestawy` (scenariusze: `pelny-noc`, `bez-internetu`, `pelny-dzien`, `angielski`, `bez-funkcji`, `pusty`, `uszkodzony`, `druga-kopia`, `bez-zapisu`; `zestawy` - tylko składanie z istniejących klatek).
- `przygotuj.mjs` - dane przykładowe i `ustawienia.json` **w folderze testowym** z `PODGLAD_DANE` (plus `wyciag-mbank.csv` do importu). Prawdziwych danych z `%APPDATA%\Mikroplatnosci` nigdy nie rusza - bez `PODGLAD_DANE` albo ze ścieżką do `Roaming` odmawia.
- `strony-testowe.js` - skrypt startowy przeglądarki: dane aplikacji tylko w folderze testowym, bez powiadomień Windows, bez poleceń systemu, linków i okien zapisu; z `window.__TRYB = 'bez-internetu'` symuluje brak sieci.
- `zestaw.html` - składa klatki w obrazek zbiorczy (`?zestaw=03&klatki=<adres folderu z klatkami>`; kilka klatek obok siebie - lista plików).

**Bezpiecznik (obowiązkowo, po wypadku z 01.11.2026):** `zrzuty.mjs` najpierw otwiera stronę bez aplikacji i sprawdza `window.__DANE` oraz podmianę `Neutralino`, a po otwarciu aplikacji - że `Neutralino.os.getPath('data')` zwraca folder testowy; inaczej przerywa. Dla pewności przed i po porównać listę plików `%APPDATA%\Mikroplatnosci` i `kopie` (`ls -la --time-style=full-iso` + `diff`). Druga kopia aplikacji ma wstrzymane samozamknięcie (inaczej `app.exit` zamknąłby serwer testowy).
