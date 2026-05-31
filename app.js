const STORAGE_KEYS = {
  records: "slotRecords.v1",
  masters: "slotMachineMasters.v1",
  stores: "slotStores.v1"
};

const state = {
  records: loadJson(STORAGE_KEYS.records, []),
  masters: loadJson(STORAGE_KEYS.masters, []),
  stores: loadJson(STORAGE_KEYS.stores, []),
  sort: { key: "date", direction: "desc" },
  ocrPreview: { files: [], settings: [], currentIndex: 0, image: null }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", () => {
  initializeDates();
  buildSettingsForm();
  bindTabs();
  bindDraftTable();
  bindStores();
  bindImageUploads();
  bindRecords();
  bindSummary();
  bindRecommendations();
  bindMasters();
  addDraftRow();
  renderAll();
});

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initializeDates() {
  const today = new Date().toISOString().slice(0, 10);
  $("#inputDate").value = today;
  $("#recommendDate").value = today;
}

function bindTabs() {
  $$(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".tab-button").forEach((item) => item.classList.remove("active"));
      $$(".panel").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      $(`#tab-${button.dataset.tab}`).classList.add("active");
    });
  });
}

function bindDraftTable() {
  $("#addRowButton").addEventListener("click", () => addDraftRow());
  $("#mockReadButton").addEventListener("click", () => addDraftRow({ memo: "画像読み取り後に修正" }));
  $("#machineInput").addEventListener("input", refreshDraftEvaluations);
  $("#clearDraftButton").addEventListener("click", () => {
    $("#draftTable tbody").innerHTML = "";
    addDraftRow();
    updateDraftHint();
  });
  $("#saveDraftButton").addEventListener("click", saveDraftRows);
  $$('[data-unit-offset]').forEach((button) => {
    button.addEventListener("click", () => shiftDraftUnitNumbers(numberValue(button.dataset.unitOffset)));
  });
}

function bindStores() {
  $("#saveStoreButton").addEventListener("click", () => {
    const store = $("#storeInput").value.trim();
    if (!store) {
      alert("保存する店舗名を入力してください。");
      return;
    }
    saveStoreName(store);
    $("#storeSelect").value = store;
    alert(`店舗「${store}」を保存しました。`);
  });

  $("#storeSelect").addEventListener("change", (event) => {
    if (event.target.value) $("#storeInput").value = event.target.value;
  });

  $("#deleteStoreButton").addEventListener("click", () => {
    const selected = $("#storeSelect").value;
    if (!selected) {
      alert("削除する店舗をプルダウンから選択してください。");
      return;
    }
    if (!confirm(`店舗「${selected}」をプルダウンから削除しますか？保存済みデータは削除されません。`)) return;
    state.stores = state.stores.filter((store) => store !== selected);
    saveJson(STORAGE_KEYS.stores, state.stores);
    if ($("#storeInput").value === selected) $("#storeInput").value = "";
    renderOptions();
  });
}

function saveStoreName(store) {
  const trimmed = String(store || "").trim();
  if (!trimmed) return;
  state.stores = unique([...state.stores, trimmed]);
  saveJson(STORAGE_KEYS.stores, state.stores);
  renderOptions();
}

function bindImageUploads() {
  $("#basicImage").addEventListener("change", handleBasicImagesSelected);
  $("#graphImage").addEventListener("change", () => updateUploadStatus());
  $("#readBasicImagesButton").addEventListener("click", readBasicImages);
  $("#ocrPreviewFileSelect").addEventListener("change", (event) => selectOcrPreviewImage(Number(event.target.value)));
  ["ocrTop", "ocrBottom", "ocrLeft", "ocrRight", "ocrRowCount"].forEach((id) => {
    $(`#${id}`).addEventListener("input", () => {
      saveCurrentOcrSettingsFromControls();
      renderOcrPreview();
    });
  });
  updateUploadStatus();
}

function updateUploadStatus(message) {
  const basicCount = $("#basicImage")?.files.length || 0;
  const graphCount = $("#graphImage")?.files.length || 0;
  $("#uploadStatus").textContent = message || `基本データ画像 ${basicCount}枚 / グラフ画像 ${graphCount}枚を選択中です。`;
}

async function handleBasicImagesSelected() {
  updateUploadStatus();
  const files = [...$("#basicImage").files];
  state.ocrPreview.files = files;
  state.ocrPreview.settings = files.map(() => defaultOcrRangeSettings());
  state.ocrPreview.currentIndex = 0;
  $("#ocrPreviewPanel").hidden = !files.length;
  $("#ocrPreviewFileSelect").innerHTML = files.map((file, index) => `<option value="${index}">${index + 1}. ${escapeHtml(file.name)}</option>`).join("");
  if (files.length) await selectOcrPreviewImage(0);
  else {
    state.ocrPreview.image = null;
    renderOcrPreview();
  }
}

function defaultOcrRangeSettings() {
  return { top: 8, bottom: 96, left: 3, right: 97, rows: 19 };
}

async function selectOcrPreviewImage(index) {
  if (!state.ocrPreview.files[index]) return;
  state.ocrPreview.currentIndex = index;
  $("#ocrPreviewFileSelect").value = String(index);
  state.ocrPreview.image = await loadImageBitmap(state.ocrPreview.files[index]);
  loadOcrSettingsToControls(getOcrRangeSettings(index));
  renderOcrPreview();
}

function getOcrRangeSettings(index) {
  state.ocrPreview.settings[index] ??= defaultOcrRangeSettings();
  return state.ocrPreview.settings[index];
}

function loadOcrSettingsToControls(settings) {
  $("#ocrTop").value = settings.top;
  $("#ocrBottom").value = settings.bottom;
  $("#ocrLeft").value = settings.left;
  $("#ocrRight").value = settings.right;
  $("#ocrRowCount").value = settings.rows;
  updateOcrRangeLabels(settings);
}

function saveCurrentOcrSettingsFromControls() {
  const index = state.ocrPreview.currentIndex;
  const settings = normalizeOcrRangeSettings({
    top: numberValue($("#ocrTop").value),
    bottom: numberValue($("#ocrBottom").value),
    left: numberValue($("#ocrLeft").value),
    right: numberValue($("#ocrRight").value),
    rows: numberValue($("#ocrRowCount").value)
  });
  state.ocrPreview.settings[index] = settings;
  loadOcrSettingsToControls(settings);
}

function normalizeOcrRangeSettings(settings) {
  const normalized = {
    top: clamp(settings.top, 0, 95),
    bottom: clamp(settings.bottom, 5, 100),
    left: clamp(settings.left, 0, 95),
    right: clamp(settings.right, 5, 100),
    rows: Math.round(clamp(settings.rows || 19, 1, 60))
  };
  if (normalized.bottom - normalized.top < 5) normalized.bottom = Math.min(100, normalized.top + 5);
  if (normalized.right - normalized.left < 5) normalized.right = Math.min(100, normalized.left + 5);
  return normalized;
}

function updateOcrRangeLabels(settings) {
  $("#ocrTopValue").textContent = `${settings.top}%`;
  $("#ocrBottomValue").textContent = `${settings.bottom}%`;
  $("#ocrLeftValue").textContent = `${settings.left}%`;
  $("#ocrRightValue").textContent = `${settings.right}%`;
}

