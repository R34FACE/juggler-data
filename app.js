const STORAGE_KEYS = {
  records: "slotRecords.v1",
  masters: "slotMachineMasters.v1",
  stores: "slotStores.v1",
  memoTags: "slotMemoTags.v1"
};

const INITIAL_MEMO_TAGS = [
  "ゾロ目",
  "ジャグラー景品",
  "旧イベ",
  "新台入替",
  "週末",
  "月末",
  "LINE示唆",
  "全体強め",
  "ジャグラー寄せ",
  "据え置きっぽい",
  "上げ狙い"
];

const state = {
  records: loadJson(STORAGE_KEYS.records, []),
  masters: loadJson(STORAGE_KEYS.masters, []),
  stores: loadJson(STORAGE_KEYS.stores, []),
  memoTags: loadMemoTags(),
  sort: { key: "date", direction: "desc" },
  analysisSelection: null,
  ocrPreview: { files: [], settings: [], currentIndex: 0, image: null, mode: "tableOnly" },
  editingRecordId: null,
  recordsScopeIds: null,
  suppressRecordFilterClear: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", () => {
  initializeDates();
  buildSettingsForm();
  bindTabs();
  bindDraftTable();
  bindStores();
  bindMemoTags();
  bindImageUploads();
  bindRecords();
  bindSummary();
  bindAnalysis();
  bindRecommendations();
  bindMasters();
  refreshRecordEvaluations();
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

function loadMemoTags() {
  const savedRaw = localStorage.getItem(STORAGE_KEYS.memoTags);
  if (savedRaw === null) {
    saveJson(STORAGE_KEYS.memoTags, INITIAL_MEMO_TAGS);
    return INITIAL_MEMO_TAGS.slice();
  }
  return normalizeMemoTags(loadJson(STORAGE_KEYS.memoTags, INITIAL_MEMO_TAGS));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initializeDates() {
  const today = new Date().toISOString().slice(0, 10);
  $("#inputDate").value = today;
  $("#recommendDate").value = today;
  if ($("#analysisTo")) $("#analysisTo").value = today;
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
  $("#machineInput").addEventListener("input", () => {
    syncMachineSelectToInput();
    refreshDraftEvaluations();
  });
  $("#machineSelect").addEventListener("change", () => {
    const value = $("#machineSelect").value;
    if (!value) return;
    $("#machineInput").value = value;
    refreshDraftEvaluations();
  });
  $("#clearDraftButton").addEventListener("click", () => {
    $("#draftTable tbody").innerHTML = "";
    addDraftRow();
    updateDraftHint();
  });
  $("#saveDraftButton").addEventListener("click", saveDraftRows);
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

function bindMemoTags() {
  $("#saveMemoTagButton").addEventListener("click", () => {
    const tag = $("#memoTagInput").value.trim();
    if (!tag) {
      alert("保存するメモタグを入力してください。");
      return;
    }
    saveMemoTag(tag);
    $("#memoTagInput").value = "";
    $("#memoTagSelect").value = tag;
  });

  $("#addMemoTagButton").addEventListener("click", () => {
    const tags = getSelectedMemoTags("#memoTagSelect");
    if (!tags.length) {
      alert("メモに追加するタグを選択してください。");
      return;
    }
    addTagsToSessionMemo(tags);
  });

  $("#deleteMemoTagButton").addEventListener("click", () => {
    const tags = getSelectedMemoTags("#memoTagSelect");
    if (!tags.length) {
      alert("削除するメモタグを選択してください。");
      return;
    }
    if (!confirm(`メモタグ「${tags.join("、")}」を削除しますか？保存済みデータは削除されません。`)) return;
    state.memoTags = state.memoTags.filter((tag) => !tags.includes(tag));
    saveJson(STORAGE_KEYS.memoTags, state.memoTags);
    renderOptions();
  });
}

function saveMemoTag(tag) {
  const trimmed = String(tag || "").trim();
  if (!trimmed) return;
  state.memoTags = normalizeMemoTags([...state.memoTags, trimmed]);
  saveJson(STORAGE_KEYS.memoTags, state.memoTags);
  renderOptions();
}

function normalizeMemoTags(tags) {
  return unique((Array.isArray(tags) ? tags : []).map((tag) => String(tag || "").trim()));
}

function getSelectedMemoTags(selector) {
  const select = $(selector);
  if (!select) return [];
  return [...select.selectedOptions].map((option) => option.value).filter(Boolean);
}

function addTagsToSessionMemo(tags) {
  const memoInput = $("#sessionMemo");
  const currentParts = splitMemoParts(memoInput.value);
  const additions = tags.filter((tag) => !currentParts.includes(tag));
  memoInput.value = [...currentParts, ...additions].join(" / ");
}

function splitMemoParts(memo) {
  return String(memo || "")
    .split(/\s*\/\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function recordHasMemoTag(record, tag) {
  return !tag || String(record.memo || "").includes(tag);
}

function recordHasAllMemoTags(record, tags) {
  return tags.every((tag) => recordHasMemoTag(record, tag));
}

function bindImageUploads() {
  $("#basicImage").addEventListener("change", handleBasicImagesSelected);
  $("#graphImage").addEventListener("change", () => updateUploadStatus());
  $("#readBasicImagesButton").addEventListener("click", readBasicImages);
  $("#readGraphImagesButton").addEventListener("click", readGraphImages);
  $("#ocrPreviewFileSelect").addEventListener("change", (event) => selectOcrPreviewImage(Number(event.target.value)));
  ["ocrTop", "ocrBottom", "ocrLeft", "ocrRight", "ocrRowCount"].forEach((id) => {
    $(`#${id}`).addEventListener("input", () => {
      saveCurrentOcrSettingsFromControls();
      renderOcrPreview();
    });
  });
  $$('input[name="ocrMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.ocrPreview.mode = getSelectedOcrMode();
      updateOcrModeControls();
      renderOcrPreview();
    });
  });
  updateOcrModeControls();
  updateUploadStatus();
}

function getSelectedOcrMode() {
  return $('input[name="ocrMode"]:checked')?.value === "tableOnly" ? "tableOnly" : "range";
}

function updateOcrModeControls() {
  const mode = getSelectedOcrMode();
  state.ocrPreview.mode = mode;
  const isTableOnly = mode === "tableOnly";
  document.body.classList.toggle("ocr-table-only-mode", isTableOnly);
  document.body.classList.toggle("ocr-range-mode", !isTableOnly);
  $$(".manual-ocr-controls").forEach((element) => {
    element.hidden = isTableOnly;
  });
  $$(".table-only-hint").forEach((element) => {
    element.hidden = !isTableOnly;
  });
  if ($("#ocrModeHelp")) {
    $("#ocrModeHelp").textContent = isTableOnly
      ? "表だけ画像モードでは、画像全体を自動解析して5列固定でOCRします。範囲指定や行数入力は使いません。"
      : "通常モードでは画像ごとに範囲と行数を変更できます。プレビューの緑枠内を5列×指定行数に固定分割して数字専用OCRします。";
  }
}

function selectOcrMode(mode) {
  const normalizedMode = mode === "range" ? "range" : "tableOnly";
  const input = $(`input[name="ocrMode"][value="${normalizedMode}"]`);
  if (input) input.checked = true;
  state.ocrPreview.mode = normalizedMode;
  updateOcrModeControls();
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
  if (files.length) selectOcrMode("tableOnly");
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
  if (getSelectedOcrMode() === "tableOnly") return;

  const rect = settingsToCanvasRect(settings, canvas.width, canvas.height);
  ctx.save();
  ctx.fillStyle = tableOnly ? "rgba(53, 111, 197, 0.10)" : "rgba(34, 125, 104, 0.12)";
  ctx.strokeStyle = tableOnly ? "#356fc5" : "#1b8f72";
  ctx.lineWidth = 2;
  ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
  ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
  ctx.strokeStyle = tableOnly ? "rgba(53, 111, 197, 0.62)" : "rgba(27, 143, 114, 0.72)";
  ctx.lineWidth = 1;
  for (let col = 1; col < 5; col += 1) {
    const x = rect.left + (rect.width * col) / 5;
    ctx.beginPath();
    ctx.moveTo(x, rect.top);
    ctx.lineTo(x, rect.top + rect.height);
    ctx.stroke();
  }
  for (let row = 1; row < previewRows; row += 1) {
    const y = rect.top + (rect.height * row) / previewRows;
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
  const mode = getSelectedOcrMode();
  const tableOnlyMode = mode === "tableOnly";
  let added = 0;
  try {
    if (!tableOnlyMode) saveCurrentOcrSettingsFromControls();
    updateUploadStatus(tableOnlyMode ? "表だけ画像を自動OCR読み取り中です..." : "指定した表範囲をOCR読み取り中です...");
    for (const [index, file] of files.entries()) {
      const imageNumber = `${index + 1}/${files.length}枚目`;
      let rows = [];
      if (tableOnlyMode) {
        updateUploadStatus(`画像全体から行・列を自動検出中です（${imageNumber}）...`);
        rows = await recognizeBasicDataTableOnlyImage(file, imageNumber);
      } else {
        const settings = getOcrRangeSettings(index);
        updateUploadStatus(`指定範囲を5列×${settings.rows}行に分割中です（${imageNumber}）...`);
        rows = await recognizeBasicDataTableImage(file, imageNumber, settings);
        if (!rows.length) {
          updateUploadStatus(`表分割で抽出できなかったため、従来OCRへ切り替えます（${imageNumber}）...`);
          const ocrResults = await recognizeBasicDataImage(file, imageNumber);
          rows = parseBasicDataText(ocrResults.map((result) => result.text).join("\n"));
        }
      }
      if (rows.length && added === 0 && isDraftTableEmpty()) $("#draftTable tbody").innerHTML = "";
      rows.forEach((row) => addDraftRow(row));
      added += rows.length;
    }
    if (added) {
      if (tableOnlyMode) {
        const fewRowsMessage = added < 3 ? " 抽出件数が少ないため範囲指定モードも試してください。" : "";
        updateUploadStatus(`表だけ画像モードで${added}台を読み取りました。合算は保存時にBB+RBから再計算します。${fewRowsMessage}要確認の行は保存前に修正してください。`);
      } else {
        updateUploadStatus(`${files.length}枚の基本データ画像から${added}台を表へ入力しました。指定範囲を5列固定で読み取り、合算はBB+RBから再計算しています。要確認の行は保存前に修正してください。`);
      }
    } else if (tableOnlyMode) {
      updateUploadStatus("表だけ画像として読み取りましたが、抽出件数が少ないため範囲指定モードも試してください。手動入力も利用できます。");
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


async function readGraphImages() {
  const files = [...$("#graphImage").files];
  if (!files.length) {
    alert("読み取るグラフ画像を選択してください。");
    return;
  }
  if (!window.Tesseract) {
    alert("OCRライブラリを読み込めませんでした。ネットワーク接続後に再読み込みしてください。");
    return;
  }

  const button = $("#readGraphImagesButton");
  button.disabled = true;
  const allResults = [];
  try {
    updateUploadStatus("グラフ領域を検出中です...");
    for (const [index, file] of files.entries()) {
      const imageNumber = `${index + 1}/${files.length}枚目`;
      const results = await recognizeGraphDiffImage(file, imageNumber);
      allResults.push(...results);
    }
    applyGraphResultsToDraftRows(allResults);
    renderGraphResults(allResults);
    const reflected = allResults.filter((result) => result.applied).length;
    const needsReview = allResults.filter((result) => !isUsableGraphDiffResult(result)).length;
    updateUploadStatus(`${allResults.length}件中${reflected}件を反映、${needsReview}件は要確認です。要確認台は手入力してください。`);
  } catch (error) {
    console.error(error);
    updateUploadStatus("グラフ差枚の読み取り中にエラーが発生しました。画像を確認して再実行してください。");
  } finally {
    button.disabled = false;
  }
}

async function recognizeGraphDiffImage(file, imageNumber) {
  updateUploadStatus(`黒いグラフ領域を検出中です（${imageNumber}）...`);
  const bitmap = await loadImageBitmap(file);
  const source = drawScaledImage(bitmap, { scale: 1.8 });
  const regions = detectGraphRegions(source);
  const results = [];

  for (const [index, region] of regions.entries()) {
    const label = `${imageNumber} グラフ${index + 1}/${regions.length}`;
    let unitResult = { unit: "", confidence: 0, text: "" };
    try {
      updateUploadStatus(`台番号をOCR中です（${label}）...`);
      unitResult = await recognizeGraphUnitNumber(source, region, label);
      updateUploadStatus(`黄色ライン終点から差枚を推定中です（${label}）...`);
      const diffResult = analyzeGraphDiff(source, region);
      results.push({
        ...diffResult,
        unit: unitResult.unit,
        unitConfidence: unitResult.confidence,
        unitText: unitResult.text,
        region,
        imageNumber,
        graphIndex: index + 1,
        sourceCanvas: source,
        applied: false,
        skipped: false
      });
    } catch (error) {
      console.error(`グラフ読み取りエラー（${label}）:`, error?.message || error, error);
      results.push(createGraphReadErrorResult({
        unitResult,
        region,
        imageNumber,
        graphIndex: index + 1,
        sourceCanvas: source
      }));
    }
  }
  return results;
}

function createGraphReadErrorResult({ unitResult, region, imageNumber, graphIndex, sourceCanvas }) {
  return {
    diff: null,
    zeroLineY: null,
    endpoint: null,
    endpointSide: null,
    yellowCount: 0,
    yellowTextBlocks: [],
    yellowComponents: [],
    lineComponents: [],
    adoptedLineComponent: null,
    adoptedLineSegment: null,
    warnings: ["読み取りエラー"],
    status: "要確認: グラフ読み取りエラー",
    unit: unitResult?.unit || "",
    unitConfidence: unitResult?.confidence || 0,
    unitText: unitResult?.text || "",
    region,
    imageNumber,
    graphIndex,
    sourceCanvas,
    applied: false,
    skipped: false
  };
}

function detectGraphRegions(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const dark = new Uint8Array(width * height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    const luminance = r * 0.299 + g * 0.587 + b * 0.114;
    if (luminance < 45 && r < 75 && g < 75 && b < 75) dark[i / 4] = 1;
  }

  const visited = new Uint8Array(width * height);
  const components = [];
  const minWidth = Math.max(90, width * 0.22);
  const minHeight = Math.max(70, height * 0.08);
  const minPixels = Math.max(5000, width * height * 0.008);

  for (let start = 0; start < dark.length; start += 1) {
    if (!dark[start] || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    let head = 0;
    let count = 0;
    let left = width;
    let right = 0;
    let top = height;
    let bottom = 0;

    while (head < queue.length) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      count += 1;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);

      const neighbors = [];
      if (x > 0) neighbors.push(index - 1);
      if (x < width - 1) neighbors.push(index + 1);
      if (y > 0) neighbors.push(index - width);
      if (y < height - 1) neighbors.push(index + width);
      for (const next of neighbors) {
        if (dark[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }

    const rectWidth = right - left + 1;
    const rectHeight = bottom - top + 1;
    const fill = count / Math.max(1, rectWidth * rectHeight);
    if (count >= minPixels && rectWidth >= minWidth && rectHeight >= minHeight && fill > 0.35) {
      components.push(padRect({ left, right, top, bottom }, 2, width, height));
    }
  }

  const connectedRegions = mergeOverlappingRects(components)
    .filter((rect) => rect.right - rect.left >= minWidth && rect.bottom - rect.top >= minHeight)
    .sort((a, b) => (a.top - b.top) || (a.left - b.left));
  const projectedRegions = detectGraphRegionsByProjection(dark, width, height);
  return mergeOverlappingRects([...connectedRegions, ...projectedRegions])
    .filter((rect) => rect.right - rect.left >= minWidth && rect.bottom - rect.top >= minHeight)
    .sort((a, b) => (a.top - b.top) || (a.left - b.left));
}

function detectGraphRegionsByProjection(darkMap, width, height) {
  const rowCounts = Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) rowCounts[y] += darkMap[y * width + x];
  }
  const rowBands = makeDenseBands(rowCounts, Math.max(80, width * 0.24), 50, 12);
  const regions = [];
  rowBands.forEach((band) => {
    const columnCounts = Array(width).fill(0);
    for (let x = 0; x < width; x += 1) {
      for (let y = band.start; y <= band.end; y += 1) columnCounts[x] += darkMap[y * width + x];
    }
    const bandHeight = band.end - band.start + 1;
    const columnBands = makeDenseBands(columnCounts, Math.max(40, bandHeight * 0.38), 80, 14);
    columnBands.forEach((column) => {
      const rect = trimDarkRect(darkMap, width, height, { left: column.start, right: column.end, top: band.start, bottom: band.end });
      if (rect) regions.push(padRect(rect, 3, width, height));
    });
  });
  return regions;
}

function makeDenseBands(counts, threshold, minSize, gapTolerance) {
  const bands = [];
  let start = null;
  let lastDense = null;
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] >= threshold) {
      if (start === null) start = index;
      lastDense = index;
    } else if (start !== null && index - lastDense > gapTolerance) {
      if (lastDense - start + 1 >= minSize) bands.push({ start, end: lastDense });
      start = null;
      lastDense = null;
    }
  }
  if (start !== null && lastDense - start + 1 >= minSize) bands.push({ start, end: lastDense });
  return bands;
}

function trimDarkRect(darkMap, width, height, rect) {
  let left = width;
  let right = 0;
  let top = height;
  let bottom = 0;
  let count = 0;
  for (let y = rect.top; y <= rect.bottom; y += 1) {
    for (let x = rect.left; x <= rect.right; x += 1) {
      if (!darkMap[y * width + x]) continue;
      count += 1;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (!count) return null;
  return { left, right, top, bottom };
}

function mergeOverlappingRects(rects) {
  const merged = [];
  rects.forEach((rect) => {
    const existing = merged.find((item) => rectsOverlap(item, rect, 12));
    if (existing) {
      existing.left = Math.min(existing.left, rect.left);
      existing.right = Math.max(existing.right, rect.right);
      existing.top = Math.min(existing.top, rect.top);
      existing.bottom = Math.max(existing.bottom, rect.bottom);
    } else merged.push({ ...rect });
  });
  return merged;
}

function rectsOverlap(a, b, padding = 0) {
  return !(a.right + padding < b.left || b.right + padding < a.left || a.bottom + padding < b.top || b.bottom + padding < a.top);
}

async function recognizeGraphUnitNumber(source, graphRect, label) {
  const titleHeight = Math.max(36, Math.round((graphRect.bottom - graphRect.top + 1) * 0.22));
  const rect = {
    left: Math.max(0, graphRect.left - 10),
    right: Math.min(source.width - 1, graphRect.right + 10),
    top: Math.max(0, graphRect.top - titleHeight - 8),
    bottom: Math.max(0, graphRect.top - 1)
  };
  const canvas = cropSourceCanvas(source, rect, { padding: 8, fill: "white" });
  const enhanced = enhanceCanvas(canvas, { contrast: 1.55, brightness: 10, threshold: null, invert: false });
  const result = await Tesseract.recognize(enhanced, "eng", {
    tessedit_pageseg_mode: "6",
    tessedit_char_whitelist: "[]0123456789",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
    logger: (progress) => {
      if (progress.status === "recognizing text") updateUploadStatus(`台番号をOCR中です（${label} ${Math.round(progress.progress * 100)}%）...`);
    }
  });
  const text = normalizeOcrText(result.data.text);
  const bracket = text.match(/\[\s*(\d{1,5})\s*\]/);
  const fallback = text.match(/\d{1,5}/);
  return {
    unit: bracket?.[1] || fallback?.[0] || "",
    text,
    confidence: Math.max(0, Math.min(100, Math.round(result.data.confidence || 0)))
  };
}

function analyzeGraphDiff(source, graphRect) {
  const ctx = source.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(graphRect.left, graphRect.top, graphRect.right - graphRect.left + 1, graphRect.bottom - graphRect.top + 1);
  const width = imageData.width;
  const height = imageData.height;
  const yellowMask = buildYellowPixelMask(imageData);
  const yellowComponents = detectYellowComponents(yellowMask, width, height);
  const yellowTextBlocks = detectYellowTextBlocks(yellowComponents, width, height);
  const lineMask = removeYellowTextBlocksFromMask(yellowMask, width, height, yellowTextBlocks);
  const lineComponents = detectYellowComponents(lineMask, width, height)
    .filter((component) => !yellowTextBlocks.some((block) => rectsOverlap(component, block, 2)))
    .filter((component) => isLikelyYellowLineComponent(component, width, height));

  const zeroLineY = detectZeroLineY(imageData);
  const endpointInfo = detectYellowEndpoint(lineMask, lineComponents, width, height, zeroLineY, yellowTextBlocks, yellowComponents);
  const endpoint = endpointInfo?.endpoint || null;
  const adoptedLineComponent = endpointInfo?.component || null;
  const adoptedLineSegment = endpointInfo?.segment || null;
  const endpointSide = getEndpointSide(endpoint, zeroLineY);
  const yellowCount = lineComponents.reduce((sum, component) => sum + component.pixelCount, 0);
  const warnings = [...(endpointInfo?.warnings || [])];
  if (zeroLineY === null) warnings.push("0ライン要確認");
  if (!endpoint) warnings.push("終点要確認");
  if (yellowCount < Math.max(25, width * 0.08)) warnings.push("低信頼度");
  if (!lineComponents.length && yellowComponents.length) warnings.push("ライン成分要確認");

  let diff = null;
  if (zeroLineY !== null && endpoint) {
    const upperY = 2;
    const lowerY = height - 3;
    if (endpoint.y < zeroLineY) diff = ((zeroLineY - endpoint.y) / Math.max(1, zeroLineY - upperY)) * 5000;
    else diff = -((endpoint.y - zeroLineY) / Math.max(1, lowerY - zeroLineY)) * 5000;
    diff = enforceEndpointDiffSign(diff, endpoint, zeroLineY);
    diff = roundEstimatedGraphDiff(diff, endpoint, zeroLineY);
    if (diff <= -3000 && isSuspiciousNumberEndpoint(endpoint, adoptedLineComponent, yellowComponents, width, height, yellowTextBlocks)) {
      warnings.push("数字誤認識要確認");
      diff = null;
    }
  }

  return {
    diff,
    zeroLineY,
    endpoint,
    endpointSide,
    yellowCount,
    yellowTextBlocks,
    yellowComponents,
    lineComponents,
    adoptedLineComponent,
    adoptedLineSegment,
    warnings,
    status: warnings.length ? `要確認: グラフ推定・${warnings.join("・")}` : "要確認: グラフ推定"
  };
}

function buildYellowPixelMask(imageData) {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    if (isGraphYellow(data[i], data[i + 1], data[i + 2])) mask[i / 4] = 1;
  }
  return mask;
}

function detectYellowTextBlocks(yellowComponents, width, height) {
  const glyphCandidates = yellowComponents.filter((component) => isLowerRightYellowGlyph(component, width, height));
  return mergeYellowGlyphBlocks(glyphCandidates)
    .filter((component) => isLikelyYellowPayoutText(component, width, height))
    .map((component) => ({ ...component, role: "excluded-text" }));
}

function removeYellowTextBlocksFromMask(mask, width, height, yellowTextBlocks) {
  const cleaned = new Uint8Array(mask);
  yellowTextBlocks.forEach((block) => {
    const lowerRightBlock = block.left >= width * 0.50 && block.top >= height * 0.55;
    const xPadding = lowerRightBlock ? Math.max(6, Math.round(width * 0.015)) : 1;
    const yPadding = lowerRightBlock ? Math.max(8, Math.round(height * 0.035)) : 1;
    const left = Math.max(0, block.left - xPadding);
    const right = Math.min(width - 1, block.right + xPadding);
    const top = Math.max(0, block.top - yPadding);
    const bottom = Math.min(height - 1, block.bottom + yPadding);
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) cleaned[y * width + x] = 0;
    }
  });
  return cleaned;
}

function detectYellowComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start];
    const byX = new Map();
    visited[start] = 1;
    let head = 0;
    let pixelCount = 0;
    let left = width;
    let right = 0;
    let top = height;
    let bottom = 0;

    while (head < queue.length) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      pixelCount += 1;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      if (!byX.has(x)) byX.set(x, []);
      byX.get(x).push(y);

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !visited[next]) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
    }
    const componentWidth = right - left + 1;
    const componentHeight = bottom - top + 1;
    components.push({
      left,
      right,
      top,
      bottom,
      width: componentWidth,
      height: componentHeight,
      pixelCount,
      count: pixelCount,
      xSpan: componentWidth,
      ySpan: componentHeight,
      density: pixelCount / Math.max(1, componentWidth * componentHeight),
      byX
    });
  }
  return components;
}

