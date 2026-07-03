// Part 4 — Scripts to run: the .pdb -> .mrc -> .hdf -> .png pipeline plus an
// "Additional" section, each showing the REAL content of a script in a
// scrollable code box (read-only API, whitelisted dirs).
import { api } from "./api.js";

const $ = (s, r = document) => r.querySelector(s);

function esc(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Build gutter + content strings. With `ranges` (1-based inclusive line spans)
// only those real lines are shown, keeping their original line numbers, with an
// "omitted" separator between spans. Without ranges, the whole file is shown.
function layout(content, ranges) {
  const all = content.replace(/\n$/, "").split("\n");
  if (!ranges || !ranges.length) {
    return { gutter: all.map((_, n) => n + 1).join("\n"), body: esc(content) };
  }
  const g = [], b = [];
  let prevEnd = null;
  ranges.forEach(([s, e]) => {
    if (prevEnd !== null) {
      g.push("⋯");
      b.push(`      ── lines ${prevEnd + 1}–${s - 1} omitted ──`);
    }
    for (let ln = s; ln <= e; ln++) { g.push(String(ln)); b.push(esc(all[ln - 1] ?? "")); }
    prevEnd = e;
  });
  return { gutter: g.join("\n"), body: b.join("\n") };
}

// Fill one card's code box with the real script content (or an error).
async function fillCode(card, spec) {
  const codeBox = card.querySelector(".code-box");
  if (!spec.available) {
    codeBox.innerHTML =
      `<div class="err">script not found on server: ${spec.file}</div>`;
    return;
  }
  try {
    const { content } = await api.script(spec.file, spec.dir || "eman2");
    const { gutter, body } = layout(content, spec.ranges);
    codeBox.innerHTML =
      `<pre class="code-gutter">${gutter}</pre>` +
      `<pre class="code-content"><code>${body}</code></pre>`;
  } catch (e) {
    codeBox.innerHTML = `<div class="err">could not read ${spec.file}: ${e.message}</div>`;
  }
}

// Render a list of scripts into a container. `mode` is "pipeline" | "additional".
async function renderList(container, specs, mode) {
  container.innerHTML = "";
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    const badge = mode === "pipeline"
      ? `<span class="step-badge">Step ${i + 1}</span><span class="step-name">${s.step}</span>`
      : `<span class="step-name">${esc(s.title)}</span>`;
    const card = document.createElement("div");
    card.className = "script-step";
    card.innerHTML = `
      <div class="script-head">
        ${badge}
        <code class="step-file">${s.dir === "viz" ? "sourceCode/visuallization/" : ""}${s.file}</code>
        ${s.ranges ? `<span class="excerpt-note">excerpt · lines ${s.ranges.map((r) => `${r[0]}–${r[1]}`).join(", ")}</span>` : ""}
      </div>
      <div class="script-desc">${esc(s.desc)}</div>
      <div class="code-box"><div class="loading">loading ${s.file}…</div></div>`;
    container.appendChild(card);
    await fillCode(card, s);
  }
}

async function init() {
  let data;
  try {
    data = await api.scripts();
  } catch (e) {
    $("#p4-steps").innerHTML = `<div class="err">${e.message}</div>`;
    return;
  }
  $("#p4-libpath").textContent = data.library;
  await renderList($("#p4-steps"), data.steps, "pipeline");
  await renderList($("#p4-additional"), data.additional || [], "additional");
}

export const Part4 = { init };
