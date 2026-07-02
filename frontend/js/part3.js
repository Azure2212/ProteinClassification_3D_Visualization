// Part 3 — summary table: dataset x model -> protein (rows) x filter/run (cols).
// Cell = correct/total exact predictions per protein.
//   MAP: sourced live from trained_results ExactN CSVs, top-k selectable.
//   PDB: sourced from the professor's Excel (EMDB_ExactNSimilarity 229),
//        top-50 only, columns = per-filter + smoothing-comparison variants.
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
  // PDB Excel data is top-50 only -> lock the top-k control.
  const kSel = $("#p3-k");
  if (ds === "PDB") {
    kSel.value = "50";
    kSel.disabled = true;
    kSel.title = "PDB Excel data is top-50 only";
  } else {
    kSel.disabled = false;
    kSel.title = "";
  }
  load();
}

function frac(cell) {
  if (!cell) return { txt: "—", pct: null };
  const pct = cell.total ? cell.correct / cell.total : 0;
  return { txt: `${cell.correct}/${cell.total}`, pct };
}

function heat(pct) {
  if (pct === null) return "";
  const a = 0.12 + 0.68 * pct;               // green scale by accuracy
  return `background: rgba(22,163,74,${a.toFixed(3)});` +
    (pct > 0.6 ? "color:#fff;" : "");
}

function renderHead(data) {
  let html = `<thead>`;
  // Excel PDB data: add a grouping header row (no-smoothing filters vs smoothing).
  if (data.source === "excel") {
    const groups = [];
    data.columns.forEach((c) => {
      const last = groups[groups.length - 1];
      if (last && last.g === c.group) last.n += 1;
      else groups.push({ g: c.group, n: 1 });
    });
    html += `<tr><th class="sticky-col"></th>`;
    groups.forEach((g) => {
      html += `<th colspan="${g.n}" class="group-hd">${g.g}</th>`;
    });
    html += `</tr>`;
  }
  html += `<tr><th class="sticky-col">protein \\ ${data.source === "excel" ? "variant" : "filter"}</th>`;
  data.columns.forEach((c) => {
    const warn = c.mismatch ? " ⚠" : "";
    html += `<th title="${c.run}">${c.label}${warn}</th>`;
  });
  return html + `</tr></thead>`;
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
    wrap.innerHTML = `<div class="empty">no data for ${ds} · ${model}</div>`;
    return;
  }

  let html = `<table class="grid-table">` + renderHead(data) + `<tbody>`;
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
    let extra = "";
    if (c.mismatch) {
      extra = `<br><small class="warn" title="Source Excel states ` +
        `${c.stated} — differs from the sum of its per-protein cells; ` +
        `values shown are recovered from the corrupted date cells, not corrected.">` +
        `⚠ Excel states ${c.stated_correct}</small>`;
    }
    html += `<td><b>${c.total_correct}/${c.total_images}</b>` +
      `<br><small>${pct.toFixed(1)}%</small>${extra}</td>`;
  });
  html += `</tr></tbody></table>`;
  wrap.innerHTML = html;

  // caption + provenance
  if (data.source === "excel") {
    $("#p3-caption").innerHTML =
      `<b>PDB · ${model}</b> · exact Top-${data.k} · input ${data.input} · ` +
      `cell = correct/total images per protein (${data.total_images} total)` +
      `<br><small class="src">source: ${data.note}</small>` +
      `<br><small class="src">⚠ = row whose per-cell sum differs from the Excel's stated total (source typo; not corrected).</small>`;
  } else {
    $("#p3-caption").textContent =
      `MAP · ${model} · exact Top-${k} · cell = correct/total images per protein ` +
      `· source: eval trained_results (v2_193)`;
  }
}

export const Part3 = { init };
