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
    row.innerHTML = `
      <input type="checkbox" value="${r.run}" ${selected.has(r.run) ? "checked" : ""}>
      <span class="run-name">${r.run}</span>
      <span class="run-tag">${tag}</span>`;
    row.querySelector("input").addEventListener("change", (e) =>
      toggleRun(r, e.target.checked));
    box.appendChild(row);
  });
  $("#p2-count").textContent = `${RUNS.length} MAP runs`;
}

async function toggleRun(meta, on) {
  if (on) {
    const color = colorFor(colorIdx++);
    selected.set(meta.run, { meta, curves: null, color });
    try {
      const c = await api.runCurves(meta.run);
      selected.get(meta.run).curves = c.curves;
    } catch (e) {
      selected.get(meta.run).error = e.message;
    }
    showConfig(meta.run);
  } else {
    selected.delete(meta.run);
  }
  redraw();
}

async function showConfig(run) {
  const panel = $("#p2-config");
  panel.innerHTML = `<div class="loading">loading config…</div>`;
  try {
    const { config } = await api.runConfig(run);
    panel.innerHTML =
      `<div class="config-head">config.json — <b>${run}</b></div>` +
      `<pre class="config-json">${syntax(JSON.stringify(config, null, 2))}</pre>`;
  } catch (e) {
    panel.innerHTML = `<div class="err">no config for ${run}</div>`;
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

function redraw() {
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
