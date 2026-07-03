// Part 2 — Training Runs. Two sections per selected run set:
//   REAL PERFORMANCE     — the two Top-k charts on the 193 held-out test images.
//   TRAINING PERFORMANCE — per-epoch curves from trainingTracking.csv (Top-1).
// A per-run "View" button opens a dialog with the config (6 fields + Expand) and
// run.log. Each selected run is one coloured line across every chart.
import { api } from "./api.js";
import { lineChart, colorFor } from "./minichart.js";

let RUNS = [];
const selected = new Map(); // run -> {meta, curves, training, config, color, ...}
let colorIdx = 0;

const $ = (s, r = document) => r.querySelector(s);
const runTag = (m) => [m.model, m.filter, m.smoothing].filter(Boolean).join("·");

async function init() {
  const data = await api.runs();
  RUNS = data.runs;
  renderRunList();
}

function renderRunList() {
  const box = $("#p2-runs");
  const q = ($("#p2-search").value || "").toLowerCase();
  box.innerHTML = "";
  RUNS.filter((r) => r.run.toLowerCase().includes(q)).forEach((r) => {
    const row = document.createElement("label");
    row.className = "run-row";
    const tag = [r.model, r.filter, r.smoothing].filter(Boolean).join(" · ");
    const noData = r.has_curves === false
      ? ` <span class="run-nodata" title="No ExactNSimilarityCheckResult.csv — cannot draw Top-k chart">⚠ no chart data</span>`
      : "";
    row.innerHTML = `
      <input type="checkbox" value="${r.run}" ${selected.has(r.run) ? "checked" : ""}>
      <span class="run-name" title="${r.run}">${r.run}</span>
      <span class="run-tag">${tag}${noData}</span>
      <button class="run-view" title="View config & log">View</button>`;
    row.querySelector("input").addEventListener("change", (e) => toggleRun(r, e.target.checked));
    row.querySelector(".run-view").addEventListener("click", (e) => {
      e.preventDefault();
      openModal(r.run);
    });
    box.appendChild(row);
  });
  const noData = RUNS.filter((r) => r.has_curves === false).length;
  $("#p2-count").textContent =
    `${RUNS.length} MAP runs (newest first)` + (noData ? ` · ${noData} without chart data` : "");
}

async function toggleRun(meta, on) {
  if (on) {
    const color = colorFor(colorIdx++);
    const entry = { meta, curves: null, training: null, color };
    selected.set(meta.run, entry);
    await Promise.all([
      api.runCurves(meta.run)
        .then((c) => { entry.curves = c.curves; })
        .catch((e) => { entry.error = e.message || "no chart data"; }),
      api.runTraining(meta.run)
        .then((t) => { entry.training = t; })
        .catch((e) => { entry.trainingError = e.message || "no training data"; }),
    ]);
  } else {
    selected.delete(meta.run);
  }
  redraw();
}

// --- config field picker (shared with Part 5) --------------------------------
const P2_CONFIG_FIELDS = [
  "model", "test_image_path", "train_protein_path",
  "valid_protein_path", "label_smoothing", "batch_size",
];

export function pickConfigFields(cfg) {
  const out = {};
  P2_CONFIG_FIELDS.forEach((k) => {
    if (cfg && Object.prototype.hasOwnProperty.call(cfg, k)) out[k] = cfg[k];
  });
  return out;
}

function syntax(json) {
  return json
    .replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))
    .replace(/("(\\.|[^"\\])*")(\s*:)?/g, (m, _p, _q, colon) =>
      colon ? `<span class="k">${m}</span>` : `<span class="s">${m}</span>`)
    .replace(/\b(true|false|null)\b/g, `<span class="b">$1</span>`)
    .replace(/\b(-?\d+\.?\d*(e[-+]?\d+)?)\b/gi, `<span class="n">$1</span>`);
}

// --- run details dialog (config 6-fields + Expand, and run.log) --------------
let modalCfg = null;   // {run, config, expanded, configError}

async function openModal(run) {
  $("#p2-modal").hidden = false;
  $("#p2-modal-title").textContent = run;
  $("#p2-modal-config").innerHTML = `<span class="loading">loading config…</span>`;
  $("#p2-modal-log").textContent = "loading log…";
  modalCfg = { run, config: null, expanded: false };
  api.runConfig(run)
    .then(({ config }) => { modalCfg.config = config; })
    .catch((e) => { modalCfg.configError = e.message || "no config"; })
    .finally(renderModalConfig);
  api.runLog(run)
    .then(({ log }) => { $("#p2-modal-log").textContent = log; })
    .catch(() => { $("#p2-modal-log").textContent = "(no run.log for this run)"; });
}

