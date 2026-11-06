// Okno „O aplikacji” (PC i telefon): wersja, prywatność w skrócie, kontakt, licencje użytych bibliotek.
// Treść wstawiana przez textContent (element z dom.js) - bez innerHTML.

import { element, krzyzykOkna } from './dom.js';
import { t, tekst } from './teksty.js';

export const KONTAKT = 'szymon.bakonis@gmail.com';
// Adres pełnej polityki prywatności (polityka-prywatnosci.md) - uzupełnić po publikacji na stronie www.
export const ADRES_POLITYKI = '';

const MIT = 'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.';
const APACHE = 'https://www.apache.org/licenses/LICENSE-2.0';
const OFL = 'https://openfontlicense.org/open-font-license-official-text/';

const BIBLIOTEKI = {
  pc: [['Neutralinojs 6.10', 'MIT', 'Copyright (c) 2021-2025 Neutralinojs and contributors. Includes WebSocket++, Mbed TLS, cpp-httplib, nlohmann/json, webview and other libraries - full license texts in LICENSE-Neutralinojs.txt in the program folder']],
  telefon: [
    [tekst('Capacitor 8 i wtyczki (App, Browser, Filesystem, Local Notifications)'), 'MIT', 'Copyright (c) 2017-present Drifty Co. / Ionic'],
    ['AndroidX, Kotlin, kotlinx.coroutines', 'Apache 2.0', 'Copyright The Android Open Source Project / JetBrains s.r.o.'],
    ['Apache Cordova (Android)', 'Apache 2.0', 'Copyright 2015-2020 The Apache Software Foundation. This product includes software developed at The Apache Software Foundation (http://www.apache.org/)'],
    [tekst('Czcionka Gelasio'), 'SIL OFL 1.1', 'Copyright 2022 The Gelasio Project Authors (https://github.com/SorkinType/Gelasio)'],
    [tekst('Czcionka Barlow Semi Condensed'), 'SIL OFL 1.1', 'Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)'],
    [tekst('Czcionka Cascadia Mono'), 'SIL OFL 1.1', 'Copyright (c) 2019 - Present, Microsoft Corporation, with Reserved Font Name Cascadia Code'],
  ],
};

// platforma: 'pc' albo 'telefon'; otworz(adres): otwarcie strony w przeglądarce (Neutralino.os.open).
export function pokazOAplikacji(platforma, otworz) {
  document.getElementById('okno-o-aplikacji')?.remove();
  const okno = element('dialog', 'okno okno--szersze okno--o-aplikacji');
  okno.id = 'okno-o-aplikacji';
  okno.setAttribute('closedby', 'any'); // kliknięcie w tło obok okna zamyka je (jak Esc)
  const link = (tekst, adres) => {
    const przycisk = element('button', 'przycisk-tekst okno__link', tekst);
    przycisk.type = 'button';
    przycisk.addEventListener('click', () => otworz(adres));
    return przycisk;
  };

  okno.append(
    element('h2', 'okno__tytul', 'Mikropłatności'),
    element('p', 'okno__uwaga', t('wersja {numer}', { numer: window.WERSJA_APLIKACJI || t('robocza') })),
    element('p', 'okno__tekst', t('Pilnuje subskrypcji i drobnych płatności. Dane są na tym urządzeniu, a jeśli włączysz synchronizację - także na Twoim Google Dysku, w jednym pliku „mikroplatnosci.json” (aplikacja widzi tylko pliki, które sama utworzyła). Autor aplikacji nie dostaje żadnych Twoich danych; bez reklam i bez śledzenia.')),
  );
  // Adres jako tekst do zaznaczenia - telefon otwiera tylko strony https (bez mailto:).
  okno.append(element('p', 'okno__tekst okno__kontakt', t('Kontakt: {adres}', { adres: KONTAKT })));
  if (ADRES_POLITYKI) {
    const polityka = element('p', 'okno__tekst');
    polityka.append(link(t('Polityka prywatności'), ADRES_POLITYKI));
    okno.append(polityka);
  }

  const licencje = element('details', 'okno__licencje');
  licencje.append(element('summary', '', t('Licencje użytych bibliotek')));
  for (const [nazwa, licencja, prawa] of BIBLIOTEKI[platforma] ?? BIBLIOTEKI.pc) {
    licencje.append(element('p', 'okno__licencja', t('{nazwa} - licencja {licencja}. {prawa}.', { nazwa: t(nazwa), licencja, prawa })));
  }
  licencje.append(element('p', 'okno__licencja', t('Licencja MIT: {tekst}', { tekst: MIT })));
  if (platforma === 'telefon') {
    const apache = element('p', 'okno__licencja', t('Licencja Apache 2.0:') + ' ');
    apache.append(link(APACHE, APACHE));
    const ofl = element('p', 'okno__licencja', t('Licencja SIL Open Font License 1.1 (pełny tekst także w plikach czcionek aplikacji):') + ' ');
    ofl.append(link(OFL, OFL));
    licencje.append(apache, ofl);
  }
  okno.append(licencje);

  const przyciski = element('div', 'okno__przyciski');
  const zamknij = element('button', 'przycisk-tekst', t('Zamknij'));
  zamknij.type = 'button';
  zamknij.addEventListener('click', () => okno.close());
  przyciski.append(zamknij);
  okno.append(przyciski);
  krzyzykOkna(okno, t('Zamknij'));
  okno.addEventListener('close', () => setTimeout(() => okno.remove(), 200)); // po animacji zamykania (wyglad.css)
  document.body.append(okno);
  okno.showModal();
}