function renderOcrPreview() {
  const canvas = $("#ocrPreviewCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const image = state.ocrPreview.image;
  if (!image) {
    canvas.width = 1;
    canvas.height = 1;
    return;
  }

  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / image.width);
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const settings = getOcrRangeSettings(state.ocrPreview.currentIndex);
  updateOcrRangeLabels(settings);
  const rect = settingsToCanvasRect(settings, canvas.width, canvas.height);
  ctx.save();
  ctx.fillStyle = "rgba(34, 125, 104, 0.12)";
  ctx.strokeStyle = "#1b8f72";
  ctx.lineWidth = 2;
  ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
  ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
  ctx.strokeStyle = "rgba(27, 143, 114, 0.72)";
  ctx.lineWidth = 1;
  for (let col = 1; col < 5; col += 1) {
    const x = rect.left + (rect.width * col) / 5;
    ctx.beginPath();
    ctx.moveTo(x, rect.top);
    ctx.lineTo(x, rect.top + rect.height);
    ctx.stroke();
  }
  for (let row = 1; row < settings.rows; row += 1) {
    const y = rect.top + (rect.height * row) / settings.rows;
    ctx.beginPath();
    ctx.moveTo(rect.left, y);
    ctx.lineTo(rect.left + rect.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function settingsToCanvasRect(settings, width, height) {
  const left = (settings.left / 100) * width;
  const right = (settings.right / 100) * width;
  const top = (settings.top / 100) * height;
  const bottom = (settings.bottom / 100) * height;
  return { left, top, width: right - left, height: bottom - top };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

async function readBasicImages() {
  const files = [...$("#basicImage").files];
  if (!files.length) {
    alert("読み取る基本データ画像を選択してください。");
    return;
  }
  if (!window.Tesseract) {
    alert("OCRライブラリを読み込めませんでした。ネットワーク接続後に再読み込みしてください。");
    return;
  }

  const button = $("#readBasicImagesButton");
  button.disabled = true;
  let added = 0;
  try {
    saveCurrentOcrSettingsFromControls();
    updateUploadStatus("指定した表範囲をOCR読み取り中です...");
    for (const [index, file] of files.entries()) {
      const imageNumber = `${index + 1}/${files.length}枚目`;
      const settings = getOcrRangeSettings(index);
      updateUploadStatus(`指定範囲を5列×${settings.rows}行に分割中です（${imageNumber}）...`);
      let rows = await recognizeBasicDataTableImage(file, imageNumber, settings);
      if (!rows.length) {
        updateUploadStatus(`表分割で抽出できなかったため、従来OCRへ切り替えます（${imageNumber}）...`);
        const ocrResults = await recognizeBasicDataImage(file, imageNumber);
        rows = parseBasicDataText(ocrResults.map((result) => result.text).join("\n"));
      }
      if (rows.length && added === 0 && isDraftTableEmpty()) $("#draftTable tbody").innerHTML = "";
      rows.forEach((row) => addDraftRow(row));
      added += rows.length;
    }
    if (added) {
      updateUploadStatus(`${files.length}枚の基本データ画像から${added}台を表へ入力しました。指定範囲を5列固定で読み取り、合算はBB+RBから再計算しています。要確認の行は保存前に修正してください。`);
    } else {
      updateUploadStatus("OCRは完了しましたが、台番・累計G・BB・RBを抽出できませんでした。プレビューで表の外枠・行数を調整して再実行するか、手動入力してください。");
    }
  } catch (error) {
    console.error(error);
    updateUploadStatus("OCR読み取り中にエラーが発生しました。画像を確認して再実行してください。");
  } finally {
    button.disabled = false;
  }
}


async function recognizeBasicDataTableImage(file, imageNumber, settings) {
  updateUploadStatus(`指定範囲を補正中です（${imageNumber}）...`);
  const rangeSettings = normalizeOcrRangeSettings(settings || defaultOcrRangeSettings());
  const bitmap = await loadImageBitmap(file);
  const source = drawScaledImage(bitmap, { scale: 2.8 });
  const tableCanvas = cropTableRangeCanvas(source, rangeSettings);
  const rawTableCanvas = cropTableRangeCanvas(source, rangeSettings, { enhance: false });
  const cells = buildFixedGridCells(tableCanvas, rangeSettings.rows, 5);
  const rows = [];

  for (let rowIndex = 0; rowIndex < rangeSettings.rows; rowIndex += 1) {
    const rowCells = cells.slice(rowIndex * 5, rowIndex * 5 + 5);
    updateUploadStatus(`指定範囲セルを数字専用OCRで読み取り中です（${imageNumber} / ${rowIndex + 1}/${rangeSettings.rows}行）...`);
    const cellResults = await Promise.all(rowCells.map((cell, columnIndex) => {
      const label = `${imageNumber} 行${rowIndex + 1} 列${columnIndex + 1}`;
      return columnIndex === 0 ? recognizeUnitCell(rawTableCanvas, cell, label) : recognizeNumericCell(tableCanvas, cell, label);
    }));
    const row = buildOcrRowFromCells(cellResults, rowIndex);
    if (row) rows.push(row);
  }

  return dedupeOcrRows(rows);
}

function cropTableRangeCanvas(source, settings, options = {}) {
  const rect = settingsToCanvasRect(settings, source.width, source.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, rect.left, rect.top, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  if (options.enhance === false) return canvas;
  return enhanceCanvas(canvas, { contrast: 1.85, brightness: 12, threshold: 176, invert: false });
}

function buildFixedGridCells(canvas, rowCount, columnCount) {
  const cells = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      cells.push({
        left: Math.round((canvas.width * column) / columnCount),
        right: Math.round((canvas.width * (column + 1)) / columnCount),
        top: Math.round((canvas.height * row) / rowCount),
        bottom: Math.round((canvas.height * (row + 1)) / rowCount)
      });
    }
  }
  return cells;
}

function detectTableLayout(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const darkMap = makeDarkMap(imageData, 120);
  const bounds = findContentBounds(darkMap, canvas.width, canvas.height);
  const horizontalLines = findProjectionLines(darkMap, canvas.width, canvas.height, "horizontal", bounds, 0.42);
  const verticalLines = findProjectionLines(darkMap, canvas.width, canvas.height, "vertical", bounds, 0.32);
  const rowBands = makeBandsFromLines(horizontalLines, bounds.top, bounds.bottom, 26).filter((band) => band.bottom - band.top >= 18);
  const columnBands = makeColumnBands(verticalLines, bounds);
  const dataRows = dropHeaderLikeBand(rowBands, columnBands, darkMap, canvas.width);

  return {
    bounds,
    rows: dataRows.map((rowBand) => columnBands.map((columnBand) => padRect({
      left: columnBand.left,
      right: columnBand.right,
      top: rowBand.top,
      bottom: rowBand.bottom
    }, -3, canvas.width, canvas.height)))
  };
}

function makeDarkMap(imageData, threshold) {
  const map = new Uint8Array(imageData.width * imageData.height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const gray = imageData.data[i] * 0.299 + imageData.data[i + 1] * 0.587 + imageData.data[i + 2] * 0.114;
    map[i / 4] = gray < threshold ? 1 : 0;
  }
  return map;
}

function findContentBounds(darkMap, width, height) {
  const xCounts = Array(width).fill(0);
  const yCounts = Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!darkMap[y * width + x]) continue;
      xCounts[x] += 1;
      yCounts[y] += 1;
    }
  }
  const xThreshold = Math.max(2, height * 0.004);
  const yThreshold = Math.max(2, width * 0.004);
  const left = firstIndexAbove(xCounts, xThreshold, 0) ?? 0;
  const right = lastIndexAbove(xCounts, xThreshold, width - 1) ?? width - 1;
  const top = firstIndexAbove(yCounts, yThreshold, 0) ?? 0;
  const bottom = lastIndexAbove(yCounts, yThreshold, height - 1) ?? height - 1;
  return padRect({ left, right, top, bottom }, 8, width, height);
}

function firstIndexAbove(values, threshold, fallback) {
  const index = values.findIndex((value) => value >= threshold);
  return index >= 0 ? index : fallback;
}

function lastIndexAbove(values, threshold, fallback) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] >= threshold) return i;
  }
  return fallback;
}

function findProjectionLines(darkMap, width, height, direction, bounds, ratio) {
  const length = direction === "horizontal" ? height : width;
  const span = direction === "horizontal" ? bounds.right - bounds.left + 1 : bounds.bottom - bounds.top + 1;
  const counts = Array(length).fill(0);
  if (direction === "horizontal") {
    for (let y = bounds.top; y <= bounds.bottom; y += 1) {
      for (let x = bounds.left; x <= bounds.right; x += 1) counts[y] += darkMap[y * width + x];
    }
  } else {
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      for (let y = bounds.top; y <= bounds.bottom; y += 1) counts[x] += darkMap[y * width + x];
    }
  }
  const threshold = Math.max(8, span * ratio);
  const lines = [];
  let start = null;
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] >= threshold && start === null) start = i;
    if ((counts[i] < threshold || i === counts.length - 1) && start !== null) {
      const end = counts[i] < threshold ? i - 1 : i;
      lines.push(Math.round((start + end) / 2));
      start = null;
    }
  }
  return mergeCloseNumbers(lines, 7);
}

function makeBandsFromLines(lines, min, max, minSize) {
  const guides = [min, ...lines.filter((line) => line > min + 3 && line < max - 3), max];
  const bands = [];
  for (let i = 0; i < guides.length - 1; i += 1) {
    const top = guides[i] + (i === 0 ? 0 : 2);
    const bottom = guides[i + 1] - (i === guides.length - 2 ? 0 : 2);
    if (bottom - top >= minSize) bands.push({ top, bottom });
  }
  if (bands.length >= 2) return bands;
  return splitEvenly(min, max, Math.max(2, Math.round((max - min) / 68))).map(([top, bottom]) => ({ top, bottom }));
}

