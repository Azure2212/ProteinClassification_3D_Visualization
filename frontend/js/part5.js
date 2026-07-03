// Part 5 — Prediction: pick a real protein + its real image(s) + a checkpoint
// run, then run inference. Per image show the picture and one top-20 bar chart
// coloured 3 ways: red = exact (predicted == protein), blue = neighbor (>=30%
// identity), black = unrelated. Uses the dependency-free SVG barChart.
import { api } from "./api.js";
import { barChart } from "./minichart.js";
import { pickConfigFields } from "./part2.js";

const $ = (s, r = document) => r.querySelector(s);

let RUNS = [];
let selectedRun = null;
let images = [];                      // [{name,url}]
const selectedImages = new Set();     // image names

function opt(v, label) {
  const o = document.createElement("option");
  o.value = v; o.textContent = label ?? v;
  return o;
}

async function init() {
  const meta = await api.datasets();
  const pSel = $("#p5-protein");
  meta.real_proteins.forEach((p) => pSel.appendChild(opt(p)));
  pSel.addEventListener("change", loadImages);

  $("#p5-select-all").addEventListener("click", () => {
    const on = selectedImages.size < images.length;   // toggle all/none
    selectedImages.clear();
    if (on) images.forEach((im) => selectedImages.add(im.name));
    paintThumbs();
  });
  $("#p5-run").addEventListener("click", runPrediction);
  $("#p5-run-search").addEventListener("input", renderRuns);

  const data = await api.predictRuns();
  RUNS = data.runs;
  renderRuns();
  await loadImages();
}

// --- images -----------------------------------------------------------------
async function loadImages() {
  const protein = $("#p5-protein").value;
  const box = $("#p5-images");
  box.innerHTML = `<div class="loading">loading images…</div>`;
  selectedImages.clear();
  try {
    const data = await api.testsetImages(protein);
    images = data.images;
  } catch (e) {
    box.innerHTML = `<div class="err">${e.message}</div>`;
    images = [];
    return;
  }
  paintThumbs();
}

function paintThumbs() {
  const box = $("#p5-images");
  if (!images.length) { box.innerHTML = `<div class="empty">no real images</div>`; return; }
  box.innerHTML = "";
  images.forEach((im) => {
    const sel = selectedImages.has(im.name);
    const t = document.createElement("button");
    t.className = "p5-thumb" + (sel ? " sel" : "");
    t.innerHTML = `<img src="${im.url}" alt="${im.name}" loading="lazy">` +
      `<span class="p5-thumb-name">${im.name}</span>`;
    t.addEventListener("click", () => {
      if (selectedImages.has(im.name)) selectedImages.delete(im.name);
      else selectedImages.add(im.name);
      paintThumbs();
    });
    box.appendChild(t);
  });
  status();
}

// --- run list (borrowed from Training runs look) ----------------------------
function renderRuns() {
  const box = $("#p5-runs");
  const q = ($("#p5-run-search").value || "").toLowerCase();
  box.innerHTML = "";
  RUNS.filter((r) => r.run.toLowerCase().includes(q)).forEach((r) => {
    const row = document.createElement("div");
    row.className = "run-row p5-run-row" + (selectedRun === r.run ? " active" : "");
    const tag = [r.model, r.filter, r.smoothing].filter(Boolean).join(" · ");
    const warn = r.can_predict ? "" :
      ` <span class="run-nodata" title="No class_to_idx.json — this run can't be predicted">⚠ no class mapping</span>`;
    row.innerHTML = `<span class="run-name" title="${r.run}">${r.run}</span>` +
      `<span class="run-tag">${tag}${warn}</span>`;
    row.addEventListener("click", () => {
      selectedRun = r.run; renderRuns(); status(); showConfig(r.run);
    });
    box.appendChild(row);
  });
}

// Click a run -> show its configs.json in a scrollable navy code box (like Part 2).
async function showConfig(run) {
  const panel = $("#p5-config");
  panel.innerHTML = `<div class="config-card"><div class="config-head">config.json — ` +
    `<b>${run}</b></div><div class="loading">loading config…</div></div>`;
  try {
    const { config } = await api.runConfig(run);
    panel.innerHTML = `<div class="config-card">` +
      `<div class="config-head">config.json — <b>${run}</b></div>` +
      `<pre class="config-json p5-config-json">${syntax(JSON.stringify(pickConfigFields(config), null, 2))}</pre></div>`;
  } catch (e) {
    panel.innerHTML = `<div class="config-card"><div class="config-head">config.json — ` +
      `<b>${run}</b></div><div class="err">no config: ${e.message}</div></div>`;
  }
}

function syntax(json) {
  return json
    .replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))
    .replace(/("(\\.|[^"\\])*")(\s*:)?/g, (m, _p, _q, colon) =>
      colon ? `<span class="k">${m}</span>` : `<span class="s">${m}</span>`)
    .replace(/\b(true|false|null)\b/g, `<span class="b">$1</span>`)
    .replace(/\b(-?\d+\.?\d*(e[-+]?\d+)?)\b/gi, `<span class="n">$1</span>`);
}

function status() {
  const parts = [];
  parts.push(`${selectedImages.size} image(s)`);
  parts.push(selectedRun ? `run: ${selectedRun}` : "no run selected");
  $("#p5-status").textContent = parts.join(" · ");
}

