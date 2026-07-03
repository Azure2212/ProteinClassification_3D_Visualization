// Part 2 — wandb-style: pick MAP runs, show config.json, two top-k line charts.
import { api } from "./api.js";
import { lineChart, colorFor } from "./minichart.js";

let RUNS = [];
const selected = new Map(); // run -> {meta, curves, color}
let colorIdx = 0;

const $ = (s, r = document) => r.querySelector(s);

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
      <span class="run-tag">${tag}${noData}</span>`;
    row.querySelector("input").addEventListener("change", (e) =>
      toggleRun(r, e.target.checked));
    box.appendChild(row);
  });
  const noData = RUNS.filter((r) => r.has_curves === false).length;
  $("#p2-count").textContent =
    `${RUNS.length} MAP runs (newest first)` + (noData ? ` · ${noData} without chart data` : "");
}

async function toggleRun(meta, on) {
  if (on) {
    const color = colorFor(colorIdx++);
    selected.set(meta.run, { meta, curves: null, color });
    // fetch curves + config in parallel; render as each resolves
    const entry = selected.get(meta.run);
    const jobs = [
      api.runCurves(meta.run)
        .then((c) => { entry.curves = c.curves; })
        .catch((e) => { entry.error = e.message || "no chart data"; }),
      api.runConfig(meta.run)
        .then(({ config }) => { entry.config = config; })
        .catch((e) => { entry.configError = e.message || "no config"; }),
    ];
    await Promise.all(jobs);
  } else {
    selected.delete(meta.run);
  }
  redraw();
}

// Only these config fields are shown in Part 2 (in this order). Missing keys are
// skipped (never invented). Part 5 still shows the full config.
const P2_CONFIG_FIELDS = [
  "model", "test_image_path", "train_protein_path",
  "valid_protein_path", "label_smoothing", "batch_size",
];

function pickConfigFields(cfg) {
  const out = {};
  P2_CONFIG_FIELDS.forEach((k) => {
    if (cfg && Object.prototype.hasOwnProperty.call(cfg, k)) out[k] = cfg[k];
  });
  return out;
}

// Render the config.json of EVERY selected run — one scrollable card each,
// titled with the run name and colour-matched to its chart line.
function renderConfigs() {
  const panel = $("#p2-config");
  const runs = [...selected.values()];
  if (!runs.length) {
    panel.innerHTML = `<div class="empty">select a run to view its config.json</div>`;
    return;
  }
  panel.innerHTML = runs.map((s) => {
    let body;
    if (s.config) {
      body = `<pre class="config-json">${syntax(JSON.stringify(pickConfigFields(s.config), null, 2))}</pre>`;
    } else if (s.configError) {
      body = `<div class="err">no config: ${s.configError}</div>`;
    } else {
      body = `<div class="loading">loading config…</div>`;
    }
    return `<div class="config-card">` +
      `<div class="config-head"><i style="background:${s.color}"></i>` +
      `config.json — <b>${s.meta.run}</b></div>${body}</div>`;
  }).join("");
}

function syntax(json) {
  return json
    .replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))
    .replace(/("(\\.|[^"\\])*")(\s*:)?/g, (m, _p, _q, colon) =>
      colon ? `<span class="k">${m}</span>` : `<span class="s">${m}</span>`)
    .replace(/\b(true|false|null)\b/g, `<span class="b">$1</span>`)
    .replace(/\b(-?\d+\.?\d*(e[-+]?\d+)?)\b/gi, `<span class="n">$1</span>`);
}

function redraw() {
  renderConfigs();                 // show every selected run's config (not just one)
  const legend = $("#p2-legend");
  legend.innerHTML = "";
  const withCurves = [...selected.values()].filter((s) => s.curves);
  withCurves.forEach((s) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    const tag = [s.meta.model, s.meta.filter, s.meta.smoothing].filter(Boolean).join("·");
    item.innerHTML = `<i style="background:${s.color}"></i>${tag} <small>${s.meta.run}</small>`;
    legend.appendChild(item);
  });
  // Explicit notice for selected runs that carry no chart data (no silent drop).
  [...selected.values()].filter((s) => !s.curves).forEach((s) => {
    const item = document.createElement("span");
    item.className = "legend-item nodata";
    item.innerHTML = `<i></i>⚠ <b>${s.meta.run}</b> — no chart data ` +
      `<small>(${s.error || "no ExactNSimilarityCheckResult.csv"})</small>`;
    legend.appendChild(item);
  });

  const ks = withCurves.length ? withCurves[0].curves.ks : [1, 3, 5, 10, 20, 50];
  const mk = (key) => withCurves.map((s) => ({
    label: [s.meta.model, s.meta.filter, s.meta.smoothing].filter(Boolean).join("·"),
    color: s.color,
    values: s.curves[key],
  }));

  if (!withCurves.length) {
    $("#p2-chart-exact").innerHTML = `<div class="empty">select runs to plot</div>`;
    $("#p2-chart-sim").innerHTML = "";
    return;
  }
  lineChart($("#p2-chart-exact"), {
    title: "Exact prediction (Top-k accuracy)", xLabels: ks, series: mk("exact"),
  });
  lineChart($("#p2-chart-sim"), {
    title: "Sequential similarity (Top-k accuracy)", xLabels: ks, series: mk("similarity"),
  });
}

function wire() {
  $("#p2-search").addEventListener("input", renderRunList);
}

export const Part2 = { init: async () => { wire(); await init(); redraw(); } };
