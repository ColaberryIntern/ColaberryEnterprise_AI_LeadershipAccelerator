#!/usr/bin/env python
"""Config-driven story-driven deep_plan generator (locked-in process).

Usage: PYTHONPATH=<AI Project Architect repo> python gen_story_plan.py story_configs/<slug>.json

Reads {slug, project_name, idea, choices[]} from the config; runs the real 6-stage
maker/checker pipeline (execution.advisory.deep_plan); writes <slug>-deep-plan.json
next to THIS script (so the publisher finds it). Prints a one-line summary.

Needs .oaikey (the advisor OPENAI_API_KEY) beside this script. Pull it from prod at
runtime, never commit it, wipe it after:
  ssh root@95.216.199.47 "docker exec ai-project-architect-app-1 printenv OPENAI_API_KEY" > .oaikey
"""
import os, sys, json

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ["OPENAI_API_KEY"] = open(os.path.join(HERE, ".oaikey")).read().strip()

cfg = json.load(open(sys.argv[1], encoding="utf-8"))
from execution.advisory import deep_plan  # noqa: E402

choices = "\n".join(cfg["choices"]) if isinstance(cfg.get("choices"), list) else cfg.get("choices", "")
print(f"[gen:{cfg['slug']}] starting pipeline...", flush=True)
plan = deep_plan.generate_deep_plan(cfg["idea"], choices, cfg["project_name"])
out = os.path.join(HERE, f"{cfg['slug']}-deep-plan.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(plan, f, indent=2, ensure_ascii=False)
t = plan.get("trace", {}) or {}
print(f"[gen:{cfg['slug']}] DONE reqs={len(plan.get('reqs', []))} stories={plan.get('story_count')} "
      f"releases={len(plan.get('releases', []))} trace_ok={t.get('ok')} below_floor={t.get('below_floor')} -> {out}", flush=True)
