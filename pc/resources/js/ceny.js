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

// Strony rysujące ceny skryptem (Google One, Proton…) zwykle mają je już w HTML - w danych dla
// skryptu: JSON w <script> albo atrybuty props / data-props. Czytamy je wyłącznie jako tekst,
// nic nie jest uruchamiane. Liczby przy polach „price”, „monthly”… tylko, gdy w tych samych
// danych jest kod waluty wpisu (np. "USD").
const POLA_CENY = /"(?:price|amount|monthly|cost|base|original)"\s*:\s*(?:\[\s*0\s*,\s*)?"?(\d{1,6}(?:\.\d{1,2})?)(?![\d.])/gi;

function cenyZDanychStrony(doc, kod) {
  const kawalki = [...doc.querySelectorAll('script:not([src]):not([type="application/ld+json"])')].map((s) => s.textContent);
  for (const el of doc.querySelectorAll('[props], [data-props], [data-page]')) {
    kawalki.push(el.getAttribute('props') ?? el.getAttribute('data-props') ?? el.getAttribute('data-page'));
  }
  const ceny = [];
  for (const kawalek of kawalki) {
    if (!kawalek) continue;
    // „8,99 zł” w JSON → „8,99 zł”.
    const tekst = kawalek
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    for (const wzor of WZORY_TEKSTU[kod] || []) {
      for (const trafienie of tekst.matchAll(wzor)) {
        const n = liczbaZTekstu(trafienie[1]);
        if (n !== null) ceny.push(n);
      }
    }
    if (tekst.includes('"' + kod + '"')) {
      for (const trafienie of tekst.matchAll(POLA_CENY)) ceny.push(parseFloat(trafienie[1]));
    }
  }
  return ceny;
}

// Strony zagraniczne podają cenę bez VAT, a płaci się z VAT (np. $20 na stronie, $24,60 na karcie).
const VAT = 1.23;

// Spośród znalezionych cen wybiera najbliższą obecnemu kosztowi (strona często ma kilka planów).
// Dla walut obcych porównuje też ceny po doliczeniu VAT. Cena wyraźnie odstająca (poniżej 40%
// lub ponad 250% kosztu) jest odrzucana jako przypadkowa. Zwraca { cena, vat } albo null.
function wybierz(ceny, koszt, zVat) {
  const sensowne = ceny.filter((n) => n > 0 && n < 100000);
  if (!sensowne.length) return null;
  if (typeof koszt !== 'number' || koszt <= 0) return { cena: sensowne[0], vat: false };
  const kandydaci = sensowne.map((n) => ({ cena: n, vat: false }));
  if (zVat) kandydaci.push(...sensowne.map((n) => ({ cena: Math.round(n * VAT * 100) / 100, vat: true })));
  // Przy remisie wygrywa cena bez VAT (jest wcześniej na liście).
  const najblizsza = kandydaci.reduce((a, b) => (Math.abs(b.cena - koszt) < Math.abs(a.cena - koszt) ? b : a));
  return najblizsza.cena >= koszt * 0.4 && najblizsza.cena <= koszt * 2.5 ? najblizsza : null;
}

// Źródła po kolei: dane dla wyszukiwarek, widoczny tekst, dane dla skryptu. Pierwsza cena zgodna
// z zapłaconą wygrywa od razu, a gdy żadnej takiej nie ma - najbliższa zapłaconej.
function cenaZDokumentu(doc, kod, koszt) {
  const zVat = kod !== 'PLN';
  const strukturalne = cenyStrukturalne(doc, kod);
  const zDanych = cenyZDanychStrony(doc, kod); // przed cenyZTekstu, która usuwa skrypty
  const wyniki = [strukturalne, cenyZTekstu(doc, kod), zDanych].map((ceny) => wybierz(ceny, koszt, zVat)).filter(Boolean);
  return wyniki.find((w) => trafiona(w, koszt)) ?? wyniki.reduce((a, b) => blizsza(a, b, koszt), null);
}

// --- szukanie cennika -------------------------------------------------

const SLOWA_CENNIKA = /pricing|cennik|\bceny\b|plans|premium|\bpro\b|subscri|abonament|pakiety/i;
const TYPOWE_ADRESY = ['/pricing', '/cennik', '/plans', '/premium', '/pro', '/subscriptions'];
const MAKS_PROB = 8;

// „one.google.com” i „google.com” to ten sam serwis; „shop.example.com.pl” → „example.com.pl”.
function domenaBazowa(host) {
  const czesci = host.toLowerCase().replace(/^www\./, '').split('.');
  const ile = czesci.length > 2 && czesci.at(-1).length === 2 && /^(com|co|org|net|gov|edu|ac)$/.test(czesci.at(-2)) ? 3 : 2;
  return czesci.slice(-ile).join('.');
}

// Kandydaci na stronę z cennikiem: linki ze słowami „pricing”, „cennik”… w tym samym serwisie,
// a potem typowe adresy. Tylko https - ten sam warunek co dla linku z kolumny Link.
function adresyCennika(doc, adres) {
  const baza = new URL(adres);
  const domena = domenaBazowa(baza.hostname);
  const adresy = [];
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (!SLOWA_CENNIKA.test(href + ' ' + a.textContent)) continue;
    let url;
    try { url = new URL(href, baza); } catch { continue; }
    if (url.protocol !== 'https:' || domenaBazowa(url.hostname) !== domena) continue;
    url.hash = '';
    adresy.push(url.href);
  }
  for (const sciezka of TYPOWE_ADRESY) adresy.push(new URL(sciezka, baza.origin).href);
  return [...new Set(adresy)].filter((u) => u !== baza.href).slice(0, MAKS_PROB);
}

