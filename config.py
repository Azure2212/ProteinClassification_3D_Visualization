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

# Root that contains the EMAN2 image-generation scripts (read-only, for Part 4).
EMAN2_LIBRARY_DIR = os.environ.get(
    "PC3D_EMAN2_LIBRARY_DIR",
    os.path.join(PROJECT_ROOT, "ProteinData", "Eman2Library"),
)

# Directory holding predict_infer.py (Part 5 inference module). Added to sys.path.
PREDICT_MODULE_DIR = os.environ.get(
    "PC3D_PREDICT_DIR",
    os.path.join(PROJECT_ROOT, "sourceCode", "visuallization"),
)

# Read-only base dirs the /api/script endpoint may read from (keyed).
SCRIPT_DIRS = {
    "eman2": EMAN2_LIBRARY_DIR,
    "viz": PREDICT_MODULE_DIR,   # sourceCode/visuallization
}

# Image-generation pipeline (.pdb -> .mrc -> .hdf -> .png). Each step points at a
# real script under a SCRIPT_DIRS base; content served read-only by /api/script.
PIPELINE_SCRIPTS = [
    {
        "step": ".pdb → .mrc",
        "dir": "eman2",
        "file": "pdb2mrcScript.py",
        "desc": "Convert an atomic PDB structure into a 3D density map (.mrc) at a "
                "chosen resolution, using EMAN2 e2pdb2mrc.py (--res, --center).",
    },
    {
        "step": ".mrc → .hdf",
        "dir": "eman2",
        "file": "mrc2hdfScript.py",
        "desc": "Generate 2D projections of the .mrc volume over many orientations "
                "into an .hdf stack, using EMAN2 e2project3d.py (orientgen/sym).",
    },
    {
        "step": ".hdf → .png",
        "dir": "eman2",
        "file": "hdf2png.py",
        "desc": "Read the .hdf projection stack and export each projection as an "
                "8-bit grayscale PNG frame (000.png, 001.png, …).",
    },
]

# "Additional" scripts shown below the pipeline on the Scripts page (real code,
# read-only). Each has a base dir key + filename (verified to exist on disk).
ADDITIONAL_SCRIPTS = [
    {
        "title": "Apply filter (Gaussian lowpass)",
        "dir": "eman2",
        "file": "map2pngScript.py",
        # excerpt: the .map->.hdf projection step + where the Gaussian filter is
        # switched on (cutoff=1/N). NOT the whole 3-step workflow (that's Steps 1-3).
        "ranges": [[40, 43], [65, 81], [105, 121]],
        "desc": "For .map inputs there is no pdb2mrc --res step, so resolution is "
                "applied at the .mrc→.hdf projection as a Gaussian lowpass: "
                "e2project3d --postprocess=filter.lowpass.gauss:cutoff_freq = 1/<filter> "
                "(filter=1 = raw map, baseline). \"filter N\" = the Gaussian smoothing "
                "level. Excerpt below shows only the projection + filter activation.",
    },
    {
        "title": "Apply frame-fill normalization",
        "dir": "eman2",
        "file": "_render_filter12_anorm.py",
        # excerpt: the ndzoom frame-fill technique (constants, _place, and the
        # scale = TARGET_FILL*BOX_OUT/D core), not the surrounding render boilerplate.
        "ranges": [[29, 33], [47, 61], [76, 104]],
        "desc": "Frame-fill normalization: scipy.ndimage.zoom rescales each view so "
                "the largest-diameter view fills TARGET_FILL = 0.40 of the frame "
                "(other views stay proportionally smaller). Does NOT read apix. "
                "Excerpt shows the constants, _place() zoom, and the scale computation.",
    },
    {
        "title": "Apply Å (true angstrom) via e2proc3d",
        "dir": "eman2",
        "file": "_render_filter12_trueA_native.py",
        # excerpt: the true-Å recipe docstring, apix read, and the e2proc3d
        # resample step (Buoc A); not the shared projection/PNG steps.
        "ranges": [[4, 11], [25, 31], [34, 47]],
        "desc": "True-Å recipe: e2proc3d resamples each map to a common apix with "
                "math.fft.resample:n=APIX_OUT/native_apix, plus xform.centerofmass "
                "and a fixed clip box — so a physical Å scale is preserved. Excerpt "
                "shows the recipe, apix read, and the resample step.",
    },
    {
        "title": "Neighbor JSON (≥ identity threshold per protein)",
        "dir": "viz",
        "file": "SequentialSimilarityEachProtein1_n.py",
        "desc": "Builds protein_neighbors_*.json: fetches FASTA per PDB id and, with "
                "Bio.Align pairwise identity, records each protein's neighbors above "
                "a percent-identity threshold (the ≥30% neighbor set used by the "
                "similarity metric / loss).",
    },
    {
        "title": "Apix (Å) data API",
        "dir": "eman2",
        "file": "get_apix_all_4885.py",
        "desc": "Resolves the pixel spacing (apix, Å) for every protein: RCSB entry "
                "-> EMD id, then EMDB map API -> pixel_spacing.x. Source of the "
                "native apix used by the true-Å rendering.",
    },
]

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

# Filters exposed in the Visualization filter picker (exact ids, numeric order).
# Other on-disk variants (filter12_amstrong_Applied, filter12_trueA_*, filter15…)
# are hidden from the dropdown.
ALLOWED_FILTERS = ["filter1", "filter6", "filter8", "filter10", "filter12", "filter14"]

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
