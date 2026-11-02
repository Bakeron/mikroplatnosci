// Miarka najbliższych 3 miesięcy: podziałka od dziś, terminy w miejscu swojej daty.

import { dzis, dodajMiesiace, roznicaDni, doPlatnosci, kiedyTekst, formatujDate } from './alarmy.js';
import { nazwaWpisu } from './dane.js';
import { element } from './dom.js';
import { t, miesiac } from './teksty.js';

const ODSTEP_ETYKIET = 10;

export function renderujMiarke(kontener, alarmy) {
  const poczatek = dzis();
  const koniec = dodajMiesiace(poczatek, 3);
  const zakres = roznicaDni(poczatek, koniec);
  const pozycja = (data) => (roznicaDni(poczatek, data) / zakres) * 100;

  const podzialka = element('div', 'miarka__podzialka');
  for (let d = 0; d <= zakres; d += 7) {
    const kreska = element('span', 'miarka__kreska');
    kreska.style.left = (d / zakres) * 100 + '%';
    podzialka.append(kreska);
  }
  for (let m = 1; m <= 3; m++) {
    const pierwszy = new Date(poczatek.getFullYear(), poczatek.getMonth() + m, 1);
    const kreska = element('span', 'miarka__kreska miarka__kreska--miesiac');
    kreska.style.left = pozycja(pierwszy) + '%';
    const nazwa = element('span', 'miarka__miesiac', miesiac(pierwszy, 'long'));
    // Miesiąc zaczynający się tuż po dziś nie wchodzi na napis „dziś” - najbliżej zaraz za nim (2,6em).
    // Przy samym końcu miarki napis stoi przed kreską - długa nazwa („październik”, „February”)
    // nie wychodzi poza kartkę.
    if (pozycja(pierwszy) > 88) {
      nazwa.classList.add('miarka__miesiac--przed');
      nazwa.style.right = `${100 - pozycja(pierwszy)}%`;
    } else nazwa.style.left = `max(${pozycja(pierwszy)}%, 2.6em)`;
    podzialka.append(kreska, nazwa);
  }
  const dzisiaj = element('span', 'miarka__dzis', t('dziś'));
  podzialka.append(dzisiaj);

  const terminy = alarmy
    .filter((a) => a.data && a.data >= poczatek && a.data <= koniec)
    .sort((a, b) => a.data - b.data);

  const znaczniki = element('div', 'miarka__znaczniki');
  for (const a of terminy) {
    const dp = doPlatnosci(a.wpis);
    const jednorazowa = a.wpis.przedluzac === 'nie';
    const znacznik = element('div', 'znacznik' + (jednorazowa ? ' znacznik--jednorazowa' : ''));
    const x = pozycja(a.data);
    znacznik.style.left = x + '%';
    if (x > 70) znacznik.classList.add('znacznik--w-lewo');
    if (dp && !dp.minal) znacznik.style.setProperty('--odcien', String(dp.odcien));
    const dni = roznicaDni(poczatek, a.data);
    const nazwa = nazwaWpisu(a.wpis);
    znacznik.title = `${nazwa} - ${formatujDate(a.data)}`;
    const etykieta = element('span', 'znacznik__etykieta');
    etykieta.append(
      element('strong', '', (jednorazowa ? '! ' : '') + nazwa),
      element('span', 'znacznik__dni', kiedyTekst(dni)),
    );
    znacznik.append(element('span', 'znacznik__punkt'), etykieta);
    znaczniki.append(znacznik);
  }

  kontener.replaceChildren(podzialka, znaczniki);
  if (!terminy.length) {
    znaczniki.append(element('p', 'miarka__spokoj', t('Spokojnie - w tym czasie nic nie wygasa i żadna roczna płatność nie przypada.')));
  }
  ulozTory(znaczniki);
}

// Etykiety, które by na siebie nachodziły, schodzą piętro niżej.
export function ulozTory(znaczniki) {
  const elementy = [...znaczniki.querySelectorAll('.znacznik')];
  const tory = [];
  for (const z of elementy) z.style.setProperty('--tor', '0');
  for (const z of elementy) {
    const r = z.querySelector('.znacznik__etykieta').getBoundingClientRect();
    let tor = tory.findIndex((prawy) => prawy + ODSTEP_ETYKIET < r.left);
    if (tor === -1) {
      tor = tory.length;
      tory.push(0);
    }
    tory[tor] = r.right;
    z.style.setProperty('--tor', String(tor));
  }
  znaczniki.style.setProperty('--torow', String(Math.max(tory.length, 1)));
}