function makeColumnBands(verticalLines, bounds) {
  const detected = makeBandsFromLines(verticalLines, bounds.left, bounds.right, 22)
    .filter((band) => band.bottom - band.top >= 22)
    .map((band) => ({ left: band.top, right: band.bottom }));
  if (detected.length >= 5) return chooseTargetColumns(detected, bounds);
  return splitEvenly(bounds.left, bounds.right, 5).map(([left, right]) => ({ left, right }));
}

function chooseTargetColumns(columns, bounds) {
  if (columns.length === 5) return columns;
  const widths = columns.map((column) => column.right - column.left);
  const medianWidth = [...widths].sort((a, b) => a - b)[Math.floor(widths.length / 2)] || 1;
  const candidates = columns.filter((column) => column.right - column.left >= medianWidth * 0.45);
  return candidates.length >= 5 ? candidates.slice(0, 5) : splitEvenly(bounds.left, bounds.right, 5).map(([left, right]) => ({ left, right }));
}

function dropHeaderLikeBand(rowBands, columnBands, darkMap, width) {
  if (rowBands.length <= 1) return rowBands;
  const [first, ...rest] = rowBands;
  const digitDensity = columnBands.reduce((total, column) => total + countDarkPixels(darkMap, width, {
    left: column.left,
    right: column.right,
    top: first.top,
    bottom: first.bottom
  }), 0) / Math.max(1, columnBands.reduce((total, column) => total + (column.right - column.left + 1) * (first.bottom - first.top + 1), 0));
  return digitDensity > 0.23 ? rowBands : rest;
}

function countDarkPixels(darkMap, width, rect) {
  let count = 0;
  for (let y = rect.top; y <= rect.bottom; y += 1) {
    for (let x = rect.left; x <= rect.right; x += 1) count += darkMap[y * width + x];
  }
  return count;
}

function splitEvenly(min, max, parts) {
  return Array.from({ length: parts }, (_, index) => {
    const start = Math.round(min + ((max - min) * index) / parts);
    const end = Math.round(min + ((max - min) * (index + 1)) / parts);
    return [start, end];
  });
}

function mergeCloseNumbers(numbers, gap) {
  return numbers.reduce((merged, value) => {
    const previous = merged.at(-1);
    if (previous !== undefined && value - previous <= gap) merged[merged.length - 1] = Math.round((previous + value) / 2);
    else merged.push(value);
    return merged;
  }, []);
}

function padRect(rect, padding, width, height) {
  return {
    left: Math.max(0, Math.min(width - 1, rect.left - padding)),
    right: Math.max(0, Math.min(width - 1, rect.right + padding)),
    top: Math.max(0, Math.min(height - 1, rect.top - padding)),
    bottom: Math.max(0, Math.min(height - 1, rect.bottom + padding))
  };
}

async function recognizeNumericCell(source, rect, label) {
  const cellCanvas = cropCellCanvas(source, rect);
  const result = await Tesseract.recognize(cellCanvas, "eng", {
    tessedit_pageseg_mode: "7",
    tessedit_char_whitelist: "0123456789",
    preserve_interword_spaces: "0",
    user_defined_dpi: "300",
    logger: (progress) => {
      if (progress.status === "recognizing text") updateUploadStatus(`表セルを数字専用OCRで読み取り中です（${label} ${Math.round(progress.progress * 100)}%）...`);
    }
  });
  const raw = normalizeOcrText(result.data.text);
  const digits = (raw.match(/\d+/g) || []).join("");
  return {
    value: digits ? numberValue(digits) : 0,
    text: digits,
    confidence: Math.max(0, Math.min(100, Math.round(result.data.confidence || 0)))
  };
}

async function recognizeUnitCell(source, rect, label) {
  const variants = createUnitCellOcrVariants(source, rect);
  const attempts = [];
  for (const variant of variants) {
    for (const pageSegMode of ["7", "8"]) {
      attempts.push({ variant, pageSegMode });
    }
  }

  const results = await Promise.all(attempts.map(async ({ variant, pageSegMode }) => {
    const result = await Tesseract.recognize(variant.source, "eng", {
      tessedit_pageseg_mode: pageSegMode,
      tessedit_char_whitelist: "0123456789",
      preserve_interword_spaces: "0",
      user_defined_dpi: "300",
      logger: (progress) => {
        if (progress.status === "recognizing text") {
          updateUploadStatus(`台番号セルを専用OCRで読み取り中です（${label} / ${variant.name} / PSM${pageSegMode} ${Math.round(progress.progress * 100)}%）...`);
        }
      }
    });
    const raw = normalizeOcrText(result.data.text);
    const digits = (raw.match(/\d+/g) || []).join("");
    const confidence = Math.max(0, Math.min(100, Math.round(result.data.confidence || 0)));
    return {
      value: digits ? numberValue(digits) : 0,
      text: digits,
      confidence,
      score: confidence + (digits ? 10 : -1000) + (digits.length === 3 ? 5 : 0)
    };
  }));

  return results.sort((a, b) => b.score - a.score)[0] || { value: 0, text: "", confidence: 0 };
}

function cropCellCanvas(source, rect) {
  const width = Math.max(1, rect.right - rect.left + 1);
  const height = Math.max(1, rect.bottom - rect.top + 1);
  const canvas = document.createElement("canvas");
  canvas.width = width + 18;
  canvas.height = height + 18;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, rect.left, rect.top, width, height, 9, 9, width, height);
  return enhanceCanvas(canvas, { contrast: 1.7, brightness: 8, threshold: 170, invert: false });
}

function createUnitCellOcrVariants(source, rect) {
  const base = cropUnitCellCanvas(source, rect);
  return [
    { name: "下線カット", source: enhanceCanvas(base, { contrast: 1.28, brightness: 8, threshold: null, invert: false }) },
    { name: "薄い二値化", source: enhanceCanvas(base, { contrast: 1.35, brightness: 10, threshold: 142, invert: false }) }
  ];
}

function cropUnitCellCanvas(source, rect) {
  const originalWidth = Math.max(1, rect.right - rect.left + 1);
  const originalHeight = Math.max(1, rect.bottom - rect.top + 1);
  const trimBottom = Math.round(originalHeight * 0.14);
  const height = Math.max(1, originalHeight - trimBottom);
  const canvas = document.createElement("canvas");
  canvas.width = originalWidth + 20;
  canvas.height = height + 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, rect.left, rect.top, originalWidth, height, 10, 8, originalWidth, height);
  return canvas;
}

function buildOcrRowFromCells(cells, rowIndex) {
  if (cells.length < 5) return null;
  const [unitCell, gamesCell, bbCell, rbCell, totalCell] = cells;
  const row = validateOcrTableRow({
    unit: unitCell.value,
    games: gamesCell.value,
    bb: bbCell.value,
    rb: rbCell.value,
    ocrTotal: totalCell.value,
    confidence: Math.round(cells.reduce((sum, cell) => sum + cell.confidence, 0) / cells.length),
    rowIndex
  });
  return row.excluded ? null : row;
}

function chooseClosestTotalDenominator(ocrTotal, calculatedTotal) {
  const text = String(Math.round(ocrTotal || 0));
  const candidates = [Number(text)];
  if (text.startsWith("1") && text.length >= 3) candidates.push(Number(text.slice(1)));
  return candidates
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => Math.abs(a - calculatedTotal) - Math.abs(b - calculatedTotal))[0] || 0;
}

function validateOcrTableRow(row) {
  const checks = [];
  const unit = Math.round(row.unit || 0);
  const games = Math.round(row.games || 0);
  const bb = Math.round(row.bb || 0);
  let rb = Math.round(row.rb || 0);
  const rbCorrection = correctRbFromOcrTotal({ games, bb, rb, ocrTotal: row.ocrTotal });
  if (rbCorrection) {
    rb = rbCorrection.corrected;
    checks.push("RB補正あり");
  }
  const calculatedTotal = games > 0 && bb + rb > 0 ? games / (bb + rb) : null;

  if (!games && !bb && !rb) return { excluded: true };
  if (bb > games || rb > games) return { excluded: true };
  if (!unit || unit > 9999) checks.push("台番要確認");
  if (!games || games > 200000) checks.push("累計G要確認");
  if (bb + rb <= 0) checks.push("BB/RB要確認");
  if (calculatedTotal && row.ocrTotal) {
    const denominator = chooseClosestTotalDenominator(row.ocrTotal, calculatedTotal);
    if (denominator && Math.abs(calculatedTotal - denominator) / calculatedTotal > 0.18) checks.push("合算差異");
  }
  if (row.confidence < 62) checks.push("低信頼度");

  return {
    unit: unit ? String(unit) : "",
    games,
    bb,
    rb,
    ocrConfidence: row.confidence,
    ocrStatus: checks.length ? `要確認: ${checks.join("・")}` : "OK",
    memo: [
      `表OCR 信頼度${row.confidence}% / 合算再計算${rateText(calculatedTotal)}${row.ocrTotal ? ` / OCR合算候補 ${row.ocrTotal}` : ""}`,
      rbCorrection ? `RB補正: ${rbCorrection.original}→${rbCorrection.corrected}` : ""
    ].filter(Boolean).join(" / ")
  };
}

