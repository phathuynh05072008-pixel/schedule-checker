import { copyFile, mkdir } from 'node:fs/promises';

const files = ['index.html', 'styles.css', 'ui.js', 'parser.js', 'rules.js', 'solver.js',
  'solver-worker.js', 'exporter.js', 'config.js', 'assets/favicon.svg',
  'vendor/xlsx.full.min.js', 'vendor/xlsx.LICENSE', 'vendor/fflate.js', 'vendor/fflate.LICENSE',
  'vendor/lucide.min.js', 'vendor/lucide.LICENSE'];
for (const file of files) {
  const target = new URL(`../dist/${file}`, import.meta.url);
  await mkdir(new URL('.', target), { recursive: true });
  await copyFile(new URL(`../${file}`, import.meta.url), target);
}
console.log(`Đã đóng gói ${files.length} tệp web vào dist/. Không chứa dữ liệu thời khóa biểu.`);
