import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.ts') && !p.endsWith('main.ts') ? [p] : [];
  });
}

const files = walk('src');
for (const file of files) {
  await import(pathToFileURL(file).href);
  console.log('ok', file);
}
