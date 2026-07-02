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

// xLabels: array of category labels (e.g. [1,3,5,10,20,50]) shared by all series.
// series[i].values aligns with xLabels.
export function lineChart(container, { title, xLabels, series, yMax = 100, yLabel = "%", showLabels = true }) {
  const W = 460, H = 300;
  const m = { top: 34, right: 14, bottom: 40, left: 44 };
  const pw = W - m.left - m.right;
  const ph = H - m.top - m.bottom;
  const n = xLabels.length;
  const xAt = (i) => m.left + (n === 1 ? pw / 2 : (pw * i) / (n - 1));
  const yAt = (v) => m.top + ph - (ph * Math.max(0, Math.min(yMax, v))) / yMax;

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(title)}">`;
  svg += `<text x="${W / 2}" y="18" text-anchor="middle" class="chart-title">${esc(title)}</text>`;

  // y gridlines + labels
  const ticks = 5;
  for (let t = 0; t <= ticks; t++) {
    const v = (yMax * t) / ticks;
    const y = yAt(v);
    svg += `<line x1="${m.left}" y1="${y}" x2="${W - m.right}" y2="${y}" class="grid"/>`;
    svg += `<text x="${m.left - 6}" y="${y + 3}" text-anchor="end" class="tick">${v}</text>`;
  }
  // x labels
  xLabels.forEach((lab, i) => {
    const x = xAt(i);
    svg += `<text x="${x}" y="${H - m.bottom + 16}" text-anchor="middle" class="tick">${esc(lab)}</text>`;
  });
  svg += `<text x="${m.left + pw / 2}" y="${H - 4}" text-anchor="middle" class="axis-label">Top-k</text>`;
  svg += `<text x="12" y="${m.top + ph / 2}" text-anchor="middle" class="axis-label" transform="rotate(-90 12 ${m.top + ph / 2})">${esc(yLabel)}</text>`;

  // series (lines + points)
  series.forEach((s) => {
    const pts = s.values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
    svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
    s.values.forEach((v, i) => {
      svg += `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="3" fill="${s.color}">`
        + `<title>${esc(s.label)} — Top-${xLabels[i]}: ${fmtValue(v, yLabel)}${String(yLabel).includes("%") ? "%" : ""}</title></circle>`;
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
      })).sort((a, b) => a.py - b.py);
      const GAP = 11;                 // min vertical spacing between labels
      let lastY = -Infinity;
      col.forEach((c) => {
        let ly = c.py - 7;            // default: just above the point
        if (ly < lastY + GAP) ly = lastY + GAP;   // push down if too close
        lastY = ly;
        const x = xAt(i);
        svg += `<text x="${x}" y="${ly}" text-anchor="middle" class="pt-label" `
          + `fill="${c.color}" stroke="#ffffff" stroke-width="2.6" paint-order="stroke">`
          + `${esc(fmtValue(c.val, yLabel))}</text>`;
      });
    }
  }

  svg += `</svg>`;
  container.innerHTML = svg;
}
