"""Parse trained_results/<run>/ artifacts for Part 2 (wandb-style) and Part 3 (table).

All numbers are read straight from the run CSVs — nothing is invented. When an
artifact is missing the run is reported with `available: false` and empty series.
"""
import os
import csv
import json
import re
import functools

import config

# top-k columns present in ExactNSimilarityCheckResult.csv
EXACT_KS = [1, 3, 5, 10, 20, 50]

# Baked PDB Part-3 data (parsed offline from the professor's Excel by
# gen_pdb_part3.py). MAP still comes from the live trained_results CSVs.
_PDB_PART3_PATH = os.path.join(os.path.dirname(__file__), "data", "pdb_part3.json")


@functools.lru_cache(maxsize=1)
def pdb_part3_data():
    """Load the baked EMDB_ExactNSimilarity-229 Excel data (or {} if absent)."""
    if not os.path.isfile(_PDB_PART3_PATH):
        return {}
    try:
        with open(_PDB_PART3_PATH) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def pdb_models():
    """Model names available in the baked PDB Excel data."""
    return sorted(pdb_part3_data().get("models", {}).keys())


def pdb_part3_table(model):
    """Part 3 table for one PDB model, sourced from the Excel JSON.

    Shape differs from the MAP table: columns are Excel variants (per-filter and
    smoothing-comparison), top-k is fixed at 50, and each column carries a
    source-mismatch flag. Returns {} if the model is unknown.
    """
    data = pdb_part3_data()
    mv = data.get("models", {}).get(model)
    if not mv:
        return {}
    proteins = data["proteins"]
    columns = []
    for c in mv["columns"]:
        columns.append({
            "run": f"{model} · {c['group']} · {c['label']}",
            "label": c["label"],
            "group": c["group"],
            "sheet": c["sheet"],
            "filter": c["label"],
            "smoothing": c["group"],
            "cells": {p: c["cells"].get(p) for p in proteins},
            "total_correct": c["computed_correct"],
            "total_images": c["computed_total"],
            "stated": c["stated"],
            "stated_correct": c["stated_correct"],
            "mismatch": c["mismatch"],
            "recovered_cells": c.get("recovered_cells", []),
        })
    return {
        "source": "excel",
        "k": data.get("topk", 50),
        "note": data.get("note"),
        "source_file": data.get("source"),
        "input": mv.get("input"),
        "total_images": data.get("total_images"),
        "proteins": proteins,
        "protein_totals": data.get("protein_totals", {}),
        "columns": columns,
    }


def _run_path(run, *parts):
    base = os.path.realpath(config.TRAINED_RESULTS_DIR)
    target = os.path.realpath(os.path.join(base, run, *parts))
    if target != base and not target.startswith(base + os.sep):
        raise ValueError("path escapes trained_results")
    return target


def _is_scratch_run(name):
    """Demo/test scaffolding folders to hide from the UI (not real experiments).

    Matches only names prefixed `_demo`/`_test` (e.g. `_demo_test_20260623`).
    Real runs that merely lack a CSV (e.g. `11062026_..._mix3EMDB`) do NOT match
    and stay listed with a "no chart data" flag.
    """
    low = name.lower()
    return low.startswith("_demo") or low.startswith("_test")


def list_runs():
    base = config.TRAINED_RESULTS_DIR
    if not os.path.isdir(base):
        return []
    return sorted(
        n for n in os.listdir(base)
        if os.path.isdir(os.path.join(base, n)) and not _is_scratch_run(n)
    )


def load_config(run):
    """Return parsed configs.json (real filename) or {} if absent."""
    p = _run_path(run, "configs.json")
    if not os.path.isfile(p):
        return {}
    try:
        with open(p) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _detect_dataset(cfg, run):
    tp = (cfg.get("train_protein_path") or "").upper()
    if "MAP" in tp or "MAP" in run.upper():
        return "MAP"
    if "PDB" in tp or "PDB" in run.upper():
        return "PDB"
    return None


