// Prognoza ceny: odczyt aktualnej ceny ze strony z linku - tylko dla wpisów, w których
// użytkownik zaznaczył zgodę „ze strony”. Strona jest tylko czytana (GET), nic nie jest wysyłane.

// Strony pobiera okno aplikacji (fetch, certyfikaty z Windows); CORS jest wyłączony w
// neutralino.config.json (webviewArgs), a CSP pozwala tylko na https.
const LIMIT_CZASU = 12000;
const MAKS_ROZMIAR = 3000000;

// Stan sprawdzania w tej sesji (nie trafia do pliku danych): id wpisu → { stan, tekst }.
export const stanCen = new Map();

// Nie łączymy się z komputerem użytkownika ani z siecią domową.
function adresLokalny(url) {
  const h = new URL(url).hostname.toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.startsWith('[') || h === '0.0.0.0'
    || /^(127|10)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

async function pobierzStrone(adres) {
  if (new URL(adres).protocol !== 'https:') throw new Error('tylko strony https');
  if (adresLokalny(adres)) throw new Error('niedozwolony adres');
  let odp;
  try {
    odp = await fetch(adres, {
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(LIMIT_CZASU),
    });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? 'strona nie odpowiada' : 'brak połączenia ze stroną');
  }
  if (adresLokalny(odp.url)) throw new Error('niedozwolony adres');
  if (!odp.ok) throw new Error('strona odpowiedziała kodem ' + odp.status);
  if (Number(odp.headers.get('content-length')) > MAKS_ROZMIAR) throw new Error('strona za duża');
  const html = await odp.text();
  if (html.length > MAKS_ROZMIAR) throw new Error('strona za duża');
  return html;
}

// „1 234,56”, „1,234.56”, „12,99”, „12.99”, „12” → liczba.
export function liczbaZTekstu(tekst) {
  let s = String(tekst).replace(/[\s  ]/g, '');
  const przecinek = s.lastIndexOf(',');
  const kropka = s.lastIndexOf('.');
  if (przecinek > -1 && kropka > -1) {
    s = przecinek > kropka ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (przecinek > -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const KWOTA = '(\\d{1,3}(?:[\\s\\u00a0.,]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)(?!\\d)';
const WZORY_TEKSTU = {
  PLN: [new RegExp(KWOTA + '\\s*(?:zł|PLN)', 'gi'), new RegExp('(?:zł|PLN)\\s*' + KWOTA, 'gi')], // „97,99 zł” i „zł 97,99”
  USD: [new RegExp('(?:US)?\\$\\s*' + KWOTA, 'g'), new RegExp(KWOTA + '\\s*(?:USD|\\$)', 'g'), new RegExp('USD\\s*' + KWOTA, 'g')],
  EUR: [new RegExp('€\\s*' + KWOTA, 'g'), new RegExp(KWOTA + '\\s*(?:€|EUR)', 'g'), new RegExp('EUR\\s*' + KWOTA, 'g')],
};

// Ceny z danych dla wyszukiwarek: JSON-LD (offers.price) i znaczniki meta / itemprop.
function cenyStrukturalne(doc, kod) {
  const ceny = [];
  const zbierz = (obiekt, glebokosc = 0) => {
    if (!obiekt || typeof obiekt !== 'object' || glebokosc > 8) return;
    if (Array.isArray(obiekt)) { obiekt.forEach((o) => zbierz(o, glebokosc + 1)); return; }
    const waluta = String(obiekt.priceCurrency || '').toUpperCase();
    for (const pole of ['price', 'lowPrice']) {
      if (obiekt[pole] !== undefined && (!waluta || waluta === kod)) {
        const n = liczbaZTekstu(obiekt[pole]);
        if (n !== null) ceny.push(n);
      }
    }
    for (const wartosc of Object.values(obiekt)) zbierz(wartosc, glebokosc + 1);
  };
  for (const skrypt of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { zbierz(JSON.parse(skrypt.textContent)); } catch { /* uszkodzony JSON-LD - pomijamy */ }
  }
  const walutaMeta = (doc.querySelector('meta[property="product:price:currency"], meta[property="og:price:currency"], [itemprop="priceCurrency"]')?.getAttribute('content') || '').toUpperCase();
  if (!walutaMeta || walutaMeta === kod) {
    for (const el of doc.querySelectorAll('meta[property="product:price:amount"], meta[property="og:price:amount"], [itemprop="price"]')) {
      const n = liczbaZTekstu(el.getAttribute('content') ?? el.textContent);
      if (n !== null) ceny.push(n);
    }
  }
  return ceny;
}

function cenyZTekstu(doc, kod) {
  doc.querySelectorAll('script, style, noscript, template').forEach((el) => el.remove());
  const tekst = (doc.body?.textContent || '').replace(/\s+/g, ' ');
  const ceny = [];
  for (const wzor of WZORY_TEKSTU[kod] || []) {
    for (const trafienie of tekst.matchAll(wzor)) {
      const n = liczbaZTekstu(trafienie[1]);
      if (n !== null) ceny.push(n);
    }
  }
  return ceny;
}

// Spośród znalezionych cen wybiera najbliższą obecnemu kosztowi (strona często ma kilka planów).
// Cena wyraźnie odstająca (poniżej 40% lub ponad 250% kosztu) jest odrzucana jako przypadkowa.
function wybierz(ceny, koszt) {
  const sensowne = ceny.filter((n) => n > 0 && n < 100000);
  if (!sensowne.length) return null;
  if (typeof koszt !== 'number' || koszt <= 0) return sensowne[0];
  const najblizsza = sensowne.reduce((a, b) => (Math.abs(b - koszt) < Math.abs(a - koszt) ? b : a));
  return najblizsza >= koszt * 0.4 && najblizsza <= koszt * 2.5 ? najblizsza : null;
}

// Zwraca odczytaną cenę albo rzuca błąd z opisem dla użytkownika.
export async function odczytajCene(adres, kod, koszt) {
  const html = await pobierzStrone(adres);
  // DOMParser nie uruchamia skryptów ani nie ładuje zasobów - służy tylko do czytania.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cena = wybierz(cenyStrukturalne(doc, kod), koszt) ?? wybierz(cenyZTekstu(doc, kod), koszt);
  if (cena === null) throw new Error('Nie znaleziono');
  return Math.round(cena * 100) / 100;
}
