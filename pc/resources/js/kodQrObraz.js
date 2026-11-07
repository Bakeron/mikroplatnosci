// Obraz kodu QR (tylko PC): SVG z jedną ścieżką, budowany przez DOM (bez innerHTML i bez obrazków
// z danymi), czarny na białym w obu motywach - skaner telefonu nie czyta jasnego kodu na ciemnym tle.

import qrcode from './qrcode.js';

const SVG = 'http://www.w3.org/2000/svg';
const MARGINES = 4; // pusty brzeg wymagany przez standard QR (w modułach)

export function obrazKoduQr(tekst) {
  const qr = qrcode(0, 'M');
  qr.addData(tekst, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + MARGINES} ${r + MARGINES}h1v1h-1z`;
  }
  const bok = n + 2 * MARGINES;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${bok} ${bok}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const tlo = document.createElementNS(SVG, 'rect');
  tlo.setAttribute('width', bok);
  tlo.setAttribute('height', bok);
  tlo.setAttribute('fill', '#fff');
  const moduly = document.createElementNS(SVG, 'path');
  moduly.setAttribute('d', d);
  moduly.setAttribute('fill', '#000');
  svg.append(tlo, moduly);
  return svg;
}
