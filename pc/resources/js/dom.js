// Wspólne tworzenie elementów strony (tabela, paragon, miarka).

export function element(tag, klasa, tekst) {
  const el = document.createElement(tag);
  if (klasa) el.className = klasa;
  if (tekst !== undefined) el.textContent = tekst;
  return el;
}