function isLowerRightYellowGlyph(component, width, height) {
  const centerX = (component.left + component.right) / 2;
  const centerY = (component.top + component.bottom) / 2;
  return centerX >= width * 0.55
    && centerY >= height * 0.60
    && component.height >= Math.max(8, height * 0.035)
    && component.width >= 3
    && component.density >= 0.10;
}

function mergeYellowGlyphBlocks(components) {
  const sorted = components.slice().sort((a, b) => (a.top - b.top) || (a.left - b.left));
  const blocks = [];
  sorted.forEach((component) => {
    const existing = blocks.find((block) => areSamePayoutTextLine(block, component));
    if (existing) mergeComponentIntoBlock(existing, component);
    else blocks.push({ ...component, byX: null });
  });
  return blocks;
}

function areSamePayoutTextLine(a, b) {
  const verticalOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + 1;
  const minHeight = Math.min(a.height, b.height);
  const horizontalGap = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right) - 1);
  return verticalOverlap >= minHeight * 0.35 && horizontalGap <= Math.max(18, minHeight * 1.8);
}

function mergeComponentIntoBlock(block, component) {
  block.left = Math.min(block.left, component.left);
  block.right = Math.max(block.right, component.right);
  block.top = Math.min(block.top, component.top);
  block.bottom = Math.max(block.bottom, component.bottom);
  block.pixelCount += component.pixelCount;
  block.count = block.pixelCount;
  block.width = block.right - block.left + 1;
  block.height = block.bottom - block.top + 1;
  block.xSpan = block.width;
  block.ySpan = block.height;
  block.density = block.pixelCount / Math.max(1, block.width * block.height);
}

function isLikelyYellowPayoutText(component, width, height) {
  const centerX = (component.left + component.right) / 2;
  const centerY = (component.top + component.bottom) / 2;
  const inLowerRight = centerX >= width * 0.55 && centerY >= height * 0.60;
  const largeGlyphBlock = component.width >= Math.max(24, width * 0.07) && component.height >= Math.max(10, height * 0.045);
  const textLikeDensity = component.density >= 0.08;
  const notThinLine = component.height > Math.max(7, height * 0.028) && component.width / Math.max(1, component.height) < 14;
  return inLowerRight && largeGlyphBlock && textLikeDensity && notThinLine;
}

function isLikelyYellowLineComponent(component, width, height) {
  if (component.pixelCount < Math.max(12, width * 0.025)) return false;
  if (component.xSpan < Math.max(18, width * 0.08)) return false;
  if (component.height > Math.max(70, height * 0.55)) return false;
  if (component.density > 0.78 && component.height > Math.max(10, height * 0.045)) return false;
  if (component.left > width * 0.72) return false;
  if (component.right < width * 0.12) return false;
  const centerX = (component.left + component.right) / 2;
  const centerY = (component.top + component.bottom) / 2;
  const isolatedLowerRightChunk = centerX >= width * 0.55 && centerY >= height * 0.60 && component.left > width * 0.50 && component.xSpan < width * 0.35;
  if (isolatedLowerRightChunk) return false;
  const xsWithEnoughPixels = [...component.byX.values()].filter((ys) => ys.length <= Math.max(16, height * 0.08)).length;
  return xsWithEnoughPixels >= Math.max(8, component.xSpan * 0.18);
}

function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function isGraphYellow(r, g, b) {
  return r >= 145 && g >= 115 && b <= 105 && r > b * 1.45 && g > b * 1.25 && Math.abs(r - g) <= 95;
}

function getEndpointSide(endpoint, zeroLineY) {
  if (!endpoint || zeroLineY === null) return "要確認";
  if (endpoint.y < zeroLineY) return "0ラインより上";
  if (endpoint.y > zeroLineY) return "0ラインより下";
  return "0ライン上";
}

function enforceEndpointDiffSign(value, endpoint, zeroLineY) {
  if (!endpoint || zeroLineY === null) return value;
  const magnitude = Math.abs(value);
  if (endpoint.y < zeroLineY && value < 0) return magnitude;
  if (endpoint.y > zeroLineY && value > 0) return -magnitude;
  return value;
}

function roundEstimatedGraphDiff(value, endpoint, zeroLineY) {
  const rounded = Math.round(clamp(value, -5000, 5000) / 50) * 50;
  if (rounded === 0 && endpoint && zeroLineY !== null) {
    if (endpoint.y > zeroLineY) return -50;
    if (endpoint.y < zeroLineY) return 50;
  }
  return rounded;
}

function endpointLooksLikeText(endpoint, yellowTextBlocks, width, height) {
  return endpoint && endpoint.x >= width * 0.55 && endpoint.y >= height * 0.60
    && yellowTextBlocks.some((block) => rectsOverlap({ left: endpoint.x - 18, right: endpoint.x + 18, top: endpoint.y - 18, bottom: endpoint.y + 18 }, block, 12));
}

function buildYellowLineProfile(lineMask, width, height) {
  const profile = new Array(width).fill(null);
  const maxLineColumnPixels = Math.max(18, Math.round(height * 0.12));
  for (let x = 0; x < width; x += 1) {
    const ys = [];
    for (let y = 0; y < height; y += 1) {
      if (lineMask[y * width + x]) ys.push(y);
    }
    if (!ys.length || ys.length > maxLineColumnPixels) continue;
    profile[x] = { x, medianY: median(ys), count: ys.length };
  }
  return profile;
}

function findRightmostContinuousLineRun(profile, options = {}) {
  const gapTolerance = options.gapTolerance ?? 6;
  const yJumpTolerance = options.yJumpTolerance ?? 35;
  const minRunWidth = options.minRunWidth ?? 5;
  let run = [];
  let gap = 0;
  let previous = null;

  const finishRun = () => {
    if (!run.length) return null;
    const left = Math.min(...run.map((entry) => entry.x));
    const right = Math.max(...run.map((entry) => entry.x));
    const width = right - left + 1;
    if (width < minRunWidth && run.length < minRunWidth) return null;
    const rightSide = run.filter((entry) => entry.x >= right - Math.max(2, minRunWidth - 1));
    const endpointYs = rightSide.map((entry) => entry.medianY);
    return {
      left,
      right,
      width,
      points: run.slice(),
      endpoint: { x: right, y: Math.round(median(endpointYs)) }
    };
  };

  for (let x = profile.length - 1; x >= 0; x -= 1) {
    const entry = profile[x];
    if (!entry) {
      if (run.length) {
        gap += 1;
        if (gap > gapTolerance) {
          const result = finishRun();
          if (result) return result;
          run = [];
          previous = null;
          gap = 0;
        }
      }
      continue;
    }

    if (previous && Math.abs(entry.medianY - previous.medianY) > yJumpTolerance) {
      const result = finishRun();
      if (result) return result;
      run = [];
    }
    run.push(entry);
    previous = entry;
    gap = 0;
  }
  return finishRun();
}

function findComponentForProfileRun(lineComponents, run, width, height) {
  if (!run?.endpoint) return null;
  const yTolerance = Math.max(8, Math.round(height * 0.035));
  const xPadding = 6;
  return lineComponents.find((component) => {
    if (component.right < run.left - xPadding || component.left > run.right + xPadding) return false;
    const nearbyXs = [...component.byX.keys()].filter((x) => x >= run.endpoint.x - xPadding && x <= run.endpoint.x + xPadding);
    return nearbyXs.some((x) => Math.abs(median(component.byX.get(x)) - run.endpoint.y) <= yTolerance);
  }) || lineComponents.find((component) => component.left <= run.right && component.right >= run.left) || null;
}

function detectZeroLineY(imageData) {
  const { width, height, data } = imageData;
  const candidates = [];
  const xStart = Math.floor(width * 0.04);
  const xEnd = Math.floor(width * 0.96);
  for (let y = Math.floor(height * 0.12); y < Math.floor(height * 0.88); y += 1) {
    let white = 0;
    let maxRun = 0;
    let run = 0;
    for (let x = xStart; x <= xEnd; x += 1) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const isWhiteLine = r > 165 && g > 165 && b > 165 && Math.max(r, g, b) - Math.min(r, g, b) < 55;
      if (isWhiteLine) {
        white += 1;
        run += 1;
        maxRun = Math.max(maxRun, run);
      } else run = 0;
    }
    const ratio = white / Math.max(1, xEnd - xStart + 1);
    if (ratio > 0.22 || maxRun > width * 0.28) {
      candidates.push({ y, score: ratio + (maxRun / width) * 0.7 - Math.abs(y - height / 2) / height * 0.55 });
    }
  }
  if (!candidates.length) return null;
  const merged = [];
  candidates.forEach((candidate) => {
    const previous = merged.at(-1);
    if (previous && candidate.y - previous.end <= 2) {
      previous.end = candidate.y;
      previous.score = Math.max(previous.score, candidate.score);
      previous.sum += candidate.y;
      previous.count += 1;
    } else merged.push({ start: candidate.y, end: candidate.y, score: candidate.score, sum: candidate.y, count: 1 });
  });
  const best = merged.sort((a, b) => b.score - a.score)[0];
  return Math.round(best.sum / best.count);
}