function correctRbFromOcrTotal({ games, bb, rb, ocrTotal }) {
  if (!games || !bb || !ocrTotal) return null;
  const denominator = chooseClosestTotalDenominator(ocrTotal, games / Math.max(1, bb + rb));
  if (!denominator || denominator < 30 || denominator > 1000) return null;

  const estimatedTotalBonus = Math.round(games / denominator);
  const estimatedRb = estimatedTotalBonus - bb;
  if (estimatedTotalBonus <= 0 || estimatedRb < 0 || estimatedRb >= 1000) return null;

  const rbLooksTooLow = rb <= 1 && estimatedRb >= 3;
  const rbDiffersGreatly = Math.abs(rb - estimatedRb) >= Math.max(3, Math.round(estimatedTotalBonus * 0.35));
  if (!rbLooksTooLow && !rbDiffersGreatly) return null;
  if (Math.abs(games / Math.max(1, bb + estimatedRb) - denominator) / denominator > 0.08) return null;

  return { original: rb, corrected: estimatedRb, denominator };
}


async function recognizeBasicDataImage(file, imageNumber) {
  const variants = await createOcrImageVariants(file);
  const attempts = [
    { name: "表全体", lang: "jpn+eng", params: { tessedit_pageseg_mode: "6" } },
    { name: "散在文字", lang: "jpn+eng", params: { tessedit_pageseg_mode: "11" } },
    { name: "数字優先", lang: "eng", params: { tessedit_pageseg_mode: "6", tessedit_char_whitelist: "0123456789０１２３４５６７８９ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/.,:-+ 合算合成累計総台番番号確率ゲームG数BBRREG " } }
  ];
  const results = [];

  for (const [variantIndex, variant] of variants.entries()) {
    for (const attempt of attempts) {
      updateUploadStatus(`基本データ画像を読み取り中です（${imageNumber} / 補正${variantIndex + 1}/${variants.length} / ${attempt.name}）...`);
      const result = await Tesseract.recognize(variant.source, attempt.lang, {
        ...attempt.params,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
        logger: (progress) => {
          if (progress.status === "recognizing text") {
            updateUploadStatus(`基本データ画像を読み取り中です（${imageNumber} / 補正${variantIndex + 1}/${variants.length} / ${attempt.name} ${Math.round(progress.progress * 100)}%）...`);
          }
        }
      });
      results.push({
        text: result.data.text,
        confidence: result.data.confidence || 0,
        variant: variant.name,
        attempt: attempt.name
      });
    }
  }
  return results;
}

async function createOcrImageVariants(file) {
  const bitmap = await loadImageBitmap(file);
  const base = drawScaledImage(bitmap, { scale: 2.4 });
  const highContrast = enhanceCanvas(base, { contrast: 1.55, brightness: 10, threshold: null, invert: false });
  const binary = enhanceCanvas(base, { contrast: 1.75, brightness: 18, threshold: 165, invert: false });
  const sharpened = sharpenCanvas(highContrast);
  return [
    { name: "高コントラスト", source: highContrast },
    { name: "二値化", source: binary },
    { name: "輪郭強調", source: sharpened }
  ];
}

async function loadImageBitmap(file) {
  if (window.createImageBitmap) return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

function drawScaledImage(image, { scale }) {
  const canvas = document.createElement("canvas");
  const longest = Math.max(image.width, image.height);
  const targetScale = Math.min(Math.max(scale, 1), 3600 / longest);
  canvas.width = Math.round(image.width * targetScale);
  canvas.height = Math.round(image.height * targetScale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function enhanceCanvas(source, { contrast, brightness, threshold, invert }) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const gray = imageData.data[i] * 0.299 + imageData.data[i + 1] * 0.587 + imageData.data[i + 2] * 0.114;
    let value = (gray - 128) * contrast + 128 + brightness;
    value = Math.max(0, Math.min(255, value));
    if (threshold !== null) value = value >= threshold ? 255 : 0;
    if (invert) value = 255 - value;
    imageData.data[i] = value;
    imageData.data[i + 1] = value;
    imageData.data[i + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function sharpenCanvas(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const dst = ctx.createImageData(src);
  dst.data.set(src.data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const width = canvas.width;
  const height = canvas.height;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const weight = kernel[(ky + 1) * 3 + (kx + 1)];
            const offset = ((y + ky) * width + (x + kx)) * 4 + channel;
            value += src.data[offset] * weight;
          }
        }
        dst.data[(y * width + x) * 4 + channel] = Math.max(0, Math.min(255, value));
      }
      dst.data[(y * width + x) * 4 + 3] = src.data[(y * width + x) * 4 + 3];
    }
  }

  ctx.putImageData(dst, 0, 0);
  return canvas;
}

function parseBasicDataText(text) {
  const normalized = normalizeOcrText(text);
  const rows = [
    ...parseTableLikeOcrRows(normalized),
    ...parseLabelledOcrRows(normalized)
  ];
  return dedupeOcrRows(rows);
}

function normalizeOcrText(text) {
  return String(text || "")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[，、]/g, ",")
    .replace(/[／]/g, "/")
    .replace(/[：]/g, ":")
    .replace(/[|｜]/g, "1")
    .replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, "0")
    .replace(/[Il](?=\d)|(?<=\d)[Il]/g, "1")
    .replace(/BIG/gi, "BB")
    .replace(/REG/gi, "RB")
    .replace(/BAR/gi, "BB")
    .replace(/合成/g, "合算")
    .replace(/台\s*(?:No|NO|番号)/gi, "台番号");
}

function parseTableLikeOcrRows(text) {
  return text.split(/\n+/).flatMap((line) => {
    const cleaned = cleanOcrLine(line);
    if (!cleaned || /日付|店舗|機種|累計|台番.*BB|台番号.*BB|項目|合算.*BB/i.test(cleaned)) return [];

    const labelled = parseLabelledOcrLine(cleaned);
    if (labelled) return [labelled];

    const numbers = extractOcrNumbers(cleaned);
    if (numbers.length < 4) return [];

    const rows = [];
    for (let offset = 0; offset <= numbers.length - 4; offset += 1) {
      const [unit, games, bb, rb] = numbers.slice(offset, offset + 4);
      if (isLikelyUnitRow(unit, games, bb, rb)) {
        const total = extractRateText(cleaned);
        rows.push(toOcrRow(unit, games, bb, rb, total));
        break;
      }
    }
    return rows;
  });
}

function parseLabelledOcrRows(text) {
  const blocks = text.split(/\n{2,}|(?=台番号|台番|No\.?\s*\d)/i);
  return blocks.map(parseLabelledOcrLine).filter(Boolean);
}

function parseLabelledOcrLine(text) {
  const unit = readLabelNumber(text, ["台番号", "台番", "台No", "No"]);
  const games = readLabelNumber(text, ["累計ゲーム", "累計G", "総ゲーム", "ゲーム", "G数", "総G"]);
  const bb = readLabelNumber(text, ["BB", "B B", "BIG"]);
  const rb = readLabelNumber(text, ["RB", "R B", "REG"]);
  if (!isLikelyUnitRow(unit, games, bb, rb)) return null;
  const total = readLabelRate(text, ["合算確率", "合成確率", "合算", "総合確率"]);
  return toOcrRow(unit, games, bb, rb, total);
}

function cleanOcrLine(line) {
  return line
    .replace(/[, ](?=\d{3}(\D|$))/g, "")
    .replace(/[\t ]+/g, " ")
    .trim();
}

