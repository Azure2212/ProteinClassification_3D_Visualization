"""Part 5 inference — thin wrapper over sourceCode/visuallization/predict_infer.py.

The heavy deps (torch, cv2, the project models) are imported LAZILY on the first
predict call, so the rest of the read-only site starts instantly and stays light.
Models are cached inside predict_infer (_CACHE keyed by run_dir), so repeated
requests for the same run are warm (~0.01-0.3s/image).
"""
import os
import functools

import config

_MODULE = None      # the imported predict_infer module (loaded once)


class PredictUnavailable(FileNotFoundError):
    """Run cannot be predicted (e.g. missing class_to_idx.json / checkpoint)."""


def _module():
    """Import predict_infer lazily (adds its dir to sys.path first)."""
    global _MODULE
    if _MODULE is None:
        import sys
        d = os.path.abspath(config.PREDICT_MODULE_DIR)
        if d not in sys.path:
            sys.path.insert(0, d)
        import predict_infer  # noqa: E402  (heavy: torch/cv2/models)
        _MODULE = predict_infer
    return _MODULE


def _run_dir(run):
    """Resolve + guard a run dir under TRAINED_RESULTS_DIR (no traversal)."""
    base = os.path.realpath(config.TRAINED_RESULTS_DIR)
    target = os.path.realpath(os.path.join(base, run))
    if target != base and not target.startswith(base + os.sep):
        raise ValueError("run escapes trained_results")
    if not os.path.isdir(target):
        raise FileNotFoundError(f"run not found: {run}")
    return target


def _test_root():
    return os.path.join(config.DATASET_DIR, config.TESTSET_ROOT,
                        config.TESTSET_VERSIONS["origin"])


def predict(run, protein, image, top_k=20):
    """Run inference for one real test image. Returns the module's dict.

    Raises PredictUnavailable if the run lacks the files needed to predict.
    """
    run_dir = _run_dir(run)
    mod = _module()
    try:
        return mod.predict_image(run_dir, protein, image,
                                 top_k=top_k, test_root=_test_root())
    except FileNotFoundError as e:
        # distinguish "run can't be predicted" (missing mapping/ckpt) so the UI
        # can show a tidy message instead of a 500
        if "class_to_idx.json" in str(e) or "PDBRSTuan.pt" in str(e):
            raise PredictUnavailable(str(e))
        raise


@functools.lru_cache(maxsize=256)
def can_predict(run):
    """True if the run has the files required for prediction (cheap file check)."""
    try:
        d = _run_dir(run)
    except (ValueError, FileNotFoundError):
        return False
    return all(os.path.isfile(os.path.join(d, f))
               for f in ("configs.json", "PDBRSTuan.pt", "class_to_idx.json"))
