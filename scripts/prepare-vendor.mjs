import { copyFile, mkdir } from 'node:fs/promises';

await mkdir(new URL('../vendor/', import.meta.url), { recursive: true });
for (const [source, target] of [
  ['xlsx/dist/xlsx.full.min.js', 'xlsx.full.min.js'],
  ['xlsx/LICENSE', 'xlsx.LICENSE'],
  ['fflate/esm/browser.js', 'fflate.js'],
  ['fflate/LICENSE', 'fflate.LICENSE'],
  ['lucide/dist/umd/lucide.min.js', 'lucide.min.js'],
  ['lucide/LICENSE', 'lucide.LICENSE'],
]) await copyFile(new URL(`../node_modules/${source}`, import.meta.url), new URL(`../vendor/${target}`, import.meta.url));
console.log('Đã chuẩn bị thư viện cục bộ trong vendor/.');
