import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { DAY_NAMES, readExcelBytes } from '../src/parser.js';
import { runRules } from '../src/rules.js';

const [packages, base = 'http://127.0.0.1:5173'] = process.argv.slice(2);
const { chromium } = createRequire(`${packages}/package.json`)('playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('.tmp/browser', { recursive: true });

function workbook(afternoon = false) {
  const book = XLSX.utils.book_new();
  for (const name of DAY_NAMES) {
    const count = name === 'THỨ TƯ' && !afternoon ? 4 : 7;
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Môn', 'Tên GV', 'SÁNG', '', '', '', ...(count === 7 ? ['CHIỀU', '', ''] : [])],
      ['', '', 'TIẾT 1', 'TIẾT 2', 'TIẾT 3', 'TIẾT 4', ...(count === 7 ? ['TIẾT 1', 'TIẾT 2', 'TIẾT 3'] : [])],
      ['Môn', name === 'THỨ BA' && !afternoon ? 'An' : 'Bình',
        ...(name === 'THỨ BA' && !afternoon ? ['1A', '2A', '1A', '1A', '3A', '3A', '4A']
          : name === 'THỨ TƯ' && afternoon ? ['', '', '', '', '1A', '1A', '1A'] : Array(count).fill(''))],
    ]);
    sheet['!merges'] = [{ s: { r: 0, c: 2 }, e: { r: 0, c: 5 } },
      ...(count === 7 ? [{ s: { r: 0, c: 6 }, e: { r: 0, c: 8 } }] : [])];
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.locator('#password').fill('TKB@2026');
  await page.locator('#login-form button[type=submit]').click();
  await page.locator('#show-rules').click();
  assert.deepEqual(await page.locator('#class-session-limits tr td:nth-child(2)').allTextContents(), ['1', '3', '2', '3', '2']);
  assert.deepEqual(await page.locator('#class-session-limits tr td:nth-child(3)').allTextContents(), ['2', '2', '2', '2', '2']);
  assert.match(await page.locator('#rules-dialog').innerText(), /từng giáo viên/);
  await page.screenshot({ path: '.tmp/browser/mobile-rules.png' });
  await page.locator('#close-rules').click();
  for (const afternoon of [false, true]) {
    const bytes = workbook(afternoon);
    const name = afternoon ? 'wednesday-afternoon.xlsx' : 'interleaved.xlsx';
    const original = readExcelBytes(bytes, XLSX, name);
    assert.equal(runRules(original.data).length, 1);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#file-input').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: bytes });
    await page.waitForFunction(() => !document.getElementById('check').disabled);
    await page.locator('#check').click();
    assert.equal(await page.locator('#stat-errors').innerText(), '1');
    const rule = afternoon ? 'CLASS_SESSION_LIMIT' : 'CLASS_LESSON_GAPS';
    await page.locator('#rule-filter').selectOption(rule);
    assert.equal(await page.locator('.issue').count(), 1);
    await page.locator('#fix').click();
    await page.waitForFunction(() => !document.getElementById('apply-all').disabled);
    if (!afternoon) assert.match(await page.locator('#preview-content').innerText(), /Đổi chỗ/);
    assert.equal(await page.locator('#stat-errors').innerText(), '1', 'preview must not apply edits');
    await page.screenshot({ path: `.tmp/browser/${name}-preview.png` });
    await page.locator('#apply-all').click();
    assert.equal(await page.locator('#stat-errors').innerText(), '0');
    const downloadEvent = page.waitForEvent('download'); await page.locator('#download').click();
    const download = await downloadEvent;
    const destination = `.tmp/browser/${name}`;
    await download.saveAs(destination);
    const reopened = readExcelBytes(await readFile(destination), XLSX, name);
    assert.deepEqual(runRules(reopened.data), []);
    if (!afternoon) {
      const lessons = reopened.data.days[1].rows[0].lessons;
      assert.deepEqual(lessons.slice(0, 4).map(l => l.className), ['2A', '1A', '1A', '1A']);
    } else assert.equal(reopened.data.days[2].slots.length, 7);
    await page.locator('[data-view=history]').click();
    await page.locator('#undo').click();
    assert.equal(await page.locator('#stat-errors').innerText(), '1');
    assert.equal(await page.locator('#history-count').innerText(), '0');
    await page.locator('[data-view=results]').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  assert.deepEqual(errors, []);
  console.log('Blocks browser: 3-lesson interleaving corrected by atomic swap, undo/download/reopen passed; Wednesday afternoon validated and corrected; rules table and mobile passed.');
} finally { await browser.close(); }