function extractOcrNumbers(text) {
  return (text.match(/[+-]?\d+(?:\.\d+)?/g) || [])
    .map((value) => numberValue(value.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
}

function toOcrRow(unit, games, bb, rb, total) {
  return {
    unit: String(Math.round(unit)),
    games: Math.round(games),
    bb: Math.round(bb),
    rb: Math.round(rb),
    ocrStatus: "要確認: 従来OCR",
    ocrConfidence: "",
    memo: total ? `OCR合算 ${total}` : "基本データ画像OCR"
  };
}

function dedupeOcrRows(rows) {
  const correctedRows = correctSequentialUnitNumbers(rows);
  const byKey = new Map();
  correctedRows.forEach((row) => {
    const key = `${row.unit}-${row.games}-${row.bb}-${row.rb}`;
    if (!byKey.has(key)) byKey.set(key, row);
  });
  return [...byKey.values()].sort((a, b) => Number(a.unit) - Number(b.unit));
}

function correctSequentialUnitNumbers(rows) {
  let previousCorrected = 0;
  let activeOffset = 0;

  rows.forEach((row, index) => {
    const original = String(row.unit || "");
    const current = numberValue(original);
    if (!Number.isFinite(current) || current <= 0) return;

    let corrected = current;
    if (previousCorrected) {
      const blockCandidate = getBlockUnitCorrectionCandidate(current, previousCorrected, activeOffset);
      if (blockCandidate) {
        corrected = blockCandidate.value;
        activeOffset = blockCandidate.offset;
        row.unit = String(corrected);
        addOcrCorrectionNotice(row, "台番号ブロック補正あり", `台番号ブロック補正: +${activeOffset} / ${original}→${corrected}`);
      } else {
        activeOffset = 0;
        const next = numberValue(rows[index + 1]?.unit);
        if (shouldTrySequentialUnitCorrection(original, previousCorrected, current, next)) {
          const singleCorrected = getUnitCorrectionCandidate(original, previousCorrected + 1);
          if (singleCorrected) {
            corrected = singleCorrected;
            row.unit = String(corrected);
            addOcrCorrectionNotice(row, "台番号補正あり", `台番号補正: ${original}→${corrected}`);
          }
        }
      }
    }

    previousCorrected = corrected;
  });
  return rows;
}

function getBlockUnitCorrectionCandidate(current, previousCorrected, activeOffset) {
  if (activeOffset) {
    const activeValue = current + activeOffset;
    if (isPlausibleNextUnit(activeValue, previousCorrected)) return { value: activeValue, offset: activeOffset };
  }
  if (current >= previousCorrected) return null;

  return [100, 200, 300, 400]
    .map((offset) => ({ value: current + offset, offset }))
    .filter((candidate) => isPlausibleNextUnit(candidate.value, previousCorrected))
    .sort((a, b) => (a.value - previousCorrected) - (b.value - previousCorrected))[0] || null;
}

function isPlausibleNextUnit(value, previousCorrected) {
  const diff = value - previousCorrected;
  return value > previousCorrected && diff > 0 && diff <= 80;
}

function shouldTrySequentialUnitCorrection(original, previous, current, next) {
  return /^\d{3}$/.test(original)
    && original.includes("2")
    && Number.isFinite(previous)
    && Number.isFinite(current)
    && Number.isFinite(next)
    && previous >= 100
    && previous <= 999
    && next >= 100
    && next <= 999
    && previous + 2 === next
    && current !== previous + 1;
}

function getUnitCorrectionCandidate(original, expected) {
  if (expected < 100 || expected > 999) return 0;
  for (let index = 0; index < original.length; index += 1) {
    if (original[index] !== "2") continue;
    const candidate = numberValue(`${original.slice(0, index)}5${original.slice(index + 1)}`);
    if (candidate === expected) return candidate;
  }
  return 0;
}

function addOcrCorrectionNotice(row, status, memo) {
  if (!row.ocrStatus || row.ocrStatus === "OK") row.ocrStatus = `要確認: ${status}`;
  else if (!row.ocrStatus.includes(status)) row.ocrStatus += row.ocrStatus.startsWith("要確認:") ? `・${status}` : ` / ${status}`;
  if (memo && !String(row.memo || "").includes(memo)) row.memo = [row.memo, memo].filter(Boolean).join(" / ");
}


function readLabelNumber(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[^0-9]{0,16}([+-]?\\d[\\d,]*)`, "i");
    const match = text.match(pattern);
    if (match) return numberValue(match[1].replace(/,/g, ""));
  }
  return 0;
}

function readLabelRate(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[^0-9/]{0,16}(1\\s*/\\s*\\d+(?:\\.\\d+)?)`, "i");
    const match = text.match(pattern);
    if (match) return match[1].replace(/\s+/g, "");
  }
  return extractRateText(text);
}

function extractRateText(text) {
  const match = text.match(/1\s*\/\s*\d+(?:\.\d+)?/);
  return match ? match[0].replace(/\s+/g, "") : "";
}

function isLikelyUnitRow(unit, games, bb, rb) {
  return Number.isFinite(unit) && Number.isFinite(games) && Number.isFinite(bb) && Number.isFinite(rb)
    && unit > 0 && unit < 10000 && games > 0 && games < 200000
    && bb >= 0 && bb < 1000 && rb >= 0 && rb < 1000 && games >= bb + rb;
}

function refreshDraftEvaluations() {
  [...$("#draftTable tbody").children].forEach((row) => updateDraftRow(row));
}

function shiftDraftUnitNumbers(offset) {
  const rows = [...$("#draftTable tbody").children];
  let changed = 0;
  rows.forEach((row) => {
    const input = $(".unit", row);
    const current = numberValue(input.value);
    if (!current) return;
    const next = current + offset;
    if (next <= 0) return;
    input.value = String(next);
    setOcrStatusCell($(".ocr-check", row), "要確認: 台番号一括補正", $(".ocr-check", row)?.dataset.confidence || "");
    appendDraftMemo(row, `台番号一括補正: ${formatSignedOffset(offset)} / ${current}→${next}`);
    updateDraftRow(row);
    changed += 1;
  });
  updateDraftHint();
  if (!changed) alert("補正できる台番号がありません。");
}

function appendDraftMemo(row, text) {
  const input = $(".row-memo", row);
  if (!input || input.value.includes(text)) return;
  input.value = [input.value.trim(), text].filter(Boolean).join(" / ");
}

function formatSignedOffset(offset) {
  return `${offset > 0 ? "+" : ""}${offset}`;
}

function addDraftRow(seed = {}) {
  const row = $("#draftRowTemplate").content.firstElementChild.cloneNode(true);
  $(".unit", row).value = seed.unit ?? "";
  $(".games", row).value = seed.games ?? "";
  $(".bb", row).value = seed.bb ?? "";
  $(".rb", row).value = seed.rb ?? "";
  $(".diff", row).value = seed.diff ?? "";
  setOcrStatusCell($(".ocr-check", row), seed.ocrStatus, seed.ocrConfidence);
  $(".row-memo", row).value = seed.memo ?? "";
  row.addEventListener("input", () => updateDraftRow(row));
  $(".remove-row", row).addEventListener("click", () => {
    row.remove();
    if (!$("#draftTable tbody").children.length) addDraftRow();
    updateDraftHint();
  });
  $("#draftTable tbody").appendChild(row);
  updateDraftRow(row);
  updateDraftHint();
}

function updateDraftRow(row) {
  const data = getDraftRowData(row);
  const rates = calculateRates(data.games, data.bb, data.rb);
  $(".bb-rate", row).textContent = rates.bbText;
  $(".rb-rate", row).textContent = rates.rbText;
  $(".total-rate", row).textContent = rates.totalText;
  const evaluation = evaluateRecord({ ...data, ...rates, machine: $("#machineInput").value.trim() });
  $(".rating-cell", row).innerHTML = ratingPill(evaluation.rating);
  if (!data.ocrStatus) setOcrStatusCell($(".ocr-check", row), "手動", "");
  row.dataset.evaluation = JSON.stringify(evaluation);
  updateDraftHint();
}

function getDraftRowData(row) {
  return {
    unit: $(".unit", row).value.trim(),
    games: numberValue($(".games", row).value),
    bb: numberValue($(".bb", row).value),
    rb: numberValue($(".rb", row).value),
    diff: numberValue($(".diff", row).value),
    memo: $(".row-memo", row).value.trim(),
    ocrStatus: $(".ocr-check", row)?.dataset.status || "",
    ocrConfidence: $(".ocr-check", row)?.dataset.confidence || ""
  };
}

function updateDraftHint() {
  const count = [...$("#draftTable tbody").children].filter((row) => !isDraftRowEmpty(row)).length;
  $("#draftHint").textContent = count ? `${count}台を編集中です。保存前に数値を確認してください。` : "台データを入力してください。";
}

function isDraftTableEmpty() {
  return [...$("#draftTable tbody").children].every((row) => isDraftRowEmpty(row));
}

function isDraftRowEmpty(row) {
  const data = getDraftRowData(row);
  return !(data.unit || data.games || data.bb || data.rb || data.diff || data.memo);
}

