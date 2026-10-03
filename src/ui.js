import { DAY_NAMES, readExcelFile } from "./parser.js";
import { runRules, RULES, classSessionLimit } from "./rules.js";
import { applyPlan } from "./solver.js";
import { exportWorkbook } from "./exporter.js";
import { ACCESS_PASSWORD } from "./config.js";

const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name) => `<i data-lucide="${name}"></i>`;
const icons = () => window.lucide?.createIcons();
const labels = {
  CLASS_CONFLICT: "Trùng lớp",
  TEACHER_DAILY_LIMIT: "Vượt số tiết giáo viên",
  CLASS_SESSION_LIMIT: "Vượt số tiết lớp",
  CLASS_LESSON_GAPS: "Tiết cùng lớp không liền nhau",
};
const shortDay = (name) =>
  name.charAt(0) + name.slice(1).toLocaleLowerCase("vi");
const empty = (symbol, title, text = "") =>
  `<div class="empty">${icon(symbol)}<h3>${escape(title)}</h3>${text ? `<p>${escape(text)}</p>` : ""}</div>`;
let original = null,
  data = null,
  checked = false,
  issues = [],
  transactions = [],
  activeDay = DAY_NAMES[0];
let busy = false,
  worker = null,
  preview = null;
const allMoves = () => transactions.flatMap((transaction) => transaction.moves);
let recommendationWorker = null, recommendations = null, recommendationStatus = '';

function resetRecommendations() {
  recommendationWorker?.terminate(); recommendationWorker = null;
  recommendations = null; recommendationStatus = '';
}

function recommend() {
  resetRecommendations();
  if (!issues.length) return;
  recommendationStatus = 'Đang tìm phương án ưu tiên…';
  renderResults(); icons();
  const snapshot = data;
  let current;
  const failed = message => {
    if (recommendationWorker !== current || data !== snapshot) return;
    recommendationWorker?.terminate(); recommendationWorker = null;
    recommendationStatus = message; renderResults(); icons();
  };
  try {
    current = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
    recommendationWorker = current;
    const timer = setTimeout(() => failed('Chưa tìm xong trong 30 giây. Nhấn Chỉnh sửa để thử lại.'), 30000);
    current.onmessage = ({ data: result }) => {
      clearTimeout(timer);
      if (recommendationWorker !== current || data !== snapshot) return;
      if (result.error) { failed(result.error); return; }
      recommendations = result.suggestions; recommendationStatus = '';
      current.terminate(); recommendationWorker = null; renderResults(); icons();
    };
    current.onerror = () => { clearTimeout(timer); failed('Không tìm được gợi ý. Nhấn Chỉnh sửa để thử lại.'); };
    current.postMessage({ schedule: data, recommendationsOnly: true });
  } catch { recommendationStatus = 'Không mở được bộ tìm phương án.'; renderResults(); icons(); }
}

function recommendationHtml(issue) {
  if (!recommendations) return `<p class="recommendation muted" role="status">${escape(recommendationStatus || 'Nhấn Kiểm tra để tìm phương án.')}</p>`;
  const best = recommendations.find(r => r.id === issue.id)?.moves[0];
  if (!best) return '<p class="recommendation muted">Chưa tìm được cách chuyển hoặc đổi chỗ hợp lệ cho lỗi này; cần điều chỉnh thủ công.</p>';
  return `<div class="recommendation"><strong>Phương án ưu tiên · ${escape(best.teacherName)} · ${escape(best.raw)}</strong><p>${escape(describe(best))}</p><p class="muted">Giảm ${best.improvement} mức vượt giới hạn; ưu tiên giảm lỗi nhiều nhất, giữ cùng buổi/ngày, rồi vị trí gần nhất. Chưa áp dụng vào lịch.</p><button class="secondary" data-recommend="${issues.indexOf(issue)}">${icon('check')}Xác nhận áp dụng</button></div>`;
}

function notify(message = "", error = false) {
  $("notice").hidden = !message;
  $("notice").textContent = message;
  $("notice").classList.toggle("error", error);
}

