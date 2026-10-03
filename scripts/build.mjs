import { copyFile, mkdir, rm } from 'node:fs/promises';
import { webFiles } from './web-files.mjs';

const files = webFiles;
// Only remove this generated directory, so obsolete root modules are not deployed.
const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
for (const file of files) {
  const target = new URL(`../dist/${file}`, import.meta.url);
  await mkdir(new URL('.', target), { recursive: true });
  await copyFile(new URL(`../${file}`, import.meta.url), target);
}
console.log(`Đã đóng gói ${files.length} tệp web vào dist/. Không chứa dữ liệu thời khóa biểu.`);
