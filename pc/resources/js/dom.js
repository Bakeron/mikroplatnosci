// Wspólne tworzenie elementów strony (tabela, paragon, miarka).

export function element(tag, klasa, tekst) {
  const el = document.createElement(tag);
  if (klasa) el.className = klasa;
  if (tekst !== undefined) el.textContent = tekst;
  return el;
}

// „×” w prawym górnym rogu okna (dialog) - zamyka je jak Esc albo kliknięcie w tło.
export function krzyzykOkna(okno, napis) {
  const x = element('button', 'okno__x', '×');
  x.type = 'button';
  x.title = napis;
  x.setAttribute('aria-label', napis);
  x.addEventListener('click', () => okno.close());
  trescObokKrzyzyka(okno, x);
}

// „×” wystaje za róg okna, więc przewija się sama treść (.okno__tresc), nie całe okno -
// przewijanie okna obcięłoby wszystko, co wychodzi poza jego brzeg.
export function trescObokKrzyzyka(okno, x) {
  const tresc = element('div', 'okno__tresc');
  tresc.append(...[...okno.childNodes].filter((n) => n !== x));
  okno.replaceChildren(x, tresc);
}

const bezRuchu = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const WYMIARY = ['height', 'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom', 'borderTopWidth', 'borderBottomWidth'];
const KLIP = 'inset(-24px -24px 0 -24px)'; // przycięte tylko od dołu - „×” wbity w róg i obwódki fokusu zostają
const plynnie = new WeakMap(); // element -> { widac, animacja } w trakcie pokazywania albo chowania

function klatka(el) {
  const s = getComputedStyle(el);
  const k = { opacity: s.opacity, translate: s.translate, clipPath: KLIP };
  for (const w of WYMIARY) k[w] = s[w];
  return k;
}

// Element zwinięty do zera. W kolumnie z odstępem (grid / flex z gap) zabiera też swój odstęp - inaczej
// sąsiedzi skoczyliby o gap dopiero po schowaniu.
function zwiniety(el, przesun) {
  const k = { opacity: 0, translate: `0 ${przesun}px`, clipPath: KLIP };
  for (const w of WYMIARY) k[w] = '0px';
  const p = getComputedStyle(el.parentElement);
  const kolumna = p.display.includes('grid') || (p.display.includes('flex') && p.flexDirection.startsWith('column'));
  const odstep = kolumna ? parseFloat(p.rowGap) || 0 : 0;
  if (odstep) {
    let poprzedni = el.previousElementSibling;
    while (poprzedni?.hidden) poprzedni = poprzedni.previousElementSibling;
    k[poprzedni ? 'marginTop' : 'marginBottom'] = -odstep + 'px';
  }
  return k;
}

// Pokazanie albo schowanie po działaniu (zaznaczenie pola, „×”, wybór w formularzu) - nie skokiem: element
// rośnie od zera albo maleje do zera i gaśnie, a treść pod nim płynnie zjeżdża albo podjeżdża. Od razu, gdy
// elementu nie widać (zamknięte okno, inna zakładka) albo system ogranicza ruch. Schowany element dostaje
// hidden dopiero po animacji. przesun - wjazd z góry / odjazd w górę o tyle px (notatki „pierwsze kroki”).
// Zwraca animację albo undefined (bez animacji).
export function pokazPlynnie(el, widac, { czas = 180, przesun = 0 } = {}) {
  const trwa = plynnie.get(el);
  if ((trwa ? trwa.widac : !el.hidden) === widac) return;
  const start = trwa ? klatka(el) : null; // przerwana animacja - dalej od miejsca, w którym była
  trwa?.animacja.cancel();
  plynnie.delete(el);
  const naEkranie = el.parentElement?.checkVisibility() && (el.hidden || el.checkVisibility());
  if (!naEkranie || bezRuchu()) {
    el.hidden = !widac;
    return;
  }
  el.hidden = false;
  const pelny = klatka(el);
  const zero = zwiniety(el, przesun);
  const animacja = el.animate(widac ? [start ?? zero, pelny] : [start ?? pelny, zero], { duration: czas, easing: 'cubic-bezier(0.2, 0, 0.2, 1)' });
  plynnie.set(el, { widac, animacja });
  animacja.addEventListener('finish', () => {
    if (plynnie.get(el)?.animacja !== animacja) return;
    plynnie.delete(el);
    if (!widac) el.hidden = true;
  });
  return animacja;
}

// Jedno w miejsce drugiego (np. „+ następna cena” i pole ceny): najpierw znika stary, dopiero potem
// pojawia się nowy (0,09 + 0,15 s). poPokazaniu - np. fokus w nowym polu, gdy już je widać.
export function zamienPoKolei(stary, nowy, poPokazaniu) {
  const dalej = () => {
    pokazPlynnie(nowy, true, { czas: 150 });
    poPokazaniu?.();
  };
  const znika = pokazPlynnie(stary, false, { czas: 90 });
  if (znika) znika.finished.then(dalej, () => {}); // przerwane - dalej prowadzi nowsze wywołanie
  else dalej();
}

// Zmiana treści (zakładka, filtr): stara najpierw gaśnie, dopiero po zgaśnięciu pojawia się nowa - szybko
// (0,09 + 0,15 s), bez przenikania jednej w drugą. zmien() podmienia treść; przy „ogranicz ruch” - od razu.
export function zamienPlynnie(el, zmien) {
  const teraz = getComputedStyle(el).opacity;
  for (const a of el.getAnimations()) if (a.id === 'zamiana') a.cancel();
  if (bezRuchu() || !el.checkVisibility()) return zmien();
  const gasnie = el.animate([{ opacity: teraz }, { opacity: 0 }], { id: 'zamiana', duration: 90, easing: 'ease-in', fill: 'forwards' });
  gasnie.addEventListener('finish', () => {
    gasnie.cancel();
    zmien();
    el.animate([{ opacity: 0 }, { opacity: getComputedStyle(el).opacity }], { id: 'zamiana', duration: 150, easing: 'ease-out' });
  });
}
