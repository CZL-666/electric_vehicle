const form = document.querySelector("#entryForm");
const input = document.querySelector("#mileageInput");
const note = document.querySelector("#formNote");
const historyList = document.querySelector("#historyList");
const chart = document.querySelector("#rangeChart");
const emptyChart = document.querySelector("#emptyChart");
const clearBtn = document.querySelector("#clearBtn");
const exportBtn = document.querySelector("#exportBtn");
const importBtn = document.querySelector("#importBtn");
const importFile = document.querySelector("#importFile");

const avgDistance = document.querySelector("#avgDistance");
const latestDistance = document.querySelector("#latestDistance");
const recordCount = document.querySelector("#recordCount");
const bestRun = document.querySelector("#bestRun");
const shortRun = document.querySelector("#shortRun");
const totalRecords = document.querySelector("#totalRecords");
const lastUpdated = document.querySelector("#lastUpdated");

let records = [];
let storageMode = "browser";
const STORAGE_KEY = "ev-charge-mileage-records-v2";
const STORAGE_TEST_KEY = "ev-charge-mileage-storage-test";

function isServerMode() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function assertBrowserStorage() {
  localStorage.setItem(STORAGE_TEST_KEY, "ok");
  const value = localStorage.getItem(STORAGE_TEST_KEY);
  localStorage.removeItem(STORAGE_TEST_KEY);
  if (value !== "ok") throw new Error("浏览器存储不可用");
}

function normalizeRecords(nextRecords) {
  return nextRecords
    .filter((item) => Number.isFinite(Number(item.mileage)))
    .map((item) => ({
      id: String(item.id || Date.now()),
      mileage: Number(item.mileage),
      date: item.date || new Date().toISOString(),
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function loadRecords() {
  if (!isServerMode()) {
    storageMode = "browser";
    assertBrowserStorage();
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return normalizeRecords(Array.isArray(parsed) ? parsed : []);
  }

  const response = await fetch("/api/records");
  if (!response.ok) throw new Error("读取记录失败");
  const parsed = await response.json();
  storageMode = "json";
  return normalizeRecords(Array.isArray(parsed.records) ? parsed.records : []);
}

async function saveRecords(nextRecords) {
  const cleanRecords = normalizeRecords(nextRecords);

  if (storageMode === "browser") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanRecords));
    records = cleanRecords;
    return;
  }

  const response = await fetch("/api/records", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records: cleanRecords }),
  });
  if (!response.ok) throw new Error("保存记录失败");
  const parsed = await response.json();
  records = normalizeRecords(Array.isArray(parsed.records) ? parsed.records : cleanRecords);
}

function storageLabel() {
  return storageMode === "json" ? "data.json" : "本机浏览器";
}