def _detect_filter(cfg, run):
    """Best-effort filter id + smoothing tag from config path / run name."""
    tp = cfg.get("train_protein_path") or ""
    m = re.search(r"PNG_(filter[0-9A-Za-z_]+?)/PNG126", tp)
    filt = m.group(1) if m else None
    if not filt:
        m = re.search(r"(filter[0-9]+[0-9A-Za-z_]*)", run)
        filt = m.group(1) if m else "?"
    # trim trailing split noise
    filt = filt.split("/")[0]
    return filt


def _detect_smoothing(run):
    m = re.search(r"(hardSmoothing|ourSmoothing)_([0-9_]+)", run)
    if m:
        return f"{m.group(1)}={m.group(2).replace('_', '.')}"
    if "mix3EMDB" in run or "mixEMDB" in run.lower():
        return "mixEMDB"
    if "amstrong" in run:
        return "amstrong"
    return ""


@functools.lru_cache(maxsize=256)
def run_meta(run):
    cfg = load_config(run)
    dataset = _detect_dataset(cfg, run)
    return {
        "run": run,
        "dataset": dataset,
        "model": cfg.get("model"),
        "filter": _detect_filter(cfg, run) if cfg else None,
        "smoothing": _detect_smoothing(run),
        "has_config": bool(cfg),
        "max_epoch": cfg.get("max_epoch_num"),
        "train_protein_path": cfg.get("train_protein_path"),
    }


_DDMMYYYY_RE = re.compile(r"^(\d{2})(\d{2})(\d{4})")
_YYYYMMDD_RE = re.compile(r"(20\d{2})(\d{2})(\d{2})")


def run_sort_ts(run):
    """Best-effort timestamp for ordering runs newest-first.

    Runs are named like `03062026_train_...` (DD MM YYYY) or `_demo_test_20260623`
    (YYYYMMDD). Parse whichever matches; fall back to the directory mtime.
    """
    m = _DDMMYYYY_RE.match(run)
    if m:
        d, mo, y = (int(g) for g in m.groups())
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return y * 10000 + mo * 100 + d
    m = _YYYYMMDD_RE.search(run)
    if m:
        y, mo, d = (int(g) for g in m.groups())
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return y * 10000 + mo * 100 + d
    # fall back to filesystem mtime (scaled into a comparable range)
    try:
        return int(os.path.getmtime(os.path.join(config.TRAINED_RESULTS_DIR, run)))
    except OSError:
        return 0


def map_runs():
    """Runs whose training data is MAP (Part 2), newest first.

    Each meta carries `has_curves` so the UI can flag runs that have no
    ExactNSimilarityCheckResult.csv (they can't be charted) instead of dropping
    them silently.
    """
    out = []
    for run in list_runs():
        meta = run_meta(run)
        if meta["dataset"] == "MAP" and meta["has_config"]:
            m = dict(meta)
            m["has_curves"] = os.path.isfile(
                os.path.join(config.TRAINED_RESULTS_DIR, run,
                             "ExactNSimilarityCheckResult.csv"))
            out.append(m)
    out.sort(key=lambda m: run_sort_ts(m["run"]), reverse=True)
    return out


# --- Part 4: pipeline scripts (read-only) ------------------------------------

def list_scripts():
    """Pipeline steps with availability flag (existence of the real file)."""
    out = []
    for spec in config.PIPELINE_SCRIPTS:
        path = os.path.join(config.EMAN2_LIBRARY_DIR, spec["file"])
        out.append({**spec, "available": os.path.isfile(path)})
    return out


def read_script(name):
    """Return the real content of a whitelisted pipeline script, or None.

    Only filenames registered in PIPELINE_SCRIPTS are readable (no traversal).
    """
    allowed = {s["file"] for s in config.PIPELINE_SCRIPTS}
    if name not in allowed:
        return None
    base = os.path.realpath(config.EMAN2_LIBRARY_DIR)
    path = os.path.realpath(os.path.join(base, name))
    if path != base and not path.startswith(base + os.sep):
        return None
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return None