function setBusy(value) {
  busy = value;
  document.body.classList.toggle("busy", value);
  for (const id of ["choose-file", "logout"]) $(id).disabled = value;
  $("check").disabled = value || !data;
  $("fix").disabled = value;
  $("download").disabled = value;
  $("undo").disabled = value || !transactions.length;
}

function render() {
  $("file-name").textContent = original?.fileName || "Chưa chọn thời khóa biểu";
  $("file-meta").textContent = data
    ? `${data.days.length} ngày · ${data.stats.teachers} giáo viên · ${(original.originalBytes.byteLength / 1024).toFixed(0)} KB`
    : "Tệp Excel .xlsx · Tối đa 20 MB";
  $("stat-teachers").textContent = data?.stats.teachers ?? "—";
  $("stat-lessons").textContent = data?.stats.occupiedSlots ?? "—";
  $("stat-errors").textContent = checked ? issues.length : "—";
  $("stat-warnings").textContent = data ? data.warnings.length : "—";
  $("stat-errors").classList.toggle("has-errors", checked && issues.length > 0);
  $("stat-warnings").classList.toggle(
    "has-warnings",
    (data?.warnings.length || 0) > 0,
  );
  $("fix").hidden = !checked || issues.length === 0;
  $("download").hidden = !transactions.length;
  $("filters").hidden = !checked || !issues.length;
  $("history-count").textContent = allMoves().length;
  $("results-title").textContent = checked
    ? issues.length
      ? `${issues.length} vi phạm cần điều chỉnh`
      : `Đã kiểm tra ${RULES.length} quy tắc`
    : "Kết quả kiểm tra";
  $("results-subtitle").textContent = checked
    ? `${original.fileName}${transactions.length ? " · Đã cập nhật trong phiên" : ""}`
    : data
      ? "Tệp đã sẵn sàng"
      : "Chưa có kết quả";
  renderResults();
  renderWarnings();
  renderSchedule();
  renderHistory();
  setBusy(busy);
  icons();
}

function renderResults() {
  if (!checked) {
    $("results").innerHTML = empty(
      data ? "clipboard-check" : "calendar-search",
      data ? "Sẵn sàng kiểm tra" : "Chưa có thời khóa biểu",
      data ? original.fileName : "Chọn tệp Excel của nhà trường",
    );
    return;
  }
  if (!issues.length) {
    $("results").innerHTML =
      `<div class="success">${icon(data.warnings.length ? "circle-alert" : "circle-check")}<div><strong>${data.warnings.length ? "Không phát hiện vi phạm trong dữ liệu đã nhận diện" : `Thời khóa biểu hợp lệ theo ${RULES.length} quy tắc`}</strong><p>${data.warnings.length ? "Vẫn còn dữ liệu cần xem lại bên dưới trước khi chốt lịch." : "Không có lỗi trùng lớp, vượt giới hạn hoặc tiết cùng lớp bị xen kẽ."}</p></div></div>`;
    return;
  }
  const filtered = issues.filter(
    (issue) =>
      (!$("day-filter").value || issue.day === $("day-filter").value) &&
      (!$("rule-filter").value || issue.rule === $("rule-filter").value),
  );
  if (!filtered.length) {
    $("results").innerHTML = empty(
      "list-filter",
      "Không có lỗi phù hợp bộ lọc",
    );
    return;
  }
  const groups = new Map();
  for (const issue of filtered) {
    const key =
      $("group-by").value === "day" ? shortDay(issue.day) : labels[issue.rule];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(issue);
  }
  $("results").innerHTML = [...groups]
    .map(
      ([label, errors]) =>
        `<div class="group-heading">${escape(label)} <span class="count">${errors.length}</span></div>${errors
          .map(
            (issue) => `
    <article class="issue">
      <div class="issue-top"><span class="badge">${issue.severity === "critical" ? "NGHIÊM TRỌNG" : "CẦN ĐIỀU CHỈNH"}</span><span class="muted">${escape(shortDay(issue.day))}${issue.session ? ` · ${escape(issue.session)}` : ""}${issue.period ? ` · Tiết ${issue.period}` : ""}</span></div>
      <p class="message">${escape(issue.message)}</p>
      <div class="locations">${issue.lessons.map((lesson) => `<span class="location" title="${escape(`${lesson.teacherName} · ${lesson.subject || "Chưa có môn"} · ${lesson.session} tiết ${lesson.period}`)}"><b>${escape(lesson.cell)}</b>${escape(lesson.raw)} · ${escape(lesson.teacherName)}</span>`).join("")}</div>
      <p class="suggestion">${escape(issue.suggestion)}</p>
      ${recommendationHtml(issue)}
    </article>`,
          )
          .join("")}`,
    )
    .join("");
}