function formatKm(value) {
  if (!Number.isFinite(value)) return "-- km";
  return `${Number(value.toFixed(1)).toLocaleString("zh-CN")} km`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getRuns() {
  return records.slice(1).map((record, index) => ({
    id: record.id,
    date: record.date,
    distance: record.mileage - records[index].mileage,
    mileage: record.mileage,
  }));
}

function setNote(message, isError = false) {
  note.textContent = message;
  note.classList.toggle("error", isError);
}

function renderStats() {
  const runs = getRuns().filter((run) => run.distance >= 0);
  const latestRun = runs.at(-1);
  const average = runs.length ? runs.reduce((sum, run) => sum + run.distance, 0) / runs.length : null;
  const best = runs.length ? Math.max(...runs.map((run) => run.distance)) : null;
  const shortest = runs.length ? Math.min(...runs.map((run) => run.distance)) : null;

  avgDistance.textContent = average === null ? "--" : Number(average.toFixed(1)).toLocaleString("zh-CN");
  latestDistance.textContent = latestRun ? `${formatKm(latestRun.distance)}` : "还没有记录";
  recordCount.textContent = records.length > 1 ? `已计算 ${runs.length} 次充电间隔` : "记录第 1 次充电后开始追踪";
  bestRun.textContent = formatKm(best);
  shortRun.textContent = formatKm(shortest);
  totalRecords.textContent = `${records.length} 次`;
  lastUpdated.textContent = records.length ? `最近 ${formatDate(records.at(-1).date)}` : "--";
}

function renderHistory() {
  historyList.innerHTML = "";

  if (!records.length) {
    const item = document.createElement("li");
    item.className = "history-item";
    item.innerHTML = '<div class="history-main"><strong>暂无记录</strong><span class="history-date">先保存一次总里程</span></div>';
    historyList.appendChild(item);
    return;
  }

  records
    .slice()
    .reverse()
    .forEach((record, reverseIndex) => {
      const index = records.length - 1 - reverseIndex;
      const prev = records[index - 1];
      const delta = prev ? record.mileage - prev.mileage : null;
      const item = document.createElement("li");
      item.className = "history-item";
      item.innerHTML = `
        <div class="history-main">
          <strong>${formatKm(record.mileage)}</strong>
          <span class="history-date">${formatDate(record.date)}</span>
        </div>
        <span class="history-delta">${delta === null ? "起点" : `+${formatKm(delta)}`}</span>
        <button class="delete-record" type="button" aria-label="删除这条记录" data-id="${record.id}">×</button>
      `;
      historyList.appendChild(item);
    });
}

function drawChart() {
  const ctx = chart.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = chart.getBoundingClientRect();
  chart.width = Math.max(1, Math.floor(rect.width * ratio));
  chart.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const runs = getRuns().filter((run) => run.distance >= 0);
  emptyChart.hidden = runs.length !== 0;
  if (!runs.length) return;

  const width = rect.width;
  const height = rect.height;
  const padding = { top: 18, right: 18, bottom: 32, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(20, Math.ceil(Math.max(...runs.map((run) => run.distance)) / 10) * 10);
  const minValue = 0;
  const xStep = runs.length > 1 ? plotWidth / (runs.length - 1) : plotWidth;

  ctx.lineWidth = 1;
  ctx.strokeStyle = "#dde2da";
  ctx.fillStyle = "#6b7280";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

  for (let i = 0; i <= 4; i += 1) {
    const value = minValue + ((maxValue - minValue) / 4) * i;
    const y = padding.top + plotHeight - ((value - minValue) / (maxValue - minValue)) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(value)), 8, y + 4);
  }

  const points = runs.map((run, index) => ({
    x: padding.left + (runs.length === 1 ? plotWidth / 2 : index * xStep),
    y: padding.top + plotHeight - ((run.distance - minValue) / (maxValue - minValue)) * plotHeight,
    value: run.distance,
  }));

  const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, "rgba(15, 118, 110, 0.28)");
  gradient.addColorStop(1, "rgba(15, 118, 110, 0.02)");

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.lineTo(points.at(-1).x, height - padding.bottom);
  ctx.lineTo(points[0].x, height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0f766e";
  ctx.stroke();

  points.forEach((point, index) => {
    ctx.beginPath();
    ctx.fillStyle = index === points.length - 1 ? "#d97706" : "#0f766e";
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#18212f";
    ctx.fillText(Number(point.value.toFixed(1)).toString(), point.x - 10, point.y - 10);
  });
}

function render() {
  renderStats();
  renderHistory();
  drawChart();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mileage = Number(input.value);
  const previous = records.at(-1);

  if (!Number.isFinite(mileage) || mileage < 0) {
    setNote("请输入有效的总里程。", true);
    return;
  }

  if (previous && mileage <= previous.mileage) {
    setNote(`新里程需要大于上一次记录：${formatKm(previous.mileage)}。`, true);
    return;
  }

  const nextRecords = records.concat({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    mileage,
    date: new Date().toISOString(),
  });

  try {
    await saveRecords(nextRecords);
    input.value = "";
    setNote(`已记录 1 次充电，并保存到${storageLabel()}。`);
    render();
  } catch {
    setNote("保存失败，请刷新后重试。", true);
  }
});

historyList.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-record");
  if (!button) return;
  try {
    await saveRecords(records.filter((record) => record.id !== button.dataset.id));
    setNote(`记录已删除，并已保存到${storageLabel()}。`);
    render();
  } catch {
    setNote("删除失败，请刷新后重试。", true);
  }
});

clearBtn.addEventListener("click", async () => {
  if (!records.length) return;
  const confirmed = window.confirm("确定清空所有里程记录吗？");
  if (!confirmed) return;
  try {
    await saveRecords([]);
    setNote(`全部记录已清空，并已保存到${storageLabel()}。`);
    render();
  } catch {
    setNote("清空失败，请刷新后重试。", true);
  }
});

exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ records }, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "电动车充电里程记录.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    const importedRecords = Array.isArray(payload.records) ? payload.records : payload;
    await saveRecords(normalizeRecords(importedRecords));
    setNote(`已导入 ${records.length} 条记录，并保存到${storageLabel()}。`);
    render();
  } catch {
    setNote("导入失败，请选择正确的 JSON 备份文件。", true);
  } finally {
    importFile.value = "";
  }
});

window.addEventListener("resize", drawChart);

async function init() {
  try {
    records = await loadRecords();
    render();
    setNote(`当前使用${storageLabel()}保存。`);
  } catch {
    storageMode = "browser";
    try {
      assertBrowserStorage();
      records = normalizeRecords(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch {
      records = [];
      render();
      setNote("浏览器没有保留本机数据。请用 Safari 普通模式打开，不要用无痕模式或 App 内置浏览器。", true);
      return;
    }
    render();
    setNote("当前使用本机浏览器保存。");
  }
}

init();
