// Kod QR z projektem Google (kodQr.js): treść pokazywana na PC i sprawdzanie zeskanowanej na telefonie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trescKodu, odczytajKod, CZAS_POKAZU } from '../resources/js/kodQr.js';

const ID = '123-abc.apps.googleusercontent.com';
const SEKRET = 'GOCSPX-abcdefghijk';

test('kod QR: treść z PC odczytana na telefonie bez zmian', () => {
  assert.equal(trescKodu(ID, SEKRET), `mikroplatnosci:google:1:${ID}:${SEKRET}`);
  assert.deepEqual(odczytajKod(trescKodu(ID, SEKRET)), { id: ID, sekret: SEKRET });
  assert.equal(CZAS_POKAZU, 120000);
});

test('kod QR: obce i zepsute kody odrzucone', () => {
  for (const zly of [
    undefined, null, 42, '', 'https://example.com',
    `mikroplatnosci:google:2:${ID}:${SEKRET}`, // nieznana wersja treści
    `mikroplatnosci:google:1:${ID}`, // bez klucza
    `mikroplatnosci:google:1:${ID}:${SEKRET}:nadmiar`,
    `mikroplatnosci:google:1:abc:${SEKRET}`, // zły identyfikator
    `mikroplatnosci:google:1:${ID}:krótki`, // zły klucz
    `mikroplatnosci:google:1:${ID}:GOCSPX abc defghij`, // spacje w kluczu
    `mikroplatnosci:google:1:${ID}:${'a'.repeat(1000)}`, // za długi
  ]) assert.equal(odczytajKod(zly), null, String(zly));
});
