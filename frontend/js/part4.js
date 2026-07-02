// Part 4 — Scripts to run: the .pdb -> .mrc -> .hdf -> .png pipeline, with the
// REAL content of each EMAN2 script shown in a scrollable code box (read-only API).
import { api } from "./api.js";

const $ = (s, r = document) => r.querySelector(s);

function esc(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
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

  const box = $("#p4-steps");
  box.innerHTML = "";
  for (let i = 0; i < data.steps.length; i++) {
    const s = data.steps[i];
    const card = document.createElement("div");
    card.className = "script-step";
    card.innerHTML = `
      <div class="script-head">
        <span class="step-badge">Step ${i + 1}</span>
        <span class="step-name">${s.step}</span>
        <code class="step-file">${s.file}</code>
      </div>
      <div class="script-desc">${esc(s.desc)}</div>
      <div class="code-box"><div class="loading">loading ${s.file}…</div></div>`;
    box.appendChild(card);

    const codeBox = card.querySelector(".code-box");
    if (!s.available) {
      codeBox.innerHTML =
        `<div class="err">script not found on server: ${s.file} ` +
        `(expected under the EMAN2 library path above)</div>`;
      continue;
    }
    try {
      const { content } = await api.script(s.file);
      const lines = content.replace(/\n$/, "").split("\n");
      const gutter = lines.map((_, n) => n + 1).join("\n");
      codeBox.innerHTML =
        `<pre class="code-gutter">${gutter}</pre>` +
        `<pre class="code-content"><code>${esc(content)}</code></pre>`;
    } catch (e) {
      codeBox.innerHTML = `<div class="err">could not read ${s.file}: ${e.message}</div>`;
    }
  }
}

export const Part4 = { init };