function saveDraftRows() {
  const date = $("#inputDate").value;
  const store = $("#storeInput").value.trim();
  const machine = $("#machineInput").value.trim();
  const sessionMemo = $("#sessionMemo").value.trim();

  if (!date || !store || !machine) {
    alert("日付、店舗、機種を入力してください。");
    return;
  }

  const rows = [...$("#draftTable tbody").children]
    .map((row) => ({ row, data: getDraftRowData(row) }))
    .filter(({ data }) => data.unit || data.games || data.bb || data.rb || data.diff);

  if (!rows.length) {
    alert("保存する台データを入力してください。");
    return;
  }

  saveStoreName(store);

  rows.forEach(({ row, data }) => {
    const rates = calculateRates(data.games, data.bb, data.rb);
    const evaluation = evaluateRecord({ ...data, ...rates, machine });
    state.records.push({
      id: uid("record"),
      date,
      store,
      machine,
      unit: data.unit,
      games: data.games,
      bb: data.bb,
      rb: data.rb,
      bbRate: rates.bb,
      rbRate: rates.rb,
      totalRate: rates.total,
      diff: data.diff,
      rating: evaluation.rating || "要確認",
      expectation: evaluation.expectation || 0,
      confidence: evaluation.confidence || "低",
      reason: evaluation.reason || "手動入力データです。",
      nearestSettings: evaluation.nearestSettings || "-",
      memo: [sessionMemo, data.ocrStatus && data.ocrStatus !== "手動" ? `OCR確認: ${data.ocrStatus}${data.ocrConfidence ? ` (${data.ocrConfidence}%)` : ""}` : "", data.memo].filter(Boolean).join(" / "),
      createdAt: new Date().toISOString()
    });
  });

  saveJson(STORAGE_KEYS.records, state.records);
  $("#draftTable tbody").innerHTML = "";
  addDraftRow();
  $("#sessionMemo").value = "";
  renderAll();
  alert(`${rows.length}台を保存しました。`);
}

function calculateRates(games, bb, rb) {
  const bbRate = games > 0 && bb > 0 ? games / bb : null;
  const rbRate = games > 0 && rb > 0 ? games / rb : null;
  const totalRate = games > 0 && bb + rb > 0 ? games / (bb + rb) : null;
  return {
    bb: bbRate,
    rb: rbRate,
    total: totalRate,
    bbText: rateText(bbRate),
    rbText: rateText(rbRate),
    totalText: rateText(totalRate)
  };
}

function rateText(value) {
  return value ? `1/${value.toFixed(1)}` : "-";
}

function setOcrStatusCell(cell, status, confidence) {
  const label = status || "手動";
  cell.dataset.status = label;
  cell.dataset.confidence = confidence || "";
  cell.innerHTML = ocrStatusBadge(label, confidence);
}

function ocrStatusBadge(status, confidence) {
  const label = status || "手動";
  const detail = confidence ? `${label} (${confidence}%)` : label;
  const className = label.startsWith("OK") ? "ocr-ok" : label.startsWith("手動") ? "ocr-manual" : "ocr-check-needed";
  return `<span class="ocr-badge ${className}">${escapeHtml(detail)}</span>`;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bindRecords() {
  ["filterDate", "filterStore", "filterMachine", "filterUnit", "filterRating", "filterPositive", "filterAOnly"].forEach((id) => {
    $(`#${id}`).addEventListener("input", renderRecords);
  });
  $("#recordsTable thead").addEventListener("click", (event) => {
    const key = event.target.dataset.sort;
    if (!key) return;
    state.sort.direction = state.sort.key === key && state.sort.direction === "asc" ? "desc" : "asc";
    state.sort.key = key;
    renderRecords();
  });
  $("#exportRecordsButton").addEventListener("click", () => exportCsv("slot-records.csv", recordsToCsv(state.records)));
  $("#importRecordsInput").addEventListener("change", (event) => importRecordsCsv(event.target.files[0]));
  $("#deleteAllRecordsButton").addEventListener("click", () => {
    if (!confirm("保存データをすべて削除しますか？")) return;
    state.records = [];
    saveJson(STORAGE_KEYS.records, state.records);
    renderAll();
  });
}

function getFilteredRecords() {
  const date = $("#filterDate").value;
  const store = $("#filterStore").value.trim();
  const machine = $("#filterMachine").value.trim();
  const unit = $("#filterUnit").value.trim();
  const rating = $("#filterRating").value;
  const positive = $("#filterPositive").checked;
  const aOnly = $("#filterAOnly").checked;

  return state.records.filter((record) => {
    if (date && record.date !== date) return false;
    if (store && !record.store.includes(store)) return false;
    if (machine && !record.machine.includes(machine)) return false;
    if (unit && !String(record.unit).includes(unit)) return false;
    if (rating && record.rating !== rating) return false;
    if (positive && record.diff <= 0) return false;
    if (aOnly && record.rating !== "A") return false;
    return true;
  }).sort((a, b) => compareBySort(a, b));
}

function compareBySort(a, b) {
  const key = state.sort.key;
  const dir = state.sort.direction === "asc" ? 1 : -1;
  const av = a[key] ?? "";
  const bv = b[key] ?? "";
  if (typeof av === "number" || typeof bv === "number") return (Number(av) - Number(bv)) * dir;
  return String(av).localeCompare(String(bv), "ja") * dir;
}

function renderRecords() {
  const tbody = $("#recordsTable tbody");
  tbody.innerHTML = "";
  getFilteredRecords().forEach((record) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(record.date)}</td>
      <td>${escapeHtml(record.store)}</td>
      <td>${escapeHtml(record.machine)}</td>
      <td>${escapeHtml(record.unit)}</td>
      <td>${record.games}</td>
      <td>${record.bb}/${record.rb}</td>
      <td>${rateText(record.totalRate)}</td>
      <td>${formatDiff(record.diff)}</td>
      <td>${ratingPill(record.rating)}</td>
      <td>${escapeHtml(record.reason || "")}</td>
      <td class="row-actions">
        <button class="secondary icon" data-edit="${record.id}" type="button">編</button>
        <button class="danger icon" data-delete="${record.id}" type="button">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.onclick = (event) => {
    const editId = event.target.dataset.edit;
    const deleteId = event.target.dataset.delete;
    if (editId) editRecord(editId);
    if (deleteId) deleteRecord(deleteId);
  };
}

function editRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  $(".tab-button[data-tab='input']").click();
  $("#inputDate").value = record.date;
  $("#storeInput").value = record.store;
  $("#machineInput").value = record.machine;
  $("#sessionMemo").value = record.memo || "";
  $("#draftTable tbody").innerHTML = "";
  addDraftRow(record);
  state.records = state.records.filter((item) => item.id !== id);
  saveJson(STORAGE_KEYS.records, state.records);
  renderAll();
}

function deleteRecord(id) {
  if (!confirm("このデータを削除しますか？")) return;
  state.records = state.records.filter((item) => item.id !== id);
  saveJson(STORAGE_KEYS.records, state.records);
  renderAll();
}

function bindSummary() {
  ["summaryGroup", "specialFrom", "specialTo", "specialDay", "specialWeekday", "specialDouble"].forEach((id) => {
    $(`#${id}`).addEventListener("input", renderSummary);
  });
}

function specialFilteredRecords() {
  const from = $("#specialFrom").value;
  const to = $("#specialTo").value;
  const day = Number($("#specialDay").value);
  const weekday = $("#specialWeekday").value;
  const double = $("#specialDouble").checked;
  return state.records.filter((record) => {
    const date = new Date(`${record.date}T00:00:00`);
    if (from && record.date < from) return false;
    if (to && record.date > to) return false;
    if (day && date.getDate() !== day) return false;
    if (weekday !== "" && date.getDay() !== Number(weekday)) return false;
    if (double && !isDoubleDay(date)) return false;
    return true;
  });
}

function isDoubleDay(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return month === day || [11, 22].includes(day);
}

function renderSummary() {
  const records = specialFilteredRecords();
  const groupKey = $("#summaryGroup").value;
  const groups = groupBy(records, (record) => record[groupKey] || "未入力");
  const cards = $("#summaryCards");
  cards.innerHTML = "";
  $("#specialSummary").textContent = buildSpecialSummaryText(records);

  Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, "ja")).forEach(([key, items]) => {
    const stats = calculateStats(items);
    const card = document.createElement("article");
    card.className = "summary-card";
    card.innerHTML = `
      <span>${escapeHtml(key)}</span>
      <strong>${stats.count}台</strong>
      <p class="muted">平均G ${stats.avgGames} / 合算 ${rateText(stats.avgTotalRate)} / REG ${rateText(stats.avgRbRate)}</p>
      <p class="muted">平均差枚 ${formatDiff(stats.avgDiff)} / プラス ${stats.positiveRate}% / A ${stats.aCount}台 / B ${stats.bCount}台 / C ${stats.cCount}台</p>
    `;
    cards.appendChild(card);
  });

  const ranking = records
    .slice()
    .sort((a, b) => recommendationScore(b) - recommendationScore(a))
    .slice(0, 10);
  renderRanking($("#summaryRanking"), ranking.map((record, index) => ({
    title: `${index + 1}位：${record.unit}番 ${record.machine}`,
    rating: record.rating,
    body: `${record.store} / ${record.date} / ${rateText(record.totalRate)} / REG ${rateText(record.rbRate)} / ${formatDiff(record.diff)}。${record.reason || ""}`
  })));
}

