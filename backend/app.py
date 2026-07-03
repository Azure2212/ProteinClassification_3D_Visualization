"""Flask read-only API + static frontend for the PC3D visualization site.

Run:  python -m backend.app   (from repo root)  or  ./run.sh
Serves the frontend at /  and JSON/image endpoints under /api.
No data is copied: images are streamed directly from the configured roots.
"""
import os
import io
import zipfile
import mimetypes

from flask import Flask, jsonify, send_file, send_from_directory, request, abort

import config
from backend import discovery, results, predict

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")

app = Flask(__name__, static_folder=None)


# --- Frontend ----------------------------------------------------------------
# The frontend is served with no-cache so browsers always pick up the latest
# HTML/JS/CSS (avoids stale cached modules after a redeploy).
def _no_cache(resp):
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


@app.route("/")
def index():
    return _no_cache(send_from_directory(FRONTEND_DIR, "index.html"))


@app.route("/<path:path>")
def static_files(path):
    full = os.path.join(FRONTEND_DIR, path)
    if os.path.isfile(full):
        return _no_cache(send_from_directory(FRONTEND_DIR, path))
    abort(404)


# --- Meta --------------------------------------------------------------------
@app.route("/api/datasets")
def api_datasets():
    out = []
    for key, spec in config.DATASETS.items():
        filters = discovery.list_filters(key)
        out.append({
            "key": key,
            "label": spec["label"],
            "filters": filters,
        })
    return jsonify({
        "datasets": out,
        "splits": list(config.SPLITS.keys()),
        "testset_versions": discovery.testset_versions(),
        "real_proteins": config.REAL_PROTEINS,
    })


# --- Part 1: protein players -------------------------------------------------
@app.route("/api/proteins")
def api_proteins():
    dataset = request.args.get("dataset")
    filt = request.args.get("filter")
    split = request.args.get("split")
    real_only = request.args.get("real_only") == "1"
    only = config.REAL_PROTEINS if real_only else None
    try:
        names = discovery.list_proteins(dataset, filt, split, only=only)
    except (ValueError, FileNotFoundError, KeyError) as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"proteins": names})


@app.route("/api/frames")
def api_frames():
    """Return ordered frame URLs for one player source."""
    src = request.args.get("source", "render")
    protein = request.args.get("protein")
    try:
        if src == "testset":
            version = request.args.get("version")
            paths = discovery.testset_frames(version, protein)
            frames = [
                f"/api/image?source=testset&version={version}"
                f"&protein={protein}&i={i}"
                for i in range(len(paths))
            ]
        else:
            dataset = request.args.get("dataset")
            filt = request.args.get("filter")
            split = request.args.get("split")
            paths = discovery.render_frames(dataset, filt, split, protein)
            frames = [
                f"/api/image?source=render&dataset={dataset}&filter={filt}"
                f"&split={split}&protein={protein}&i={i}"
                for i in range(len(paths))
            ]
    except (ValueError, FileNotFoundError, KeyError) as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"count": len(frames), "frames": frames})


@app.route("/api/image")
def api_image():
    src = request.args.get("source", "render")
    protein = request.args.get("protein")
    try:
        i = int(request.args.get("i", "0"))
        if src == "testset":
            paths = discovery.testset_frames(request.args.get("version"), protein)
        else:
            paths = discovery.render_frames(
                request.args.get("dataset"),
                request.args.get("filter"),
                request.args.get("split"),
                protein,
            )
    except (ValueError, FileNotFoundError, KeyError):
        abort(404)
    if i < 0 or i >= len(paths):
        abort(404)
    path = paths[i]
    if not discovery.is_allowed_path(path) or not os.path.isfile(path):
        abort(404)
    mime = mimetypes.guess_type(path)[0] or "image/png"
    return send_file(path, mimetype=mime, max_age=3600)


# --- Part 2: runs ------------------------------------------------------------
@app.route("/api/runs")
def api_runs():
    return jsonify({"runs": results.map_runs()})


@app.route("/api/run/<run>/config")
def api_run_config(run):
    cfg = results.load_config(run)
    if not cfg:
        return jsonify({"error": "no config"}), 404
    return jsonify({"config": cfg, "meta": results.run_meta(run)})


@app.route("/api/run/<run>/curves")
def api_run_curves(run):
    curves = results.topk_curves(run)
    if curves is None:
        return jsonify({"error": "no ExactN results"}), 404
    return jsonify({"meta": results.run_meta(run), "curves": curves})


@app.route("/api/run/<run>/training")
def api_run_training(run):
    """Per-epoch training curves from trainingTracking.csv (TRAINING PERFORMANCE)."""
    t = results.training_series(run)
    if t is None:
        return jsonify({"error": "no trainingTracking.csv"}), 404
    return jsonify({"meta": results.run_meta(run), **t})


@app.route("/api/run/<run>/log")
def api_run_log(run):
    """Read-only run.log content for the run details dialog."""
    log = results.read_run_log(run)
    if log is None:
        return jsonify({"error": "no run.log"}), 404
    return jsonify({"log": log})


