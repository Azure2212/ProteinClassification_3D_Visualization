"""Central configuration for the ProteinClassification_3D visualization server.

Heavy data lives OUTSIDE this repo. All paths are configurable via environment
variables so the site can be pointed at a different machine / mount without
touching code. Defaults match the current lab layout on the training box.
"""
import os

# --- Base data locations (read-only; NEVER copied into the repo) -------------
PROJECT_ROOT = os.environ.get(
    "PC3D_PROJECT_ROOT", "/data/atran16/ProteinClassification_3D"
)

# Root that contains 3D_MAP_4885 / 3D_PDB_5013 / testingDataFromProfessorSu_v2_193
DATASET_DIR = os.environ.get(
    "PC3D_DATASET_DIR", os.path.join(PROJECT_ROOT, "ProteinData", "Dataset")
)

# Root that contains the trained_results/<run>/ folders
TRAINED_RESULTS_DIR = os.environ.get(
    "PC3D_TRAINED_RESULTS_DIR",
    os.path.join(PROJECT_ROOT, "sourceCode", "trained_results"),
)

# --- Dataset registry --------------------------------------------------------
# Each dataset maps to a folder under DATASET_DIR and a glob for its filter dirs.
DATASETS = {
    "MAP": {
        "label": "3D_MAP_4885 (EMDB density maps)",
        "root": "3D_MAP_4885",
        "filter_glob": "PNG_*",
        "filter_prefix": "PNG_",          # strip to get the filter id
    },
    "PDB": {
        "label": "3D_PDB_5013 (PDB structures)",
        "root": "3D_PDB_5013",
        "filter_glob": "3D_PDB_5013_*",
        "filter_prefix": "3D_PDB_5013_",
    },
}

# Split folders inside a filter directory.
SPLITS = {
    "train126": "PNG126",
    "test30": "PNG30_random",
}

# Professor Su held-out real test set (the 12 real proteins, 193 images total).
TESTSET_ROOT = "testingDataFromProfessorSu_v2_193"
TESTSET_VERSIONS = {
    "origin": "origin_Version",
    "black": "blackbackground_Version",
    "sim": "simulatedbackground_Version",
}

# The 12 real proteins (verified from testingDataFromProfessorSu_v2_193/origin_Version).
REAL_PROTEINS = [
    "7UZM", "8DNM", "8DNO", "8DNP", "8DNS", "8DNU",
    "8EM2", "8EMS", "8EMT", "8ENE", "8EOJ", "8EOR",
]

# --- Server ------------------------------------------------------------------
HOST = os.environ.get("PC3D_HOST", "0.0.0.0")
PORT = int(os.environ.get("PC3D_PORT", "8070"))
