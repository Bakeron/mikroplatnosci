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