# --- Part 3: table -----------------------------------------------------------
@app.route("/api/part3")
def api_part3():
    dataset = request.args.get("dataset", "MAP")
    model = request.args.get("model", "")
    metric = request.args.get("metric", "exact")
    if metric not in results.METRIC_FIELDS:
        metric = "exact"
    # PDB: sourced from the professor's Excel (similarity-check, top-50 only).
    # The metric toggle applies to MAP only; PDB returns its single Excel source.
    if dataset == "PDB":
        table = results.pdb_part3_table(model)
        if not table:
            return jsonify({"error": f"no PDB Excel data for model {model!r}"}), 404
        return jsonify(table)
    try:
        k = int(request.args.get("k", "50"))
    except ValueError:
        k = 50
    if k not in results.EXACT_KS:
        return jsonify({"error": f"k must be one of {results.EXACT_KS}"}), 400
    return jsonify(results.part3_table(dataset, model, k, metric))


@app.route("/api/models")
def api_models():
    """Distinct models available per dataset.

    MAP models come from trained_results configs; PDB models come from the baked
    Excel data (Part 3 for PDB is Excel-sourced, not eval-sourced).
    """
    out = {}
    for run in results.list_runs():
        m = results.run_meta(run)
        ds, model = m["dataset"], m["model"]
        if not ds or not model:
            continue
        out.setdefault(ds, set()).add(model)
    out = {k: sorted(v) for k, v in out.items()}
    pdb = results.pdb_models()
    if pdb:
        out["PDB"] = pdb
    return jsonify(out)


# --- Part 4: pipeline scripts (read-only) ------------------------------------
@app.route("/api/scripts")
def api_scripts():
    """Pipeline steps + "Additional" scripts (real files, read-only)."""
    return jsonify({
        "library": config.EMAN2_LIBRARY_DIR,
        "dirs": config.SCRIPT_DIRS,
        "steps": results.list_scripts(),
        "additional": results.list_additional_scripts(),
    })


@app.route("/api/script")
def api_script():
    """Return the real content of one whitelisted script (by dir + name)."""
    name = request.args.get("name", "")
    dir_key = request.args.get("dir", "eman2")
    content = results.read_script(name, dir_key)
    if content is None:
        return jsonify({"error": f"script not available: {name}"}), 404
    return jsonify({"name": name, "dir": dir_key, "content": content})


# --- Part 5: prediction ------------------------------------------------------
@app.route("/api/testset_images")
def api_testset_images():
    """List the real (professor test-set) images for one protein."""
    protein = request.args.get("protein")
    version = request.args.get("version", "origin")
    try:
        paths = discovery.testset_frames(version, protein)
    except (ValueError, FileNotFoundError, KeyError) as e:
        return jsonify({"error": str(e)}), 404
    images = [{
        "name": os.path.basename(p),
        "url": f"/api/image?source=testset&version={version}"
               f"&protein={protein}&i={i}",
    } for i, p in enumerate(paths)]
    return jsonify({"protein": protein, "version": version,
                    "count": len(images), "images": images})


@app.route("/api/apix")
def api_apix():
    """Per-protein pixel spacing (Å) for the trueA own-apix variant, from
    apix_12test.json. Returns {protein: apix}; {} if the file is absent."""
    import json
    path = config.APIX_12TEST_JSON
    out = {}
    if os.path.isfile(path):
        try:
            with open(path) as f:
                raw = json.load(f)
            for prot, v in raw.items():
                apix = v.get("apix") if isinstance(v, dict) else v
                if apix is not None:
                    out[prot] = apix
        except (json.JSONDecodeError, OSError):
            out = {}
    return jsonify({"apix": out})


@app.route("/api/testset_download")
def api_testset_download():
    """Zip ALL images of one test-set version, preserving the folder tree
    testingDataFromProfessorSu_v2_193/<version>/<protein>/<file>."""
    version = request.args.get("version", "origin")
    folder = config.TESTSET_VERSIONS.get(version)
    vdir = discovery.testset_dir(version)
    if not folder or not vdir or not os.path.isdir(vdir):
        abort(404)
    prefix = os.path.join(config.TESTSET_ROOT, folder)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for protein, name, path in discovery.testset_all(version):
            z.write(path, os.path.join(prefix, protein, name))
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True,
                     download_name=f"{config.TESTSET_ROOT}_{folder}.zip")


@app.route("/api/predict_runs")
def api_predict_runs():
    """MAP runs, each flagged whether it can be predicted (has class_to_idx.json)."""
    out = []
    for m in results.map_runs():
        out.append({**m, "can_predict": predict.can_predict(m["run"])})
    return jsonify({"runs": out})


@app.route("/api/predict")
def api_predict():
    run = request.args.get("run", "")
    protein = request.args.get("protein", "")
    image = request.args.get("image", "1")
    try:
        top_k = int(request.args.get("top_k", "20"))
    except ValueError:
        top_k = 20
    top_k = max(1, min(top_k, 50))
    try:
        return jsonify(predict.predict(run, protein, image, top_k))
    except predict.PredictUnavailable as e:
        return jsonify({"error": str(e),
                        "reason": "unsupported_run"}), 422
    except (ValueError, FileNotFoundError) as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:  # inference/runtime failure -> tidy 500, no crash
        return jsonify({"error": f"prediction failed: {e}"}), 500


if __name__ == "__main__":
    app.run(host=config.HOST, port=config.PORT, debug=False, threaded=True)
