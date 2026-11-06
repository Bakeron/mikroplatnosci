# Mikropłatności - wersja na Androida

Aplikacja APK (Capacitor 8) z tymi samymi danymi co wersja PC, połączona przez Google Dysk. Plan i stan prac: `robota.md`, pkt 2 i 8.

## Co jest gdzie

| Ścieżka | Co to |
|---|---|
| `src/` | pliki telefonu: `index.html`, `css/telefon.css`, `js/aplikacja.js`, `js/neutralino-telefon.js` (zamiennik zapisu plików i otwierania stron na wtyczki Capacitora), `czcionki/` (Gelasio, Barlow Semi Condensed, Cascadia Mono - SIL OFL, z licencjami `OFL-*.txt`; pobrane 31.10.2026 z repozytorium [google/fonts](https://github.com/google/fonts) - `ofl/gelasio`, `ofl/barlowsemicondensed`, `ofl/cascadiamono`; Gelasio i Barlow przycięte narzędziem fontTools do łaciny z polskimi znakami i kilku symboli (strzałki, ▲ ▼, ✓, €), Cascadia Mono tylko zamieniona na woff2) |
| `../pc/resources/js/` | **wspólne obliczenia** - `dom.js`, `teksty.js`, `teksty-en.js`, `funkcje.js`, `swieta.js`, `oAplikacji.js`, `ustawienia.js`, `ustawieniaOkno.js`, `magazyn.js`, `alarmy.js`, `waluty.js`, `podsumowanie.js`, `spisy.js`, `miarka.js`, `dane.js`, `scalanie.js`, `dysk.js`, `synchronizacja.js`, `powiadomienia.js`, `anulowane.js`, `historia.js`, `pomoc.js`, `filtr.js`, `eksport.js`, `wyciag.js`, `wyciagOkno.js` - kopiowane do telefonu przy budowaniu (jedno źródło dla obu aplikacji) |
| `../pc/resources/css/wyglad.css` | kolory, paragon, listy terminów - też kopiowane |
| `skrypty/przygotuj.mjs` | składa `www/` (nie w gicie) i wpisuje identyfikator projektu Google ze zmiennych środowiskowych |
| `skrypty/apk.mjs` | buduje podpisany APK → `apk/Mikroplatnosci-<numer>.apk` (nie w gicie) |
| `numer-instalki.txt` | numer ostatniej zbudowanej instalki (1.1, 1.2, …) |
| `skrypty/ikony.ps1` | ikony Androida i ekran startowy z rysunku ikony PC |
| `android/` | projekt Androida z `npx cap add android` (wyniki budowania poza gitem) |
| `../pc/testy/` | testy - także telefonu: wspólne obliczenia, zamiennik Neutralino, kompletność listy plików kopiowanych do `www/` (`cd pc && npm test`) |

## Budowanie APK

```
cd mobile
npm install            # raz, po pobraniu repozytorium
npm run apk            # testy + www/ + kopiowanie do Androida + podpisany APK
npm run aab            # to samo, ale paczka AAB dla Google Play (mobile/apk/Mikroplatnosci-<numer>.aab)
```

Gdy któryś test nie przechodzi, APK się nie buduje. Każde budowanie dostaje nowy numer wersji z daty i godziny (widoczny w zakładce Paragon, pod paragonem) i rosnący kod wersji dla Androida (`mobile/wersja.json`, poza gitem).

**Numer instalki** (decyzja autora 01.11.2026): każda nowa instalka o 0.1 wyżej - 1.0 (pierwsza, `Mikroplatnosci.apk` bez numeru), 1.1, 1.2, … 1.9, 2.0. `apk.mjs` sam podbija numer z `numer-instalki.txt` i zapisuje go po udanym budowaniu. Numer jest w nazwie pliku i w Androidzie (Ustawienia → Aplikacje → Mikropłatności → wersja).

Potrzebne (zainstalowane 30.10.2026 bez uprawnień administratora, w `%LOCALAPPDATA%\Android`):
- `jdk\jdk-21…` - Java (Microsoft Build of OpenJDK 21),
- `sdk\` - Android SDK: `cmdline-tools`, `platform-tools`, `platforms;android-36`, `build-tools;36.0.0` (licencja zaakceptowana przez autora 31.10.2026).

Dwie rzeczy, które `apk.mjs` obchodzi sam (31.10.2026):
- **Polskie litery w ścieżce** („mikropłatności”) - wtyczka Androida do Gradle odmawia budowania. Skrypt buduje przez skrót folderu `%LOCALAPPDATA%\Android\budowa-mikroplatnosci` → `mobile/` (junction, tworzony raz). Usuwanie skrótu: `rmdir` bez `/s` - inaczej zniknie zawartość `mobile/`.
- **Antywirus sprawdzający HTTPS** podstawia własny certyfikat - Java mu nie ufa, więc Gradle nie pobrałby niczego. Skrypt każe Javie korzystać z listy zaufanych certyfikatów Windows (`JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT`) - tej samej, której ufa Edge.

## Klucz podpisu - WAŻNE

- Plik: `%USERPROFILE%\.mikroplatnosci\mikroplatnosci.jks` (alias `mikroplatnosci`), poza repozytorium.
- Hasło: zmienna środowiskowa użytkownika `MIKROPLATNOSCI_KLUCZ_HASLO` (losowe, nigdzie niezapisane jawnym tekstem).
- **Zrób kopię zapasową pliku klucza i hasła** (pendrive albo menedżer haseł). Każda aktualizacja APK musi być podpisana tym samym kluczem - bez niego telefon nie zainstaluje nowej wersji na starą (trzeba odinstalować aplikację; dane w telefonie przepadną, na Dysku zostaną).
- Hasło wyświetlisz w PowerShellu: `[Environment]::GetEnvironmentVariable('MIKROPLATNOSCI_KLUCZ_HASLO','User')`.

## Google Dysk

Telefon używa tego samego identyfikatora co PC (typ „Telewizory i urządzenia z ograniczonym wprowadzaniem danych”) i loguje się kodem przez `google.com/device` - instrukcja projektu: `../google-cloud.md`. Identyfikator wpisuje się w aplikacji (okno po zaznaczeniu „Google Dysk”, z instrukcją pod „Nie wiem, skąd to wziąć”) - zapamiętany w prywatnym folderze aplikacji. Gdy przy budowaniu są zmienne `MIKROPLATNOSCI_GOOGLE_ID` / `_SECRET`, trafiają do APK i okno się nie pokazuje.

Na telefonie: zmiany zapisują się w telefonie od razu, a przy włączonym Dysku wysyłają się same po 3 s. Przy uruchomieniu i powrocie do aplikacji pobierają się zmiany wysłane z PC (PC z zapisem lokalnym wysyła je przyciskiem „↑ Wyślij na Dysk”).

## Instalacja na telefonie

1. Skopiuj najnowszy `apk/Mikroplatnosci-<numer>.apk` na telefon (kabel USB albo Dysk Google).
2. Otwórz plik w telefonie (menedżer plików / Dysk) → zgoda „Instalowanie nieznanych aplikacji” dla tej aplikacji → Zainstaluj.
3. Aktualizacja = zainstalowanie nowszego APK tak samo (dane zostają).