function buildSpecialSummaryText(records) {
  const stats = calculateStats(records);
  const conditions = [];
  const day = $("#specialDay").value;
  if (day) conditions.push(`毎月${day}日`);
  if ($("#specialDouble").checked) conditions.push("ゾロ目日");
  const weekday = $("#specialWeekday");
  if (weekday.value !== "") conditions.push(`${weekday.options[weekday.selectedIndex].text}曜日`);
  return `検索条件：${conditions.join("・") || "全データ"} / 対象件数：${stats.count}件 / A評価：${stats.aCount}件 / 平均合算：${rateText(stats.avgTotalRate)} / 平均REG：${rateText(stats.avgRbRate)} / プラス台割合：${stats.positiveRate}%`;
}

function calculateStats(records) {
  const count = records.length;
  const average = (values) => {
    const usable = values.filter((value) => Number.isFinite(value) && value > 0);
    return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
  };
  const plus = records.filter((record) => record.diff > 0).length;
  return {
    count,
    avgGames: count ? Math.round(records.reduce((sum, record) => sum + Number(record.games || 0), 0) / count) : 0,
    avgBbRate: average(records.map((record) => record.bbRate)),
    avgRbRate: average(records.map((record) => record.rbRate)),
    avgTotalRate: average(records.map((record) => record.totalRate)),
    avgDiff: count ? Math.round(records.reduce((sum, record) => sum + Number(record.diff || 0), 0) / count) : 0,
    positiveRate: count ? Math.round((plus / count) * 100) : 0,
    aCount: records.filter((record) => record.rating === "A").length,
    bCount: records.filter((record) => record.rating === "B").length,
    cCount: records.filter((record) => record.rating === "C").length
  };
}

function bindRecommendations() {
  $("#makeRecommendButton").addEventListener("click", renderRecommendations);
}

function renderRecommendations() {
  const targetDate = $("#recommendDate").value;
  const store = $("#recommendStore").value.trim();
  const machine = $("#recommendMachine").value.trim();
  const target = new Date(`${targetDate}T00:00:00`);
  const day = target.getDate();
  const weekday = target.getDay();
  const double = isDoubleDay(target);

  const base = state.records.filter((record) => {
    if (store && record.store !== store) return false;
    if (machine && record.machine !== machine) return false;
    return true;
  });

  const byUnit = groupBy(base, (record) => `${record.store}__${record.machine}__${record.unit}`);
  const candidates = Object.values(byUnit).map((items) => {
    const latest = items.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    let score = 0;
    const reasons = [];
    const sameDay = items.filter((record) => new Date(`${record.date}T00:00:00`).getDate() === day);
    const sameWeekday = items.filter((record) => new Date(`${record.date}T00:00:00`).getDay() === weekday);
    const sameDouble = double ? items.filter((record) => isDoubleDay(new Date(`${record.date}T00:00:00`))) : [];
    const aCount = items.filter((record) => record.rating === "A").length;
    const strongReg = items.filter((record) => record.rbRate && record.rbRate <= 300 && record.games >= 3000).length;
    const recent = items.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    const recentDip = recent.some((record) => record.diff < -1000);

    score += sameDay.length * 10 + sameWeekday.length * 4 + sameDouble.length * 8 + aCount * 12 + strongReg * 8;
    if (recentDip) score += 9;
    if (latest.rating === "A") score += 6;
    if (latest.diff < -1000) score += 5;

    if (sameDay.length) reasons.push(`同じ${day}日の履歴が${sameDay.length}件`);
    if (double && sameDouble.length) reasons.push(`ゾロ目日の履歴あり`);
    if (aCount) reasons.push(`A評価が${aCount}回`);
    if (strongReg) reasons.push(`高回転でREGが強い履歴あり`);
    if (recentDip) reasons.push(`直近で凹み後の候補`);

    return {
      title: `${latest.unit}番 ${latest.machine}`,
      rating: score >= 45 ? "A" : score >= 24 ? "B" : "C",
      body: `${latest.store}。${reasons.join("、") || "履歴は少なめです"}。注意点：過去データに基づく候補で、設定を断定するものではありません。`,
      score
    };
  }).sort((a, b) => b.score - a.score).slice(0, 10);

  renderRanking($("#recommendList"), candidates.length ? candidates : [{
    title: "候補なし",
    rating: "要確認",
    body: "条件に合う保存データがありません。まずは台データを保存してください。"
  }]);
}

function bindMasters() {
  $("#masterForm").addEventListener("submit", saveMaster);
  $("#resetMasterForm").addEventListener("click", resetMasterForm);
  $("#exportMastersButton").addEventListener("click", () => exportCsv("slot-machine-masters.csv", mastersToCsv(state.masters)));
  $("#importMastersInput").addEventListener("change", (event) => importMastersCsv(event.target.files[0]));
}

function buildSettingsForm() {
  const grid = $("#settingsGrid");
  for (let setting = 1; setting <= 6; setting += 1) {
    const card = document.createElement("div");
    card.className = "setting-card";
    card.innerHTML = `
      <h3>設定${setting}</h3>
      <div class="mini-grid">
        <label>BIG確率<input data-setting="${setting}" data-field="big" placeholder="例 240"></label>
        <label>REG確率<input data-setting="${setting}" data-field="reg" placeholder="例 300"></label>
        <label>合算確率<input data-setting="${setting}" data-field="total" placeholder="例 135"></label>
        <label>機械割<input data-setting="${setting}" data-field="payout" placeholder="例 105.5"></label>
      </div>
    `;
    grid.appendChild(card);
  }
}

function saveMaster(event) {
  event.preventDefault();
  const id = $("#masterId").value || uid("master");
  const name = $("#masterName").value.trim();
  if (!name) {
    alert("機種名を入力してください。");
    return;
  }

  const settings = {};
  $$("[data-setting]").forEach((input) => {
    settings[input.dataset.setting] ??= {};
    settings[input.dataset.setting][input.dataset.field] = numberValue(input.value);
  });

  const master = { id, name, settings, note: $("#masterNote").value.trim() };
  const index = state.masters.findIndex((item) => item.id === id);
  if (index >= 0) state.masters[index] = master;
  else state.masters.push(master);

  saveJson(STORAGE_KEYS.masters, state.masters);
  resetMasterForm();
  renderAll();
}

function resetMasterForm() {
  $("#masterId").value = "";
  $("#masterName").value = "";
  $("#masterNote").value = "";
  $$("[data-setting]").forEach((input) => input.value = "");
}

function renderMasters() {
  const tbody = $("#mastersTable tbody");
  tbody.innerHTML = "";
  state.masters.forEach((master) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(master.name)}</td>
      ${[1, 2, 3, 4, 5, 6].map((setting) => {
        const data = master.settings?.[setting] || {};
        return `<td>BIG 1/${data.big || "-"}<br>REG 1/${data.reg || "-"}<br>合算 1/${data.total || "-"}<br>${data.payout || "-"}%</td>`;
      }).join("")}
      <td>
        <button class="secondary icon" data-master-edit="${master.id}" type="button">編</button>
        <button class="danger icon" data-master-delete="${master.id}" type="button">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.onclick = (event) => {
    const editId = event.target.dataset.masterEdit;
    const deleteId = event.target.dataset.masterDelete;
    if (editId) loadMasterToForm(editId);
    if (deleteId) deleteMaster(deleteId);
  };
}

function loadMasterToForm(id) {
  const master = state.masters.find((item) => item.id === id);
  if (!master) return;
  $("#masterId").value = master.id;
  $("#masterName").value = master.name;
  $("#masterNote").value = master.note || "";
  $$("[data-setting]").forEach((input) => {
    input.value = master.settings?.[input.dataset.setting]?.[input.dataset.field] || "";
  });
}

function deleteMaster(id) {
  if (!confirm("この機種マスターを削除しますか？")) return;
  state.masters = state.masters.filter((item) => item.id !== id);
  saveJson(STORAGE_KEYS.masters, state.masters);
  renderAll();
}

