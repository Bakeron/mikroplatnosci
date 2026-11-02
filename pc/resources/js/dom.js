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
  okno.prepend(x);
}
