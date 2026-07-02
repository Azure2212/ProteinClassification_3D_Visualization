// Part 3 — summary table: dataset x model -> protein (rows) x filter/run (cols).
// Cell = correct/total exact predictions per protein (top-k selectable).
import { api } from "./api.js";

let MODELS = {};
const $ = (s, r = document) => r.querySelector(s);

function opt(v, label) {
  const o = document.createElement("option");
  o.value = v; o.textContent = label ?? v;
  return o;
}

async function init() {
  MODELS = await api.models();
  const dsSel = $("#p3-dataset");
  Object.keys(MODELS).forEach((ds) => dsSel.appendChild(opt(ds)));
  dsSel.addEventListener("change", refreshModels);
  $("#p3-model").addEventListener("change", load);
  $("#p3-k").addEventListener("change", load);
  refreshModels();
}

function refreshModels() {
  const ds = $("#p3-dataset").value;
  const mSel = $("#p3-model");
  mSel.innerHTML = "";
  (MODELS[ds] || []).forEach((m) => mSel.appendChild(opt(m)));
  load();
}

function frac(cell) {
  if (!cell) return { txt: "—", pct: null };
  const pct = cell.total ? cell.correct / cell.total : 0;
  return { txt: `${cell.correct}/${cell.total}`, pct };
}

function heat(pct) {
  if (pct === null) return "";
  // green scale by accuracy
  const a = 0.12 + 0.68 * pct;
  return `background: rgba(22,163,74,${a.toFixed(3)});` +
    (pct > 0.6 ? "color:#fff;" : "");
}

async function load() {
  const ds = $("#p3-dataset").value;
  const model = $("#p3-model").value;
  const k = $("#p3-k").value;
  if (!model) return;
  const wrap = $("#p3-table-wrap");
  wrap.innerHTML = `<div class="loading">loading…</div>`;
  let data;
  try {
    data = await api.part3(ds, model, k);
  } catch (e) {
    wrap.innerHTML = `<div class="err">${e.message}</div>`;
    return;
  }
  if (!data.columns.length) {
    wrap.innerHTML = `<div class="empty">no runs for ${ds} · ${model}</div>`;
    return;
  }
  let html = `<table class="grid-table"><thead><tr>` +
    `<th class="sticky-col">protein \\ filter</th>`;
  data.columns.forEach((c) => {
    html += `<th title="${c.run}">${c.label}</th>`;
  });
  html += `</tr></thead><tbody>`;
  data.proteins.forEach((prot) => {
    html += `<tr><th class="sticky-col">${prot}</th>`;
    data.columns.forEach((c) => {
      const f = frac(c.cells[prot]);
      html += `<td style="${heat(f.pct)}">${f.txt}</td>`;
    });
    html += `</tr>`;
  });
  // totals row
  html += `<tr class="total-row"><th class="sticky-col">Total</th>`;
  data.columns.forEach((c) => {
    const pct = c.total_images ? (100 * c.total_correct / c.total_images) : 0;
    html += `<td><b>${c.total_correct}/${c.total_images}</b><br><small>${pct.toFixed(1)}%</small></td>`;
  });
  html += `</tr></tbody></table>`;
  wrap.innerHTML = html;
  $("#p3-caption").textContent =
    `${ds} · ${model} · exact Top-${k} · cell = correct/total images per protein`;
}

export const Part3 = { init };
