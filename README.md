# ProteinClassification 3D — Visualization

A lightweight, **read-only** dashboard for exploring the ProteinClassification_3D
project results. It streams images and result CSVs directly from their existing
locations — **no heavy data is copied into this repo**.

## Three views

1. **12 Real Proteins** — checkbox-driven GIF-like players. Each player loops a
   protein's frames (1→n, adjustable speed / pause / step). Add many players to
   compare a protein across `dataset × filter × split` and the professor's held-out
   test set (origin / blackbackground / simulatedbackground) side by side.
2. **Training Runs** (wandb-style) — lists only runs trained on **MAP** data. Select
   runs to see their `config.json` and two Top-k accuracy line charts
   (**Exact prediction** | **Sequential similarity / approx**), computed live from
   each run's `ExactNSimilarityCheckResult.csv`.
3. **Summary Table** — pick `dataset × model (× Top-k)`; renders a
   protein (rows) × filter/variant (cols) table where each cell is `correct/total`
   exact predictions for that protein among the 12 real proteins.
   - **MAP** — computed live from each run's `ExactNSimilarityCheckResult.csv`
     (`trained_results`, v2_193), Top-k selectable.
   - **PDB** — sourced directly from the professor's Excel
     `ExactNSimilarity229ProteinImages_ourSmoothing.xlsx` (229 real test images,
     **top-50 only**; input 224² Resnet152 / 256² Swinv2b). Columns are the Excel
     variants: per-filter (6/12/14, no smoothing) and the smoothing comparison
     (without / hard / our, ε=0.2). Baked offline into `backend/data/pdb_part3.json`
     by `backend/gen_pdb_part3.py` so the server needs no `openpyxl`. The Excel
     auto-corrupted `"M/D"` fractions into dates (e.g. `5/11 → May 11`); the
     generator recovers them as `M/D` and **flags (⚠)** any row whose recovered
     per-cell sum differs from the Excel's stated total (source typos — shown, not
     silently corrected).

## Data sources (configurable, never copied)

Defaults (override via env vars in `config.py`):

| Env var                      | Default |
|------------------------------|---------|
| `PC3D_PROJECT_ROOT`          | `/data/atran16/ProteinClassification_3D` |
| `PC3D_DATASET_DIR`           | `$PROJECT_ROOT/ProteinData/Dataset` |
| `PC3D_TRAINED_RESULTS_DIR`   | `$PROJECT_ROOT/sourceCode/trained_results` |
| `PC3D_HOST` / `PC3D_PORT`    | `0.0.0.0` / `8070` |

Verified layout the server reads:
- `3D_MAP_4885/PNG_<filter>/{PNG126,PNG30_random}/<protein>/NNN.png`
- `3D_PDB_5013/3D_PDB_5013_<filter>/PNG/{PNG126,PNG30_random}/<protein>/NNN.png`
- `testingDataFromProfessorSu_v2_193/<version>_Version/<protein>/N.png`
- `trained_results/<run>/{configs.json, ExactNSimilarityCheckResult.csv, realTestTracking.csv, ...}`
- PDB Part 3 only: `sourceCode/visuallization/ExactNSimilarity229ProteinImages_ourSmoothing.xlsx`
  (read offline by `backend/gen_pdb_part3.py`, results baked into `backend/data/pdb_part3.json`;
  regenerate with a Python that has `openpyxl`)

## Run

```bash
pip install -r requirements.txt      # just Flask
./run.sh                             # or:  python -m backend.app
# open http://<host>:8070
```

Point at a different machine/mount:

```bash
PC3D_PROJECT_ROOT=/mnt/other ./run.sh
```

## Stack

- **Backend**: Flask (single process serves API + static frontend). Path-traversal
  guarded; only whitelisted read-only roots are served.
- **Frontend**: vanilla HTML/CSS/ES-modules, **no build step**. Charts are a tiny
  dependency-free inline-SVG renderer (`js/minichart.js`) — works fully offline.

## Deploy notes (assumptions — not yet finalized)

Deploy target is not decided. Assumed internal LAN use behind the lab network.
For a public deploy, put it behind nginx + auth and keep the data mounts read-only.
