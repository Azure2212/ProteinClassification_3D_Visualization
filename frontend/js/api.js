// Thin fetch wrapper for the read-only backend API.
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}

export const api = {
  datasets: () => getJSON("/api/datasets"),
  models: () => getJSON("/api/models"),
  proteins: (dataset, filter, split, realOnly) =>
    getJSON(`/api/proteins?dataset=${dataset}&filter=${filter}&split=${split}` +
      (realOnly ? "&real_only=1" : "")),
  framesRender: (dataset, filter, split, protein) =>
    getJSON(`/api/frames?source=render&dataset=${dataset}&filter=${filter}` +
      `&split=${split}&protein=${protein}`),
  framesTestset: (version, protein) =>
    getJSON(`/api/frames?source=testset&version=${version}&protein=${protein}`),
  runs: () => getJSON("/api/runs"),
  runConfig: (run) => getJSON(`/api/run/${encodeURIComponent(run)}/config`),
  runCurves: (run) => getJSON(`/api/run/${encodeURIComponent(run)}/curves`),
  runTraining: (run) => getJSON(`/api/run/${encodeURIComponent(run)}/training`),
  runLog: (run) => getJSON(`/api/run/${encodeURIComponent(run)}/log`),
  part3: (dataset, model, k, metric = "exact") =>
    getJSON(`/api/part3?dataset=${dataset}&model=${encodeURIComponent(model)}&k=${k}&metric=${metric}`),
  scripts: () => getJSON("/api/scripts"),
  script: (name, dir = "eman2") =>
    getJSON(`/api/script?name=${encodeURIComponent(name)}&dir=${encodeURIComponent(dir)}`),
  apix: () => getJSON("/api/apix"),
  testsetImages: (protein, version = "origin") =>
    getJSON(`/api/testset_images?protein=${encodeURIComponent(protein)}&version=${version}`),
  predictRuns: () => getJSON("/api/predict_runs"),
  predict: (run, protein, image, topK = 20) =>
    getJSON(`/api/predict?run=${encodeURIComponent(run)}&protein=${encodeURIComponent(protein)}` +
      `&image=${encodeURIComponent(image)}&top_k=${topK}`),
};
