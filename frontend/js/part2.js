// Part 2 — Training Runs. Two sections per selected run set:
//   REAL PERFORMANCE     — the two Top-k charts on the 193 held-out test images.
//   TRAINING PERFORMANCE — per-epoch curves from trainingTracking.csv (Top-1).
// A per-run "View" button opens a dialog with the config (6 fields + Expand).
// Each selected run is one coloured line across every chart.
import { api } from "./api.js";
import { lineChart, colorFor } from "./minichart.js";

let RUNS = [];
const selected = new Map(); // run -> {meta, curves, training, config, color, ...}
let colorIdx = 0;

const $ = (s, r = document) => r.querySelector(s);
const runTag = (m) => [m.model, m.filter, m.smoothing].filter(Boolean).join("·");

// Hover a selected run's row -> emphasize its line across ALL charts and dim the
// others. `on=false` clears the highlight. Uses data-run tags set by lineChart.
function highlightRun(run, on) {
  const main = $(".p2-main");
  if (!main) return;
  main.querySelectorAll("[data-run]").forEach((el) => {
    const isThis = el.getAttribute("data-run") === run;
    el.classList.toggle("series-hl", on && isThis);
    el.classList.toggle("series-dim", on && !isThis);
  });
}

async function init() {
  const data = await api.runs();
  RUNS = data.runs;
  renderRunList();
  // Default placeholder: auto-select the most recent run that has chart data
  // (RUNS is newest-first) so charts show on load instead of an empty screen.
  const def = RUNS.find((r) => r.has_curves !== false) || RUNS[0];
  if (def) {
    await toggleRun(def, true);   // fetches curves + training, then redraws
    renderRunList();              // reflect the checked box in the list
  }
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
    // hover a SELECTED run -> highlight its line, dim the others
    row.addEventListener("mouseenter", () => { if (selected.has(r.run)) highlightRun(r.run, true); });
    row.addEventListener("mouseleave", () => { if (selected.has(r.run)) highlightRun(r.run, false); });
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

// --- run details dialog (config 6-fields + Expand) ---------------------------
let modalCfg = null;   // {run, config, expanded, configError}

async function openModal(run) {
  $("#p2-modal").hidden = false;
  $("#p2-modal-title").textContent = run;
  $("#p2-modal-config").innerHTML = `<span class="loading">loading config…</span>`;
  modalCfg = { run, config: null, expanded: false };
  api.runConfig(run)
    .then(({ config }) => { modalCfg.config = config; })
    .catch((e) => { modalCfg.configError = e.message || "no config"; })
    .finally(renderModalConfig);
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

// Right-drag pan shared across charts (window listeners registered once).
let _pan = null;
function _panMove(e) {
  if (!_pan) return;
  const r = _pan.svg.getBoundingClientRect();
  const nx = _pan.svb[0] - (e.clientX - _pan.sx) / r.width * _pan.vb[2];
  const ny = _pan.svb[1] - (e.clientY - _pan.sy) / r.height * _pan.vb[3];
  _pan.vb[0] = Math.max(_pan.minX, Math.min(_pan.maxX, nx));
  _pan.vb[1] = Math.max(_pan.minY, Math.min(_pan.maxY, ny));
  _pan.apply();
}
let _panWired = false;
function ensurePan() {
  if (_panWired) return;
  _panWired = true;
  window.addEventListener("mousemove", _panMove);
  window.addEventListener("mouseup", () => { _pan = null; });
}

// Per-chart zoom via the SVG viewBox (SVG stays the same size, shows a zoomed
// sub-region). +/- zoom from centre; double-click or 1× resets. RIGHT-DRAG pans
// the zoomed view (clamped to the data bounds). No wheel zoom. Clamp 1x..8x.
function attachZoom(wrap, chartEl) {
  const svg = chartEl.querySelector("svg");
  if (!svg) return;
  const base = (svg.getAttribute("viewBox") || "0 0 460 300").split(/\s+/).map(Number);
  const [bx, by, bw, bh] = base;
  const MIN_W = bw / 8;                 // max zoom 8x
  const vb = base.slice();              // mutated in place (stable reference)
  const apply = () => svg.setAttribute("viewBox", vb.join(" "));
  function zoomAround(factor, cx, cy) {
    const nw = Math.max(MIN_W, Math.min(bw, vb[2] / factor));
    const nh = nw * (bh / bw);
    vb[0] = cx - (cx - vb[0]) * (nw / vb[2]);
    vb[1] = cy - (cy - vb[1]) * (nh / vb[3]);
    vb[2] = nw; vb[3] = nh;
    vb[0] = Math.max(bx, Math.min(bx + bw - nw, vb[0]));
    vb[1] = Math.max(by, Math.min(by + bh - nh, vb[1]));
    apply();
  }
  const centre = (f) => zoomAround(f, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2);
  const reset = () => { vb[0] = bx; vb[1] = by; vb[2] = bw; vb[3] = bh; apply(); };
  // right-drag to pan; suppress the browser context menu
  svg.addEventListener("contextmenu", (e) => e.preventDefault());
  svg.addEventListener("mousedown", (e) => {
    if (e.button !== 2) return;         // right button only
    e.preventDefault();
    ensurePan();
    _pan = { svg, vb, apply, sx: e.clientX, sy: e.clientY, svb: vb.slice(),
      minX: bx, maxX: bx + bw - vb[2], minY: by, maxY: by + bh - vb[3] };
  });
  svg.addEventListener("dblclick", reset);
  wrap.querySelector(".zoom-in").addEventListener("click", () => centre(1.3));
  wrap.querySelector(".zoom-out").addEventListener("click", () => centre(1 / 1.3));
  wrap.querySelector(".zoom-reset").addEventListener("click", reset);
}

// --- charts ------------------------------------------------------------------
function padTo(arr, n) {
  const out = arr.slice(0, n);
  while (out.length < n) out.push(null);
  return out;
}

function drawTraining() {
  const grid = $("#p2-train-grid");
  if (!grid) return;
  const runs = [...selected.values()].filter((s) => s.training && s.training.series);
  if (!runs.length) {
    grid.innerHTML = `<div class="empty">select runs to plot</div>`;
    return;
  }
  try {
    const maxLen = runs.reduce((mx, s) => Math.max(mx, (s.training.epochs || []).length), 0);
    const xLabels = Array.from({ length: maxLen }, (_, i) => i + 1);
    // one series per run for a column (missing/short columns -> nulls, never throw)
    const series = (col, scale = 1) => runs.map((s) => {
      const raw = Array.isArray(s.training.series[col]) ? s.training.series[col] : [];
      return {
        label: runTag(s.meta),
        color: s.color,
        run: s.meta.run,
        values: padTo(raw.map((v) => (v == null ? null : v * scale)), maxLen),
      };
    });
    // max over all values without spreading a big array (avoids arg-count limits)
    const niceMax = (ss) => {
      let mx = 0;
      ss.forEach((s) => s.values.forEach((v) => { if (v != null && v > mx) mx = v; }));
      return mx <= 0 ? 1 : mx * 1.05;
    };

    const common = { xLabels, showLabels: false, xAxisLabel: "epoch" };
    // Top-k accuracy columns available in trainingTracking.csv (no top-50).
    const availK = (runs[0].training && runs[0].training.topk) || [1, 3, 5, 10, 20];
    const specs = [
      { acc: "train" },
      { acc: "val" },
      { col: "learning_rate", title: "Learning rate", yLabel: "lr" },
      { col: "train_loss", title: "Train loss", yLabel: "loss" },
      { col: "val_loss", title: "Val loss", yLabel: "loss" },
    ];
    grid.innerHTML = "";
    specs.forEach((sp) => {
      const wrap = document.createElement("div");
      wrap.className = "chart-zoom";
      // accuracy charts get a Top-k dropdown, placed opposite the zoom buttons
      const leftCtrl = sp.acc
        ? `<div class="chart-ctrl-left"><select class="topk-sel" title="Top-k accuracy">` +
            availK.map((k) => `<option value="${k}">Top-${k}</option>`).join("") +
          `</select></div>`
        : "";
      wrap.innerHTML =
        leftCtrl +
        `<div class="chart"></div>` +
        `<div class="zoom-ctrl">` +
        `<button class="zbtn zoom-out" title="Zoom out">−</button>` +
        `<button class="zbtn zoom-reset" title="Reset (dbl-click chart)">1×</button>` +
        `<button class="zbtn zoom-in" title="Zoom in">+</button></div>`;
      grid.appendChild(wrap);
      const chartEl = wrap.querySelector(".chart");
      const paint = () => {
        let title, ser, yMax, yLabel;
        if (sp.acc) {
          const k = Number(wrap.querySelector(".topk-sel").value);
          title = `Top-${k} ${sp.acc} accuracy`;
          ser = series(`topk${k}${sp.acc}_acc`, 100);
          yMax = 100; yLabel = "%";
        } else {
          title = sp.title; ser = series(sp.col); yLabel = sp.yLabel;
          yMax = niceMax(ser);
        }
        lineChart(chartEl, { ...common, title, series: ser, yMax, yLabel });
        attachZoom(wrap, chartEl);   // re-attach (SVG replaced)
      };
      paint();
      if (sp.acc) wrap.querySelector(".topk-sel").addEventListener("change", paint);
    });
  } catch (e) {
    grid.innerHTML = `<div class="err">training charts failed to render: ${e.message}</div>`;
  }
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
    label: runTag(s.meta), color: s.color, values: s.curves[key], run: s.meta.run,
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
