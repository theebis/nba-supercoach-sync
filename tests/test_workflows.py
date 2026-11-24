"""GitHub Actions workflow files must parse and have the expected shape (a broken one silently stops data syncs)."""
import glob
import os

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(path):
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    # YAML 1.1 reads the bare key `on` as True
    if True in doc and "on" not in doc:
        doc["on"] = doc.pop(True)
    return doc


def test_every_workflow_parses_with_triggers_and_jobs():
    files = glob.glob(os.path.join(ROOT, ".github", "workflows", "*.yml"))
    assert files
    for path in files:
        doc = load(path)
        name = os.path.basename(path)
        assert isinstance(doc.get("on"), dict), f"{name}: 'on' must be a mapping of triggers"
        assert isinstance(doc.get("jobs"), dict) and doc["jobs"], f"{name}: no jobs"
        assert "name" in doc, f"{name}: missing name"


def test_data_sync_schedule_and_concurrency():
    doc = load(os.path.join(ROOT, ".github", "workflows", "weekly-sync.yml"))
    on = doc["on"]
    crons = [c["cron"] for c in on["schedule"]]
    assert len(crons) >= 8, "expected the 8-a-day refresh schedule"
    assert "workflow_dispatch" in on and "push" in on
    assert doc["concurrency"]["group"] == "data-sync"
