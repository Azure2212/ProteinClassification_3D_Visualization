import { Part1 } from "./part1.js";
import { Part2 } from "./part2.js";
import { Part3 } from "./part3.js";

const inited = { p1: false, p2: false, p3: false };

function show(tab) {
  document.querySelectorAll(".tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach((p) =>
    p.classList.toggle("active", p.id === tab));
  if (tab === "p1" && !inited.p1) { inited.p1 = true; Part1.init().catch(err); }
  if (tab === "p2" && !inited.p2) { inited.p2 = true; Part2.init().catch(err); }
  if (tab === "p3" && !inited.p3) { inited.p3 = true; Part3.init().catch(err); }
}

function err(e) {
  console.error(e);
  alert("Error: " + e.message);
}

document.querySelectorAll(".tab").forEach((b) =>
  b.addEventListener("click", () => show(b.dataset.tab)));

show("p1");
