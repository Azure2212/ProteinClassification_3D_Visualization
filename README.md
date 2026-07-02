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
3. **Summary Table** — pick `dataset × model × Top-k`; renders a
   protein (rows) × filter/run (cols) table where each cell is `correct/total`
   exact predictions for that protein among the 12 real proteins (layout after
   Sheet 2 of `EMDB_ExactNSimilarity193ProteinImages.xlsx`).

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
