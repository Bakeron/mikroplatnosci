// Zmienna środowiskowa z bieżącego procesu albo zapisana przez setx (widoczna dopiero w nowych oknach).
import { execFileSync } from 'node:child_process';

export function zmienna(nazwa) {
  if (process.env[nazwa]) return process.env[nazwa].trim();
  try {
    const wynik = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', nazwa], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return (wynik.match(/REG_(?:EXPAND_)?SZ\s+(.*)/)?.[1] ?? '').trim();
  } catch {
    return '';
  }
}