function detectYellowEndpoint(lineMask, lineComponents, width, height, zeroLineY, yellowTextBlocks, yellowComponents = []) {
  const safeLineComponents = Array.isArray(lineComponents) ? lineComponents : [];
  const safeYellowTextBlocks = Array.isArray(yellowTextBlocks) ? yellowTextBlocks : [];
  const warnings = [];
  const hasLineMask = lineMask && lineMask.length >= width * height;
  const trace = hasLineMask ? buildYellowLineTrace(lineMask, width, height) : null;
  const segments = trace ? findYellowLineTraceSegments(trace, width, height)
    .filter((segment) => segment.right >= width * 0.12)
    .filter((segment) => !segmentEndpointLooksLikeText(segment, safeYellowTextBlocks, width, height))
    .sort((a, b) => b.right - a.right || b.validCount - a.validCount) : [];

  if (segments.length) {
    const chosenSegment = segments[0];
    if (segments.length > 1 || hasDiscardedMiddleComponents(safeLineComponents, chosenSegment)) warnings.push("途中成分除外");
    if (chosenSegment.right < width * 0.45) warnings.push("短時間稼働推定");
    warnings.push("最右連続区間採用");
    const endpoint = endpointFromTraceSegment(chosenSegment, trace);
    const component = safeLineComponents.find((candidate) => candidate.left <= chosenSegment.right && candidate.right >= chosenSegment.left)
      || segmentToComponent(chosenSegment, trace);
    return { endpoint, component, segment: chosenSegment, warnings };
  }

  const fallback = detectYellowEndpointFromComponents(lineMask, safeLineComponents, width, height, zeroLineY, safeYellowTextBlocks, yellowComponents);
  if (fallback.endpoint && fallback.endpoint.x < width * 0.45) fallback.warnings.push("短時間稼働推定");
  return fallback;
}

function buildYellowLineTrace(lineMask, width, height) {
  const raw = Array(width).fill(null);
  const counts = Array(width).fill(0);
  const maxColumnPixels = Math.max(18, Math.round(height * 0.10));
  for (let x = 0; x < width; x += 1) {
    const ys = [];
    for (let y = 0; y < height; y += 1) {
      if (lineMask[y * width + x]) ys.push(y);
    }
    if (!ys.length || ys.length > maxColumnPixels) continue;
    raw[x] = median(ys);
    counts[x] = ys.length;
  }
  const filled = raw.slice();
  const maxGap = 8;
  const maxYJump = Math.max(20, Math.min(35, Math.round(height * 0.16)));
  let prevX = -1;
  for (let x = 0; x < width; x += 1) {
    if (!Number.isFinite(raw[x])) continue;
    if (prevX >= 0) {
      const gap = x - prevX - 1;
      if (gap > 0 && gap <= maxGap && Math.abs(raw[x] - raw[prevX]) <= maxYJump) {
        for (let fillX = prevX + 1; fillX < x; fillX += 1) {
          const ratio = (fillX - prevX) / (x - prevX);
          filled[fillX] = raw[prevX] + (raw[x] - raw[prevX]) * ratio;
        }
      }
    }
    prevX = x;
  }
  return { raw, filled, counts, maxGap, maxYJump };
}

function findYellowLineTraceSegments(trace, width, height) {
  const segments = [];
  const minValidColumns = Math.max(4, Math.round(width * 0.012));
  const minSpan = Math.max(5, Math.round(width * 0.015));
  let current = null;
  let lastValidX = null;
  let lastY = null;

  for (let x = 0; x < width; x += 1) {
    const y = trace.filled[x];
    if (!Number.isFinite(y)) continue;
    const rawValid = Number.isFinite(trace.raw[x]);
    const canConnect = current
      && lastValidX !== null
      && x - lastValidX <= trace.maxGap + 1
      && Math.abs(y - lastY) <= trace.maxYJump;
    if (!current || !canConnect) {
      pushYellowTraceSegment(segments, current, minValidColumns, minSpan);
      current = { left: x, right: x, top: y, bottom: y, validCount: rawValid ? 1 : 0, xs: [x], ys: [y] };
    } else {
      current.right = x;
      current.top = Math.min(current.top, y);
      current.bottom = Math.max(current.bottom, y);
      current.xs.push(x);
      current.ys.push(y);
      if (rawValid) current.validCount += 1;
    }
    lastValidX = x;
    lastY = y;
  }
  pushYellowTraceSegment(segments, current, minValidColumns, minSpan);
  return segments.map((segment) => ({
    ...segment,
    top: Math.floor(segment.top),
    bottom: Math.ceil(segment.bottom),
    width: segment.right - segment.left + 1,
    height: Math.ceil(segment.bottom) - Math.floor(segment.top) + 1
  }));
}

function pushYellowTraceSegment(segments, segment, minValidColumns, minSpan) {
  if (!segment) return;
  const span = segment.right - segment.left + 1;
  if (segment.validCount >= minValidColumns && span >= minSpan) segments.push(segment);
}

function segmentEndpointLooksLikeText(segment, yellowTextBlocks, width, height) {
  const endpoint = endpointFromTraceSegment(segment, { filled: [] });
  return endpointLooksLikeText(endpoint, yellowTextBlocks, width, height);
}

function endpointFromTraceSegment(segment, trace) {
  const windowSize = Math.max(5, Math.min(15, Math.round(segment.width * 0.20)));
  const left = Math.max(segment.left, segment.right - windowSize + 1);
  const xs = [];
  const ys = [];
  for (let x = left; x <= segment.right; x += 1) {
    const y = trace.filled[x];
    if (!Number.isFinite(y)) continue;
    xs.push(x);
    ys.push(y);
  }
  return { x: Math.round(median(xs.length ? xs : [segment.right])), y: Math.round(median(ys.length ? ys : segment.ys)) };
}

function hasDiscardedMiddleComponents(lineComponents, chosenSegment) {
  return lineComponents.some((component) => component.right < chosenSegment.left - 2 || component.left > chosenSegment.right + 2);
}

function segmentToComponent(segment, trace) {
  const byX = new Map();
  for (let x = segment.left; x <= segment.right; x += 1) {
    const y = trace.filled[x];
    if (Number.isFinite(y)) byX.set(x, [Math.round(y)]);
  }
  return {
    left: segment.left,
    right: segment.right,
    top: segment.top,
    bottom: segment.bottom,
    width: segment.width,
    height: segment.height,
    pixelCount: segment.validCount,
    count: segment.validCount,
    xSpan: segment.width,
    ySpan: segment.height,
    density: segment.validCount / Math.max(1, segment.width * segment.height),
    byX
  };
}

function detectYellowEndpointFromComponents(lineMask, lineComponents, width, height, zeroLineY, yellowTextBlocks, yellowComponents = []) {
  const safeLineComponents = Array.isArray(lineComponents) ? lineComponents : [];
  const safeYellowTextBlocks = Array.isArray(yellowTextBlocks) ? yellowTextBlocks : [];
  const safeYellowComponents = Array.isArray(yellowComponents) ? yellowComponents : [];
  const warnings = [];
  const hasLineMask = lineMask && lineMask.length >= width * height;
  if (!hasLineMask) {
    warnings.push("ライン要確認");
    return { endpoint: null, component: null, segment: null, warnings };
  }

  const profile = buildYellowLineProfile(lineMask, width, height);
  const rightmostRun = findRightmostContinuousLineRun(profile);
  if (rightmostRun?.endpoint && !endpointLooksLikeText(rightmostRun.endpoint, safeYellowTextBlocks, width, height)) {
    return {
      endpoint: rightmostRun.endpoint,
      component: findComponentForProfileRun(safeLineComponents, rightmostRun, width, height),
      segment: null,
      warnings
    };
  }

  const candidates = safeLineComponents
    .map((component) => ({ component, endpoint: endpointFromLineComponent(component, width) }))
    .filter((candidate) => candidate.endpoint)
    .filter((candidate) => !endpointLooksLikeText(candidate.endpoint, safeYellowTextBlocks, width, height))
    .sort((a, b) => b.endpoint.x - a.endpoint.x || scoreLineEndpointCandidate(b, width) - scoreLineEndpointCandidate(a, width));

  if (!candidates.length) return { endpoint: null, component: null, segment: null, warnings };

  let chosen = candidates[0];
  if (candidates.length > 1) warnings.push("途中成分除外");
  warnings.push("最右連続区間採用");
  const safeCandidate = candidates.find((candidate) => !isSuspiciousNumberEndpoint(candidate.endpoint, candidate.component, safeYellowComponents, width, height, safeYellowTextBlocks));
  if (safeCandidate && safeCandidate.endpoint.x >= chosen.endpoint.x - Math.max(8, width * 0.03) && isSuspiciousNumberEndpoint(chosen.endpoint, chosen.component, safeYellowComponents, width, height, safeYellowTextBlocks)) {
    chosen = safeCandidate;
    warnings.push("数字誤認識再探索");
  }

  if (isSuspiciousNumberEndpoint(chosen.endpoint, chosen.component, safeYellowComponents, width, height, safeYellowTextBlocks)) {
    const rescannedEndpoint = findContinuousEndpointFromRight(chosen.component, width, height, safeYellowComponents, safeYellowTextBlocks);
    if (rescannedEndpoint) {
      chosen = { ...chosen, endpoint: rescannedEndpoint };
      warnings.push("右端から再探索");
    } else warnings.push("終点数字近傍要確認");
  }

  if (zeroLineY !== null && chosen.endpoint.y > zeroLineY) {
    const rightEdgeBodyY = rightEdgeMedianY(chosen.component, Math.max(18, Math.round(width * 0.04)));
    const probablyTextDraggedEndpoint = rightEdgeBodyY !== null && rightEdgeBodyY < zeroLineY && chosen.endpoint.y > zeroLineY;
    if (probablyTextDraggedEndpoint) warnings.push("数字誤認識要確認");
  }

  return { endpoint: chosen.endpoint, component: chosen.component, segment: componentToSegment(chosen.component), warnings };
}

function componentToSegment(component) {
  if (!component) return null;
  return { left: component.left, right: component.right, top: component.top, bottom: component.bottom, width: component.width, height: component.height, validCount: component.pixelCount };
}


function isSuspiciousNumberEndpoint(endpoint, component, yellowComponents, width, height, yellowTextBlocks) {
  if (!endpoint || !component) return false;
  const inDangerZone = endpoint.x > width * 0.65 && endpoint.y > height * 0.65;
  if (!inDangerZone) return false;
  const nearbyLargeBlock = yellowComponents.some((candidate) => {
    if (candidate === component) return false;
    const nearEndpoint = rectsOverlap(candidate, { left: endpoint.x - 22, right: endpoint.x + 22, top: endpoint.y - 22, bottom: endpoint.y + 22 }, 8);
    const largeDense = candidate.width >= Math.max(16, width * 0.045)
      && candidate.height >= Math.max(8, height * 0.035)
      && candidate.density >= 0.10;
    return nearEndpoint && largeDense;
  });
  const nearKnownText = endpointLooksLikeText(endpoint, yellowTextBlocks, width, height);
  const denseCluster = hasDenseYellowClusterNearEndpoint(component, endpoint, width, height);
  const continuous = hasLineContinuityNearEndpoint(component, endpoint, width);
  return nearKnownText || nearbyLargeBlock || denseCluster || !continuous;
}

function hasDenseYellowClusterNearEndpoint(component, endpoint, width, height) {
  const xRadius = Math.max(10, Math.round(width * 0.025));
  const yRadius = Math.max(10, Math.round(height * 0.045));
  let localPixels = 0;
  let verticalColumns = 0;
  let horizontalRows = new Map();
  for (const [x, ys] of component.byX.entries()) {
    if (Math.abs(x - endpoint.x) > xRadius) continue;
    const localYs = ys.filter((y) => Math.abs(y - endpoint.y) <= yRadius);
    if (!localYs.length) continue;
    localPixels += localYs.length;
    if (localYs.length >= Math.max(5, yRadius * 0.45)) verticalColumns += 1;
    localYs.forEach((y) => horizontalRows.set(y, (horizontalRows.get(y) || 0) + 1));
  }
  const denseRows = [...horizontalRows.values()].filter((count) => count >= Math.max(8, xRadius * 0.65)).length;
  const localArea = (xRadius * 2 + 1) * (yRadius * 2 + 1);
  return localPixels / localArea > 0.16 || verticalColumns >= 3 || denseRows >= 3;
}

function hasLineContinuityNearEndpoint(component, endpoint, width) {
  const xs = [...component.byX.keys()].sort((a, b) => a - b);
  const endpointIndex = xs.findIndex((x) => x >= endpoint.x);
  const endIndex = endpointIndex < 0 ? xs.length - 1 : endpointIndex;
  const lookback = Math.max(12, Math.round(width * 0.035));
  const startX = endpoint.x - lookback;
  const localXs = xs.filter((x, index) => index <= endIndex && x >= startX && x <= endpoint.x);
  if (localXs.length < Math.max(5, lookback * 0.35)) return false;
  let largestGap = 0;
  for (let i = 1; i < localXs.length; i += 1) largestGap = Math.max(largestGap, localXs[i] - localXs[i - 1]);
  const medians = localXs.map((x) => median(component.byX.get(x))).filter((value) => Number.isFinite(value));
  const ySpread = medians.length ? Math.max(...medians) - Math.min(...medians) : Number.POSITIVE_INFINITY;
  return largestGap <= 8 && ySpread <= Math.max(35, width * 0.08);
}

function findContinuousEndpointFromRight(component, width, height, yellowComponents, yellowTextBlocks) {
  const xs = [...component.byX.keys()].sort((a, b) => b - a);
  for (const x of xs) {
    const endpoint = endpointFromLineComponentUpToX(component, width, x);
    if (!endpoint) continue;
    if (endpoint.x < width * 0.12) return null;
    if (!isSuspiciousNumberEndpoint(endpoint, component, yellowComponents, width, height, yellowTextBlocks)) return endpoint;
  }
  return null;
}

function endpointFromLineComponentUpToX(component, width, maxX) {
  const xs = [...component.byX.keys()].filter((x) => x <= maxX).sort((a, b) => a - b);
  if (!xs.length) return null;
  const rightmost = xs.at(-1);
  if (rightmost < width * 0.12) return null;
  const windowSize = Math.max(5, Math.min(15, Math.round(component.xSpan * 0.12)));
  const windowXs = xs.filter((x) => x >= rightmost - windowSize).slice(-20);
  const ys = windowXs.flatMap((x) => component.byX.get(x) || []).filter((value) => Number.isFinite(value));
  if (ys.length < 2) return null;
  return { x: Math.round(median(windowXs)), y: Math.round(median(ys)) };
}

function endpointFromLineComponent(component, width) {
  const xs = [...component.byX.keys()].sort((a, b) => a - b);
  if (!xs.length) return null;
  const rightmost = xs.at(-1);
  if (rightmost < width * 0.12) return null;
  const windowSize = Math.max(5, Math.min(15, Math.round(component.xSpan * 0.12)));
  const windowXs = xs.filter((x) => x >= rightmost - windowSize).slice(-20);
  const ys = windowXs
    .flatMap((x) => component.byX.get(x) || [])
    .filter((value) => Number.isFinite(value));
  if (ys.length < 2) return null;
  return { x: Math.round(median(windowXs)), y: Math.round(median(ys)) };
}

function scoreLineEndpointCandidate(candidate, width) {
  const { component, endpoint } = candidate;
  const rightScore = endpoint.x / Math.max(1, width);
  const spanScore = Math.min(1, component.xSpan / Math.max(1, width * 0.45));
  const leftContinuityScore = component.left <= width * 0.35 ? 0.35 : component.left <= width * 0.55 ? 0.18 : -0.25;
  const densityPenalty = component.density > 0.55 && component.height > 12 ? -0.4 : 0;
  return rightScore * 2 + spanScore + leftContinuityScore + densityPenalty;
}

