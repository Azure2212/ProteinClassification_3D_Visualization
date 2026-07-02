// Part 4 — Scripts to run: the .pdb -> .mrc -> .hdf -> .png pipeline plus an
// "Additional" section, each showing the REAL content of a script in a
// scrollable code box (read-only API, whitelisted dirs).
import { api } from "./api.js";

const $ = (s, r = document) => r.querySelector(s);

function esc(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
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
    const lines = content.replace(/\n$/, "").split("\n");
    const gutter = lines.map((_, n) => n + 1).join("\n");
    codeBox.innerHTML =
      `<pre class="code-gutter">${gutter}</pre>` +
      `<pre class="code-content"><code>${esc(content)}</code></pre>`;
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
