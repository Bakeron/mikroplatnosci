# Mikropłatności - wersja na Androida

Aplikacja APK (Capacitor 8) z tymi samymi danymi co wersja PC, połączona przez Google Dysk. Plan i stan prac: `robota.md`, pkt 3.

## Co jest gdzie

| Ścieżka | Co to |
|---|---|
| `src/` | pliki telefonu: `index.html`, `css/telefon.css`, `js/aplikacja.js`, `js/neutralino-telefon.js` (zamiennik zapisu plików i otwierania stron na wtyczki Capacitora) |
| `../pc/resources/js/` | **wspólne obliczenia** - `alarmy.js`, `waluty.js`, `podsumowanie.js`, `spisy.js`, `miarka.js`, `dane.js`, `scalanie.js`, `dysk.js`, `synchronizacja.js`, `powiadomienia.js` - kopiowane do telefonu przy budowaniu (jedno źródło dla obu aplikacji) |
| `../pc/resources/css/wyglad.css` | kolory, paragon, listy terminów - też kopiowane |
| `skrypty/przygotuj.mjs` | składa `www/` (nie w gicie) i wpisuje identyfikator projektu Google ze zmiennych środowiskowych |
| `skrypty/apk.mjs` | buduje podpisany APK → `apk/Mikroplatnosci.apk` (nie w gicie) |
| `skrypty/ikony.ps1` | ikony Androida i ekran startowy z rysunku ikony PC |
| `android/` | projekt Androida z `npx cap add android` (wyniki budowania poza gitem) |

## Budowanie APK

```
cd mobile
npm install            # raz, po pobraniu repozytorium
npm run apk            # www/ + kopiowanie do Androida + podpisany APK
```

Każde budowanie dostaje nowy numer wersji z daty i godziny (widoczny w zakładce Paragon, pod paragonem) i rosnący kod wersji dla Androida (`mobile/wersja.json`, poza gitem).

Potrzebne (zainstalowane 30.10.2026 bez uprawnień administratora, w `%LOCALAPPDATA%\Android`):
- `jdk\jdk-21…` - Java (Microsoft Build of OpenJDK 21),
- `sdk\` - Android SDK: `cmdline-tools` (jest), `platform-tools`, `platforms;android-36`, `build-tools;36.0.0` (doinstalowane po akceptacji licencji - stan 31.10.2026: jeszcze nie).

**Licencja Android SDK** musi być zaakceptowana przez autora (raz) - polecenie w `robota.md`, pkt 3.

## Klucz podpisu - WAŻNE

- Plik: `%USERPROFILE%\.mikroplatnosci\mikroplatnosci.jks` (alias `mikroplatnosci`), poza repozytorium.
- Hasło: zmienna środowiskowa użytkownika `MIKROPLATNOSCI_KLUCZ_HASLO` (losowe, nigdzie niezapisane jawnym tekstem).
- **Zrób kopię zapasową pliku klucza i hasła** (pendrive albo menedżer haseł). Każda aktualizacja APK musi być podpisana tym samym kluczem - bez niego telefon nie zainstaluje nowej wersji na starą (trzeba odinstalować aplikację; dane w telefonie przepadną, na Dysku zostaną).
- Hasło wyświetlisz w PowerShellu: `[Environment]::GetEnvironmentVariable('MIKROPLATNOSCI_KLUCZ_HASLO','User')`.

## Google Dysk

Telefon używa tego samego identyfikatora co PC (typ „Telewizory i urządzenia z ograniczonym wprowadzaniem danych”) i loguje się kodem przez `google.com/device` - instrukcja projektu: `../google-cloud.md`. Identyfikator wpisuje się w aplikacji (okno po zaznaczeniu „Google Dysk”, z instrukcją pod „Nie wiem, skąd to wziąć”) - zapamiętany w prywatnym folderze aplikacji. Gdy przy budowaniu są zmienne `MIKROPLATNOSCI_GOOGLE_ID` / `_SECRET`, trafiają do APK i okno się nie pokazuje.

Na telefonie: zmiany zapisują się w telefonie od razu, a przy włączonym Dysku wysyłają się same po 3 s. Przy uruchomieniu i powrocie do aplikacji pobierają się zmiany z PC.

## Instalacja na telefonie

1. Skopiuj `apk/Mikroplatnosci.apk` na telefon (kabel USB albo Dysk Google).
2. Otwórz plik w telefonie (menedżer plików / Dysk) → zgoda „Instalowanie nieznanych aplikacji” dla tej aplikacji → Zainstaluj.
3. Aktualizacja = zainstalowanie nowszego APK tak samo (dane zostają).
