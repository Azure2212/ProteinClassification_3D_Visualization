"""Filesystem discovery for datasets, filters, proteins and image frames.

Robust to two on-disk layouts observed in the real data:
  MAP: 3D_MAP_4885/PNG_filter12/PNG126/<protein>/000.png
  PDB: 3D_PDB_5013/3D_PDB_5013_filter12/PNG/PNG126/<protein>/000.png   (extra PNG/ wrapper)
The professor test set:
       testingDataFromProfessorSu_v2_193/origin_Version/<protein>/1.png
"""
import os
import re
import functools

import config

_NUM_RE = re.compile(r"(\d+)")


def _numeric_key(name):
    """Sort 1.png, 2.png ... 10.png and 000.png ... numerically."""
    m = _NUM_RE.search(name)
    return (int(m.group(1)) if m else 0, name)


def _safe_join(base, *parts):
    """Join and guarantee the result stays within `base` (no traversal)."""
    base_real = os.path.realpath(base)
    target = os.path.realpath(os.path.join(base, *parts))
    if target != base_real and not target.startswith(base_real + os.sep):
        raise ValueError("path escapes base directory")
    return target


def is_allowed_path(path):
    """True if `path` sits under one of the whitelisted read-only roots."""
    real = os.path.realpath(path)
    for base in (config.DATASET_DIR, config.TRAINED_RESULTS_DIR):
        base_real = os.path.realpath(base)
        if real == base_real or real.startswith(base_real + os.sep):
            return True
    return False


# --- Datasets / filters ------------------------------------------------------

@functools.lru_cache(maxsize=None)
def list_filters(dataset):
    """Return sorted filter ids for a dataset, e.g. ['filter1','filter6',...]."""
    spec = config.DATASETS.get(dataset)
    if not spec:
        return []
    root = _safe_join(config.DATASET_DIR, spec["root"])
    if not os.path.isdir(root):
        return []
    prefix = spec["filter_prefix"]
    out = []
    for name in os.listdir(root):
        full = os.path.join(root, name)
        if not os.path.isdir(full):
            continue
        if name.startswith(prefix):
            out.append(name[len(prefix):])
    # list every real render variant on disk except hidden ids (numeric first)
    out = [f for f in out if f not in config.HIDDEN_FILTERS]
    return sorted(out, key=_filter_sort_key)


def _filter_sort_key(filt):
    """Sort filters by numeric value ascending (filter6 < filter10 < filter12),
    then by any suffix so variants stay grouped (e.g. 12 < 12_amstrong_Applied)."""
    m = _NUM_RE.search(filt)
    return (int(m.group(1)) if m else 1 << 30, filt)


def _filter_dir(dataset, filt):
    spec = config.DATASETS[dataset]
    return _safe_join(config.DATASET_DIR, spec["root"], spec["filter_prefix"] + filt)


def _split_dir(dataset, filt, split):
    """Directory that directly contains protein subfolders for a split.

    Handles the optional `PNG/` wrapper used by the PDB layout.
    """
    split_folder = config.SPLITS.get(split)
    if not split_folder:
        raise ValueError("unknown split")
    base = _filter_dir(dataset, filt)
    direct = os.path.join(base, split_folder)
    if os.path.isdir(direct):
        return direct
    wrapped = os.path.join(base, "PNG", split_folder)
    if os.path.isdir(wrapped):
        return wrapped
    raise FileNotFoundError(f"no split dir for {dataset}/{filt}/{split}")


def available_splits(dataset, filt):
    out = []
    for split in config.SPLITS:
        try:
            _split_dir(dataset, filt, split)
            out.append(split)
        except FileNotFoundError:
            pass
    return out


# --- Proteins / frames -------------------------------------------------------

def list_proteins(dataset, filt, split, only=None):
    """List protein ids present in a split. `only` filters to a subset (list)."""
    d = _split_dir(dataset, filt, split)
    names = [n for n in os.listdir(d) if os.path.isdir(os.path.join(d, n))]
    if only is not None:
        only = set(only)
        names = [n for n in names if n in only]
    return sorted(names)


def render_frames(dataset, filt, split, protein):
    """Absolute, numerically ordered frame paths for a rendered protein."""
    d = _split_dir(dataset, filt, split)
    pdir = _safe_join(d, protein)
    if not os.path.isdir(pdir):
        raise FileNotFoundError(protein)
    frames = [f for f in os.listdir(pdir) if f.lower().endswith(".png")]
    frames.sort(key=_numeric_key)
    return [os.path.join(pdir, f) for f in frames]


# --- Professor test set ------------------------------------------------------

def _testset_dir(version):
    folder = config.TESTSET_VERSIONS.get(version)
    if not folder:
        raise ValueError("unknown test-set version")
    return _safe_join(config.DATASET_DIR, config.TESTSET_ROOT, folder)


def testset_versions():
    out = []
    for v in config.TESTSET_VERSIONS:
        try:
            if os.path.isdir(_testset_dir(v)):
                out.append(v)
        except ValueError:
            pass
    return out


def testset_proteins(version):
    d = _testset_dir(version)
    if not os.path.isdir(d):
        return []
    return sorted(n for n in os.listdir(d) if os.path.isdir(os.path.join(d, n)))


def testset_frames(version, protein):
    d = _testset_dir(version)
    pdir = _safe_join(d, protein)
    if not os.path.isdir(pdir):
        raise FileNotFoundError(protein)
    frames = [f for f in os.listdir(pdir) if f.lower().endswith(".png")]
    frames.sort(key=_numeric_key)
    return [os.path.join(pdir, f) for f in frames]


def testset_dir(version):
    """Public: absolute path of a test-set version dir (guarded). '' if unknown."""
    try:
        return _testset_dir(version)
    except ValueError:
        return ""


def testset_all(version):
    """Yield (protein, filename, abspath) for every PNG in a version, sorted."""
    for protein in testset_proteins(version):
        for path in testset_frames(version, protein):
            yield protein, os.path.basename(path), path
