"""Generate the background stills for a short-form spot via the ComfyUI HTTP API.

Reads <project>/shots.json, writes <project>/images/<id>.png.

Idempotent: a shot whose PNG already exists is skipped, so the script resumes after
an interrupt rather than restarting a multi-hour batch. To force a reshoot, delete
that shot's PNG (or change its seed). Every take is also retained under
ComfyUI/output/<prefix>/ so a discarded take can be recovered without re-rendering.

Usage:
  python generate_shots.py --project . [--steps 3] [--only 01_hook,07_hero]

Env:
  COMFY_DIR     ComfyUI install root (default: %USERPROFILE%\\Downloads\\ComfyUI)
  COMFY_SERVER  default http://127.0.0.1:8188
"""

import argparse
import json
import os
import shutil
import sys
import time
import urllib.request

COMFY_DIR = os.environ.get(
    "COMFY_DIR", os.path.join(os.path.expanduser("~"), "Downloads", "ComfyUI")
)
SERVER = os.environ.get("COMFY_SERVER", "http://127.0.0.1:8188")
DEFAULT_CKPT = "sd_xl_turbo_1.0_fp16.safetensors"

# Distilled few-step models (SDXL-Turbo et al) run at cfg 1.0, which disables
# classifier-free guidance. NOTE: that also makes the negative prompt completely
# inert - do not rely on it to suppress text artifacts. Above cfg ~1.5 turbo
# degrades badly.
CFG = 1.0
SAMPLER = "euler_ancestral"
SCHEDULER = "sgm_uniform"


def api(path, payload=None, timeout=60):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        f"{SERVER}{path}", data=data, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
    return json.loads(body) if body else {}


def wait_for_server(timeout=900):
    """Poll until ComfyUI answers. 900s, not 300s: a cold boot on a CPU-only box runs
    alembic migrations and warms the RAM-pressure cache first, and was measured taking
    over five minutes - a 300s ceiling aborted a reshoot on a server that was simply
    still starting."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            api("/system_stats", timeout=10)
            return True
        except Exception as e:  # noqa: BLE001 - startup polling; any error means "not up yet"
            last = e
            time.sleep(3)
    raise RuntimeError(f"ComfyUI not ready within {timeout}s (last error: {last})")


def build_workflow(shot, style, meta, steps, ckpt, prefix, key=None):
    key = key or shot.get("image") or shot["id"]
    positive = f"{shot['prompt']}, {style['suffix']}"
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": positive, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": style["negative"], "clip": ["1", 1]}},
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": meta["gen_width"],
                "height": meta["gen_height"],
                "batch_size": 1,
            },
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": shot["seed"],
                "steps": steps,
                "cfg": CFG,
                "sampler_name": SAMPLER,
                "scheduler": SCHEDULER,
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
            },
        },
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {
            "class_type": "SaveImage",
            "inputs": {"images": ["6", 0], "filename_prefix": f"{prefix}/{key}"},
        },
    }


def unique_images(shots):
    """One generation job per distinct image key.

    A shot may carry `"image": "<key>"` to reuse a still another shot generated -
    essential for longer narrative pieces, where 17 dialogue beats over 9 plates is
    the difference between a 2-hour render and a 4-hour one. Reusing one plate at
    two different `zoom_base` values reads as wide/tight coverage, not a repeat.
    The first shot carrying a prompt for a key defines that image.
    """
    jobs = {}
    for s in shots:
        key = s.get("image") or s["id"]
        if key not in jobs and s.get("prompt"):
            jobs[key] = s
    return jobs


def run_shot(shot, style, meta, steps, images_dir, ckpt, prefix, key=None):
    key = key or shot.get("image") or shot["id"]
    dest = os.path.join(images_dir, f"{key}.png")
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print(f"[skip] {key} already rendered", flush=True)
        return dest

    t0 = time.time()
    resp = api("/prompt", {"prompt": build_workflow(shot, style, meta, steps, ckpt, prefix, key)})
    prompt_id = resp.get("prompt_id")
    if not prompt_id:
        raise RuntimeError(f"{key}: /prompt returned no prompt_id: {resp}")
    print(f"[queue] {key} prompt_id={prompt_id}", flush=True)

    # CPU sampling is slow (minutes per step), so allow a generous per-shot ceiling.
    deadline = time.time() + 5400
    while time.time() < deadline:
        entry = api(f"/history/{prompt_id}", timeout=30).get(prompt_id)
        if entry:
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(f"{shot['id']}: execution error: {json.dumps(status)[:800]}")
            images = []
            for node_out in entry.get("outputs", {}).values():
                images.extend(node_out.get("images", []))
            if images:
                img = images[0]
                src = os.path.join(COMFY_DIR, "output", img.get("subfolder", ""), img["filename"])
                if not os.path.exists(src):
                    raise RuntimeError(f"{key}: reported output missing on disk: {src}")
                shutil.copyfile(src, dest)
                print(f"[done] {key} in {time.time()-t0:.0f}s -> {dest}", flush=True)
                return dest
        time.sleep(5)
    raise TimeoutError(f"{key}: not finished within 5400s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=".", help="dir holding shots.json")
    ap.add_argument("--steps", type=int, default=3)
    ap.add_argument("--only", default="", help="comma-separated shot ids")
    args = ap.parse_args()

    project = os.path.abspath(args.project)
    with open(os.path.join(project, "shots.json"), encoding="utf-8-sig") as f:
        cfg = json.load(f)

    meta = cfg["meta"]
    ckpt = meta.get("checkpoint", DEFAULT_CKPT)
    prefix = meta.get("output_prefix", "shortform")
    images_dir = os.path.join(project, "images")
    os.makedirs(images_dir, exist_ok=True)

    wait_for_server()
    print(f"[ok] ComfyUI reachable at {SERVER}", flush=True)

    # Generate one image per distinct key, not one per beat. --only filters on the
    # image key (which equals the shot id when no `image` field is used).
    jobs = unique_images(cfg["shots"])
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    if only:
        jobs = {k: v for k, v in jobs.items() if k in only}
    reused = len(cfg["shots"]) - len(unique_images(cfg["shots"]))
    if reused > 0:
        print(f"[plan] {len(cfg['shots'])} beats -> {len(jobs)} generations ({reused} reuse existing plates)", flush=True)

    failures = []
    for key, shot in jobs.items():
        try:
            run_shot(shot, cfg["style"], meta, args.steps, images_dir, ckpt, prefix, key)
        except Exception as e:  # noqa: BLE001 - one bad shot must not sink a multi-hour batch
            print(f"[FAIL] {key}: {type(e).__name__}: {e}", flush=True)
            failures.append(key)

    print(f"\n[summary] {len(jobs)-len(failures)}/{len(jobs)} rendered", flush=True)
    if failures:
        print(f"[summary] failed: {', '.join(failures)}", flush=True)
        sys.exit(1)
    print("GENERATION_COMPLETE_OK", flush=True)


if __name__ == "__main__":
    main()
