// Tiny dependency-free multi-line chart rendered as inline SVG.
// series: [{label, color, points:[{x,y}]}]  x categorical (top-k), y in %.
const PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5",
  "#0d9488", "#be123c", "#a16207", "#9333ea", "#0284c7",
];

export function colorFor(i) {
  return PALETTE[i % PALETTE.length];
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]
  ));
}

// Format a value for the on-point data label, matching the chart's unit:
//   percentage charts -> 1 decimal; count charts -> integer.
function fmtValue(v, yLabel) {
  if (String(yLabel).includes("%")) {
    return (Math.round(v * 10) / 10).toFixed(1);
  }
  return Number.isInteger(v) ? String(v) : String(Math.round(v));
}

// Format a y-axis tick compactly (handles %, tiny lr, and large loss values).
function fmtTick(v) {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a < 0.001 || a >= 100000) return v.toExponential(1);
  return String(Math.round(v * 1000) / 1000);
}

// xLabels: array of category labels (e.g. [1,3,5,10,20,50]) shared by all series.
// series[i].values aligns with xLabels. xAxisLabel names the x axis; showLabels
// draws per-point value labels (turn OFF for many-point epoch charts).
export function lineChart(container, {
  title, xLabels, series, yMax = 100, yLabel = "%",
  showLabels = true, xAxisLabel = "Top-k",
}) {
  const W = 460, H = 300;
  const m = { top: 34, right: 14, bottom: 40, left: 44 };
  const pw = W - m.left - m.right;
  const ph = H - m.top - m.bottom;
  const n = xLabels.length;
  const xAt = (i) => m.left + (n === 1 ? pw / 2 : (pw * i) / (n - 1));
  const yAt = (v) => m.top + ph - (ph * Math.max(0, Math.min(yMax, v || 0))) / yMax;
  const isPct = String(yLabel).includes("%");

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(title)}">`;
  svg += `<text x="${W / 2}" y="18" text-anchor="middle" class="chart-title">${esc(title)}</text>`;

  // y gridlines + labels
  const ticks = 5;
  for (let t = 0; t <= ticks; t++) {
    const v = (yMax * t) / ticks;
    const y = yAt(v);
    svg += `<line x1="${m.left}" y1="${y}" x2="${W - m.right}" y2="${y}" class="grid"/>`;
    svg += `<text x="${m.left - 6}" y="${y + 3}" text-anchor="end" class="tick">${fmtTick(v)}</text>`;
  }
  // x labels — thin out when there are many (e.g. epochs) to avoid crowding
  const step = Math.max(1, Math.ceil(n / 12));
  xLabels.forEach((lab, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const x = xAt(i);
    svg += `<text x="${x}" y="${H - m.bottom + 16}" text-anchor="middle" class="tick">${esc(lab)}</text>`;
  });
  svg += `<text x="${m.left + pw / 2}" y="${H - 4}" text-anchor="middle" class="axis-label">${esc(xAxisLabel)}</text>`;
  svg += `<text x="12" y="${m.top + ph / 2}" text-anchor="middle" class="axis-label" transform="rotate(-90 12 ${m.top + ph / 2})">${esc(yLabel)}</text>`;

  // series (lines + points). null values (e.g. NaN loss epochs) are skipped so
  // the line spans the gap instead of diving to 0, and no dot is drawn there.
  // Each element carries data-run (when provided) for hover-highlight.
  series.forEach((s) => {
    const dr = s.run ? ` data-run="${esc(s.run)}"` : "";
    const pts = s.values
      .map((v, i) => (v == null ? null : `${xAt(i)},${yAt(v)}`))
      .filter(Boolean).join(" ");
    svg += `<polyline class="series-line"${dr} points="${pts}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
    s.values.forEach((v, i) => {
      if (v == null) return;
      const r = n > 30 ? 1.6 : 3;      // smaller dots on dense epoch charts
      svg += `<circle class="series-dot"${dr} cx="${xAt(i)}" cy="${yAt(v)}" r="${r}" fill="${s.color}">`
        + `<title>${esc(s.label)} — ${esc(xAxisLabel)} ${xLabels[i]}: ${fmtValue(v, yLabel)}${isPct ? "%" : ""}</title></circle>`;
    });
  });

  // data labels — one per point, drawn above the point with a white halo so they
  // stay readable over lines/gridlines. Within each x column the labels are nudged
  // apart vertically so overlapping series don't stack illegibly.
  if (showLabels) {
    for (let i = 0; i < n; i++) {
      // collect this column's labels, sorted top-most first
      const col = series.map((s) => ({
        color: s.color,
        val: s.values[i],
        py: yAt(s.values[i]),
        run: s.run,
      })).sort((a, b) => a.py - b.py);
      const GAP = 11;                 // min vertical spacing between labels
      let lastY = -Infinity;
      col.forEach((c) => {
        let ly = c.py - 7;            // default: just above the point
        if (ly < lastY + GAP) ly = lastY + GAP;   // push down if too close
        lastY = ly;
        const x = xAt(i);
        const dr = c.run ? ` data-run="${esc(c.run)}"` : "";
        svg += `<text x="${x}" y="${ly}" text-anchor="middle" class="pt-label"${dr} `
          + `fill="${c.color}" stroke="#ffffff" stroke-width="2.6" paint-order="stroke">`
          + `${esc(fmtValue(c.val, yLabel))}</text>`;
      });
    }
  }

  svg += `</svg>`;
  container.innerHTML = svg;
}

// Vertical bar chart (Part 5). bars: [{label, value, color?, highlight?}].
// Each bar (and its value + rotated axis label) is drawn in `color` when given,
// else `highlightColor` if `highlight` is true, else `baseColor`.
export function barChart(container, {
  title, bars, yLabel = "%", baseColor = "#111827", highlightColor = "#dc2626",
}) {
  const barColor = (b) => b.color || (b.highlight ? highlightColor : baseColor);
  const n = bars.length;
  const slot = 30;                         // px per bar
  const m = { top: 30, right: 12, bottom: 62, left: 40 };
  const pw = Math.max(360, n * slot);
  const W = pw + m.left + m.right;
  const ph = 200;
  const H = ph + m.top + m.bottom;
  const maxV = Math.max(1, ...bars.map((b) => b.value));
  const yMax = Math.min(100, Math.ceil(maxV / 10) * 10 || 10);
  const xAt = (i) => m.left + slot * i + slot / 2;
  const yAt = (v) => m.top + ph - (ph * Math.max(0, Math.min(yMax, v))) / yMax;

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg bar-svg" role="img" aria-label="${esc(title)}">`;
  svg += `<text x="${W / 2}" y="16" text-anchor="middle" class="chart-title">${esc(title)}</text>`;

  // y gridlines + ticks
  for (let t = 0; t <= 5; t++) {
    const v = (yMax * t) / 5;
    const y = yAt(v);
    svg += `<line x1="${m.left}" y1="${y}" x2="${W - m.right}" y2="${y}" class="grid"/>`;
    svg += `<text x="${m.left - 6}" y="${y + 3}" text-anchor="end" class="tick">${v}</text>`;
  }

  const bw = slot * 0.62;
  bars.forEach((b, i) => {
    const x = xAt(i);
    const y = yAt(b.value);
    const h = m.top + ph - y;
    const color = barColor(b);
    svg += `<rect x="${x - bw / 2}" y="${y}" width="${bw}" height="${Math.max(0, h)}" `
      + `rx="1.5" fill="${color}"><title>${esc(b.label)}: ${b.value}%</title></rect>`;
    // value above bar (only where tall enough to avoid clutter), coloured to match.
    // Use inline `style` (not the fill attribute) so it beats the stylesheet.
    if (b.value >= 0.5) {
      svg += `<text x="${x}" y="${y - 3}" text-anchor="middle" class="bar-val" `
        + `style="fill:${color}" stroke="#fff" stroke-width="2.4" paint-order="stroke">${b.value}</text>`;
    }
    // rotated label under the axis, coloured to match the bar
    svg += `<text x="${x}" y="${m.top + ph + 12}" text-anchor="end" class="bar-lab" `
      + `style="fill:${color}" transform="rotate(-55 ${x} ${m.top + ph + 12})">`
      + `${esc(b.label)}</text>`;
  });

  svg += `<text x="12" y="${m.top + ph / 2}" text-anchor="middle" class="axis-label" `
    + `transform="rotate(-90 12 ${m.top + ph / 2})">${esc(yLabel)}</text>`;
  svg += `</svg>`;
  container.innerHTML = svg;
}
