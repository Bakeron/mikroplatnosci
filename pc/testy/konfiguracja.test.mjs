// CSP is kept twice: in the server header (frame-ancestors works only there) and in <meta> in index.html.
// Both must stay the same, otherwise the stricter one silently wins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const czytaj = (sciezka) => readFileSync(new URL(sciezka, import.meta.url), 'utf8');
const konfiguracja = JSON.parse(czytaj('../neutralino.config.json'));
const html = czytaj('../resources/index.html');

test('CSP w nagłówku serwera to ta sama polityka co w index.html, z frame-ancestors', () => {
  const meta = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(meta, 'brak CSP w index.html');
  assert.equal(konfiguracja.serverHeaders['Content-Security-Policy'], `${meta}; frame-ancestors 'none'`);
});

test('serwer wysyła nosniff', () => {
  assert.equal(konfiguracja.serverHeaders['X-Content-Type-Options'], 'nosniff');
});