async function cenaZAdresu(adres, kod, koszt) {
  // DOMParser nie uruchamia skryptów ani nie ładuje zasobów - służy tylko do czytania.
  return cenaZDokumentu(new DOMParser().parseFromString(await pobierzStrone(adres), 'text/html'), kod, koszt);
}

// Cena różna od zapłaconej najwyżej o 1% - to na pewno ten plan, dalej nie szukamy.
function trafiona(wynik, koszt) {
  return !!wynik && (typeof koszt !== 'number' || koszt <= 0 || Math.abs(wynik.cena - koszt) <= koszt * 0.01);
}

function blizsza(a, b, koszt) {
  if (!a || !b) return a || b;
  return Math.abs(b.cena - koszt) < Math.abs(a.cena - koszt) ? b : a;
}

// Zwraca { cena, vat, cennik } albo rzuca błąd z opisem dla użytkownika. Kolejność: zapamiętany
// cennik, strona z linku, a gdy na niej nie ma ceny zgodnej z zapłaconą - strony z cennikiem
// znalezione na niej; wygrywa cena najbliższa zapłaconej.
export async function odczytajCene(adres, kod, koszt, zapamietanyCennik = '') {
  const gotowy = (wynik) => ({ ...wynik, cena: Math.round(wynik.cena * 100) / 100 });
  let najlepszy = null;
  if (zapamietanyCennik && zapamietanyCennik !== adres) {
    try {
      const wynik = await cenaZAdresu(zapamietanyCennik, kod, koszt);
      if (wynik) najlepszy = { ...wynik, cennik: zapamietanyCennik };
      if (trafiona(wynik, koszt)) return gotowy(najlepszy);
    } catch { /* cennik zniknął albo się zmienił - szukamy od nowa */ }
  }
  let kandydaci;
  let bladStrony = null;
  try {
    const doc = new DOMParser().parseFromString(await pobierzStrone(adres), 'text/html');
    kandydaci = adresyCennika(doc, adres); // przed cenaZDokumentu, która usuwa część strony
    const wynik = cenaZDokumentu(doc, kod, koszt);
    if (wynik) najlepszy = blizsza(najlepszy, { ...wynik, cennik: adres }, koszt);
  } catch (e) {
    // Strona z linku nie odpowiada - zostają typowe adresy cennika w tym serwisie.
    if (new URL(adres).protocol !== 'https:') throw e;
    bladStrony = e;
    kandydaci = TYPOWE_ADRESY.map((sciezka) => new URL(sciezka, new URL(adres).origin).href);
  }
  // Po kolei, żeby nie obciążać łącza ani serwisu.
  for (const kandydat of kandydaci.filter((u) => u !== zapamietanyCennik)) { // zapamiętany już sprawdzony
    if (trafiona(najlepszy, koszt)) break;
    try {
      const wynik = await cenaZAdresu(kandydat, kod, koszt);
      if (wynik) najlepszy = blizsza(najlepszy, { ...wynik, cennik: kandydat }, koszt);
    } catch { /* brak takiej strony - następny adres */ }
  }
  if (!najlepszy) throw bladStrony || new Error('Nie znaleziono');
  return gotowy(najlepszy);
}
