const CACHE_NAME = "juggler-data-v25";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=24",
  "./app.js?v=24",
  "./manifest.json?v=24",
  "./icons/icon.svg"
];

const RECOMMEND_DAYTYPE_PATCH = "\n/* v25 recommend day type patch: memo tag unselected = normal day */\n(function () {\n  function selectedRecommendMemoTagsV25() {\n    return typeof getSelectedMemoTags === \"function\" ? getSelectedMemoTags(\"#recommendMemoTags\") : [];\n  }\n\n  getRecommendSpecialTypeFromMemoTags = function (memoTags) {\n    return memoTags && memoTags.length ? \"memo-tag\" : \"normal\";\n  };\n\n  recommendDayTypeLabelFromMemoTags = function (memoTags) {\n    return memoTags && memoTags.length ? \"タグ条件\" : \"通常日\";\n  };\n\n  updateRecommendDayTypePreview = function (memoTags = selectedRecommendMemoTagsV25()) {\n    const preview = document.querySelector(\"#recommendDayTypePreview\");\n    if (preview) preview.textContent = recommendDayTypeLabelFromMemoTags(memoTags);\n  };\n\n  bindRecommendations = function () {\n    [\"recommendDate\", \"recommendMemoTags\"].forEach((id) => {\n      const element = document.querySelector(\"#\" + id);\n      if (!element) return;\n      element.addEventListener(\"input\", renderRecommendations);\n      element.addEventListener(\"change\", renderRecommendations);\n    });\n\n    const storeInput = document.querySelector(\"#recommendStore\");\n    const machineInput = document.querySelector(\"#recommendMachine\");\n    const storeSelect = document.querySelector(\"#recommendStoreSelect\");\n    const machineSelect = document.querySelector(\"#recommendMachineSelect\");\n\n    storeInput?.addEventListener(\"input\", () => {\n      syncRecommendStoreSelectToInput();\n      renderRecommendMachineSelectOptions();\n      syncRecommendMachineSelectToInput();\n      renderRecommendations();\n    });\n    storeInput?.addEventListener(\"change\", () => {\n      syncRecommendStoreSelectToInput();\n      renderRecommendMachineSelectOptions();\n      syncRecommendMachineSelectToInput();\n      renderRecommendations();\n    });\n    storeSelect?.addEventListener(\"change\", () => {\n      if (storeInput) storeInput.value = storeSelect.value;\n      renderRecommendMachineSelectOptions();\n      syncRecommendMachineSelectToInput();\n      renderRecommendations();\n    });\n\n    machineInput?.addEventListener(\"input\", () => {\n      syncRecommendMachineSelectToInput();\n      renderRecommendations();\n    });\n    machineInput?.addEventListener(\"change\", () => {\n      syncRecommendMachineSelectToInput();\n      renderRecommendations();\n    });\n    machineSelect?.addEventListener(\"change\", () => {\n      if (machineInput) machineInput.value = machineSelect.value;\n      renderRecommendations();\n    });\n\n    document.querySelector(\"#makeRecommendButton\")?.addEventListener(\"click\", renderRecommendations);\n    document.querySelector(\"#exportRecommendCsvButton\")?.addEventListener(\"click\", exportRecommendCsv);\n    document.querySelector(\"#makeChappyConsultButton\")?.addEventListener(\"click\", makeChappyConsultText);\n    document.querySelector(\"#copyChappyConsultButton\")?.addEventListener(\"click\", copyChappyConsultText);\n  };\n\n  getRecommendationData = function () {\n    const targetDate = document.querySelector(\"#recommendDate\").value;\n    const store = document.querySelector(\"#recommendStore\").value.trim();\n    const machine = document.querySelector(\"#recommendMachine\").value.trim();\n    const memoTags = selectedRecommendMemoTagsV25();\n    const specialType = getRecommendSpecialTypeFromMemoTags(memoTags);\n    const target = targetDate ? new Date(targetDate + \"T00:00:00\") : new Date();\n\n    const base = activeRecords().filter((record) => {\n      if (store && record.store !== store) return false;\n      if (machine && record.machine !== machine) return false;\n      if (targetDate && record.date >= targetDate) return false;\n      if (memoTags.length && !memoTags.some((tag) => recordHasMemoTag(record, tag))) return false;\n      return true;\n    });\n\n    const context = buildRecommendationContext(target, specialType, { targetDate, store, machine, memoTags, count: base.length });\n    const byUnit = groupBy(base, (record) => record.store + \"__\" + record.machine + \"__\" + record.unit);\n    const candidates = Object.values(byUnit)\n      .map((items) => buildRecommendationCandidate(items, context, base))\n      .sort((a, b) => b.score - a.score || b.stats.count - a.stats.count || String(a.unit).localeCompare(String(b.unit), \"ja\"))\n      .slice(0, 10)\n      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));\n\n    return { targetDate, specialType, store, machine, memoTags, target, base, context, candidates };\n  };\n\n  renderRecommendations = function () {\n    const data = getRecommendationData();\n    updateRecommendDayTypePreview(data.memoTags);\n    const summary = document.querySelector(\"#recommendSummary\");\n    if (summary) summary.textContent = buildRecommendationSummary(data.context, data.base.length, data.candidates.length);\n    renderRecommendationRanking(document.querySelector(\"#recommendList\"), data.candidates.length ? data.candidates : [{\n      empty: true,\n      title: \"候補なし\",\n      rating: \"要確認\",\n      body: \"条件に合う保存データがありません。まずは台データを保存してください。\"\n    }]);\n  };\n\n  specialTypeLabel = function (value) {\n    return {\n      normal: \"通常日\",\n      \"memo-tag\": \"タグ条件\",\n      \"same-day\": \"毎月同じ日付\",\n      double: \"ゾロ目日\",\n      \"same-weekday\": \"同じ曜日\",\n      \"recent-dip\": \"直近凹み狙い\"\n    }[value] || \"通常日\";\n  };\n\n  buildRecommendationContext = function (target, specialType, filters) {\n    const day = target.getDate();\n    const weekday = target.getDay();\n    const memoTagText = (filters.memoTags || []).join(\"、\");\n    const useDoubleTrend = /ゾロ目/.test(memoTagText);\n    const targetIsDouble = useDoubleTrend;\n    const activeType = specialType;\n    const multipliers = {\n      sameDay: activeType === \"normal\" ? 1.2 : 1,\n      weekday: activeType === \"normal\" ? 1.15 : 1,\n      double: useDoubleTrend ? 1.45 : 0.75,\n      recentDip: activeType === \"normal\" ? 1.25 : 1,\n      stable: 1\n    };\n    return { target, day, weekday, targetIsDouble, useDoubleTrend, specialType, activeType, multipliers, filters };\n  };\n\n  buildRecommendationSummary = function (context, recordCount, candidateCount) {\n    const focus = [];\n    if (context.activeType === \"normal\") {\n      focus.push(\"過去の毎月\" + context.day + \"日を評価\");\n      focus.push(weekdayName(context.weekday) + \"曜日のREG・差枚傾向を評価\");\n      focus.push(\"直近3回差枚と大きな凹みを評価\");\n    } else if (context.useDoubleTrend) {\n      focus.push(\"メモタグ条件のゾロ目日実績を評価\");\n    } else {\n      focus.push(\"選択したメモタグ条件に一致する過去データを評価\");\n    }\n    const filterText = [\n      context.filters.store ? \"店舗:\" + context.filters.store : \"全店舗\",\n      context.filters.machine ? \"機種:\" + context.filters.machine : \"全機種\",\n      context.filters.memoTags.length ? \"メモ:\" + context.filters.memoTags.join(\"、\") : \"メモ指定なし\"\n    ].join(\" / \");\n    return \"日種別：\" + specialTypeLabel(context.specialType) + \" / \" + filterText + \" / 対象\" + recordCount + \"件 / 候補\" + candidateCount + \"台。\" + focus.join(\"、\") + \"します。\";\n  };\n\n  const originalBuildChappyConsultText = buildChappyConsultText;\n  buildChappyConsultText = function (data) {\n    return originalBuildChappyConsultText(data)\n      .replace(/- 特定日タイプ：.*\\n/, \"- 日種別：\" + specialTypeLabel(data.context.specialType) + \"\\n\")\n      .replace(/- メモタグ：/, \"- 特定日タグ：\");\n  };\n\n  function patchRecommendDayTypeDom() {\n    const specialSelect = document.querySelector(\"#recommendSpecialType\");\n    const specialLabel = specialSelect?.closest(\"label\");\n    if (specialLabel && !document.querySelector(\"#recommendDayTypePreview\")) {\n      const note = document.createElement(\"div\");\n      note.className = \"recommend-daytype-note\";\n      note.innerHTML = '<span>日種別</span><strong id=\"recommendDayTypePreview\">通常日</strong><small>メモタグ未選択なら通常日、選択時はタグ条件として自動判定します。</small>';\n      specialLabel.replaceWith(note);\n    } else if (specialLabel) {\n      specialLabel.remove();\n    }\n    updateRecommendDayTypePreview();\n  }\n\n  if (document.readyState === \"loading\") {\n    document.addEventListener(\"DOMContentLoaded\", patchRecommendDayTypeDom);\n  } else {\n    patchRecommendDayTypeDom();\n  }\n})();\n";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isAppScript = url.pathname.endsWith("/app.js") || url.pathname.endsWith("app.js");
  if (isAppScript) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request)).then((response) => {
        if (!response) return response;
        return response.clone().text().then((text) => new Response(text + "\n" + RECOMMEND_DAYTYPE_PATCH, {
          headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache" }
        }));
      }).catch(() => fetch(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => cached);
    })
  );
});
