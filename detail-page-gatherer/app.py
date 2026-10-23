import argparse
import csv
import json
import mimetypes
import os
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
DIST_ROOT = ROOT / "dist"
OUTPUT_ROOT = ROOT / "output"
STATE_PATH = ROOT / "storage" / "taobao_state.json"
SCRIPT_PATH = ROOT / "scripts" / "run_taobao_analysis.py"

JOBS: dict[str, dict] = {}


def candidate_python_paths() -> list[Path]:
    return [
        ROOT / ".venv" / "bin" / "python",
        ROOT / ".venv" / "Scripts" / "python.exe",
    ]


def project_python() -> str:
    for candidate in candidate_python_paths():
        if candidate.exists():
            return str(candidate)
    return sys.executable


def venv_exists() -> bool:
    return any(candidate.exists() for candidate in candidate_python_paths())


def safe_child_path(base: Path, requested: str) -> Path | None:
    target = (base / requested.lstrip("/")).resolve()
    try:
        target.relative_to(base.resolve())
    except ValueError:
        return None
    return target


def read_json(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("content-length", "0"))
    body = handler.rfile.read(length).decode("utf-8")
    return json.loads(body or "{}")


def write_csv(path: Path, payload: dict) -> None:
    fields = [
        "client_product_url",
        "industry",
        "category_keyword",
        "platform",
        "brand_name",
        "target_market",
        "price_range",
        "notes",
        "competitor_1_url",
        "competitor_2_url",
        "competitor_3_url",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerow({field: payload.get(field, "") for field in fields})


def find_latest_report(before: set[Path]) -> Path | None:
    reports = set(OUTPUT_ROOT.glob("*/report.md"))
    new_reports = sorted(reports - before, key=lambda item: item.stat().st_mtime, reverse=True)
    if new_reports:
        return new_reports[0]
    all_reports = sorted(reports, key=lambda item: item.stat().st_mtime, reverse=True)
    return all_reports[0] if all_reports else None


def output_relative_path(path: Path) -> str:
    return str(path.relative_to(OUTPUT_ROOT)).replace("\\", "/")


def run_job(job_id: str, payload: dict) -> None:
    job = JOBS[job_id]
    job_dir = OUTPUT_ROOT / "_jobs" / job_id
    input_path = job_dir / "input.csv"
    before = set(OUTPUT_ROOT.glob("*/report.md"))

    write_csv(input_path, payload)

    browser_mode = payload.get("browser_mode") or "managed"
    cmd = [
        project_python(),
        "-u",
        str(SCRIPT_PATH),
        "--input",
        str(input_path),
        "--limit",
        str(payload.get("limit") or 3),
        "--browser-mode",
        browser_mode,
    ]
    if payload.get("headless") and browser_mode == "managed":
        cmd.append("--headless")
    if browser_mode == "chrome":
        cmd.extend(["--cdp-url", payload.get("cdp_url") or "http://127.0.0.1:9222"])

    job.update({"status": "running", "log": "任务已启动，正在打开淘宝页面...\n"})

    try:
        process = subprocess.Popen(
            cmd,
            cwd=str(ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        assert process.stdout is not None
        for line in process.stdout:
            job["log"] += line
        return_code = process.wait()

        report = find_latest_report(before)
        if return_code == 0 and report:
            case_dir = report.parent
            job.update(
                {
                    "status": "done",
                    "report_path": output_relative_path(report),
                    "case_dir": output_relative_path(case_dir),
                    "log": job["log"] + "\n任务完成。\n",
                }
            )
        else:
            job.update({"status": "error", "log": job["log"] + f"\n任务失败，退出码：{return_code}\n"})
    except Exception as exc:
        job.update({"status": "error", "log": job["log"] + f"\n任务异常：{exc}\n"})


class Handler(BaseHTTPRequestHandler):
    server_version = "DetailPageGatherer/1.0"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/api/health":
            self.send_json(
                {
                    "ok": True,
                    "dist_ready": (DIST_ROOT / "index.html").exists(),
                    "venv_python": venv_exists(),
                }
            )
            return

        if path == "/api/state":
            self.send_json(
                {
                    "taobao_state": STATE_PATH.exists(),
                    "venv_python": venv_exists(),
                    "python": project_python(),
                }
            )
            return

        if path.startswith("/api/job/"):
            job_id = path.rsplit("/", 1)[-1]
            job = JOBS.get(job_id)
            if not job:
                self.send_json({"error": "job not found"}, status=404)
                return
            self.send_json(job)
            return

        if path.startswith("/api/report/"):
            report_rel = path.replace("/api/report/", "", 1)
            report_path = safe_child_path(OUTPUT_ROOT, report_rel)
            if not report_path or not report_path.exists() or report_path.name != "report.md":
                self.send_json({"error": "report not found"}, status=404)
                return
            self.send_json({"content": report_path.read_text(encoding="utf-8")})
            return

        if path.startswith("/api/output/"):
            output_rel = path.replace("/api/output/", "", 1)
            target = safe_child_path(OUTPUT_ROOT, output_rel)
            if not target or not target.exists() or not target.is_file():
                self.send_error(404)
                return
            self.serve_absolute_file(target)
            return

        if path == "/":
            path = "/index.html"

        if DIST_ROOT.exists():
            target = safe_child_path(DIST_ROOT, path)
            if target and target.exists() and target.is_file():
                self.serve_absolute_file(target)
                return
            if "." not in Path(path).name and (DIST_ROOT / "index.html").exists():
                self.serve_absolute_file(DIST_ROOT / "index.html")
                return

        self.send_error(404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/run":
            payload = read_json(self)
            job_id = uuid.uuid4().hex[:12]
            JOBS[job_id] = {
                "id": job_id,
                "status": "queued",
                "created_at": int(time.time()),
                "log": "任务已排队。\n",
            }
            thread = threading.Thread(target=run_job, args=(job_id, payload), daemon=True)
            thread.start()
            self.send_json({"job_id": job_id})
            return

        self.send_json({"error": "not found"}, status=404)

    def serve_absolute_file(self, target: Path) -> None:
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(target.stat().st_size))
        self.end_headers()
        with target.open("rb") as file:
            self.wfile.write(file.read())

    def send_json(self, payload: dict, status: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    parser = argparse.ArgumentParser(description="detail-page-gatherer backend server")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "9898")))
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"detail-page-gatherer backend: http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
