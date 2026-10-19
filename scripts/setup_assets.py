"""Get the pinned model files and unpack the saved course data."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen
import argparse
import gzip
import hashlib
import json
import math
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / "assets.json").read_text())


def matches(path, expected):
    return path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == expected


def prepare_snapshot(item):
    path = ROOT / item["path"]
    if matches(path, item["sha256"]):
        return
    # Keep the original bytes so the frozen benchmark uses the same catalog.
    data = gzip.decompress((ROOT / item["archive"]).read_bytes())
    if hashlib.sha256(data).hexdigest() != item["sha256"]:
        raise ValueError("Saved data failed its checksum: " + item["path"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def download(item):
    path = ROOT / item["path"]
    if matches(path, item["sha256"]):
        return
    print("Downloading " + item["path"], flush=True)
    request = Request(item["url"], headers={"User-Agent": "AggieCourseGuide/1.0"})
    with urlopen(request, timeout=120) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != item["sha256"]:
        raise ValueError("Download failed its checksum: " + item["path"])
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".download")
    temporary.write_bytes(data)
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true", help="Check local files without downloading")
    args = parser.parse_args()
    if not args.verify:
        for item in MANIFEST["snapshots"]:
            prepare_snapshot(item)
        with ThreadPoolExecutor(max_workers=3) as workers:
            list(workers.map(download, MANIFEST["downloads"]))
        if not valid_vectors():
            subprocess.run(["node", "--experimental-vm-modules", "scripts/embed-catalog.mjs"], cwd=ROOT, check=True)
    missing = [item["path"] for item in MANIFEST["snapshots"] + MANIFEST["downloads"]
               if not matches(ROOT / item["path"], item["sha256"])]
    if missing:
        raise SystemExit("Missing or changed files: " + ", ".join(missing))
    if not valid_vectors():
        raise SystemExit("Course vectors are missing or invalid. Run setup again.")
    print("Course data, model files, and runtime checksums passed.")


def valid_vectors():
    try:
        vectors = json.loads((ROOT / "embeddings.json").read_text())
        courses = json.loads((ROOT / "catalog.json").read_text())["courses"]
        return set(vectors) == {course["code"] for course in courses} and all(
            isinstance(vector, list) and len(vector) == 384
            and all(isinstance(value, (int, float)) and math.isfinite(value) for value in vector)
            for vector in vectors.values())
    except (OSError, ValueError, TypeError, KeyError):
        return False


if __name__ == "__main__":
    main()
