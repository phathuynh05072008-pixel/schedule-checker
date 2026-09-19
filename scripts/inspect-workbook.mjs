import { readFile, writeFile } from 'node:fs/promises';
import { parseWorkbook, readExcelBytes } from '../parser.js';
import { runRules } from '../rules.js';

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error('Cách dùng: npm run inspect -- "đường dẫn.xlsx" [đường dẫn JSON đầu ra]');
  process.exitCode = 1;
} else {
  try {
    // JSON is the independent reference extractor output; production uses SheetJS.
    const data = input.endsWith('.json')
      ? parseWorkbook(JSON.parse(await readFile(input, 'utf8')))
      : readExcelBytes(await readFile(input), await import('xlsx'), input).data;
    console.log(JSON.stringify({ stats: data.stats, days: data.days.map(day => ({
      name: day.name, teachers: day.rows.length, slots: day.actualTotal,
    })), warnings: data.warnings, violations: runRules(data) }, null, 2));
    if (output) await writeFile(output, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(error.code === 'ERR_MODULE_NOT_FOUND'
      ? 'Chưa cài SheetJS. Chạy npm install khi có kết nối đến cdn.sheetjs.com.' : error.message);
    process.exitCode = 1;
  }
}