# --- ExactN aggregation ------------------------------------------------------

def _read_exactn(run):
    p = _run_path(run, "ExactNSimilarityCheckResult.csv")
    if not os.path.isfile(p):
        return None
    rows = []
    with open(p, newline="") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows


def _to_bool(v):
    return str(v).strip().lower() == "true"


def topk_curves(run):
    """Two top-k accuracy curves for Part 2 charts.

    Returns {'ks', 'exact': [%...], 'similarity': [%...], 'total': N} or None.
    exact       = mean(exact_predictTopK)      -> model argmax correctness
    similarity  = mean(countSimilarityTopK)    -> approx (>= id-threshold) match
    """
    rows = _read_exactn(run)
    if not rows:
        return None
    total = len(rows)
    exact, sim = [], []
    for k in EXACT_KS:
        ec = sum(_to_bool(r.get(f"exact_predictTop{k}")) for r in rows)
        sc = sum(_to_bool(r.get(f"countSimilarityTop{k}")) for r in rows)
        exact.append(round(100.0 * ec / total, 2) if total else 0.0)
        sim.append(round(100.0 * sc / total, 2) if total else 0.0)
    return {"ks": EXACT_KS, "exact": exact, "similarity": sim, "total": total}


def real_test_tracking(run):
    """Per-epoch exact top-k counts from realTestTracking.csv (optional extra)."""
    p = _run_path(run, "realTestTracking.csv")
    if not os.path.isfile(p):
        return None
    with open(p, newline="") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames or []
        data = {c: [] for c in cols}
        for row in reader:
            for c in cols:
                try:
                    data[c].append(float(row[c]))
                except (ValueError, TypeError):
                    data[c].append(None)
    return {"columns": cols, "data": data}


# --- Part 3 table ------------------------------------------------------------

def per_protein_counts(run, k):
    """For each real protein: (#exact_predictTopK True, total images)."""
    rows = _read_exactn(run)
    if not rows:
        return {}
    field = f"exact_predictTop{k}"
    agg = {}
    for r in rows:
        # image column like "8DNM/1.png" -> protein prefix; protein col also present
        prot = r.get("protein") or (r.get("image", "").split("/")[0])
        if prot not in agg:
            agg[prot] = [0, 0]
        agg[prot][1] += 1
        if _to_bool(r.get(field)):
            agg[prot][0] += 1
    return agg


def part3_table(dataset, model, k=50):
    """Protein (rows) x filter/run (cols) table of correct/total.

    Column = each matching run (labelled by filter + smoothing).
    """
    runs = []
    for run in list_runs():
        meta = run_meta(run)
        if meta["dataset"] != dataset:
            continue
        if model and (meta["model"] or "").lower() != model.lower():
            continue
        counts = per_protein_counts(run, k)
        if not counts:
            continue
        label = meta["filter"] or "?"
        if meta["smoothing"]:
            label += f" ({meta['smoothing']})"
        runs.append({
            "run": run,
            "label": label,
            "filter": meta["filter"],
            "smoothing": meta["smoothing"],
            "counts": counts,
        })
    # union of proteins, real ones first in canonical order
    proteins = list(config.REAL_PROTEINS)
    extra = sorted({p for r in runs for p in r["counts"]} - set(proteins))
    proteins += extra

    columns = []
    for r in runs:
        total_correct = sum(v[0] for v in r["counts"].values())
        total_imgs = sum(v[1] for v in r["counts"].values())
        cells = {}
        for prot in proteins:
            c = r["counts"].get(prot)
            cells[prot] = {"correct": c[0], "total": c[1]} if c else None
        columns.append({
            "run": r["run"],
            "label": r["label"],
            "filter": r["filter"],
            "smoothing": r["smoothing"],
            "total_correct": total_correct,
            "total_images": total_imgs,
            "cells": cells,
        })
    columns.sort(key=lambda c: (str(c["filter"]), c["smoothing"]))
    return {"k": k, "proteins": proteins, "columns": columns}