function renderModalConfig() {
  if (!modalCfg) return;
  const btn = $("#p2-modal-expand");
  if (modalCfg.configError) {
    $("#p2-modal-config").innerHTML = `<span class="err">no config: ${modalCfg.configError}</span>`;
    btn.hidden = true;
    return;
  }
  if (!modalCfg.config) return;
  btn.hidden = false;
  btn.textContent = modalCfg.expanded ? "Collapse" : "Expand";
  const obj = modalCfg.expanded ? modalCfg.config : pickConfigFields(modalCfg.config);
  $("#p2-modal-config").innerHTML = syntax(JSON.stringify(obj, null, 2));
}

function closeModal() { $("#p2-modal").hidden = true; modalCfg = null; }

// --- charts ------------------------------------------------------------------
function padTo(arr, n) {
  const out = arr.slice(0, n);
  while (out.length < n) out.push(null);
  return out;
}

function drawTraining() {
  const grid = $("#p2-train-grid");
  const runs = [...selected.values()].filter((s) => s.training);
  if (!runs.length) {
    grid.innerHTML = `<div class="empty">select runs to plot</div>`;
    return;
  }
  const maxLen = Math.max(...runs.map((s) => s.training.epochs.length));
  const xLabels = Array.from({ length: maxLen }, (_, i) => i + 1);
  const series = (col, scale = 1) => runs.map((s) => ({
    label: runTag(s.meta),
    color: s.color,
    values: padTo(s.training.series[col].map((v) => (v == null ? null : v * scale)), maxLen),
  }));
  const niceMax = (ss) => {
    const mx = Math.max(0, ...ss.flatMap((s) => s.values.filter((v) => v != null)));
    return mx <= 0 ? 1 : mx * 1.05;
  };

  grid.innerHTML =
    `<div class="chart" id="tc-tacc"></div><div class="chart" id="tc-vacc"></div>` +
    `<div class="chart" id="tc-lr"></div>` +
    `<div class="chart" id="tc-tloss"></div><div class="chart" id="tc-vloss"></div>`;

  const common = { xLabels, showLabels: false, xAxisLabel: "epoch" };
  const tacc = series("topk1train_acc", 100);
  const vacc = series("topk1val_acc", 100);
  const lr = series("learning_rate");
  const tloss = series("train_loss");
  const vloss = series("val_loss");
  lineChart($("#tc-tacc"), { ...common, title: "Top-1 train accuracy", series: tacc, yMax: 100, yLabel: "%" });
  lineChart($("#tc-vacc"), { ...common, title: "Top-1 val accuracy", series: vacc, yMax: 100, yLabel: "%" });
  lineChart($("#tc-lr"), { ...common, title: "Learning rate", series: lr, yMax: niceMax(lr), yLabel: "lr" });
  lineChart($("#tc-tloss"), { ...common, title: "Train loss", series: tloss, yMax: niceMax(tloss), yLabel: "loss" });
  lineChart($("#tc-vloss"), { ...common, title: "Val loss", series: vloss, yMax: niceMax(vloss), yLabel: "loss" });
}

function redraw() {
  const legend = $("#p2-legend");
  legend.innerHTML = "";
  [...selected.values()].forEach((s) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<i style="background:${s.color}"></i>${runTag(s.meta)} <small>${s.meta.run}</small>`;
    legend.appendChild(item);
  });
  // notice for selected runs with no REAL chart data (no silent drop)
  [...selected.values()].filter((s) => !s.curves).forEach((s) => {
    const item = document.createElement("span");
    item.className = "legend-item nodata";
    item.innerHTML = `<i></i>⚠ <b>${s.meta.run}</b> — no chart data ` +
      `<small>(${s.error || "no ExactNSimilarityCheckResult.csv"})</small>`;
    legend.appendChild(item);
  });

  // REAL PERFORMANCE (unchanged)
  const withCurves = [...selected.values()].filter((s) => s.curves);
  const ks = withCurves.length ? withCurves[0].curves.ks : [1, 3, 5, 10, 20, 50];
  const mk = (key) => withCurves.map((s) => ({
    label: runTag(s.meta), color: s.color, values: s.curves[key],
  }));
  if (!withCurves.length) {
    $("#p2-chart-exact").innerHTML = `<div class="empty">select runs to plot</div>`;
    $("#p2-chart-sim").innerHTML = "";
  } else {
    lineChart($("#p2-chart-exact"), {
      title: "Exact prediction (Top-k accuracy)", xLabels: ks, series: mk("exact"),
    });
    lineChart($("#p2-chart-sim"), {
      title: "Sequential similarity (Top-k accuracy)", xLabels: ks, series: mk("similarity"),
    });
  }

  // TRAINING PERFORMANCE
  drawTraining();
}

function wire() {
  $("#p2-search").addEventListener("input", renderRunList);
  $("#p2-modal-close").addEventListener("click", closeModal);
  $("#p2-modal .modal-backdrop").addEventListener("click", closeModal);
  $("#p2-modal-expand").addEventListener("click", () => {
    if (modalCfg) { modalCfg.expanded = !modalCfg.expanded; renderModalConfig(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#p2-modal").hidden) closeModal();
  });
}

export const Part2 = { init: async () => { wire(); await init(); redraw(); } };
