// Szyfrowanie kopii danych wysyłanej na Google Dysk: AES-256-GCM, klucz z hasła (PBKDF2-SHA256).
// Na Dysku leży tylko szyfrogram - bez hasła nie da się go odczytać ani niepostrzeżenie zmienić.

const FORMAT = 'mikroplatnosci-szyfr';
const POWTORZENIA = 600000;
// Granice dla pliku z Dysku: za mało = łatwe łamanie, za dużo = zawieszona aplikacja.
const POWTORZENIA_MIN = 100000;
const POWTORZENIA_MAX = 5000000;

function naBase64(bajty) {
  let tekst = '';
  for (let i = 0; i < bajty.length; i += 0x8000) tekst += String.fromCharCode(...bajty.subarray(i, i + 0x8000));
  return btoa(tekst);
}

function zBase64(tekst) {
  return Uint8Array.from(atob(tekst), (z) => z.charCodeAt(0));
}

async function kluczZHasla(haslo, sol, powtorzenia) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(haslo), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sol, iterations: powtorzenia },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

// Nagłówek (format, sól, liczba powtórzeń) też chroniony przez GCM - podmiana = błąd odczytu.
function naglowek(n) {
  return new TextEncoder().encode(JSON.stringify([n.format, n.wersja, n.powtorzenia, n.sol, n.iv]));
}

export async function zaszyfruj(tekst, haslo) {
  const sol = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const n = { format: FORMAT, wersja: 1, powtorzenia: POWTORZENIA, sol: naBase64(sol), iv: naBase64(iv) };
  const klucz = await kluczZHasla(haslo, sol, POWTORZENIA);
  const szyfr = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: naglowek(n) }, klucz, new TextEncoder().encode(tekst));
  return JSON.stringify({ ...n, dane: naBase64(new Uint8Array(szyfr)) });
}

export async function odszyfruj(plik, haslo) {
  let n;
  try {
    n = JSON.parse(plik);
  } catch {
    throw new Error('plik na Dysku nie jest zaszyfrowaną kopią Mikropłatności');
  }
  const b64 = (v) => typeof v === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(v);
  if (!n || n.format !== FORMAT || n.wersja !== 1 || !Number.isInteger(n.powtorzenia)
    || n.powtorzenia < POWTORZENIA_MIN || n.powtorzenia > POWTORZENIA_MAX || !b64(n.sol) || !b64(n.iv) || !b64(n.dane)) {
    throw new Error('plik na Dysku nie jest zaszyfrowaną kopią Mikropłatności');
  }
  const sol = zBase64(n.sol);
  const iv = zBase64(n.iv);
  if (sol.length !== 16 || iv.length !== 12) throw new Error('plik na Dysku nie jest zaszyfrowaną kopią Mikropłatności');
  const klucz = await kluczZHasla(haslo, sol, n.powtorzenia);
  try {
    const jawne = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: naglowek(n) }, klucz, zBase64(n.dane));
    return new TextDecoder().decode(jawne);
  } catch {
    throw new Error('złe hasło albo plik na Dysku został zmieniony');
  }
}
