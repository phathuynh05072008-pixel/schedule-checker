import { unzipSync, zipSync, strFromU8, strToU8 } from "./vendor/fflate.js";
import { applyPlan } from "./solver.js";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const elements = (node, name) =>
  Array.from(node.getElementsByTagNameNS(NS, name));
const direct = (node, name) =>
  Array.from(node.childNodes).find(
    (n) => n.nodeType === 1 && n.localName === name,
  );

function parseXml(bytes, xml) {
  if (!bytes) throw new Error("File Excel thiếu thành phần XML bắt buộc.");
  const document = new xml.DOMParser().parseFromString(
    strFromU8(bytes),
    "application/xml",
  );
  if (document.getElementsByTagName("parsererror").length)
    throw new Error("XML trong file Excel không hợp lệ.");
  return document;
}

function sheetPaths(files, xml) {
  const workbook = parseXml(files["xl/workbook.xml"], xml);
  const rels = parseXml(files["xl/_rels/workbook.xml.rels"], xml);
  const targets = new Map(
    Array.from(rels.documentElement.childNodes)
      .filter(
        (node) =>
          node.nodeType === 1 && node.getAttribute("TargetMode") !== "External",
      )
      .map((node) => [node.getAttribute("Id"), node.getAttribute("Target")]),
  );
  return new Map(
    elements(workbook, "sheet").map((sheet) => {
      const target = targets.get(sheet.getAttributeNS(REL, "id"));
      if (!target)
        throw new Error(
          "Không xác định được đường dẫn sheet trong file Excel.",
        );
      const path = new URL(target, "https://xlsx.local/xl/").pathname.slice(1);
      if (!files[path])
        throw new Error("Không tìm thấy dữ liệu sheet trong file Excel.");
      return [sheet.getAttribute("name"), path];
    }),
  );
}

function cellAt(document, address) {
  const data = elements(document, "sheetData")[0];
  if (!data) throw new Error("Sheet không có vùng dữ liệu.");
  const rowNumber = Number(address.match(/\d+$/)[0]);
  let row = elements(data, "row").find(
    (r) => Number(r.getAttribute("r")) === rowNumber,
  );
  if (!row) {
    row = document.createElementNS(NS, "row");
    row.setAttribute("r", String(rowNumber));
    data.insertBefore(
      row,
      elements(data, "row").find(
        (r) => Number(r.getAttribute("r")) > rowNumber,
      ) || null,
    );
  }
  let cell = elements(row, "c").find((c) => c.getAttribute("r") === address);
  if (!cell) {
    cell = document.createElementNS(NS, "c");
    cell.setAttribute("r", address);
    const column = (ref) =>
      ref
        .match(/^[A-Z]+/)[0]
        .split("")
        .reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
    row.insertBefore(
      cell,
      elements(row, "c").find(
        (c) => column(c.getAttribute("r")) > column(address),
      ) || null,
    );
  }
  return cell;
}

function setCell(document, address, value, total) {
  const cell = cellAt(document, address);
  if (!total && direct(cell, "f"))
    throw new Error("Không thể thay đổi ô lịch có công thức.");
  if (total && direct(cell, "f")?.getAttribute("t") === "array")
    throw new Error("Ô tổng dùng công thức mảng, cần cập nhật thủ công.");
  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === 1 && ["v", "is"].includes(child.localName))
      cell.removeChild(child);
  }
  cell.removeAttribute("t");
  let content;
  if (total) {
    content = document.createElementNS(NS, "v");
    content.textContent = String(value);
  } else if (value !== "") {
    cell.setAttribute("t", "inlineStr");
    content = document.createElementNS(NS, "is");
    const text = document.createElementNS(NS, "t");
    text.setAttributeNS(
      "http://www.w3.org/XML/1998/namespace",
      "xml:space",
      "preserve",
    );
    text.textContent = value;
    content.appendChild(text);
  }
  if (content) cell.insertBefore(content, direct(cell, "extLst") || null);
}

/** Patch values inside the original ZIP; leave styles, drawings, merges and other parts intact. */
export function exportWorkbook(original, moves, xml = globalThis) {
  if (!moves.length) return new Uint8Array(original.originalBytes);
  const next = applyPlan(original.data, moves);
  let expanded = 0;
  const files = unzipSync(new Uint8Array(original.originalBytes), {
    filter(entry) {
      expanded += entry.originalSize;
      if (expanded > 100 * 1024 * 1024)
        throw new Error("File Excel giải nén vượt quá 100 MB.");
      return true;
    },
  });
  if (Object.keys(files).some((path) => path.startsWith("_xmlsignatures/"))) {
    throw new Error(
      "File có chữ ký số. Không thể sửa mà vẫn giữ chữ ký hợp lệ.",
    );
  }
  const paths = sheetPaths(files, xml);
  const updates = new Map();
  const add = (name, cell, value, total = false) => {
    if (!updates.has(name)) updates.set(name, []);
    updates.get(name).push({ cell, value, total });
  };
  for (let d = 0; d < next.days.length; d++) {
    const day = next.days[d];
    for (let r = 0; r < day.rows.length; r++) {
      const row = day.rows[r],
        before = original.data.days[d].rows[r];
      for (let s = 0; s < row.lessons.length; s++) {
        if (row.lessons[s].raw !== before.lessons[s].raw)
          add(day.name, row.lessons[s].cell, row.lessons[s].raw);
      }
      if (row.actualTotal !== before.actualTotal) {
        add(day.name, row.sourceTotal.cell, row.actualTotal + (row.sourceTotal.includesAssembly ? row.assemblyCount : 0), true);
        const summary = original.data.summary.find(
          (item) => item.teacherKey === row.teacherKey,
        );
        if (summary)
          add("Sheet1", summary.dailyTotals[d].cell, row.actualTotal + (summary.dailyTotals[d].includesAssembly ? row.assemblyCount : 0), true);
      }
    }
  }
  for (const [name, changes] of updates) {
    const path = paths.get(name);
    const document = parseXml(files[path], xml);
    if (elements(document, "sheetProtection").length)
      throw new Error(
        `${name} đang được bảo vệ. Hãy bỏ bảo vệ trong Excel trước khi xuất.`,
      );
    for (const change of changes)
      setCell(document, change.cell, change.value, change.total);
    files[path] = strToU8(new xml.XMLSerializer().serializeToString(document));
  }
  const workbook = parseXml(files["xl/workbook.xml"], xml);
  let calc = elements(workbook, "calcPr")[0];
  if (!calc) {
    calc = workbook.createElementNS(NS, "calcPr");
    const following = [
      "oleSize",
      "customWorkbookViews",
      "pivotCaches",
      "smartTagPr",
      "smartTagTypes",
      "webPublishing",
      "fileRecoveryPr",
      "webPublishObjects",
      "extLst",
    ];
    workbook.documentElement.insertBefore(
      calc,
      Array.from(workbook.documentElement.childNodes).find((n) =>
        following.includes(n.localName),
      ) || null,
    );
  }
  calc.setAttribute("fullCalcOnLoad", "1");
  calc.setAttribute("forceFullCalc", "1");
  calc.setAttribute("calcMode", "auto");
  files["xl/workbook.xml"] = strToU8(
    new xml.XMLSerializer().serializeToString(workbook),
  );
  return zipSync(files, { level: 6 });
}
