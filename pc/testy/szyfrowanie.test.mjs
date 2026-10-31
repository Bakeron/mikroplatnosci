// Szyfrowanie hasłem kopii na Dysku (szyfrowanie.js - gotowe, na razie niepodpięte).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zaszyfruj, odszyfruj } from '../resources/js/szyfrowanie.js';

test('zapis i odczyt (duży plik, polskie znaki)', async () => {
  const dane = JSON.stringify({ wpisy: [{ nazwa: 'ząb żółć ' + 'x'.repeat(300000) }] });
  const s = await zaszyfruj(dane, 'hasło-ćma 1');
  assert.equal(await odszyfruj(s, 'hasło-ćma 1'), dane);
  assert.ok(!s.includes('ząb') && !s.includes('xxxx'));
});

test('złe hasło', async () => {
  const s = await zaszyfruj('{}', 'a');
  await assert.rejects(odszyfruj(s, 'b'), /złe hasło/);
});

test('podmiana nagłówka i treści wykryta', async () => {
  const s = JSON.parse(await zaszyfruj('{"a":1}', 'h'));
  await assert.rejects(odszyfruj(JSON.stringify({ ...s, powtorzenia: 100001 }), 'h'), /złe hasło/);
  const d = Buffer.from(s.dane, 'base64');
  d[0] ^= 1;
  await assert.rejects(odszyfruj(JSON.stringify({ ...s, dane: d.toString('base64') }), 'h'), /złe hasło/);
});

test('odrzuca śmieci i za małą / za dużą liczbę powtórzeń', async () => {
  const s = JSON.parse(await zaszyfruj('{}', 'h'));
  for (const zly of ['nie json', '{}', JSON.stringify({ ...s, powtorzenia: 1000 }), JSON.stringify({ ...s, powtorzenia: 1e9 }), JSON.stringify({ ...s, iv: 'AAAA' })]) {
    await assert.rejects(odszyfruj(zly, 'h'), /nie jest zaszyfrowaną/);
  }
});

test('za każdym razem inny wynik (losowa sól i IV)', async () => {
  assert.notEqual(await zaszyfruj('{}', 'h'), await zaszyfruj('{}', 'h'));
});