function renderWarnings() {
  const warnings = data?.warnings || [];
  $("warnings-section").hidden = !warnings.length && !data?.notes?.length;
  $("warnings").innerHTML = warnings
    .map(
      (w) =>
        `<div class="warning-row"><strong>${escape(shortDay(w.sheet))}${w.cell ? ` · ${escape(w.cell)}` : ""}</strong><span>${escape(w.message)}</span></div>`,
    )
    .join("");
  for (const note of data?.notes || []) {
    // Notes are informational, not schedule violations or missing-class warnings.
    const row = document.createElement('p'); row.className = 'muted'; row.textContent = note;
    $('warnings').appendChild(row);
  }
}

function renderSchedule() {
  $("day-tabs").innerHTML = DAY_NAMES.map(
    (name) =>
      `<button data-day="${escape(name)}" class="${name === activeDay ? "active" : ""}" aria-pressed="${name === activeDay}">${escape(shortDay(name))}</button>`,
  ).join("");
  if (!data) {
    $("schedule").innerHTML = empty("calendar-days", "Chưa có thời khóa biểu");
    return;
  }
  const day = data.days.find((d) => d.name === activeDay);
  const query = $("teacher-search")
    .value.normalize("NFC")
    .toLocaleLowerCase("vi")
    .trim();
  const rows = day.rows.filter((row) =>
    `${row.teacherName} ${row.subject || ""}`
      .toLocaleLowerCase("vi")
      .includes(query),
  );
  const problems = new Set(
    issues
      .filter((e) => e.day === day.name)
      .flatMap((e) => e.lessons.map((l) => l.cell)),
  );
  const changes = new Set(
    allMoves()
      .flatMap((m) => [m.from, m.to])
      .filter((l) => l.day === day.name)
      .map((l) => l.cell),
  );
  $("schedule").innerHTML = rows.length
    ? `<table><thead><tr><th>Giáo viên</th><th>Môn</th>${day.slots.map((s) => `<th>${s.session}<br>Tiết ${s.period}</th>`).join("")}<th>Tổng</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${escape(row.teacherName)}</strong><span class="teacher-sub">Dòng ${row.row}</span></td><td>${escape(row.subject || "—")}</td>${row.lessons.map((l) => `<td class="lesson-cell${problems.has(l.cell) ? " problem" : ""}${l.kind === "unrecognized" ? " uncertain" : ""}${changes.has(l.cell) ? " changed" : ""}">${escape(l.raw || "—")}<span class="cell-ref">${l.cell}</span></td>`).join("")}<td><strong>${row.actualTotal}</strong></td></tr>`).join("")}</tbody></table>`
    : empty("search", "Không tìm thấy giáo viên");
}

function describe(move) {
  const from = `${shortDay(move.from.day)} · ${move.from.session} tiết ${move.from.period} (${move.from.cell})`;
  const to = `${shortDay(move.to.day)} · ${move.to.session} tiết ${move.to.period} (${move.to.cell})`;
  return move.type === 'swap' ? `Đổi chỗ ${move.raw} tại ${from} với ${move.swapRaw} tại ${to}` : `${from} → ${to}`;
}

function renderHistory() {
  $("history").innerHTML = transactions.length
    ? transactions
        .map(
          (transaction, index) =>
            `<div class="history-row"><h3>Lần ${index + 1} · ${transaction.moves.length} tiết được chuyển</h3>${transaction.moves.map((m) => `<p><strong>${escape(m.teacherName)} · ${escape(m.raw)}</strong><br>${escape(describe(m))}</p>`).join("")}</div>`,
        )
        .join("")
    : empty("history", "Chưa có thay đổi");
}

function switchView(view) {
  for (const name of ["results", "schedule", "history"])
    $(`${name}-view`).hidden = name !== view;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  });
}

function cancelWorker() {
  worker?.terminate();
  worker = null;
}

async function loadFile(file) {
  if (!file || busy) return;
  if (
    transactions.length &&
    !window.confirm("Mở tệp khác sẽ bỏ các thay đổi chưa tải xuống. Tiếp tục?")
  )
    return;
  cancelWorker();
  setBusy(true);
  notify("Đang đọc tệp Excel…");
  try {
    const loaded = await readExcelFile(file, window.XLSX);
    original = loaded;
    resetRecommendations();
    data = loaded.data;
    checked = false;
    issues = [];
    transactions = [];
    preview = null;
    activeDay = DAY_NAMES[0];
    $("teacher-search").value = "";
    $("day-filter").value = "";
    $("rule-filter").value = "";
    switchView("results");
    notify("Đã đọc tệp Excel.");
    render();
  } catch (error) {
    notify(error.message, true);
  } finally {
    setBusy(false);
    $("file-input").value = "";
  }
}

function apply(moves) {
  try {
    if (!moves.length) return;
    data = applyPlan(data, moves);
    transactions.push({ moves });
    issues = runRules(data);
    checked = true;
    preview = null;
    $("preview-dialog").close();
    cancelWorker();
    notify(
      `Đã áp dụng ${moves.length} thay đổi và kiểm tra lại. Còn ${issues.length} vi phạm${data.warnings.length ? `, ${data.warnings.length} mục dữ liệu cần xem lại` : ""}.`,
    );
    render();
    recommend();
  } catch (error) {
    $("preview-dialog").close();
    notify(error.message, true);
  }
}

function showPreview() {
  if (busy || !data || !issues.length) return;
  preview = null;
  $("apply-all").disabled = true;
  $("plan-summary").textContent = "Đang tìm phương án chuyển và đổi chỗ…";
  $("preview-content").innerHTML =
    '<div class="empty"><span class="spinner"></span><p>Đang kiểm tra các vị trí còn trống…</p></div>';
  $("preview-dialog").showModal();
  try {
    cancelWorker();
    worker = new Worker(new URL("./solver-worker.js", import.meta.url), {
      type: "module",
    });
    const activeWorker = worker;
    const timer = setTimeout(() => {
      if (worker !== activeWorker) return;
      cancelWorker();
      $("preview-content").innerHTML = empty(
        "clock",
        "Chưa tìm xong trong 30 giây",
        "Cần điều chỉnh thủ công hoặc thử lại với lịch ít lỗi hơn.",
      );
      $("plan-summary").textContent = "Chưa áp dụng thay đổi nào.";
    }, 30000);
    worker.onmessage = ({ data: result }) => {
      clearTimeout(timer);
      if (worker !== activeWorker) return;
      cancelWorker();
      if (result.error) {
        $("preview-content").innerHTML = empty("circle-alert", result.error);
        $("plan-summary").textContent = "";
        return;
      }
      preview = result;
      $("preview-content").innerHTML =
        `<p class="muted">Các phương án đối chiếu lịch giáo viên chuyên theo ${RULES.length} quy tắc, gồm tiết cùng lớp phải liền nhau trong buổi. ${data.warnings.length ? "Dữ liệu chưa rõ lớp vẫn cần kiểm tra thủ công." : ""}</p>` +
        issues
          .map((issue, i) => {
            const options =
              result.suggestions.find((s) => s.id === issue.id)?.moves || [];
            return `<section class="preview-group"><div class="group-heading">${escape(labels[issue.rule])}</div><h3>${escape(issue.message)}</h3>${options.length ? options.map((m, j) => `<div class="option"><div><strong>${escape(m.teacherName)} · ${escape(m.raw)}</strong><p>${escape(describe(m))}</p></div><button class="secondary" data-apply-issue="${i}" data-option="${j}">${icon("check")}Áp dụng</button></div>`).join("") : '<p class="error-text">Chưa tìm được phương án chuyển hoặc đổi chỗ hợp lệ riêng cho lỗi này. Xem kế hoạch bên dưới hoặc điều chỉnh thủ công.</p>'}</section>`;
          })
          .join("") +
        (result.plan.moves.length
          ? `<h3 class="plan-label">Danh sách áp dụng tất cả · ${result.plan.moves.length} thay đổi</h3><div class="plan-list">${result.plan.moves.map((m) => `<p><strong>${escape(m.teacherName)} · ${escape(m.raw)}</strong><br>${escape(describe(m))}</p>`).join("")}</div>`
          : "");
      if (result.plan.remainingIssues.length) {
        $("preview-content").innerHTML += `<section class="preview-group"><h3>Lỗi còn lại sau kế hoạch</h3>${result.plan.remainingIssues.map(issue => `<p class="error-text">${escape(issue.message)}</p>`).join('')}</section>`;
      }
      $("plan-summary").textContent = result.plan.moves.length
        ? `Sau khi áp dụng tất cả: còn ${result.plan.remaining} vi phạm.${data.warnings.length ? " Vẫn cần xem lại dữ liệu cảnh báo." : ""}`
        : "Chưa có phương án tự động khả thi.";
      $("apply-all").disabled = !result.plan.moves.length;
      icons();
    };
    worker.onerror = () => {
      clearTimeout(timer);
      cancelWorker();
      $("preview-content").innerHTML = empty(
        "circle-alert",
        "Không tìm được phương án",
        "Hãy đóng cửa sổ và thử lại.",
      );
      $("plan-summary").textContent = "";
    };
    worker.postMessage(data);
  } catch {
    cancelWorker();
    $("preview-content").innerHTML = empty(
      "circle-alert",
      "Không mở được bộ tìm phương án",
    );
  }
}

$("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if ($("password").value !== ACCESS_PASSWORD) {
    $("login-error").textContent = "Mật khẩu chưa đúng. Vui lòng thử lại.";
    return;
  }
  try {
    sessionStorage.setItem("tkb-access", "1");
  } catch {
    /* Login still works in memory if browser storage is blocked. */
  }
  $("password").value = "";
  $("login-error").textContent = "";
  $("login").hidden = true;
  $("app").hidden = false;
  $("choose-file").focus();
});
$("show-password").addEventListener("click", () => {
  const hidden = $("password").type === "password";
  $("password").type = hidden ? "text" : "password";
  $("show-password").title = hidden ? "Ẩn mật khẩu" : "Hiện mật khẩu";
  $("show-password").setAttribute("aria-label", $("show-password").title);
  $("show-password").innerHTML = icon(hidden ? "eye-off" : "eye");
  icons();
});
$("logout").addEventListener("click", () => {
  if (
    transactions.length &&
    !window.confirm(
      "Đăng xuất sẽ xóa dữ liệu và các thay đổi trong phiên. Tiếp tục?",
    )
  )
    return;
  cancelWorker();
  try {
    sessionStorage.removeItem("tkb-access");
  } catch {
    /* No persistent session. */
  }
  original = null;
  resetRecommendations();
  data = null;
  checked = false;
  issues = [];
  transactions = [];
  preview = null;
  $("app").hidden = true;
  $("login").hidden = false;
  $("password").type = "password";
  $("password").focus();
  notify();
  render();
});
$("choose-file").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", (event) =>
  loadFile(event.target.files[0]),
);
for (const type of ["dragover", "dragenter"])
  $("drop-zone").addEventListener(type, (event) => {
    event.preventDefault();
    $("drop-zone").classList.add("dragging");
  });
for (const type of ["dragleave", "drop"])
  $("drop-zone").addEventListener(type, (event) => {
    event.preventDefault();
    $("drop-zone").classList.remove("dragging");
  });
$("drop-zone").addEventListener("drop", (event) => {
  if (event.dataTransfer.files.length !== 1) {
    notify("Vui lòng chọn một tệp Excel mỗi lần.", true);
    return;
  }
  loadFile(event.dataTransfer.files[0]);
});
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());
$("check").addEventListener("click", () => {
  if (!data || busy) return;
  try {
    issues = runRules(data);
    checked = true;
    notify();
    render();
    recommend();
  } catch (error) {
    notify(error.message, true);
  }
});
for (const id of ["day-filter", "rule-filter", "group-by"])
  $(id).addEventListener("change", () => {
    renderResults();
    icons();
  });
document
  .querySelectorAll("[data-view]")
  .forEach((button) =>
    button.addEventListener("click", () => switchView(button.dataset.view)),
  );
$("day-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-day]");
  if (!button) return;
  activeDay = button.dataset.day;
  renderSchedule();
  icons();
});
$("teacher-search").addEventListener("input", () => {
  renderSchedule();
  icons();
});
$("fix").addEventListener("click", showPreview);
$('results').addEventListener('click', event => {
  const button = event.target.closest('[data-recommend]');
  if (!button || busy || !recommendations) return;
  const issue = issues[Number(button.dataset.recommend)];
  const best = recommendations.find(r => r.id === issue?.id)?.moves[0];
  if (best) apply([best]);
});
$("close-preview").addEventListener("click", () => $("preview-dialog").close());
$("preview-dialog").addEventListener("close", () => {
  cancelWorker();
  preview = null;
});
$("preview-content").addEventListener("click", (event) => {
  const button = event.target.closest("[data-apply-issue]");
  if (!button || !preview) return;
  const issue = issues[Number(button.dataset.applyIssue)];
  const move = preview.suggestions.find((s) => s.id === issue.id)?.moves[
    Number(button.dataset.option)
  ];
  if (move) apply([move]);
});
$("apply-all").addEventListener("click", () => {
  if (preview) apply(preview.plan.moves);
});
$("undo").addEventListener("click", () => {
  if (!transactions.length || busy) return;
  try {
    const remaining = transactions.slice(0, -1);
    data = applyPlan(
      original.data,
      remaining.flatMap((t) => t.moves),
    );
    transactions = remaining;
    issues = runRules(data);
    checked = true;
    preview = null;
    notify("Đã hoàn tác lần thay đổi cuối và kiểm tra lại.");
    render();
    recommend();
  } catch (error) {
    notify(error.message, true);
  }
});
$("download").addEventListener("click", async () => {
  if (!original || !transactions.length || busy) return;
  setBusy(true);
  notify("Đang chuẩn bị tệp Excel…");
  await new Promise((resolve) => setTimeout(resolve, 30));
  try {
    const bytes = exportWorkbook(original, allMoves());
    const url = URL.createObjectURL(
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = original.fileName.replace(/\.xlsx$/i, "-da-chinh.xlsx");
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notify(
      `Đã tạo tệp Excel mới.${issues.length ? ` Còn ${issues.length} vi phạm.` : ""}${data.warnings.length ? ` Còn ${data.warnings.length} mục dữ liệu cần xem lại.` : ""}`,
    );
  } catch (error) {
    notify(`Không xuất được Excel: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
});
$("show-rules").addEventListener("click", () => $("rules-dialog").showModal());
$("close-rules").addEventListener("click", () => $("rules-dialog").close());
window.addEventListener("beforeunload", (event) => {
  if (transactions.length) {
    event.preventDefault();
    event.returnValue = "";
  }
});
for (const name of DAY_NAMES) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = shortDay(name);
  $("day-filter").appendChild(option);
}
$("class-session-limits").innerHTML = DAY_NAMES.map(name =>
  `<tr><td>${escape(shortDay(name))}</td><td>${classSessionLimit(name, 'Sáng')}</td><td>${classSessionLimit(name, 'Chiều')}</td></tr>`).join('');
try {
  if (sessionStorage.getItem("tkb-access") === "1") {
    $("login").hidden = true;
    $("app").hidden = false;
  }
} catch {
  /* Require login if session storage is unavailable. */
}
render();