// --- run inference ----------------------------------------------------------
async function runPrediction() {
  const protein = $("#p5-protein").value;
  const results = $("#p5-results");
  if (!selectedRun) { results.innerHTML = `<div class="err">Pick a checkpoint run first.</div>`; return; }
  if (!selectedImages.size) { results.innerHTML = `<div class="err">Select at least one image.</div>`; return; }

  const names = images.map((i) => i.name).filter((n) => selectedImages.has(n));
  results.innerHTML = "";
  // Overview (2 matrices) goes ON TOP; per-image detail cards below.
  const overview = document.createElement("div");
  overview.className = "pred-overview";
  const details = document.createElement("div");
  details.className = "pred-details";
  results.append(overview, details);

  const collected = [];
  for (const name of names) {
    const card = document.createElement("div");
    card.className = "pred-card";
    card.innerHTML = `<div class="pred-head">Predicting <b>${protein}/${name}</b> …
      <span class="loading">running model</span></div>`;
    details.appendChild(card);
    try {
      const r = await api.predict(selectedRun, protein, name, 20);
      collected.push(r);
      renderResult(card, r);
    } catch (e) {
      const unsupported = /unsupported|class_to_idx|class mapping/i.test(e.message);
      card.innerHTML = `<div class="pred-head"><b>${protein}/${name}</b></div>` +
        `<div class="err">${unsupported
          ? "This run does not support prediction (missing class mapping / checkpoint)."
          : "Prediction failed: " + e.message}</div>`;
    }
  }
  renderOverview(overview, protein, collected);
}

// Overview: two image×rank matrices. Rows = images, columns = top-k rank.
// Left (Exact): cell red if is_exact else black.
// Right (Similarity): red if is_exact, blue if is_neighbor, else black.
function renderOverview(host, protein, results) {
  if (!results.length) { host.innerHTML = ""; return; }
  const K = Math.max(...results.map((r) => r.predictions.length));

  const legend =
    `<div class="pred-legend ov-legend">
       <span class="lg"><i style="background:${COL.exact}"></i>Exact prediction (predicted = ${protein})</span>
       <span class="lg"><i style="background:${COL.neighbor}"></i>Neighbor (≥30% identity)</span>
       <span class="lg"><i style="background:${COL.unrelated}"></i>Unrelated</span>
     </div>`;

  const cellColor = (p, mode) => {
    if (!p) return "transparent";
    if (p.is_exact) return COL.exact;
    if (mode === "sim" && p.is_neighbor) return COL.neighbor;
    return COL.unrelated;
  };
  const kind = (p) => p.is_exact ? "exact" : (p.is_neighbor ? "neighbor" : "unrelated");

  const matrix = (mode) => {
    let head = `<tr><th class="ov-imgcol">image \\ rank</th>`;
    for (let j = 1; j <= K; j++) head += `<th>${j}</th>`;
    head += `<th class="ov-hit">hit?</th></tr>`;

    let body = "";
    results.forEach((r) => {
      const hit = mode === "exact"
        ? r.predictions.some((p) => p.is_exact)
        : r.predictions.some((p) => p.is_exact || p.is_neighbor);
      const hitColor = r.predictions.some((p) => p.is_exact) ? COL.exact
        : (mode === "sim" && r.predictions.some((p) => p.is_neighbor) ? COL.neighbor : COL.unrelated);
      body += `<tr><th class="ov-imgcol">${r.image}</th>`;
      for (let j = 1; j <= K; j++) {
        const p = r.predictions[j - 1];
        const c = cellColor(p, mode);
        const tip = p ? `rank ${j}: ${p.label} ${p.prob}% (${kind(p)})` : "";
        body += `<td class="ov-cell" style="background:${c}" title="${tip}"></td>`;
      }
      body += `<td class="ov-hit" style="color:${hit ? hitColor : COL.unrelated}">` +
        `${hit ? "✓" : "✗"}</td></tr>`;
    });
    return `<table class="ov-matrix">${head}${body}</table>`;
  };

  host.innerHTML = legend +
    `<div class="ov-grids">
       <div class="ov-block"><div class="ov-title">Exact prediction</div>
         <div class="ov-scroll">${matrix("exact")}</div></div>
       <div class="ov-block"><div class="ov-title">Sequential similarity</div>
         <div class="ov-scroll">${matrix("sim")}</div></div>
     </div>`;
}

// One chart per image, 3 colours: red = exact (predicted label == protein),
// blue = neighbor (>=30% identity), black = unrelated. Labels match bar colour.
const COL = { exact: "#dc2626", neighbor: "#1f6fe5", unrelated: "#111827" };

function renderResult(card, r) {
  const imgUrl = (images.find((i) => r.image.endsWith(i.name)) || {}).url || "";
  card.innerHTML = `
    <div class="pred-head">
      <b>${r.image}</b> · ${r.model} · ${r.n_classes} classes ·
      exact rank: <b>${r.exact_rank ?? "—"}</b> · first neighbor rank: <b>${r.first_neighbor_rank ?? "—"}</b>
    </div>
    <div class="pred-body">
      <div class="pred-imgwrap">
        <img class="pred-img" src="${imgUrl}" alt="${r.image}">
        <div class="pred-name">${r.image}</div>
      </div>
      <div class="pred-charts">
        <div class="pred-legend">
          <span class="lg"><i style="background:${COL.exact}"></i>Exact prediction (predicted = ${r.protein})</span>
          <span class="lg"><i style="background:${COL.neighbor}"></i>Neighbor (≥30% identity)</span>
          <span class="lg"><i style="background:${COL.unrelated}"></i>Unrelated</span>
        </div>
        <div class="pred-chart" data-c="main"></div>
      </div>
    </div>`;
  const bars = r.predictions.map((p) => ({
    label: p.label,
    value: p.prob,
    color: p.is_exact ? COL.exact : (p.is_neighbor ? COL.neighbor : COL.unrelated),
  }));
  barChart(card.querySelector('[data-c="main"]'), {
    title: `Top-${r.top_k} predicted classes for ${r.image}`,
    bars,
  });
}

export const Part5 = { init };
