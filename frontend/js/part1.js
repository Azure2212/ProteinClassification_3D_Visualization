// Part 1 — 12 real proteins: build many synchronized/independent GIF-like players.
// Each player loops frame 1..n. Add multiple to compare dataset x filter x split side by side.
import { api } from "./api.js";

let META = null;
let playerSeq = 0;
const players = new Map(); // id -> {timer, frames, idx, speed, playing, el}

const $ = (s, r = document) => r.querySelector(s);

function opt(v, label) {
  const o = document.createElement("option");
  o.value = v; o.textContent = label ?? v;
  return o;
}

async function init() {
  META = await api.datasets();
  const dsSel = $("#p1-dataset");
  META.datasets.forEach((d) => dsSel.appendChild(opt(d.key, d.label)));
  dsSel.addEventListener("change", refreshFilters);
  $("#p1-source-type").addEventListener("change", onSourceTypeChange);
  refreshFilters();
  onSourceTypeChange();

  // protein select
  const pSel = $("#p1-protein");
  pSel.appendChild(opt("__all__", "▶ All 12 real proteins"));
  META.real_proteins.forEach((p) => pSel.appendChild(opt(p)));

  $("#p1-add").addEventListener("click", addFromForm);
  $("#p1-pause-all").addEventListener("click", () => setAll(false));
  $("#p1-play-all").addEventListener("click", () => setAll(true));
  $("#p1-clear").addEventListener("click", clearAll);
  $("#p1-speed-all").addEventListener("input", (e) => {
    const ms = Number(e.target.value);
    $("#p1-speed-all-val").textContent = ms + "ms";
    players.forEach((p) => setSpeed(p.id, ms));
  });
}

function currentSourceType() {
  return $("#p1-source-type").value; // "render" | "testset"
}

function onSourceTypeChange() {
  const isTest = currentSourceType() === "testset";
  $("#p1-render-fields").style.display = isTest ? "none" : "";
  $("#p1-testset-fields").style.display = isTest ? "" : "none";
}

function refreshFilters() {
  const ds = META.datasets.find((d) => d.key === $("#p1-dataset").value);
  const fSel = $("#p1-filter");
  fSel.innerHTML = "";
  ds.filters.forEach((f) => fSel.appendChild(opt(f)));
}

function addFromForm() {
  const type = currentSourceType();
  const protSel = $("#p1-protein").value;
  const proteins = protSel === "__all__" ? META.real_proteins : [protSel];
  const specs = proteins.map((protein) => {
    if (type === "testset") {
      const version = $("#p1-version").value;
      return { type, version, protein,
        label: `TEST·${version} · ${protein}` };
    }
    const dataset = $("#p1-dataset").value;
    const filter = $("#p1-filter").value;
    const split = $("#p1-split").value;
    return { type, dataset, filter, split, protein,
      label: `${dataset}·${filter}·${split} · ${protein}` };
  });
  specs.forEach(addPlayer);
}

async function addPlayer(spec) {
  const id = ++playerSeq;
  const grid = $("#p1-grid");
  const card = document.createElement("div");
  card.className = "player";
  card.innerHTML = `
    <div class="player-head">
      <span class="player-label" title="${spec.label}">${spec.label}</span>
      <button class="x" title="Remove">✕</button>
    </div>
    <div class="player-stage"><div class="loading">loading…</div></div>
    <div class="player-ctrl">
      <button class="prev" title="Previous">⏮</button>
      <button class="pp" title="Play/Pause">⏸</button>
      <button class="next" title="Next">⏭</button>
      <span class="frame-count">0/0</span>
      <input class="speed" type="range" min="80" max="1500" step="20"
        value="${Number($("#p1-speed-all").value)}" title="Speed (ms/frame)">
    </div>`;
  grid.appendChild(card);

  const p = { id, spec, frames: [], idx: 0,
    speed: Number($("#p1-speed-all").value), playing: true, timer: null, card };
  players.set(id, p);

  card.querySelector(".x").addEventListener("click", () => removePlayer(id));
  card.querySelector(".prev").addEventListener("click", () => { stop(p); step(p, -1); });
  card.querySelector(".next").addEventListener("click", () => { stop(p); step(p, 1); });
  card.querySelector(".pp").addEventListener("click", () => toggle(id));
  card.querySelector(".speed").addEventListener("input", (e) => setSpeed(id, Number(e.target.value)));

  try {
    const res = spec.type === "testset"
      ? await api.framesTestset(spec.version, spec.protein)
      : await api.framesRender(spec.dataset, spec.filter, spec.split, spec.protein);
    p.frames = res.frames;
    if (!p.frames.length) throw new Error("no frames");
    // preload into an <img> stage
    const stage = card.querySelector(".player-stage");
    stage.innerHTML = `<img class="player-img" alt="${spec.protein}">`;
    p.img = stage.querySelector(".player-img");
    render(p);
    if (p.playing) start(p);
  } catch (e) {
    card.querySelector(".player-stage").innerHTML =
      `<div class="err">error: ${e.message}</div>`;
  }
}

function render(p) {
  if (!p.frames.length) return;
  p.img.src = p.frames[p.idx];
  p.card.querySelector(".frame-count").textContent = `${p.idx + 1}/${p.frames.length}`;
}

function step(p, d) {
  p.idx = (p.idx + d + p.frames.length) % p.frames.length;
  render(p);
}

function start(p) {
  stop(p);
  p.playing = true;
  p.card.querySelector(".pp").textContent = "⏸";
  p.timer = setInterval(() => step(p, 1), p.speed);
}

function stop(p) {
  if (p.timer) { clearInterval(p.timer); p.timer = null; }
  p.playing = false;
  p.card.querySelector(".pp").textContent = "▶";
}

function toggle(id) {
  const p = players.get(id);
  if (!p) return;
  p.playing ? stop(p) : start(p);
}

function setSpeed(id, ms) {
  const p = players.get(id);
  if (!p) return;
  p.speed = ms;
  p.card.querySelector(".speed").value = ms;
  if (p.playing) start(p);
}

function setAll(play) {
  players.forEach((p) => (play ? start(p) : stop(p)));
}

function removePlayer(id) {
  const p = players.get(id);
  if (!p) return;
  stop(p);
  p.card.remove();
  players.delete(id);
}

function clearAll() {
  [...players.keys()].forEach(removePlayer);
}

export const Part1 = { init };