function rightEdgeMedianY(component, span) {
  const xs = [...component.byX.keys()].sort((a, b) => a - b);
  if (!xs.length) return null;
  const rightmost = xs.at(-1);
  const ys = xs.filter((x) => x >= rightmost - span).flatMap((x) => component.byX.get(x) || []);
  return median(ys);
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function cropSourceCanvas(source, rect, options = {}) {
  const width = Math.max(1, rect.right - rect.left + 1);
  const height = Math.max(1, rect.bottom - rect.top + 1);
  const padding = options.padding || 0;
  const canvas = document.createElement("canvas");
  canvas.width = width + padding * 2;
  canvas.height = height + padding * 2;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = options.fill || "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, rect.left, rect.top, width, height, padding, padding, width, height);
  return canvas;
}

function applyGraphResultsToDraftRows(results) {
  const resultsWithUnit = results.filter((result) => result.unit);
  if (!resultsWithUnit.length) return;
  if (isDraftTableEmpty()) $("#draftTable tbody").innerHTML = "";

  resultsWithUnit.forEach((result) => {
    const row = findDraftRowByUnit(result.unit) || addDraftRowAndReturn({ unit: result.unit });
    const currentDiff = $(".diff", row).value.trim();

    if (isUsableGraphDiffResult(result)) {
      const memoText = `グラフ推定差枚: ${formatSignedNumber(result.diff)}`;
      if (!currentDiff) {
        $(".diff", row).value = result.diff;
        result.applied = true;
      } else {
        result.skipped = true;
      }
      appendRowMemo(row, currentDiff ? `${memoText}（既存差枚あり未上書き）` : memoText);
    } else {
      appendRowMemo(row, "グラフ差枚要確認");
    }

    setOcrStatusCell($(".ocr-check", row), result.status, result.unitConfidence || "");
    updateDraftRow(row);
  });
}

function isUsableGraphDiffResult(result) {
  return result.diff !== null
    && !(result.warnings || []).includes("0ライン要確認")
    && !(result.warnings || []).includes("終点要確認")
    && !(result.warnings || []).includes("読み取りエラー");
}

function findDraftRowByUnit(unit) {
  return [...$("#draftTable tbody").children].find((row) => $(".unit", row).value.trim() === String(unit));
}

function addDraftRowAndReturn(seed = {}) {
  addDraftRow(seed);
  return $("#draftTable tbody").lastElementChild;
}

function appendRowMemo(row, text) {
  const input = $(".row-memo", row);
  if (!input.value.includes(text)) input.value = [input.value.trim(), text].filter(Boolean).join(" / ");
}

function formatSignedNumber(value) {
  const number = Math.round(Number(value || 0));
  return `${number > 0 ? "+" : ""}${number}`;
}

function renderGraphResults(results) {
  const panel = $("#graphResultPanel");
  const list = $("#graphResultList");
  const previews = $("#graphPreviewGrid");
  if (!panel || !list || !previews) return;
  panel.hidden = false;
  list.innerHTML = results.length ? results.map((result) => {
    const unit = result.unit || "台番号要確認";
    const summary = isUsableGraphDiffResult(result) ? `${formatSignedNumber(result.diff)}枚 推定` : "要確認";
    const reflect = result.applied ? "反映済み" : result.skipped ? "既存差枚あり未上書き" : result.unit ? "台番号のみ反映" : "自動反映なし";
    return `<div class="graph-result-item"><strong>${escapeHtml(unit)}</strong><span>：${escapeHtml(summary)}<small>${escapeHtml(graphResultDebugText(result))}</small></span><em>${escapeHtml(reflect)}</em></div>`;
  }).join("") : '<p class="muted">黒いグラフ領域を検出できませんでした。</p>';

  previews.innerHTML = "";
  results.forEach((result) => previews.appendChild(createGraphPreviewCard(result)));
}


function clearGraphResults() {
  const panel = $("#graphResultPanel");
  const list = $("#graphResultList");
  const previews = $("#graphPreviewGrid");

  if (panel) panel.hidden = true;
  if (list) list.innerHTML = "";
  if (previews) previews.innerHTML = "";

  const graphInput = $("#graphImage");
  if (graphInput) graphInput.value = "";
}

function clearBasicOcrState() {
  const basicInput = $("#basicImage");
  if (basicInput) basicInput.value = "";

  state.ocrPreview.files = [];
  state.ocrPreview.settings = [];
  state.ocrPreview.currentIndex = 0;
  state.ocrPreview.image = null;
  state.ocrPreview.mode = "tableOnly";

  const previewPanel = $("#ocrPreviewPanel");
  if (previewPanel) previewPanel.hidden = true;

  const fileSelect = $("#ocrPreviewFileSelect");
  if (fileSelect) fileSelect.innerHTML = "";

  selectOcrMode("tableOnly");
  renderOcrPreview();
}

function createGraphPreviewCard(result) {
  const card = document.createElement("article");
  card.className = "graph-preview-card";
  const canvas = cropSourceCanvas(result.sourceCanvas, result.region, { padding: 0, fill: "black" });
  drawGraphDebugOverlay(canvas, result);
  const title = document.createElement("strong");
  title.textContent = `${result.unit || "台番号要確認"}：${isUsableGraphDiffResult(result) ? `${formatSignedNumber(result.diff)}枚 推定` : "要確認"}`;
  const detail = document.createElement("p");
  detail.textContent = `${result.warnings.length ? `${result.warnings.join("・")} / ` : ""}${graphResultDebugText(result)}`;
  card.append(title, canvas, detail);
  return card;
}

function graphResultDebugText(result) {
  const zero = result.zeroLineY === null ? "要確認" : Math.round(result.zeroLineY);
  const endpointY = result.endpoint ? Math.round(result.endpoint.y) : "要確認";
  const side = result.endpointSide || getEndpointSide(result.endpoint, result.zeroLineY);
  const diff = result.diff === null ? "要確認" : `${formatSignedNumber(result.diff)}枚`;
  const lineStatus = result.adoptedLineSegment ? "最右連続区間採用" : "ライン成分要確認";
  const textStatus = result.yellowTextBlocks?.length ? `数字除外済み ${result.yellowTextBlocks.length}件` : "数字候補なし";
  return `0ラインY: ${zero} / 終点Y: ${endpointY} / ${side} / 推定差枚: ${diff} / ${lineStatus} / ${textStatus}`;
}

function drawGraphDebugOverlay(canvas, result) {
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.lineWidth = 2;
  (result.yellowTextBlocks || []).forEach((block) => drawDebugRect(ctx, block, "#ff9f1a", "数字除外"));
  if (result.adoptedLineSegment) drawDebugRect(ctx, result.adoptedLineSegment, "#39ff14", "最終連続区間");
  else if (result.adoptedLineComponent) drawDebugRect(ctx, result.adoptedLineComponent, "#39ff14", "最右連続区間");
  if (result.warnings?.includes("途中成分除外")) drawDebugBadge(ctx, "途中成分除外", 14, 58, "#ffb020");
  if (result.warnings?.includes("短時間稼働推定")) drawDebugBadge(ctx, "短時間稼働推定", 14, 88, "#7cffc4");
  if (result.zeroLineY !== null) {
    ctx.strokeStyle = "#00d5ff";
    ctx.beginPath();
    ctx.moveTo(0, result.zeroLineY);
    ctx.lineTo(canvas.width, result.zeroLineY);
    ctx.stroke();
  }
  if (result.endpoint) {
    ctx.strokeStyle = "#ff3b8a";
    ctx.fillStyle = "#ff3b8a";
    ctx.beginPath();
    ctx.arc(result.endpoint.x, result.endpoint.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(6, 6, 150, 28);
  ctx.fillStyle = "white";
  ctx.font = "16px sans-serif";
  ctx.fillText(result.diff === null ? "差枚要確認" : `${formatSignedNumber(result.diff)}枚 推定`, 14, 26);
  ctx.restore();
}

function drawDebugRect(ctx, rect, color, label) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.left, rect.top, rect.right - rect.left + 1, rect.bottom - rect.top + 1);
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  const labelWidth = Math.max(72, label.length * 12);
  ctx.fillRect(rect.left, Math.max(0, rect.top - 20), labelWidth, 18);
  ctx.fillStyle = color;
  ctx.font = "12px sans-serif";
  ctx.fillText(label, rect.left + 4, Math.max(12, rect.top - 6));
  ctx.restore();
}

function drawDebugBadge(ctx, label, x, y, color) {
  ctx.save();
  ctx.font = "13px sans-serif";
  const labelWidth = Math.max(96, label.length * 13);
  ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
  ctx.fillRect(x - 2, y - 16, labelWidth, 22);
  ctx.fillStyle = color;
  ctx.fillText(label, x + 4, y);
  ctx.restore();
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

async function recognizeBasicDataTableOnlyImage(file, imageNumber) {
  updateUploadStatus(`表だけ画像の全体を補正中です（${imageNumber}）...`);
  const bitmap = await loadImageBitmap(file);
  const source = drawScaledImage(bitmap, { scale: 2.8 });
  const rawTableCanvas = cropWholeTableCanvas(source, { enhance: false });
  const tableCanvas = cropWholeTableCanvas(source);
  const layout = detectTableLayout(tableCanvas, { fullImageBounds: true, columnCount: 5 });
  const rows = [];

  for (const [rowIndex, rowCells] of layout.rows.entries()) {
    const header = rowIndex === 0 ? await detectHeaderOnlyRow(rawTableCanvas, rowCells, imageNumber) : false;
    if (header) continue;
    updateUploadStatus(`表だけ画像セルを数字専用OCRで読み取り中です（${imageNumber} / ${rowIndex + 1}/${layout.rows.length}行）...`);
    const cellResults = await Promise.all(rowCells.map((cell, columnIndex) => {
      const label = `${imageNumber} 自動行${rowIndex + 1} 列${columnIndex + 1}`;
      return columnIndex === 0 ? recognizeUnitCell(rawTableCanvas, cell, label) : recognizeNumericCell(tableCanvas, cell, label);
    }));
    const row = buildOcrRowFromCells(cellResults, rowIndex);
    if (row) {
      row.memo = `${row.memo} / 表だけ画像モード`;
      rows.push(row);
    }
  }

  return dedupeOcrRows(rows);
}

function cropWholeTableCanvas(source, options = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  if (options.enhance === false) return canvas;
  return enhanceCanvas(canvas, { contrast: 1.85, brightness: 12, threshold: 176, invert: false });
}

async function detectHeaderOnlyRow(source, rowCells, imageNumber) {
  const rowRect = {
    left: Math.min(...rowCells.map((cell) => cell.left)),
    right: Math.max(...rowCells.map((cell) => cell.right)),
    top: Math.min(...rowCells.map((cell) => cell.top)),
    bottom: Math.max(...rowCells.map((cell) => cell.bottom))
  };
  const headerCanvas = cropHeaderRowCanvas(source, rowRect);
  try {
    const result = await Tesseract.recognize(headerCanvas, "jpn+eng", {
      tessedit_pageseg_mode: "7",
      user_defined_dpi: "300",
      logger: (progress) => {
        if (progress.status === "recognizing text") updateUploadStatus(`表ヘッダーを確認中です（${imageNumber} ${Math.round(progress.progress * 100)}%）...`);
      }
    });
    const text = normalizeOcrText(result.data.text);
    return /台\s*(?:番|番号)|累計|総\s*G|BB|RB|合算|合成/i.test(text);
  } catch (error) {
    console.warn("Header OCR failed", error);
    return false;
  }
}

function cropHeaderRowCanvas(source, rect) {
  const width = Math.max(1, rect.right - rect.left + 1);
  const height = Math.max(1, rect.bottom - rect.top + 1);
  const canvas = document.createElement("canvas");
  canvas.width = width + 16;
  canvas.height = height + 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, rect.left, rect.top, width, height, 8, 8, width, height);
  return enhanceCanvas(canvas, { contrast: 1.45, brightness: 8, threshold: null, invert: false });
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

function detectTableLayout(canvas, options = {}) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const darkMap = makeDarkMap(imageData, 120);
  const contentBounds = findContentBounds(darkMap, canvas.width, canvas.height);
  const bounds = options.fullImageBounds
    ? padRect({ left: 2, right: canvas.width - 3, top: 2, bottom: canvas.height - 3 }, 0, canvas.width, canvas.height)
    : contentBounds;
  const horizontalLines = findProjectionLines(darkMap, canvas.width, canvas.height, "horizontal", bounds, 0.42);
  const verticalLines = findProjectionLines(darkMap, canvas.width, canvas.height, "vertical", bounds, 0.32);
  const lineRowBands = makeBandsFromLines(horizontalLines, bounds.top, bounds.bottom, 26).filter((band) => band.bottom - band.top >= 18);
  const textRowBands = estimateTextRowBands(darkMap, canvas.width, canvas.height, bounds);
  const rowBands = horizontalLines.length >= 2 && lineRowBands.length >= Math.max(2, textRowBands.length * 0.6)
    ? lineRowBands
    : textRowBands.length >= 2 ? textRowBands : lineRowBands;
  const columnBands = makeColumnBands(verticalLines, bounds, options.columnCount || 5);
  const dataRows = options.fullImageBounds ? rowBands : dropHeaderLikeBand(rowBands, columnBands, darkMap, canvas.width);

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

function makeColumnBands(verticalLines, bounds, columnCount = 5) {
  const detected = makeBandsFromLines(verticalLines, bounds.left, bounds.right, 22)
    .filter((band) => band.bottom - band.top >= 22)
    .map((band) => ({ left: band.top, right: band.bottom }));
  if (detected.length >= columnCount) return chooseTargetColumns(detected, bounds, columnCount);
  return splitEvenly(bounds.left, bounds.right, columnCount).map(([left, right]) => ({ left, right }));
}

function chooseTargetColumns(columns, bounds, columnCount = 5) {
  if (columns.length === columnCount) return columns;
  const widths = columns.map((column) => column.right - column.left);
  const medianWidth = [...widths].sort((a, b) => a - b)[Math.floor(widths.length / 2)] || 1;
  const candidates = columns.filter((column) => column.right - column.left >= medianWidth * 0.45);
  return candidates.length >= columnCount ? candidates.slice(0, columnCount) : splitEvenly(bounds.left, bounds.right, columnCount).map(([left, right]) => ({ left, right }));
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

function estimateTextRowBands(darkMap, width, height, bounds) {
  const counts = Array(height).fill(0);
  const span = Math.max(1, bounds.right - bounds.left + 1);
  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    for (let x = bounds.left; x <= bounds.right; x += 1) counts[y] += darkMap[y * width + x];
  }
  const textThreshold = Math.max(3, span * 0.018);
  const lineThreshold = Math.max(8, span * 0.42);
  const bands = [];
  let start = null;
  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    const hasText = counts[y] >= textThreshold && counts[y] < lineThreshold;
    if (hasText && start === null) start = y;
    if ((!hasText || y === bounds.bottom) && start !== null) {
      const end = hasText && y === bounds.bottom ? y : y - 1;
      if (end - start >= 5) bands.push({ top: start, bottom: end });
      start = null;
    }
  }
  return mergeCloseBands(bands, 14)
    .map((band) => padRect({ left: bounds.left, right: bounds.right, top: band.top, bottom: band.bottom }, 10, width, height))
    .filter((band) => band.bottom - band.top >= 18);
}

function mergeCloseBands(bands, gap) {
  return bands.reduce((merged, band) => {
    const previous = merged.at(-1);
    if (previous && band.top - previous.bottom <= gap) previous.bottom = band.bottom;
    else merged.push({ ...band });
    return merged;
  }, []);
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

function addDraftRow(seed = {}) {
  const row = $("#draftRowTemplate").content.firstElementChild.cloneNode(true);
  $(".unit", row).value = seed.unit ?? "";
  $(".games", row).value = seed.games ?? "";
  $(".bb", row).value = seed.bb ?? "";
  $(".rb", row).value = seed.rb ?? "";
  const diffInput = $(".diff", row);
  diffInput.value = seed.diff ?? "";
  setOcrStatusCell($(".ocr-check", row), seed.ocrStatus, seed.ocrConfidence);
  $(".row-memo", row).value = seed.memo ?? "";
  row.addEventListener("input", () => updateDraftRow(row));
  diffInput.addEventListener("blur", () => {
    diffInput.value = normalizeDiffInputValue(diffInput.value);
    updateDraftRow(row);
  });
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
  clearGraphResults();
  clearBasicOcrState();
  updateUploadStatus();
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

function normalizeNumberText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[−ー－―ｰ–—‐-]/g, "-")
    .replace(/[,，]/g, "")
    .trim();
}

function normalizeDiffInputValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = normalizeNumberText(raw);
  return /^-?\d+$/.test(normalized) ? normalized : raw;
}

