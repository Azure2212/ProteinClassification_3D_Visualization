#!/usr/bin/env bash
# Launch the PC3D visualization server (read-only Flask API + static frontend).
# Data roots are configurable via env vars — see config.py. Nothing is copied.
set -euo pipefail
cd "$(dirname "$0")"

PY="${PC3D_PYTHON:-python3}"

# Optional overrides (defaults target the lab layout):
# export PC3D_PROJECT_ROOT=/data/atran16/ProteinClassification_3D
# export PC3D_PORT=8070

echo "Starting PC3D visualization on ${PC3D_HOST:-0.0.0.0}:${PC3D_PORT:-8070}"
exec "$PY" -m backend.app