function evaluateRecord(record) {
  if (!record.games || record.games < 1000) {
    return {
      rating: "要確認",
      expectation: 20,
      confidence: "低",
      reason: "回転数が少ないため参考評価です。",
      nearestSettings: "-"
    };
  }

  const master = state.masters.find((item) => item.name === record.machine);
  const confidence = record.games >= 6000 ? "高" : record.games >= 3000 ? "中" : "低";
  let score = record.games >= 6000 ? 18 : record.games >= 3000 ? 10 : 2;
  let nearestSettings = "-";
  let reason = "";

  if (master) {
    const comparisons = [1, 2, 3, 4, 5, 6].map((setting) => {
      const data = master.settings?.[setting] || {};
      const regDiff = diffScore(record.rbRate, data.reg);
      const totalDiff = diffScore(record.totalRate, data.total);
      const bigDiff = diffScore(record.bbRate, data.big);
      return { setting, distance: regDiff * 0.5 + totalDiff * 0.35 + bigDiff * 0.15 };
    }).filter((item) => Number.isFinite(item.distance)).sort((a, b) => a.distance - b.distance);

    nearestSettings = comparisons.slice(0, 2).map((item) => `設定${item.setting}`).join("〜") || "-";
    const best = comparisons[0]?.setting || 1;
    score += best * 8;
    if (record.rbRate && master.settings?.[5]?.reg && record.rbRate <= master.settings[5].reg) score += 22;
    if (record.totalRate && master.settings?.[5]?.total && record.totalRate <= master.settings[5].total) score += 16;
    if (record.bbRate && master.settings?.[4]?.big && record.bbRate <= master.settings[4].big) score += 5;
    reason = makeEvaluationReason(record, best, nearestSettings, master);
  } else {
    if (record.rbRate && record.rbRate <= 300) score += 22;
    if (record.totalRate && record.totalRate <= 145) score += 14;
    if (record.bbRate && record.bbRate <= 260) score += 4;
    reason = "機種マスター未登録のため、一般的なREG・合算の強さで仮評価しています。";
  }

  if (record.diff > 1000) score += 4;
  if (record.diff < -1000 && record.rbRate && record.rbRate <= 320) score += 6;
  if (record.games < 3000) score -= 18;
  if (record.rbRate && record.rbRate > 420 && record.games >= 3000) score -= 20;

  return {
    rating: score >= 72 ? "A" : score >= 44 ? "B" : "C",
    expectation: Math.max(0, Math.min(99, Math.round(score))),
    confidence,
    reason,
    nearestSettings
  };
}

function diffScore(actual, target) {
  if (!actual || !target) return Number.POSITIVE_INFINITY;
  return Math.abs(actual - target) / target;
}

function makeEvaluationReason(record, best, nearestSettings, master) {
  if (record.games >= 6000 && best >= 5) return `累計ゲーム数が6000G以上あり、REG・合算が${nearestSettings}近似のため高評価です。`;
  if (record.games < 3000) return `数値は見られますが回転数が少ないため参考評価です。近い候補は${nearestSettings}です。`;
  if (record.totalRate && record.rbRate && master.settings?.[4]?.total && record.totalRate <= master.settings[4].total && record.rbRate > (master.settings?.[4]?.reg || 0)) {
    return "合算は良い一方でREGがやや弱く、差枚の上振れも考慮が必要です。";
  }
  if (record.diff < 0 && best >= 4) return `差枚はマイナスですが、REG・合算は${nearestSettings}近似のため候補に残せます。`;
  return `REGを重視して比較し、近い設定候補は${nearestSettings}です。`;
}

function recommendationScore(record) {
  return (record.rating === "A" ? 80 : record.rating === "B" ? 50 : record.rating === "C" ? 20 : 5)
    + Number(record.expectation || 0)
    + (record.games >= 5000 ? 15 : 0)
    + (record.rbRate && record.rbRate <= 300 ? 18 : 0)
    + (record.diff > 0 ? 5 : 0);
}

function renderAll() {
  renderOptions();
  renderRecords();
  renderSummary();
  renderMasters();
  $("#storageStatus").textContent = `保存 ${state.records.length}件`;
}

function renderOptions() {
  const stores = unique(state.stores);
  const machines = unique([...state.records.map((record) => record.machine), ...state.masters.map((master) => master.name)]);
  $("#storeList").innerHTML = stores.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  $("#storeSelect").innerHTML = `<option value="">店舗を選択</option>${stores.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  $("#machineList").innerHTML = machines.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function renderRanking(target, items) {
  target.innerHTML = "";
  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "rank-item";
    article.innerHTML = `
      <div class="rank-title">
        <strong>${escapeHtml(item.title)}</strong>
        ${ratingPill(item.rating)}
      </div>
      <p>${escapeHtml(item.body)}</p>
    `;
    target.appendChild(article);
  });
}

function ratingPill(rating) {
  const normalized = rating === "A" || rating === "B" || rating === "C" ? rating : "check";
  return `<span class="rating-pill rating-${normalized}">${escapeHtml(rating || "要確認")}</span>`;
}

function formatDiff(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${Math.round(number).toLocaleString()}枚`;
}

function groupBy(items, fn) {
  return items.reduce((groups, item) => {
    const key = fn(item);
    groups[key] ??= [];
    groups[key].push(item);
    return groups;
  }, {});
}

function unique(items) {
  return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function recordsToCsv(records) {
  const headers = ["日付", "店舗名", "機種名", "台番号", "累計ゲーム数", "BB回数", "RB回数", "BB確率", "RB確率", "合算確率", "推定差枚", "評価", "高設定期待度", "信頼度", "評価理由", "近い設定候補", "メモ", "登録日時"];
  const rows = records.map((record) => [
    record.date, record.store, record.machine, record.unit, record.games, record.bb, record.rb,
    record.bbRate, record.rbRate, record.totalRate, record.diff, record.rating, record.expectation,
    record.confidence, record.reason, record.nearestSettings, record.memo, record.createdAt
  ]);
  return toCsv([headers, ...rows]);
}

function mastersToCsv(masters) {
  const headers = ["機種名"];
  for (let setting = 1; setting <= 6; setting += 1) {
    headers.push(`設定${setting}BIG確率`, `設定${setting}REG確率`, `設定${setting}合算確率`, `設定${setting}機械割`);
  }
  headers.push("備考");
  const rows = masters.map((master) => {
    const row = [master.name];
    for (let setting = 1; setting <= 6; setting += 1) {
      const data = master.settings?.[setting] || {};
      row.push(data.big || "", data.reg || "", data.total || "", data.payout || "");
    }
    row.push(master.note || "");
    return row;
  });
  return toCsv([headers, ...rows]);
}

function toCsv(rows) {
  return rows.map((row) => row.map((cell) => {
    const text = String(cell ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\n");
}

function exportCsv(filename, csv) {
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function importRecordsCsv(file) {
  if (!file) return;
  file.text().then((text) => {
    const [, ...rows] = parseCsv(text.replace(/^\ufeff/, ""));
    rows.forEach((row) => {
      const record = {
        id: uid("record"),
        date: row[0] || "",
        store: row[1] || "",
        machine: row[2] || "",
        unit: row[3] || "",
        games: numberValue(row[4]),
        bb: numberValue(row[5]),
        rb: numberValue(row[6]),
        bbRate: numberValue(row[7]) || null,
        rbRate: numberValue(row[8]) || null,
        totalRate: numberValue(row[9]) || null,
        diff: numberValue(row[10]),
        rating: row[11] || "要確認",
        expectation: numberValue(row[12]),
        confidence: row[13] || "低",
        reason: row[14] || "",
        nearestSettings: row[15] || "-",
        memo: row[16] || "",
        createdAt: row[17] || new Date().toISOString()
      };
      state.records.push(record);
    });
    saveJson(STORAGE_KEYS.records, state.records);
    renderAll();
  });
}

function importMastersCsv(file) {
  if (!file) return;
  file.text().then((text) => {
    const [, ...rows] = parseCsv(text.replace(/^\ufeff/, ""));
    rows.forEach((row) => {
      const settings = {};
      let cursor = 1;
      for (let setting = 1; setting <= 6; setting += 1) {
        settings[setting] = {
          big: numberValue(row[cursor++]),
          reg: numberValue(row[cursor++]),
          total: numberValue(row[cursor++]),
          payout: numberValue(row[cursor++])
        };
      }
      state.masters.push({
        id: uid("master"),
        name: row[0] || "",
        settings,
        note: row[cursor] || ""
      });
    });
    saveJson(STORAGE_KEYS.masters, state.masters);
    renderAll();
  });
}