function numberValue(value) {
  const normalized = normalizeNumberText(value);
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bindRecords() {
  ["filterDate", "filterStore", "filterMachine", "filterUnit", "filterRating", "filterMemoTag", "filterPositive", "filterAOnly", "filterStoreText", "filterMachineText", "filterUnitText"].forEach((id) => {
    const element = $(`#${id}`);
    if (!element) return;
    element.addEventListener("input", () => {
      if (!state.suppressRecordFilterClear) state.recordsScopeIds = null;
      if (["filterDate", "filterStore", "filterMachine"].includes(id)) renderFilterOptions();
      renderRecords();
    });
  });
  $("#recordsTable thead").addEventListener("click", (event) => {
    const key = event.target.dataset.sort;
    if (!key) return;
    state.sort.direction = state.sort.key === key && state.sort.direction === "asc" ? "desc" : "asc";
    state.sort.key = key;
    renderRecords();
  });
  $("#exportLatestRecordsButton").addEventListener("click", () => exportRecordsCsv("slot-records_latest.csv"));
  $("#exportDatedRecordsButton").addEventListener("click", () => exportRecordsCsv(`slot-records_${formatLocalDate(new Date())}.csv`));
  $("#reevaluateRecordsButton").addEventListener("click", reevaluateSavedRecords);
  $("#importRecordsInput").addEventListener("change", (event) => importRecordsCsv(event.target.files[0]));
  $("#bulkAddTagButton").addEventListener("click", () => bulkUpdateMemoTags("add"));
  $("#bulkRemoveTagButton").addEventListener("click", () => bulkUpdateMemoTags("remove"));
  $("#deleteAllRecordsButton").addEventListener("click", () => {
    if (!confirm("保存データをすべて削除しますか？")) return;
    state.records = [];
    state.editingRecordId = null;
    saveJson(STORAGE_KEYS.records, state.records);
    renderAll();
  });
}

function getRecordFilters() {
  return {
    date: $("#filterDate")?.value || "",
    store: $("#filterStore")?.value || "",
    machine: $("#filterMachine")?.value || "",
    unit: $("#filterUnit")?.value || "",
    storeText: $("#filterStoreText")?.value.trim() || "",
    machineText: $("#filterMachineText")?.value.trim() || "",
    unitText: $("#filterUnitText")?.value.trim() || "",
    rating: $("#filterRating")?.value || "",
    memoTag: $("#filterMemoTag")?.value || "",
    positive: Boolean($("#filterPositive")?.checked),
    aOnly: Boolean($("#filterAOnly")?.checked)
  };
}

function getFilteredRecords() {
  const filters = getRecordFilters();

  return state.records.filter((record) => {
    if (state.recordsScopeIds && !state.recordsScopeIds.has(record.id)) return false;
    if (filters.date && record.date !== filters.date) return false;
    if (filters.store && record.store !== filters.store) return false;
    if (filters.machine && record.machine !== filters.machine) return false;
    if (filters.unit && String(record.unit) !== filters.unit) return false;
    if (filters.storeText && !String(record.store || "").includes(filters.storeText)) return false;
    if (filters.machineText && !String(record.machine || "").includes(filters.machineText)) return false;
    if (filters.unitText && !String(record.unit || "").includes(filters.unitText)) return false;
    if (filters.rating && record.rating !== filters.rating) return false;
    if (filters.memoTag && !recordHasMemoTag(record, filters.memoTag)) return false;
    if (filters.positive && record.diff <= 0) return false;
    if (filters.aOnly && record.rating !== "A") return false;
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
    if (state.editingRecordId === record.id) {
      tr.className = "editing-row";
      tr.innerHTML = renderEditableRecordRow(record);
    } else {
      tr.innerHTML = renderReadOnlyRecordRow(record);
    }
    tbody.appendChild(tr);
  });

  tbody.onclick = (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const editId = button.dataset.edit;
    const saveId = button.dataset.save;
    const cancelId = button.dataset.cancel;
    const deleteId = button.dataset.delete;
    if (editId) startInlineEdit(editId);
    if (saveId) saveInlineRecord(saveId, button.closest("tr"));
    if (cancelId) cancelInlineEdit();
    if (deleteId) deleteRecord(deleteId);
  };
}

function renderReadOnlyRecordRow(record) {
  return `
    <td>${escapeHtml(record.date)}</td>
    <td>${escapeHtml(record.store)}</td>
    <td>${escapeHtml(record.machine)}</td>
    <td>${escapeHtml(record.unit)}</td>
    <td>${Number(record.games || 0).toLocaleString()}</td>
    <td>${record.bb}/${record.rb}</td>
    <td>${rateText(record.totalRate)}</td>
    <td>${formatDiff(record.diff)}</td>
    <td>${ratingPill(record.rating)}</td>
    <td class="reason-cell">${escapeHtml(record.reason || "")}</td>
    <td class="memo-cell">${escapeHtml(record.memo || "")}</td>
    <td class="row-actions">
      <button class="secondary" data-edit="${record.id}" type="button" title="一覧上で編集">編集</button>
      <button class="danger icon" data-delete="${record.id}" type="button" title="削除">×</button>
    </td>
  `;
}

function renderDiffEditInput(record) {
  return `<input
    type="text"
    inputmode="text"
    autocomplete="off"
    autocorrect="off"
    spellcheck="false"
    pattern="[\\-ー－−―ｰ–—‐]?[0-9０-９,，]*"
    data-edit-field="diff"
    value="${escapeHtml(Number(record.diff || 0))}"
    placeholder="例：ー500 / -500"
  >`;
}

function renderEditableRecordRow(record) {
  return `
    <td><input type="date" data-edit-field="date" value="${escapeHtml(record.date)}"></td>
    <td><input data-edit-field="store" value="${escapeHtml(record.store)}"></td>
    <td><input data-edit-field="machine" value="${escapeHtml(record.machine)}"></td>
    <td><input data-edit-field="unit" value="${escapeHtml(record.unit)}"></td>
    <td><input type="number" inputmode="numeric" data-edit-field="games" value="${Number(record.games || 0)}"></td>
    <td class="inline-pair">
      <input type="number" inputmode="numeric" data-edit-field="bb" aria-label="BB" value="${Number(record.bb || 0)}">
      <input type="number" inputmode="numeric" data-edit-field="rb" aria-label="RB" value="${Number(record.rb || 0)}">
    </td>
    <td>${rateText(record.totalRate)}</td>
    <td>${renderDiffEditInput(record)}</td>
    <td>${ratingPill(record.rating)}</td>
    <td class="reason-cell">${escapeHtml(record.reason || "")}</td>
    <td><textarea data-edit-field="memo" rows="3">${escapeHtml(record.memo || "")}</textarea></td>
    <td class="row-actions">
      <button class="secondary" data-save="${record.id}" type="button" title="保存">保存</button>
      <button data-cancel="${record.id}" type="button" title="キャンセル">キャンセル</button>
    </td>
  `;
}

function startInlineEdit(id) {
  state.editingRecordId = id;
  renderRecords();
}

function cancelInlineEdit() {
  state.editingRecordId = null;
  renderRecords();
}

function saveInlineRecord(id, row) {
  saveRecordFromRow(id, row);
}

function saveRecordFromRow(id, row) {
  const index = state.records.findIndex((item) => item.id === id);
  if (!row || index === -1) return;

  const original = state.records[index];
  const updated = {
    ...original,
    date: getInlineFieldValue(row, "date"),
    store: getInlineFieldValue(row, "store").trim(),
    machine: getInlineFieldValue(row, "machine").trim(),
    unit: getInlineFieldValue(row, "unit").trim(),
    games: numberValue(getInlineFieldValue(row, "games")),
    bb: numberValue(getInlineFieldValue(row, "bb")),
    rb: numberValue(getInlineFieldValue(row, "rb")),
    diff: numberValue(getInlineFieldValue(row, "diff")),
    memo: getInlineFieldValue(row, "memo").trim()
  };

  if (!updated.date || !updated.store || !updated.machine) {
    alert("日付、店舗、機種を入力してください。");
    return;
  }

  const rates = calculateRates(updated.games, updated.bb, updated.rb);
  const evaluation = evaluateRecord({ ...updated, ...rates });
  Object.assign(updated, {
    bbRate: rates.bb,
    rbRate: rates.rb,
    totalRate: rates.total,
    rating: evaluation.rating || "要確認",
    expectation: evaluation.expectation || 0,
    confidence: evaluation.confidence || "低",
    reason: evaluation.reason || "手動入力データです。",
    nearestSettings: evaluation.nearestSettings || "-",
    updatedAt: new Date().toISOString()
  });

  state.records[index] = updated;
  saveStoreName(updated.store);
  saveJson(STORAGE_KEYS.records, state.records);
  state.editingRecordId = null;
  renderAll();
}

function getInlineFieldValue(row, field) {
  return $(`[data-edit-field="${field}"]`, row)?.value || "";
}

function editRecord(id) {
  startInlineEdit(id);
}

function deleteRecord(id) {
  if (!confirm("このデータを削除しますか？")) return;
  state.records = state.records.filter((item) => item.id !== id);
  saveJson(STORAGE_KEYS.records, state.records);
  renderAll();
}

function bindSummary() {
  ["summaryGroup", "specialFrom", "specialTo", "specialDay", "specialWeekday", "specialStore", "specialMachine", "specialUnit", "specialMemoTag", "specialRating", "specialDouble", "specialPositive", "specialAOnly"].forEach((id) => {
    const element = $(`#${id}`);
    if (!element) return;
    element.addEventListener("input", () => {
      if (["specialFrom", "specialTo", "specialDay", "specialWeekday", "specialStore", "specialMachine", "specialDouble"].includes(id)) renderSummaryFilterOptions();
      renderSummary();
    });
  });
  $("#summaryBulkAddTagButton")?.addEventListener("click", () => bulkUpdateSummaryMemoTags("add"));
  $("#summaryBulkRemoveTagButton")?.addEventListener("click", () => bulkUpdateSummaryMemoTags("remove"));
  $("#openRecordsWithSummaryFiltersButton")?.addEventListener("click", openRecordsWithSummaryFilters);
}

function getSummaryFilters() {
  return {
    from: $("#specialFrom")?.value || "",
    to: $("#specialTo")?.value || "",
    day: Number($("#specialDay")?.value || 0),
    weekday: $("#specialWeekday")?.value ?? "",
    store: $("#specialStore")?.value || "",
    machine: $("#specialMachine")?.value || "",
    unit: $("#specialUnit")?.value || "",
    memoTag: $("#specialMemoTag")?.value || "",
    rating: $("#specialRating")?.value || "",
    double: Boolean($("#specialDouble")?.checked),
    positive: Boolean($("#specialPositive")?.checked),
    aOnly: Boolean($("#specialAOnly")?.checked)
  };
}

function matchesSummaryDateFilters(record, filters) {
  const date = new Date(`${record.date}T00:00:00`);
  if (filters.from && record.date < filters.from) return false;
  if (filters.to && record.date > filters.to) return false;
  if (filters.day && date.getDate() !== filters.day) return false;
  if (filters.weekday !== "" && date.getDay() !== Number(filters.weekday)) return false;
  if (filters.double && !isDoubleDay(date)) return false;
  return true;
}

function specialFilteredRecords() {
  const filters = getSummaryFilters();
  return state.records.filter((record) => {
    if (!matchesSummaryDateFilters(record, filters)) return false;
    if (filters.store && record.store !== filters.store) return false;
    if (filters.machine && record.machine !== filters.machine) return false;
    if (filters.unit && String(record.unit) !== filters.unit) return false;
    if (filters.memoTag && !recordHasMemoTag(record, filters.memoTag)) return false;
    if (filters.rating && record.rating !== filters.rating) return false;
    if (filters.positive && record.diff <= 0) return false;
    if (filters.aOnly && record.rating !== "A") return false;
    return true;
  });
}

function isDoubleDay(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return month === day || [11, 22].includes(day);
}

function renderSummary() {
  renderSummaryFilterOptions();
  const records = specialFilteredRecords();
  const groupKey = $("#summaryGroup").value;
  const groups = buildSummaryGroups(records, groupKey);
  const cards = $("#summaryCards");
  cards.innerHTML = "";
  $("#specialSummary").textContent = buildSpecialSummaryText(records);

  Object.entries(groups).sort(([a], [b]) => compareSummaryGroupLabels(a, b, groupKey)).forEach(([key, items]) => {
    const stats = calculateStats(items);
    const card = document.createElement("article");
    card.className = "summary-card";
    card.innerHTML = `
      <span>${escapeHtml(key)}</span>
      <strong>${stats.count}台</strong>
      <p class="muted">平均G ${stats.avgGames.toLocaleString()} / BIG ${rateText(stats.avgBbRate)} / REG ${rateText(stats.avgRbRate)} / 合算 ${rateText(stats.avgTotalRate)}</p>
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
  renderSummaryRecords(records);
}

function buildSummaryGroups(records, groupKey) {
  if (groupKey === "memoTag") {
    return records.reduce((groups, record) => {
      const tags = splitMemoParts(record.memo);
      (tags.length ? tags : ["メモなし"]).forEach((tag) => {
        groups[tag] ??= [];
        groups[tag].push(record);
      });
      return groups;
    }, {});
  }
  if (groupKey === "weekday") return groupBy(records, (record) => weekdayLabel(new Date(`${record.date}T00:00:00`).getDay()));
  if (groupKey === "monthDay") return groupBy(records, (record) => `${new Date(`${record.date}T00:00:00`).getDate()}日`);
  if (groupKey === "unitRange") return groupBy(records, (record) => unitRangeLabel(record.unit));
  return groupBy(records, (record) => record[groupKey] || "未入力");
}


function compareSummaryGroupLabels(a, b, groupKey) {
  if (["monthDay", "unitRange", "unit"].includes(groupKey)) {
    const an = Number(normalizeNumberText(a));
    const bn = Number(normalizeNumberText(b));
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  }
  if (groupKey === "weekday") {
    const order = { "日": 0, "月": 1, "火": 2, "水": 3, "木": 4, "金": 5, "土": 6 };
    if (order[a] !== undefined && order[b] !== undefined) return order[a] - order[b];
  }
  return a.localeCompare(b, "ja");
}

function weekdayLabel(day) {
  return ["日", "月", "火", "水", "木", "金", "土"][day] || "未入力";
}

function unitRangeLabel(unit) {
  const number = Number(normalizeNumberText(unit));
  if (!Number.isFinite(number)) return "番号不明";
  const start = Math.floor(number / 10) * 10;
  return `${start}〜${start + 9}`;
}

function buildSpecialSummaryText(records) {
  const stats = calculateStats(records);
  const conditions = [];
  const filters = getSummaryFilters();
  if (filters.from) conditions.push(`開始:${filters.from}`);
  if (filters.to) conditions.push(`終了:${filters.to}`);
  if (filters.store) conditions.push(filters.store);
  if (filters.machine) conditions.push(filters.machine);
  if (filters.unit) conditions.push(`${filters.unit}番`);
  if (filters.day) conditions.push(`毎月${filters.day}日`);
  if (filters.double) conditions.push("ゾロ目日");
  if (filters.memoTag) conditions.push(`メモ:${filters.memoTag}`);
  if (filters.rating) conditions.push(`評価:${filters.rating}`);
  if (filters.positive) conditions.push("差枚プラスのみ");
  if (filters.aOnly) conditions.push("A評価のみ");
  const weekday = $("#specialWeekday");
  if (filters.weekday !== "") conditions.push(`${weekday.options[weekday.selectedIndex].text}曜日`);
  return `検索条件：${conditions.join("・") || "全データ"} / 対象件数：${stats.count}件 / A評価：${stats.aCount}件 / 平均G：${stats.avgGames.toLocaleString()} / 平均差枚：${formatDiff(stats.avgDiff)} / 平均BB：${rateText(stats.avgBbRate)} / 平均REG：${rateText(stats.avgRbRate)} / 平均合算：${rateText(stats.avgTotalRate)} / プラス率：${stats.positiveRate}%`;
}

function renderSummaryRecords(records) {
  const tbody = $("#summaryRecordsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  records.slice().sort((a, b) => compareBySort(a, b)).forEach((record) => {
    const tr = document.createElement("tr");
    if (state.editingRecordId === record.id) {
      tr.className = "editing-row";
      tr.innerHTML = renderSummaryEditableRecordRow(record);
    } else {
      tr.innerHTML = renderSummaryReadOnlyRecordRow(record);
    }
    tbody.appendChild(tr);
  });

  tbody.onclick = (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.summaryEdit) {
      state.editingRecordId = button.dataset.summaryEdit;
      renderSummary();
    }
    if (button.dataset.summarySave) saveRecordFromRow(button.dataset.summarySave, button.closest("tr"));
    if (button.dataset.summaryCancel) {
      state.editingRecordId = null;
      renderSummary();
    }
  };
}

function renderSummaryReadOnlyRecordRow(record) {
  return `
    <td>${escapeHtml(record.date)}</td>
    <td>${escapeHtml(record.store)}</td>
    <td>${escapeHtml(record.machine)}</td>
    <td>${escapeHtml(record.unit)}</td>
    <td>${Number(record.games || 0).toLocaleString()}</td>
    <td>${record.bb}/${record.rb}</td>
    <td>${rateText(record.totalRate)}</td>
    <td>${formatDiff(record.diff)}</td>
    <td>${ratingPill(record.rating)}</td>
    <td class="memo-cell">${escapeHtml(record.memo || "")}</td>
    <td class="row-actions"><button class="secondary" data-summary-edit="${record.id}" type="button">編集</button></td>
  `;
}

function renderSummaryEditableRecordRow(record) {
  return `
    <td><input type="date" data-edit-field="date" value="${escapeHtml(record.date)}"></td>
    <td><input data-edit-field="store" value="${escapeHtml(record.store)}"></td>
    <td><input data-edit-field="machine" value="${escapeHtml(record.machine)}"></td>
    <td><input data-edit-field="unit" value="${escapeHtml(record.unit)}"></td>
    <td><input type="number" inputmode="numeric" data-edit-field="games" value="${Number(record.games || 0)}"></td>
    <td class="inline-pair">
      <input type="number" inputmode="numeric" data-edit-field="bb" aria-label="BB" value="${Number(record.bb || 0)}">
      <input type="number" inputmode="numeric" data-edit-field="rb" aria-label="RB" value="${Number(record.rb || 0)}">
    </td>
    <td>${rateText(record.totalRate)}</td>
    <td>${renderDiffEditInput(record)}</td>
    <td>${ratingPill(record.rating)}</td>
    <td><textarea data-edit-field="memo" rows="3">${escapeHtml(record.memo || "")}</textarea></td>
    <td class="row-actions">
      <button class="secondary" data-summary-save="${record.id}" type="button">保存</button>
      <button data-summary-cancel="${record.id}" type="button">キャンセル</button>
    </td>
  `;
}

function bulkUpdateSummaryMemoTags(mode) {
  const tags = getSelectedMemoTags("#summaryBulkMemoTags");
  if (!tags.length) {
    alert("一括操作するメモタグを選択してください。");
    return;
  }
  updateMemoTagsForRecords(specialFilteredRecords(), tags, mode, "現在の集計対象");
}

function openRecordsWithSummaryFilters() {
  const records = specialFilteredRecords();
  const filters = getSummaryFilters();
  state.recordsScopeIds = new Set(records.map((record) => record.id));
  state.suppressRecordFilterClear = true;
  setSelectValue("#filterStore", filters.store);
  renderFilterOptions();
  setSelectValue("#filterMachine", filters.machine);
  renderFilterOptions();
  setSelectValue("#filterUnit", filters.unit);
  setSelectValue("#filterMemoTag", filters.memoTag);
  setSelectValue("#filterRating", filters.rating);
  $("#filterPositive").checked = filters.positive;
  $("#filterAOnly").checked = filters.aOnly;
  $("#filterDate").value = filters.from && filters.from === filters.to ? filters.from : "";
  renderFilterOptions();
  ["#filterStoreText", "#filterMachineText", "#filterUnitText"].forEach((selector) => {
    const input = $(selector);
    if (input) input.value = "";
  });
  state.suppressRecordFilterClear = false;
  $(".tab-button[data-tab='records']").click();
  renderRecords();
}

function setSelectValue(selector, value) {
  const select = $(selector);
  if (!select) return;
  select.value = [...select.options].some((option) => option.value === value) ? value : "";
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


function bindAnalysis() {
  ["analysisStore", "analysisMachine", "analysisFrom", "analysisTo", "analysisRangeMode", "analysisCustomRanges"].forEach((id) => {
    const element = $(`#${id}`);
    if (!element) return;

    const handler = () => {
      state.analysisSelection = null;
      renderAnalysis();
    };

    element.addEventListener("input", handler);
    element.addEventListener("change", handler);
  });
  $("#unitHeatmap").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-unit-key]");
    if (!button) return;
    state.analysisSelection = button.dataset.unitKey;
    renderAnalysis();
    $("#unitDetailPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function getAnalysisRecords() {
  const store = $("#analysisStore").value;
  const machine = $("#analysisMachine").value;
  const from = $("#analysisFrom").value;
  const to = $("#analysisTo").value;
  return state.records.filter((record) => {
    if (store && record.store !== store) return false;
    if (machine && record.machine !== machine) return false;
    if (from && record.date < from) return false;
    if (to && record.date > to) return false;
    return true;
  });
}

function renderAnalysis() {
  if (!$("#analysisStore")) return;
  renderAnalysisOptions();
  const records = getAnalysisRecords();
  renderAnalysisKpis(records);
  renderUnitHeatmap(records);
  renderUnitDetail(records);
  renderSpecialDateAnalysis(records);
  renderRangeAnalysis(records);
  renderAnalysisRanking(records);
}

function renderAnalysisOptions() {
  const currentStore = $("#analysisStore").value;
  const currentMachine = $("#analysisMachine").value;
  const stores = unique(state.records.map((record) => record.store));
  const machines = unique(state.records.map((record) => record.machine));
  $("#analysisStore").innerHTML = `<option value="">全店舗</option>${stores.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  $("#analysisMachine").innerHTML = `<option value="">全機種</option>${machines.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  if (stores.includes(currentStore)) $("#analysisStore").value = currentStore;
  if (machines.includes(currentMachine)) $("#analysisMachine").value = currentMachine;
}

function renderAnalysisKpis(records) {
  const stats = calculateStats(records);
  const dates = records.map((record) => record.date).sort();
  const latestDate = dates[dates.length - 1] || "-";
  const cards = [
    ["対象データ", `${stats.count}件`, `直近日 ${latestDate}`],
    ["平均差枚", formatDiff(stats.avgDiff), `プラス率 ${stats.positiveRate}%`],
    ["平均RB", rateText(stats.avgRbRate), `平均合算 ${rateText(stats.avgTotalRate)}`],
    ["A評価", `${stats.aCount}件`, `A評価率 ${percentage(stats.aCount, stats.count)}%`]
  ];
  $("#analysisKpis").innerHTML = cards.map(([label, value, note]) => `
    <article class="analysis-kpi"><span>${label}</span><strong>${value}</strong><p>${note}</p></article>
  `).join("");
}

function renderUnitHeatmap(records) {
  const target = $("#unitHeatmap");
  const grouped = Object.values(groupBy(records, unitGroupKey)).map(buildUnitStats).sort(compareUnitStats);
  if (!grouped.length) {
    target.innerHTML = `<div class="empty-card">条件に合う保存データがありません。</div>`;
    return;
  }
  target.innerHTML = grouped.map((stats) => {
    const classes = ["heatmap-card", stats.avgDiff >= 0 ? "diff-plus" : "diff-minus"];
    if (stats.avgRbRate && stats.avgRbRate <= 300) classes.push("rb-strong");
    if (stats.aCount >= 2) classes.push("a-strong");
    if (state.analysisSelection === stats.key) classes.push("selected");
    return `
      <button class="${classes.join(" ")}" data-unit-key="${escapeHtml(stats.key)}" type="button">
        <span class="heatmap-unit">${escapeHtml(stats.unit)}番</span>
        <span class="heatmap-sub">${escapeHtml(stats.store)} / ${escapeHtml(stats.machine)}</span>
        <span class="heatmap-main">平均差枚 ${formatDiff(stats.avgDiff)}</span>
        <span>件数 ${stats.count} / 平均G ${stats.avgGames}</span>
        <span>プラス ${stats.positiveRate}% / A ${stats.aCount}回</span>
        <span>BB ${rateText(stats.avgBbRate)} / RB ${rateText(stats.avgRbRate)} / 合算 ${rateText(stats.avgTotalRate)}</span>
        <span>直近 ${formatDiff(stats.latestDiff)} / 直近3回 ${formatDiff(stats.recent3Diff)}</span>
      </button>
    `;
  }).join("");
}

function renderUnitDetail(records) {
  const grouped = groupBy(records, unitGroupKey);
  const selected = state.analysisSelection && grouped[state.analysisSelection]
    ? state.analysisSelection
    : Object.keys(grouped).sort((a, b) => compareUnitStats(buildUnitStats(grouped[a]), buildUnitStats(grouped[b])))[0];
  state.analysisSelection = selected || null;
  const items = selected ? grouped[selected].slice().sort((a, b) => b.date.localeCompare(a.date)) : [];
  const latest = items[0];
  $("#unitDetailHint").textContent = latest ? `${latest.store} / ${latest.machine} / ${latest.unit}番の履歴（新しい順）` : "ヒートマップの台番号を押すと時系列履歴を表示します。";
  $("#unitSignals").innerHTML = latest ? buildUnitSignals(items).map((text) => `<span class="signal-chip">${escapeHtml(text)}</span>`).join("") : "";
  $("#unitHistoryBody").innerHTML = items.map((record) => `
    <tr>
      <td>${escapeHtml(record.date)}</td><td>${escapeHtml(record.store)}</td><td>${escapeHtml(record.machine)}</td>
      <td>${formatDiff(record.diff)}</td><td>${Number(record.games || 0).toLocaleString()}</td><td>${record.bb || 0}</td><td>${record.rb || 0}</td>
      <td>${rateText(record.totalRate)}</td><td>${ratingPill(record.rating)}</td><td>${escapeHtml(record.memo || "")}</td>
    </tr>
  `).join("");
}

function renderSpecialDateAnalysis(records) {
  const dayEntries = Array.from({ length: 31 }, (_, index) => index + 1).map((day) => [`${day}日`, records.filter((record) => recordDate(record).getDate() === day)]);
  const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
  const weekdayEntries = weekdayLabels.map((label, index) => [`${label}曜日`, records.filter((record) => recordDate(record).getDay() === index)]);
  const doubleItems = records.filter((record) => isDoubleDay(recordDate(record)));
  renderAnalysisStatList($("#dayOfMonthAnalysis"), dayEntries, { limit: 31 });
  renderAnalysisStatList($("#weekdayAnalysis"), weekdayEntries, { limit: 7 });
  renderAnalysisStatList($("#doubleDayAnalysis"), [["ゾロ目日", doubleItems], ["通常日", records.filter((record) => !isDoubleDay(recordDate(record)))]]);
}

function renderAnalysisStatList(target, entries, options = {}) {
  const rows = entries.map(([label, items]) => ({ label, items, stats: calculateStats(items) }))
    .filter((row) => row.stats.count > 0)
    .sort((a, b) => b.stats.avgDiff - a.stats.avgDiff)
    .slice(0, options.limit || 12);
  target.innerHTML = rows.length ? rows.map(({ label, stats }) => analysisStatRow(label, stats)).join("") : `<div class="empty-card">該当データなし</div>`;
}

function analysisStatRow(label, stats) {
  const strength = stats.avgDiff >= 500 || stats.positiveRate >= 60 || percentage(stats.aCount, stats.count) >= 30 ? "strong" : stats.avgDiff < 0 ? "weak" : "normal";
  return `
    <article class="analysis-row ${strength}">
      <strong>${escapeHtml(label)}</strong>
      <span>対象 ${stats.count}台</span>
      <span>平均差枚 ${formatDiff(stats.avgDiff)}</span>
      <span>プラス ${stats.positiveRate}%</span>
      <span>平均RB ${rateText(stats.avgRbRate)}</span>
      <span>A評価率 ${percentage(stats.aCount, stats.count)}%</span>
    </article>
  `;
}

function renderRangeAnalysis(records) {
  const ranges = buildUnitRanges(records);
  const summary = analysisRangeSummary();
  const summaryTarget = $("#analysisRangeSummary");
  if (summaryTarget) summaryTarget.textContent = summary;
  $("#rangeAnalysis").innerHTML = ranges.length ? ranges.map(({ label, items }) => analysisStatRow(label, calculateStats(items))).join("") : `<div class="empty-card">${escapeHtml(summary === "番号帯：10台単位" ? "番号帯を作れるデータがありません。" : summary)}</div>`;
}

function renderAnalysisRanking(records) {
  const ranges = buildUnitRanges(records);
  const rangeByUnit = new Map();
  ranges.forEach(({ label, items }) => items.forEach((record) => rangeByUnit.set(unitGroupKey(record), { label, stats: calculateStats(items) })));
  const grouped = Object.values(groupBy(records, unitGroupKey));
  const candidates = grouped.map((items) => buildAimCandidate(items, rangeByUnit.get(unitGroupKey(items[0]))))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  renderRanking($("#analysisRanking"), candidates.length ? candidates.map((item, index) => ({
    title: `${index + 1}位：${item.latest.unit}番 ${item.latest.machine}（${item.score}pt）`,
    rating: item.score >= 70 ? "A" : item.score >= 42 ? "B" : "C",
    body: `${item.latest.store}。理由：${item.reasons.join("＋") || "履歴少なめ"}。直近 ${formatDiff(item.latest.diff)} / 番号帯 ${item.rangeLabel || "未分類"}`
  })) : [{ title: "候補なし", rating: "要確認", body: "条件に合う保存データがありません。" }]);
}

function buildAimCandidate(items, rangeInfo) {
  const sorted = items.slice().sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  const day = recordDate(latest).getDate();
  const weekday = recordDate(latest).getDay();
  const sameDay = items.filter((record) => recordDate(record).getDate() === day);
  const sameWeekday = items.filter((record) => recordDate(record).getDay() === weekday);
  const doubleItems = items.filter((record) => isDoubleDay(recordDate(record)));
  const aCount = items.filter((record) => record.rating === "A").length;
  const strongReg = items.filter((record) => record.rbRate && record.rbRate <= 300 && record.games >= 2500).length;
  const recent3 = sorted.slice(0, 3);
  const recentDip = recent3.reduce((sum, record) => sum + Number(record.diff || 0), 0) <= -1000 || latest.diff <= -1000;
  const rangeStrong = rangeInfo?.stats?.avgDiff > 0 || rangeInfo?.stats?.positiveRate >= 55;
  let score = sameDay.length * 8 + sameWeekday.length * 4 + doubleItems.length * 6 + aCount * 12 + strongReg * 10;
  if (recentDip) score += 14;
  if (rangeStrong) score += 12;
  const reasons = [];
  if (recentDip) reasons.push("直近凹み");
  if (sameDay.length >= 2) reasons.push("同日付実績");
  if (sameWeekday.length >= 2) reasons.push("同曜日実績");
  if (doubleItems.length) reasons.push("ゾロ目日実績");
  if (aCount) reasons.push(`A評価${aCount}回`);
  if (strongReg) reasons.push("RB確率強め");
  if (rangeStrong) reasons.push("番号帯強め");
  return { latest, score, reasons, rangeLabel: rangeInfo?.label || "" };
}

function buildUnitStats(items) {
  const sorted = items.slice().sort((a, b) => b.date.localeCompare(a.date));
  const stats = calculateStats(items);
  return {
    ...stats,
    key: unitGroupKey(items[0]),
    store: items[0].store,
    machine: items[0].machine,
    unit: items[0].unit,
    latestDiff: Number(sorted[0]?.diff || 0),
    recent3Diff: sorted.slice(0, 3).reduce((sum, record) => sum + Number(record.diff || 0), 0)
  };
}

function compareUnitStats(a, b) {
  return numberValue(a.unit) - numberValue(b.unit) || a.store.localeCompare(b.store, "ja") || a.machine.localeCompare(b.machine, "ja");
}

function buildUnitSignals(items) {
  const sorted = items.slice().sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  const recent3Diff = sorted.slice(0, 3).reduce((sum, record) => sum + Number(record.diff || 0), 0);
  const signals = [];
  if (latest?.diff <= -1000 || recent3Diff <= -1500) signals.push("直近凹み：上げ候補として要確認");
  if (latest?.rating === "A" && latest.diff < 0) signals.push("据え置き候補：数値強めで差枚マイナス");
  if (sorted.slice(0, 2).every((record) => record?.rating === "A")) signals.push("据え置き候補：A評価が連続");
  if (sorted.some((record) => record.rbRate && record.rbRate <= 300)) signals.push("RB良好履歴あり");
  return signals.length ? signals : ["大きな凹み・据え置きサインは弱め"];
}

function buildUnitRanges(records) {
  const mode = $("#analysisRangeMode")?.value || "10";
  const customRanges = parseCustomRanges($("#analysisCustomRanges")?.value);
  if (mode === "custom") {
    if (!customRanges.length) return [];
    return customRanges.map((range) => ({
      label: `${range.from}〜${range.to}`,
      items: records.filter((record) => numberValue(record.unit) >= range.from && numberValue(record.unit) <= range.to)
    })).filter((range) => range.items.length);
  }
  const groups = groupBy(records.filter((record) => numberValue(record.unit) > 0), (record) => {
    const unit = numberValue(record.unit);
    const start = Math.floor(unit / 10) * 10;
    return `${start}〜${start + 9}`;
  });
  return Object.entries(groups).sort(([a], [b]) => numberValue(a) - numberValue(b)).map(([label, items]) => ({ label, items }));
}

function analysisRangeSummary() {
  const mode = $("#analysisRangeMode")?.value || "10";
  if (mode !== "custom") return "番号帯：10台単位";
  const customRanges = parseCustomRanges($("#analysisCustomRanges")?.value);
  if (!customRanges.length) return "任意範囲が未設定です";
  return `番号帯：${customRanges.map((range) => `${range.from}〜${range.to}`).join(" / ")}`;
}

function parseCustomRanges(value) {
  const text = String(value || "").normalize("NFKC").trim();
  if (!text) return [];

  const ranges = [];
  const chunks = text.split(/[,、]/);
  for (const chunk of chunks) {
    const match = chunk.trim().match(/^(\d+)\s*[-〜~ー－～]\s*(\d+)$/);
    if (!match) return [];
    const from = Number(match[1]);
    const to = Number(match[2]);
    ranges.push({ from: Math.min(from, to), to: Math.max(from, to) });
  }
  return ranges;
}

function unitGroupKey(record) {
  return `${record.store}__${record.machine}__${record.unit}`;
}

function recordDate(record) {
  return new Date(`${record.date}T00:00:00`);
}

function percentage(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function bindRecommendations() {
  ["recommendDate", "recommendSpecialType", "recommendStore", "recommendMachine", "recommendMemoTags"].forEach((id) => {
    const element = $(`#${id}`);
    if (!element) return;
    element.addEventListener("input", renderRecommendations);
    element.addEventListener("change", renderRecommendations);
  });
  $("#makeRecommendButton").addEventListener("click", renderRecommendations);
}

function renderRecommendations() {
  const targetDate = $("#recommendDate").value;
  const specialType = $("#recommendSpecialType")?.value || "normal";
  const store = $("#recommendStore").value.trim();
  const machine = $("#recommendMachine").value.trim();
  const memoTags = getSelectedMemoTags("#recommendMemoTags");
  const target = targetDate ? new Date(`${targetDate}T00:00:00`) : new Date();

  const base = state.records.filter((record) => {
    if (store && record.store !== store) return false;
    if (machine && record.machine !== machine) return false;
    if (targetDate && record.date >= targetDate) return false;
    if (memoTags.length && !memoTags.some((tag) => recordHasMemoTag(record, tag))) return false;
    return true;
  });

  const context = buildRecommendationContext(target, specialType, { targetDate, store, machine, memoTags, count: base.length });
  const byUnit = groupBy(base, (record) => `${record.store}__${record.machine}__${record.unit}`);
  const candidates = Object.values(byUnit)
    .map((items) => buildRecommendationCandidate(items, context, base))
    .sort((a, b) => b.score - a.score || b.stats.count - a.stats.count || String(a.unit).localeCompare(String(b.unit), "ja"))
    .slice(0, 10)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  const summary = $("#recommendSummary");
  if (summary) summary.textContent = buildRecommendationSummary(context, base.length, candidates.length);
  renderRecommendationRanking($("#recommendList"), candidates.length ? candidates : [{
    empty: true,
    title: "候補なし",
    rating: "要確認",
    body: "条件に合う保存データがありません。まずは台データを保存してください。"
  }]);
}

function buildRecommendationContext(target, specialType, filters) {
  const day = target.getDate();
  const weekday = target.getDay();
  const targetIsDouble = isDoubleDay(target);
  const activeType = specialType === "normal" && targetIsDouble ? "double" : specialType;
  const multipliers = {
    sameDay: activeType === "same-day" ? 1.7 : activeType === "normal" ? 1.2 : 1,
    weekday: activeType === "same-weekday" ? 1.7 : activeType === "normal" ? 1.15 : 1,
    double: activeType === "double" ? 1.9 : targetIsDouble ? 1.45 : 0.75,
    recentDip: activeType === "recent-dip" ? 1.9 : activeType === "normal" ? 1.25 : 1,
    stable: activeType === "recent-dip" ? 0.85 : 1
  };
  return { target, day, weekday, targetIsDouble, specialType, activeType, multipliers, filters };
}

function buildRecommendationSummary(context, recordCount, candidateCount) {
  const labels = {
    normal: "通常日",
    "same-day": "毎月同じ日付",
    double: "ゾロ目日",
    "same-weekday": "同じ曜日",
    "recent-dip": "直近凹み狙い"
  };
  const focus = [];
  if (context.activeType === "double") focus.push("ゾロ目日の過去実績を強めに評価");
  if (context.activeType === "same-day" || context.activeType === "normal") focus.push(`過去の毎月${context.day}日を評価`);
  if (context.activeType === "same-weekday" || context.activeType === "normal") focus.push(`${weekdayName(context.weekday)}曜日のREG・差枚傾向を評価`);
  if (context.activeType === "recent-dip" || context.activeType === "normal") focus.push("直近3回差枚と大きな凹みを評価");
  if (context.specialType === "normal" && context.targetIsDouble) focus.push("指定日がゾロ目日のため自動でゾロ目比重を上乗せ");
  const filterText = [
    context.filters.store ? `店舗:${context.filters.store}` : "全店舗",
    context.filters.machine ? `機種:${context.filters.machine}` : "全機種",
    context.filters.memoTags.length ? `メモ:${context.filters.memoTags.join("、")}` : "メモ指定なし"
  ].join(" / ");
  return `特定日タイプ：${labels[context.specialType] || "通常日"} / ${filterText} / 対象${recordCount}件 / 候補${candidateCount}台。${focus.join("、")}します。`;
}

function buildRecommendationCandidate(items, context, base) {
  const sorted = items.slice().sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  const { day, weekday, multipliers, targetIsDouble } = context;
  const sameDay = items.filter((record) => getRecordDate(record).getDate() === day);
  const sameWeekday = items.filter((record) => getRecordDate(record).getDay() === weekday);
  const doubleDay = items.filter((record) => isDoubleDay(getRecordDate(record)));
  const sameDouble = targetIsDouble || context.activeType === "double" ? doubleDay : [];
  const recent = sorted.slice(0, 3);
  const stats = calculateStats(items);
  const sameDayStats = calculateStats(sameDay);
  const sameWeekdayStats = calculateStats(sameWeekday);
  const sameDoubleStats = calculateStats(sameDouble);
  const recentDiffTotal = recent.reduce((sum, record) => sum + Number(record.diff || 0), 0);
  const recentBigDipCount = recent.filter((record) => Number(record.diff || 0) <= -1000).length;
  const latestBigDip = Number(latest.diff || 0) <= -1000;
  const rbGoodCount = items.filter(isGoodRbRecord).length;
  const sameDayRbGoodCount = sameDay.filter(isGoodRbRecord).length;
  const sameWeekdayRbGoodCount = sameWeekday.filter(isGoodRbRecord).length;
  const doubleRbGoodCount = sameDouble.filter(isGoodRbRecord).length;
  const bandItems = getSameBandRecords(latest, base);
  const bandStats = calculateStats(bandItems);
  const bandAcount = bandItems.filter((record) => record.rating === "A").length;
  const bandRbGoodCount = bandItems.filter(isGoodRbRecord).length;
  const scoreParts = [];

  addScorePart(scoreParts, sameDay.length * 6 * multipliers.sameDay, sameDay.length ? `毎月${day}日の実績${sameDay.length}件` : "");
  addScorePart(scoreParts, sameDayStats.aCount * 8 * multipliers.sameDay, sameDayStats.aCount ? `毎月${day}日のA評価${sameDayStats.aCount}回` : "");
  addScorePart(scoreParts, sameDayRbGoodCount * 4 * multipliers.sameDay, sameDayRbGoodCount ? `毎月${day}日のREG良好${sameDayRbGoodCount}回` : "");
  addScorePart(scoreParts, sameDayStats.avgDiff > 0 ? 6 * multipliers.sameDay : 0, sameDayStats.avgDiff > 0 ? `毎月${day}日の平均差枚 ${formatDiff(sameDayStats.avgDiff)}` : "");

  addScorePart(scoreParts, sameWeekday.length * 3 * multipliers.weekday, sameWeekday.length ? `${weekdayName(weekday)}曜日の実績${sameWeekday.length}件` : "");
  addScorePart(scoreParts, sameWeekdayStats.aCount * 5 * multipliers.weekday, sameWeekdayStats.aCount ? `${weekdayName(weekday)}曜日のA評価${sameWeekdayStats.aCount}回` : "");
  addScorePart(scoreParts, sameWeekdayRbGoodCount * 5 * multipliers.weekday, sameWeekdayRbGoodCount ? `同曜日のREG良好${sameWeekdayRbGoodCount}回` : "");
  addScorePart(scoreParts, sameWeekdayStats.avgRbRate && sameWeekdayStats.avgRbRate <= 330 ? 10 * multipliers.weekday : 0, sameWeekdayStats.avgRbRate && sameWeekdayStats.avgRbRate <= 330 ? `同曜日の平均REG ${rateText(sameWeekdayStats.avgRbRate)}` : "");

  addScorePart(scoreParts, sameDouble.length * 6 * multipliers.double, sameDouble.length ? `ゾロ目日の実績${sameDouble.length}件` : "");
  addScorePart(scoreParts, sameDoubleStats.aCount * 9 * multipliers.double, sameDoubleStats.aCount ? `ゾロ目日のA評価${sameDoubleStats.aCount}回` : "");
  addScorePart(scoreParts, doubleRbGoodCount * 5 * multipliers.double, doubleRbGoodCount ? `ゾロ目日のREG良好${doubleRbGoodCount}回` : "");
  addScorePart(scoreParts, sameDoubleStats.avgDiff > 0 ? 8 * multipliers.double : 0, sameDoubleStats.avgDiff > 0 ? `ゾロ目日の平均差枚 ${formatDiff(sameDoubleStats.avgDiff)}` : "");

  addScorePart(scoreParts, stats.aCount * 9 * multipliers.stable, stats.aCount ? `台番号ごとのA評価${stats.aCount}回` : "");
  addScorePart(scoreParts, rbGoodCount * 5 * multipliers.stable, rbGoodCount ? `RB確率良好${rbGoodCount}回` : "");
  addScorePart(scoreParts, stats.avgRbRate && stats.avgRbRate <= 300 ? 16 * multipliers.stable : stats.avgRbRate && stats.avgRbRate <= 330 ? 10 * multipliers.stable : 0, stats.avgRbRate && stats.avgRbRate <= 330 ? `平均REG ${rateText(stats.avgRbRate)}` : "");
  addScorePart(scoreParts, stats.avgTotalRate && stats.avgTotalRate <= 145 ? 10 * multipliers.stable : stats.avgTotalRate && stats.avgTotalRate <= 155 ? 6 * multipliers.stable : 0, stats.avgTotalRate && stats.avgTotalRate <= 155 ? `平均合算 ${rateText(stats.avgTotalRate)}` : "");
  addScorePart(scoreParts, stats.avgDiff > 500 ? 12 * multipliers.stable : stats.avgDiff > 0 ? 6 * multipliers.stable : 0, stats.avgDiff > 0 ? `平均差枚 ${formatDiff(stats.avgDiff)}` : "");
  addScorePart(scoreParts, stats.positiveRate >= 60 ? 10 * multipliers.stable : stats.positiveRate >= 50 ? 5 * multipliers.stable : 0, stats.positiveRate >= 50 ? `プラス率${stats.positiveRate}%` : "");

  addScorePart(scoreParts, recentDiffTotal <= -2000 ? 14 * multipliers.recentDip : recentDiffTotal <= -1000 ? 8 * multipliers.recentDip : 0, recentDiffTotal <= -1000 ? `直近3回差枚合計 ${formatDiff(recentDiffTotal)}` : "");
  addScorePart(scoreParts, recentBigDipCount ? recentBigDipCount * 7 * multipliers.recentDip : 0, recentBigDipCount ? `直近で大きく凹み${recentBigDipCount}回` : "");
  addScorePart(scoreParts, latestBigDip ? 6 * multipliers.recentDip : 0, latestBigDip ? `最新履歴が${formatDiff(latest.diff)}で上げ候補` : "");

  addScorePart(scoreParts, bandStats.count >= 3 && bandStats.avgDiff > 0 ? 8 : 0, bandStats.count >= 3 && bandStats.avgDiff > 0 ? `同じ番号帯平均 ${formatDiff(bandStats.avgDiff)}` : "");
  addScorePart(scoreParts, bandStats.count >= 3 && bandStats.positiveRate >= 60 ? 6 : 0, bandStats.count >= 3 && bandStats.positiveRate >= 60 ? `同じ番号帯プラス率${bandStats.positiveRate}%` : "");
  addScorePart(scoreParts, bandAcount >= 2 ? 5 : 0, bandAcount >= 2 ? `同じ番号帯A評価${bandAcount}回` : "");
  addScorePart(scoreParts, bandRbGoodCount >= 2 ? 4 : 0, bandRbGoodCount >= 2 ? `同じ番号帯REG良好${bandRbGoodCount}回` : "");

  const penaltyParts = [];
  addScorePart(penaltyParts, stats.count <= 2 ? -10 : 0, stats.count <= 2 ? "データ件数が少ない" : "");
  addScorePart(penaltyParts, stats.avgDiff < -500 ? -8 : stats.avgDiff < 0 ? -4 : 0, stats.avgDiff < 0 ? "平均差枚は弱め" : "");
  addScorePart(penaltyParts, stats.aCount === 0 ? -6 : 0, stats.aCount === 0 ? "A評価回数が少ない" : "");
  addScorePart(penaltyParts, !stats.avgRbRate || stats.avgRbRate > 360 ? -8 : 0, !stats.avgRbRate || stats.avgRbRate > 360 ? "REG実績が不足" : "");
  addScorePart(penaltyParts, context.activeType === "recent-dip" && recent.length && recentDiffTotal > 0 ? -8 : recent.length && recentDiffTotal > 0 ? -3 : 0, recent.length && recentDiffTotal > 0 ? "直近もプラスのため上げ狙いとしては弱い" : "");
  addScorePart(penaltyParts, context.activeType === "double" && !sameDouble.length ? -8 : 0, context.activeType === "double" && !sameDouble.length ? "ゾロ目日の台別実績がない" : "");
  addScorePart(penaltyParts, context.activeType === "same-day" && !sameDay.length ? -6 : 0, context.activeType === "same-day" && !sameDay.length ? `毎月${day}日の台別実績がない` : "");

  const score = Math.max(0, Math.round([...scoreParts, ...penaltyParts].reduce((sum, part) => sum + part.points, 0)));
  return {
    title: `${latest.unit}番 ${latest.machine}`,
    unit: latest.unit,
    machine: latest.machine,
    store: latest.store,
    rating: score >= 75 ? "A" : score >= 42 ? "B" : "C",
    score,
    stats,
    averageDiff: stats.avgDiff,
    averageRbRate: stats.avgRbRate,
    recentDiffTotal,
    confidence: confidenceByCount(stats.count),
    reason: buildRecommendationReason(scoreParts, stats, sameDayStats, sameWeekdayStats, sameDoubleStats, bandStats, { context, recentDiffTotal, recentBigDipCount, latestBigDip }),
    concerns: buildRecommendationConcerns(penaltyParts, stats),
    recentHistory: recent.map(formatRecentHistory)
  };
}

function getRecordDate(record) {
  return new Date(`${record.date}T00:00:00`);
}

function isGoodRbRecord(record) {
  return Number(record.rbRate || 0) > 0 && Number(record.rbRate) <= 330 && Number(record.games || 0) >= 2500;
}

function addScorePart(parts, points, label) {
  if (!points || !label) return;
  parts.push({ points: Math.round(points), label });
}

function buildRecommendationReason(scoreParts, stats, sameDayStats, sameWeekdayStats, sameDoubleStats, bandStats, detail) {
  const positives = scoreParts.filter((part) => part.points > 0).sort((a, b) => b.points - a.points).map((part) => part.label);
  const phrases = positives.slice(0, 4);
  if (sameDayStats.count && sameDayStats.aCount) phrases.unshift(`毎月${detail.context.day}日の実績あり`);
  if ((detail.context.activeType === "double" || detail.context.targetIsDouble) && sameDoubleStats.count) phrases.unshift(`ゾロ目日でA評価${sameDoubleStats.aCount}回`);
  if (sameWeekdayStats.avgRbRate && sameWeekdayStats.avgRbRate <= 330) phrases.push(`同曜日のREG実績が強い`);
  if (bandStats.count >= 3 && bandStats.avgDiff > 0) phrases.push(`番号帯平均もプラス`);
  if (detail.latestBigDip || detail.recentBigDipCount) phrases.push(`直近${formatDiff(detail.recentDiffTotal)}で上げ狙い候補`);
  if (stats.avgDiff < 0 && (detail.latestBigDip || detail.recentDiffTotal <= -1000)) phrases.push("平均差枚は弱いが、直近凹みから上げ狙い候補");
  const selected = uniqueKeepOrder(phrases).slice(0, 5);
  if (!selected.length) return "スコア加点は少ないですが、保存データの比較対象として候補に残ります。";
  const details = [];
  if (stats.avgRbRate) details.push(`平均REG ${rateText(stats.avgRbRate)}`);
  details.push(`平均差枚 ${formatDiff(stats.avgDiff)}`);
  details.push(`プラス率${stats.positiveRate}%`);
  return `${selected.join("、")}。${details.join(" / ")}。`;
}

function uniqueKeepOrder(items) {
  return [...new Set(items.filter(Boolean))];
}

function buildRecommendationConcerns(penaltyParts, stats) {
  const concerns = penaltyParts.filter((part) => part.points < 0).map((part) => part.label);
  if (stats.count <= 5 && !concerns.includes("データ件数が少ない")) concerns.push("データ件数はまだ多くありません");
  if (!concerns.length) concerns.push("大きな不安材料は少なめですが、過去データのみの判定です");
  return unique(concerns);
}

function confidenceByCount(count) {
  if (count >= 6) return "高";
  if (count >= 3) return "中";
  return "低";
}

function getSameBandRecords(record, records) {
  const unit = Number(record.unit);
  if (!Number.isFinite(unit)) return [];
  const bandStart = Math.floor(unit / 10) * 10;
  const bandEnd = bandStart + 9;
  return records.filter((item) => {
    if (item.store !== record.store || item.machine !== record.machine) return false;
    const itemUnit = Number(item.unit);
    return Number.isFinite(itemUnit) && itemUnit >= bandStart && itemUnit <= bandEnd;
  });
}

function formatRecentHistory(record) {
  return `${record.date} ${record.unit}番 ${formatDiff(record.diff)} ${record.rating || "要確認"} REG${rateText(record.rbRate)} 合算${rateText(record.totalRate)}`;
}

function weekdayName(day) {
  return ["日", "月", "火", "水", "木", "金", "土"][day] || "";
}

function renderRecommendationRanking(target, items) {
  target.innerHTML = "";
  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "rank-item recommendation-item";
    if (item.empty) {
      article.innerHTML = `
        <div class="rank-title">
          <strong>${escapeHtml(item.title)}</strong>
          ${ratingPill(item.rating)}
        </div>
        <p>${escapeHtml(item.body)}</p>
      `;
    } else {
      article.innerHTML = `
        <div class="rank-title">
          <strong>${item.rank}位：${escapeHtml(item.unit)}番</strong>
          ${ratingPill(item.rating)}
        </div>
        <div class="recommend-meta">
          <span>店舗：${escapeHtml(item.store)}</span>
          <span>機種：${escapeHtml(item.machine)}</span>
          <span>おすすめ度：${escapeHtml(item.rating)}</span>
          <span>スコア：${item.score}</span>
          <span>平均差枚：${formatDiff(item.averageDiff)}</span>
          <span>平均RB確率：${rateText(item.averageRbRate)}</span>
          <span>直近3回差枚：${formatDiff(item.recentDiffTotal)}</span>
          <span>信頼度：${escapeHtml(item.confidence)}（${item.stats.count}件）</span>
        </div>
        <div class="recommend-block">
          <strong>理由</strong>
          <p>${escapeHtml(item.reason)}</p>
        </div>
        <div class="recommend-block concern">
          <strong>不安材料</strong>
          <p>${escapeHtml(item.concerns.join("、"))}</p>
        </div>
        <div class="recommend-block">
          <strong>直近履歴</strong>
          <ul>${item.recentHistory.map((history) => `<li>${escapeHtml(history)}</li>`).join("")}</ul>
        </div>
      `;
    }
    target.appendChild(article);
  });
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

  const master = findMachineMaster(record.machine);
  const hasUsableMaster = isCompleteMachineMaster(master);
  const confidence = record.games >= 6000 ? "高" : record.games >= 3000 ? "中" : "低";
  let score = record.games >= 6000 ? 18 : record.games >= 3000 ? 10 : 2;
  let nearestSettings = "-";
  let reason = "";

  if (hasUsableMaster) {
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
    reason = master
      ? "機種マスターが不完全なため、一般的なREG・合算基準で仮評価しています。"
      : "機種マスター未登録のため、一般的なREG・合算の強さで仮評価しています。";
  }

  if (record.diff > 1000) score += 4;
  if (record.diff < -1000 && record.rbRate && record.rbRate <= 320) score += 6;
  if (record.games < 3000) score -= 18;
  if (record.rbRate && record.rbRate > 420 && record.games >= 3000) score -= 20;

  score = applyStrongPerformanceFloor(record, score);

  return {
    rating: score >= 72 ? "A" : score >= 44 ? "B" : "C",
    expectation: Math.max(0, Math.min(99, Math.round(score))),
    confidence,
    reason,
    nearestSettings
  };
}

function findMachineMaster(machineName) {
  const normalizedName = normalizeMachineName(machineName);
  if (!normalizedName) return null;
  return state.masters.find((master) => normalizeMachineName(master.name) === normalizedName) || null;
}

function normalizeMachineName(name) {
  const normalized = String(name || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/iii/g, "3")
    .replace(/[\s　・･_ー-]/g, "");

  if (/^ハッピ(ジャグラ)?v?3$/.test(normalized)) return "happy-juggler-v3";
  return normalized;
}

function isCompleteMachineMaster(master) {
  if (!master) return false;
  return [1, 2, 3, 4, 5, 6].every((setting) => {
    const data = master.settings?.[setting] || {};
    return hasPositiveNumber(data.big) && hasPositiveNumber(data.reg) && hasPositiveNumber(data.total);
  });
}

function hasPositiveNumber(value) {
  return Number(value) > 0;
}

function applyStrongPerformanceFloor(record, score) {
  if (record.games < 6000 || !record.rbRate || !record.totalRate || record.diff <= 0) return score;
  if (record.rbRate <= 270 && record.totalRate <= 120 && record.diff > 1000) return Math.max(score, 72);
  if (record.rbRate <= 300 && record.totalRate <= 130) return Math.max(score, 44);
  return score;
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

const REEVALUATION_KEYS = ["bbRate", "rbRate", "totalRate", "rating", "expectation", "confidence", "reason", "nearestSettings"];
const RATING_LABELS = ["A", "B", "C", "要確認"];

function buildReevaluatedRecord(record) {
  const rates = calculateRates(record.games, record.bb, record.rb);
  const evaluation = evaluateRecord({ ...record, bbRate: rates.bb, rbRate: rates.rb, totalRate: rates.total });
  return {
    ...record,
    bbRate: rates.bb,
    rbRate: rates.rb,
    totalRate: rates.total,
    rating: evaluation.rating || "要確認",
    expectation: evaluation.expectation ?? 0,
    confidence: evaluation.confidence || "低",
    reason: evaluation.reason || "",
    nearestSettings: evaluation.nearestSettings || "-"
  };
}

function hasReevaluationChange(before, after) {
  return REEVALUATION_KEYS.some((key) => before[key] !== after[key]);
}

function normalizeRatingLabel(rating) {
  return RATING_LABELS.includes(rating) ? rating : "要確認";
}

function refreshRecordEvaluations() {
  let changed = false;
  state.records = state.records.map((record) => {
    const updated = buildReevaluatedRecord(record);
    changed = changed || hasReevaluationChange(record, updated);
    return updated;
  });
  if (changed) saveJson(STORAGE_KEYS.records, state.records);
}

function reevaluateSavedRecords() {
  const total = state.records.length;
  if (!total) {
    alert("再判定する保存済みデータがありません。");
    return;
  }

  const confirmed = confirm([
    `保存済みデータ${total}件を最新ロジックで再判定します。よろしいですか？`,
    "再判定前にCSVバックアップをおすすめします。",
    "台番号、日付、店舗、機種、G数、BB、RB、差枚、メモは変更しません。"
  ].join("\n"));
  if (!confirmed) return;

  const ratingCounts = Object.fromEntries(RATING_LABELS.map((label) => [label, 0]));
  const transitions = {};
  let changedCount = 0;

  state.records = state.records.map((record) => {
    const updated = buildReevaluatedRecord(record);
    const nextRating = normalizeRatingLabel(updated.rating);
    ratingCounts[nextRating] += 1;

    if (hasReevaluationChange(record, updated)) changedCount += 1;

    const previousRating = normalizeRatingLabel(record.rating);
    if (previousRating !== nextRating) {
      const key = `${previousRating}→${nextRating}`;
      transitions[key] = (transitions[key] || 0) + 1;
    }

    return updated;
  });

  saveJson(STORAGE_KEYS.records, state.records);
  renderAll();

  const ratingSummary = RATING_LABELS.map((label) => `${label} ${ratingCounts[label]}件`).join("、");
  const transitionEntries = Object.entries(transitions);
  const transitionSummary = transitionEntries.length
    ? `判定変更：${transitionEntries.map(([label, count]) => `${label}：${count}件`).join("、")}`
    : "判定変更：なし";

  alert(`再判定完了：${ratingSummary}\n判定項目更新：${changedCount}件\n${transitionSummary}`);
}


function renderFilterOptions() {
  const filters = getRecordFilters();
  const stores = unique(state.records
    .filter((record) => !filters.date || record.date === filters.date)
    .map((record) => record.store));
  const selectedStore = stores.includes(filters.store) ? filters.store : "";
  const machines = unique(state.records
    .filter((record) => (!filters.date || record.date === filters.date) && (!selectedStore || record.store === selectedStore))
    .map((record) => record.machine));
  const selectedMachine = machines.includes(filters.machine) ? filters.machine : "";
  const candidates = state.records.filter((record) => {
    if (filters.date && record.date !== filters.date) return false;
    if (selectedStore && record.store !== selectedStore) return false;
    if (selectedMachine && record.machine !== selectedMachine) return false;
    return true;
  });

  renderSelectOptions("#filterStore", stores, "すべて");
  renderSelectOptions("#filterMachine", machines, "すべて");
  renderSelectOptions("#filterUnit", uniqueUnits(candidates.map((record) => record.unit)), "すべて");
}

function renderSelectOptions(selector, values, emptyLabel = "すべて") {
  const select = $(selector);
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  select.value = values.includes(current) ? current : "";
}

function uniqueUnits(units) {
  return [...new Set(units.map((unit) => String(unit || "").trim()).filter(Boolean))]
    .sort((a, b) => {
      const an = Number(normalizeNumberText(a));
      const bn = Number(normalizeNumberText(b));
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
      if (Number.isFinite(an) && !Number.isFinite(bn)) return -1;
      if (!Number.isFinite(an) && Number.isFinite(bn)) return 1;
      return a.localeCompare(b, "ja");
    });
}

function bulkUpdateMemoTags(mode) {
  const tags = getSelectedMemoTags("#bulkMemoTags");
  if (!tags.length) {
    alert("一括操作するメモタグを選択してください。");
    return;
  }
  updateMemoTagsForRecords(getFilteredRecords(), tags, mode, "検索結果");
}

function updateMemoTagsForRecords(targets, tags, mode, targetLabel) {
  if (!targets.length) {
    alert(`${targetLabel}が0件のため、一括操作できません。`);
    return;
  }

  const verb = mode === "add" ? "追加" : "削除";
  if (!confirm(`${targetLabel} ${targets.length}件にタグ「${tags.join("、")}」を${verb}します。よろしいですか？`)) return;

  const targetIds = new Set(targets.map((record) => record.id));
  let changedCount = 0;
  state.records = state.records.map((record) => {
    if (!targetIds.has(record.id)) return record;
    const currentParts = splitMemoParts(record.memo);
    const nextParts = mode === "add"
      ? [...currentParts, ...tags.filter((tag) => !currentParts.includes(tag))]
      : currentParts.filter((part) => !tags.includes(part));
    const nextMemo = nextParts.join(" / ");
    if (nextMemo === String(record.memo || "")) return record;
    changedCount += 1;
    return { ...record, memo: nextMemo, updatedAt: new Date().toISOString() };
  });

  saveJson(STORAGE_KEYS.records, state.records);
  renderAll();
  alert(`タグ${verb}完了：${changedCount}件`);
}


function renderSummaryFilterOptions() {
  if (!$("#specialStore")) return;
  const filters = getSummaryFilters();
  const dateFiltered = state.records.filter((record) => matchesSummaryDateFilters(record, filters));
  const stores = unique(dateFiltered.map((record) => record.store));
  const selectedStore = stores.includes(filters.store) ? filters.store : "";
  const machines = unique(dateFiltered
    .filter((record) => !selectedStore || record.store === selectedStore)
    .map((record) => record.machine));
  const selectedMachine = machines.includes(filters.machine) ? filters.machine : "";
  const units = uniqueUnits(dateFiltered
    .filter((record) => (!selectedStore || record.store === selectedStore) && (!selectedMachine || record.machine === selectedMachine))
    .map((record) => record.unit));

  renderSelectOptions("#specialStore", stores, "すべて");
  renderSelectOptions("#specialMachine", machines, "すべて");
  renderSelectOptions("#specialUnit", units, "すべて");
}

function renderAll() {
  renderOptions();
  renderRecords();
  renderSummary();
  renderAnalysis();
  renderMasters();
  $("#storageStatus").textContent = `保存 ${state.records.length}件`;
}

function renderOptions() {
  const stores = unique(state.stores);
  const machines = unique([
    ...state.records.map((record) => String(record.machine || "").trim()),
    ...state.masters.map((master) => String(master.name || "").trim())
  ]);
  const memoTags = normalizeMemoTags(state.memoTags);
  state.memoTags = memoTags;
  $("#storeList").innerHTML = stores.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  $("#storeSelect").innerHTML = `<option value="">店舗を選択</option>${stores.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  $("#machineList").innerHTML = machines.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  const machineSelect = $("#machineSelect");
  if (machineSelect) {
    machineSelect.innerHTML = `<option value="">機種を選択</option>${machines.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    syncMachineSelectToInput();
  }
  renderFilterOptions();
  renderMemoTagSelect("#memoTagSelect", memoTags, "保存済みタグを選択");
  renderMemoTagSelect("#filterMemoTag", memoTags, "すべて");
  renderMemoTagSelect("#bulkMemoTags", memoTags);
  renderSummaryFilterOptions();
  renderMemoTagSelect("#specialMemoTag", memoTags, "すべて");
  renderMemoTagSelect("#summaryBulkMemoTags", memoTags);
  renderMemoTagSelect("#recommendMemoTags", memoTags);
}


function syncMachineSelectToInput() {
  const machineSelect = $("#machineSelect");
  const machineInput = $("#machineInput");
  if (!machineSelect || !machineInput) return;
  const value = machineInput.value.trim();
  machineSelect.value = value && [...machineSelect.options].some((option) => option.value === value) ? value : "";
}

function renderMemoTagSelect(selector, tags, emptyLabel) {
  const select = $(selector);
  if (!select) return;
  const current = new Set([...select.selectedOptions].map((option) => option.value));
  const emptyOption = emptyLabel === undefined ? "" : `<option value="">${escapeHtml(emptyLabel)}</option>`;
  select.innerHTML = `${emptyOption}${tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}`;
  [...select.options].forEach((option) => {
    option.selected = current.has(option.value);
  });
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

function exportRecordsCsv(filename) {
  const latestDate = getLatestRecordDate(state.records);
  const message = `保存済みデータ ${state.records.length}件をCSV出力します。最新日：${latestDate || "未登録"}`;
  if (!confirm(message)) return;
  exportCsv(filename, recordsToCsv(state.records));
}

function getLatestRecordDate(records) {
  return records
    .map((record) => record.date)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] || "";
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function exportRecordsCsv(filename) {
  const latestDate = latestRecordDate(state.records);
  const latestText = latestDate || "なし";
  const message = `保存済みデータ ${state.records.length}件をCSV出力します。最新日：${latestText}`;
  if (!confirm(message)) return;
  exportCsv(filename, recordsToCsv(state.records));
}

function latestRecordDate(records) {
  return records.reduce((latest, record) => {
    const date = String(record.date || "");
    return date && (!latest || date > latest) ? date : latest;
  }, "");
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function buildRecordDuplicateKey(record) {
  return [record.date, record.store, record.machine, record.unit]
    .map((value) => String(value ?? "").trim())
    .join("\u001f");
}

function createRecordFromCsvRow(row) {
  return {
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
}

function chooseDuplicateImportAction(duplicateCount) {
  if (!duplicateCount) return "add";
  const choice = prompt(
    `重複データが${duplicateCount}件あります。処理を選択してください。\n` +
      "1: 上書きする\n" +
      "2: 取り込まない\n" +
      "3: 別データとして追加する",
    "1"
  );
  if (choice === null) return "cancel";
  const normalized = choice.trim();
  if (normalized === "1" || normalized === "上書き" || normalized === "上書きする") return "overwrite";
  if (normalized === "2" || normalized === "取り込まない" || normalized === "スキップ") return "skip";
  if (normalized === "3" || normalized === "追加" || normalized === "別データとして追加する") return "add";
  alert("1、2、3のいずれかを入力してください。CSV取込を中止しました。");
  return "cancel";
}

function importRecordsCsv(file) {
  if (!file) return Promise.resolve();
  return file.text().then((text) => {
    const [, ...rows] = parseCsv(text.replace(/^\ufeff/, ""));
    const importedRecords = rows.map(createRecordFromCsvRow);
    const duplicateMap = new Map();
    state.records.forEach((record, index) => {
      const key = buildRecordDuplicateKey(record);
      if (!key) return;
      const duplicate = duplicateMap.get(key);
      if (duplicate) duplicate.extraIndices.push(index);
      else duplicateMap.set(key, { record, index, extraIndices: [] });
    });

    const duplicates = importedRecords.filter((record) => duplicateMap.has(buildRecordDuplicateKey(record)));
    const action = chooseDuplicateImportAction(duplicates.length);
    if (action === "cancel") return;

    let addedCount = 0;
    let overwrittenCount = 0;
    let skippedCount = 0;
    const duplicateIndexesToRemove = new Set();

    importedRecords.forEach((record) => {
      const duplicate = duplicateMap.get(buildRecordDuplicateKey(record));
      if (!duplicate || action === "add") {
        state.records.push(record);
        addedCount += 1;
        return;
      }
      if (action === "skip") {
        skippedCount += 1;
        return;
      }
      state.records[duplicate.index] = { ...record, id: duplicate.record.id };
      duplicate.extraIndices.forEach((index) => duplicateIndexesToRemove.add(index));
      overwrittenCount += 1;
    });

    if (duplicateIndexesToRemove.size) {
      state.records = state.records.filter((_, index) => !duplicateIndexesToRemove.has(index));
    }

    saveJson(STORAGE_KEYS.records, state.records);
    renderAll();
    alert(`CSV取込が完了しました。追加: ${addedCount}件 / 上書き: ${overwrittenCount}件 / 未取込: ${skippedCount}件`);
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}
