"""Flask read-only API + static frontend for the PC3D visualization site.

Run:  python -m backend.app   (from repo root)  or  ./run.sh
Serves the frontend at /  and JSON/image endpoints under /api.
No data is copied: images are streamed directly from the configured roots.
"""
import os
import mimetypes

from flask import Flask, jsonify, send_file, send_from_directory, request, abort

import config
from backend import discovery, results

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")

app = Flask(__name__, static_folder=None)


# --- Frontend ----------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    full = os.path.join(FRONTEND_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(FRONTEND_DIR, path)
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


# --- Part 3: table -----------------------------------------------------------
@app.route("/api/part3")
def api_part3():
    dataset = request.args.get("dataset", "MAP")
    model = request.args.get("model", "")
    # PDB: sourced from the professor's Excel (top-50 only, k ignored).
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
    return jsonify(results.part3_table(dataset, model, k))


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
    """List the .pdb -> .mrc -> .hdf -> .png pipeline steps + script files."""
    return jsonify({
        "library": config.EMAN2_LIBRARY_DIR,
        "steps": results.list_scripts(),
    })


@app.route("/api/script")
def api_script():
    """Return the real content of one whitelisted pipeline script."""
    name = request.args.get("name", "")
    content = results.read_script(name)
    if content is None:
        return jsonify({"error": f"script not available: {name}"}), 404
    return jsonify({"name": name, "content": content})


if __name__ == "__main__":
    app.run(host=config.HOST, port=config.PORT, debug=False, threaded=True)
