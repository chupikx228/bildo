"""Recorder for live LLM experiments: raw responses, per-run metadata, spend ledger.

Dependency-free and not part of the production package (`src`). Convention and usage:
.claude/knowledge/backend/architecture.md, section 16.
"""

import contextlib
import fcntl
import json
import math
import os
import re
import tempfile
import time
import warnings
from collections import Counter
from collections.abc import Callable, Hashable, Iterable, Iterator, Mapping
from datetime import UTC, datetime
from pathlib import Path
from types import TracebackType
from typing import Any, Self

ENV_DIR = "BILDO_EXPERIMENTS_DIR"
DEFAULT_DIR = "~/bildo-experiments"
RESULTS_FILE = "results.jsonl"
LEDGER_FILE = "ledger.json"
LOCK_FILE = ".lock"
REDACTED = "[REDACTED]"
SLEEP_SKEW_SECONDS = 5.0
MIN_SECRET_LENGTH = 8
BACKEND_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
_SECRET_ENV_NAME = re.compile(r"(?i)(?:_KEY|_TOKEN|_SECRET|_PASSWORD)$")
_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{8,}"), f"Bearer {REDACTED}"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"), REDACTED),
    (re.compile(r"(?i)(authorization[\"']?\s*[:=]\s*[\"']?)[^\r\n\"']+"), rf"\1{REDACTED}"),
    (re.compile(r"(?i)((?:x-)?api[_-]?key[\"']?\s*[:=]\s*[\"']?)[A-Za-z0-9._~+/=-]{8,}"), rf"\1{REDACTED}"),
)
_HEADER_KEYS = frozenset({"headers", "request_headers", "authorization", "proxy-authorization", "x-api-key"})


class CeilingExceededError(RuntimeError):
    """The planned call would push the spend of the experiment over its ceiling."""


class UnsafeLocationError(ValueError):
    """The experiments directory is inside a git work tree, where raw data could be committed."""


def _check_name(kind: str, value: str) -> str:
    if not _NAME.fullmatch(value):
        raise ValueError(f"{kind} must match {_NAME.pattern}: {value!r}")
    return value


def _dotenv_values(path: Path) -> dict[str, str]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    values: dict[str, str] = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")
    return values


def discover_secrets(extra: Iterable[str] = ()) -> list[str]:
    """Secret values to scrub literally: the process env, backend/.env (by name suffix) and `extra`."""
    candidates = [
        value
        for source in (os.environ, _dotenv_values(BACKEND_ENV_FILE))
        for name, value in source.items()
        if _SECRET_ENV_NAME.search(name)
    ]
    secrets = {value for value in (*candidates, *extra) if len(value) >= MIN_SECRET_LENGTH}
    return sorted(secrets, key=len, reverse=True)


def redact_text(text: str, secrets: Iterable[str] = ()) -> str:
    for secret in secrets:
        text = text.replace(secret, REDACTED)
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def redact_value(value: Any, secrets: Iterable[str] = ()) -> Any:
    """Redact every string in a JSON-like structure and drop request-header keys entirely."""
    secrets = tuple(secrets)
    if isinstance(value, str):
        return redact_text(value, secrets)
    if isinstance(value, Mapping):
        return {
            redact_text(str(key), secrets): redact_value(item, secrets)
            for key, item in value.items()
            if str(key).lower() not in _HEADER_KEYS
        }
    if isinstance(value, list | tuple):
        return [redact_value(item, secrets) for item in value]
    return value


def _write_new(target: Path, data: bytes) -> Path:
    """Write `data` atomically without ever replacing an existing file (`name.2.json`, `name.3.json`, …)."""
    fd, tmp_name = tempfile.mkstemp(dir=target.parent, prefix=".tmp-")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        attempt = 1
        while True:
            candidate = target if attempt == 1 else target.with_name(f"{target.stem}.{attempt}{target.suffix}")
            try:
                os.link(tmp_name, candidate)
            except FileExistsError:
                attempt += 1
                continue
            return candidate
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(tmp_name)


def _find_git_root(path: Path) -> Path | None:
    for parent in (path, *path.parents):
        if (parent / ".git").exists():
            return parent
    return None


def extract_usage(body: Mapping[str, Any]) -> dict[str, Any]:
    """Fields of a chat-completion response body worth recording; `cost` is `usage.cost` as billed."""
    raw_usage = body.get("usage")
    usage: Mapping[str, Any] = raw_usage if isinstance(raw_usage, Mapping) else {}
    raw_details = usage.get("completion_tokens_details")
    details: Mapping[str, Any] = raw_details if isinstance(raw_details, Mapping) else {}
    choices = body.get("choices")
    first = choices[0] if isinstance(choices, list) and choices and isinstance(choices[0], Mapping) else {}
    return {
        "provider": body.get("provider"),
        "finish_reason": first.get("finish_reason"),
        "input_tokens": usage.get("prompt_tokens"),
        "output_tokens": usage.get("completion_tokens"),
        "reasoning_tokens": details.get("reasoning_tokens"),
        "cost": usage.get("cost"),
    }


def response_text(body: Any) -> str:
    """`choices[0].message.content` of a chat-completion body, or an empty string."""
    if isinstance(body, Mapping):
        choices = body.get("choices")
        if isinstance(choices, list) and choices and isinstance(choices[0], Mapping):
            message = choices[0].get("message")
            if isinstance(message, Mapping) and isinstance(message.get("content"), str):
                return str(message["content"])
    return ""


def parse_json_text(text: str) -> Any | None:
    """Parse JSON from a model reply: plain, inside a ``` fence, or surrounded by prose. None if absent."""
    stripped = text.strip()
    candidates = [stripped]
    fenced = re.search(r"```(?:json)?\s*(.*?)```", stripped, re.DOTALL)
    if fenced:
        candidates.append(fenced.group(1).strip())
    for candidate in candidates:
        with contextlib.suppress(ValueError):
            return json.loads(candidate)
    decoder = json.JSONDecoder()
    for match in re.finditer(r"[{\[]", stripped):
        with contextlib.suppress(ValueError):
            return decoder.raw_decode(stripped, match.start())[0]
    return None


def walk_dicts(value: Any) -> Iterator[dict[str, Any]]:
    """Every dict in a parsed document, depth first — for counting node-level values."""
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from walk_dicts(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk_dicts(item)


class Experiment:
    """One ticket's experiment directory: `<base>/<ticket>/{results.jsonl,ledger.json,<run-id>/…}`."""

    def __init__(
        self,
        ticket: str,
        *,
        base_dir: Path | str | None = None,
        ceiling: float | None = None,
        secrets: Iterable[str] = (),
        allow_in_repo: bool = False,
    ) -> None:
        self.ticket = _check_name("ticket", ticket)
        base = Path(base_dir or os.environ.get(ENV_DIR) or DEFAULT_DIR).expanduser().resolve()
        git_root = _find_git_root(base)
        if git_root is not None and not allow_in_repo:
            raise UnsafeLocationError(
                f"{base} is inside the git work tree {git_root}; use a directory outside the repo"
            )
        self.root = base / self.ticket
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.results_path = self.root / RESULTS_FILE
        self.ledger_path = self.root / LEDGER_FILE
        self.ceiling = ceiling
        self._secrets = discover_secrets(secrets)

    def redact(self, text: str) -> str:
        return redact_text(text, self._secrets)

    @contextlib.contextmanager
    def _locked(self) -> Iterator[None]:
        fd = os.open(self.root / LOCK_FILE, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield
        finally:
            os.close(fd)

    def run_dir(self, run_id: str) -> Path:
        path = self.root / _check_name("run_id", run_id)
        path.mkdir(mode=0o700, exist_ok=True)
        return path

    def save_raw(self, run_id: str, data: bytes | str, *, kind: str, suffix: str = ".json") -> Path:
        """Store a raw request/response body as `<run-id>/<kind><suffix>`; call this BEFORE parsing anything."""
        raw = data.decode("utf-8", errors="surrogateescape") if isinstance(data, bytes) else data
        clean = self.redact(raw).encode("utf-8", errors="surrogateescape")
        return _write_new(self.run_dir(run_id) / f"{_check_name('kind', kind)}{suffix}", clean)

    def record(self, run_id: str, meta: Mapping[str, Any]) -> dict[str, Any]:
        """Append one line to results.jsonl; `ticket`/`run_id`/`recorded_at` are filled in, secrets scrubbed."""
        _check_name("run_id", run_id)
        entry: dict[str, Any] = {
            **redact_value(dict(meta), self._secrets),
            "ticket": self.ticket,
            "run_id": run_id,
            "recorded_at": datetime.now(UTC).isoformat(),
        }
        line = json.dumps(entry, ensure_ascii=False, default=str) + "\n"
        with self._locked():
            fd = os.open(self.results_path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            try:
                os.write(fd, line.encode("utf-8"))
                os.fsync(fd)
            finally:
                os.close(fd)
        return entry

    def _read_ledger(self) -> dict[str, Any]:
        if not self.ledger_path.exists():
            return {"ticket": self.ticket, "spent": 0.0, "entries": []}
        data = json.loads(self.ledger_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("entries"), list):
            raise ValueError(f"{self.ledger_path} is not a ledger; fix or remove it by hand")
        return data

    def spent(self) -> float:
        return math.fsum(float(item["amount"]) for item in self._read_ledger()["entries"])

    def add_spend(self, amount: float, note: str = "") -> float:
        """Add real spend (use `usage.cost`) to the persistent ledger; returns the new total."""
        if not math.isfinite(amount) or amount < 0:
            raise ValueError(f"spend must be a finite non-negative number: {amount!r}")
        with self._locked():
            ledger = self._read_ledger()
            ledger["entries"].append(
                {"at": datetime.now(UTC).isoformat(), "amount": amount, "note": self.redact(note)},
            )
            ledger["spent"] = math.fsum(float(item["amount"]) for item in ledger["entries"])
            fd, tmp_name = tempfile.mkstemp(dir=self.root, prefix=".tmp-ledger-")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    json.dump(ledger, handle, ensure_ascii=False, indent=1)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(tmp_name, self.ledger_path)
            finally:
                with contextlib.suppress(FileNotFoundError):
                    os.unlink(tmp_name)
            return float(ledger["spent"])

    def guard(self, planned_pessimistic_cost: float, ceiling: float | None = None) -> None:
        """Raise before a call whose worst case would push the total spend (from the ledger) over the ceiling."""
        limit = ceiling if ceiling is not None else self.ceiling
        if limit is None:
            raise ValueError("no ceiling: pass one to guard() or to Experiment()")
        spent = self.spent()
        if spent + planned_pessimistic_cost > limit:
            raise CeilingExceededError(
                f"{self.ticket}: spent {spent:.4f} + planned {planned_pessimistic_cost:.4f} exceeds ceiling {limit:.4f}",
            )

    def run(self, run_id: str, **fields: Any) -> "Run":
        """Context manager that times a call and always writes its record (and spend) on exit."""
        return Run(self, run_id, fields)

    def iter_results(self, *, strict: bool = False) -> Iterator[dict[str, Any]]:
        """Records of results.jsonl. A torn last line (crash mid-write) is skipped unless `strict`."""
        if not self.results_path.exists():
            return
        for number, line in enumerate(self.results_path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except ValueError as error:
                if strict:
                    raise ValueError(f"{self.results_path}:{number}: {error}") from error
                continue
            if isinstance(record, dict):
                yield record

    def raw_path(self, record: Mapping[str, Any], kind: str = "response") -> Path | None:
        files = record.get("raw_files")
        relative = files.get(kind) if isinstance(files, Mapping) else None
        if relative is None and kind == "response":
            relative = record.get("raw_file")
        return self.root / str(relative) if relative else None

    def load_document(self, record: Mapping[str, Any], kind: str = "response") -> Any | None:
        """The JSON document the model produced for a record: parsed from the raw response, or None."""
        path = self.raw_path(record, kind)
        if path is None or not path.is_file():
            return None
        text = path.read_text(encoding="utf-8", errors="replace")
        body = parse_json_text(text)
        return parse_json_text(response_text(body) if isinstance(body, Mapping) and "choices" in body else text)

    def count_values(
        self,
        extract: Callable[[Any], Iterable[Hashable]],
        *,
        group_by: str = "model",
        where: Callable[[Mapping[str, Any]], bool] | None = None,
        kind: str = "response",
    ) -> dict[str, Counter[Hashable]]:
        """Count `extract(document)` values over all raw documents, grouped by a record field (default: model)."""
        counts: dict[str, Counter[Hashable]] = {}
        unreadable = 0
        for record in self.iter_results():
            if where is not None and not where(record):
                continue
            document = self.load_document(record, kind)
            if document is None:
                unreadable += 1
                continue
            counts.setdefault(str(record.get(group_by, "?")), Counter()).update(extract(document))
        if unreadable:
            warnings.warn(f"{unreadable} record(s) had no readable document and were skipped", stacklevel=2)
        return counts


class Run:
    """A timed call. On exit writes the record with both clocks and adds `cost` to the ledger exactly once."""

    def __init__(self, experiment: Experiment, run_id: str, fields: Mapping[str, Any]) -> None:
        self.experiment = experiment
        self.run_id = _check_name("run_id", run_id)
        self.fields: dict[str, Any] = dict(fields)
        self.checks: dict[str, Any] = {}
        self._raw_files: dict[str, str] = {}
        self._started_wall = 0.0
        self._started_monotonic = 0.0

    def __enter__(self) -> Self:
        self._started_wall = time.time()
        self._started_monotonic = time.monotonic()
        return self

    def save_raw(self, data: bytes | str, *, kind: str = "response", suffix: str = ".json") -> Path:
        path = self.experiment.save_raw(self.run_id, data, kind=kind, suffix=suffix)
        self._raw_files[kind] = str(path.relative_to(self.experiment.root))
        return path

    def set(self, **fields: Any) -> None:
        self.fields.update(fields)

    def apply_usage(self, body: Mapping[str, Any]) -> None:
        """Take provider, finish_reason, tokens and `usage.cost` from a parsed response body."""
        self.fields.update(extract_usage(body))

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        wall = time.time() - self._started_wall
        monotonic = time.monotonic() - self._started_monotonic
        meta: dict[str, Any] = {
            **self.fields,
            "started_at": datetime.fromtimestamp(self._started_wall, UTC).isoformat(),
            "started_monotonic": self._started_monotonic,
            "wall_seconds": round(wall, 3),
            "monotonic_seconds": round(monotonic, 3),
            "clock_skew_seconds": round(wall - monotonic, 3),
            "suspected_sleep": wall - monotonic > SLEEP_SKEW_SECONDS,
            "checks": self.checks,
            "raw_files": self._raw_files,
            "raw_file": self._raw_files.get("response"),
        }
        if exc is not None:
            meta["error"] = f"{type(exc).__name__}: {exc}"
        self.experiment.record(self.run_id, meta)
        cost = self.fields.get("cost")
        if isinstance(cost, int | float) and not isinstance(cost, bool):
            self.experiment.add_spend(float(cost), note=self.run_id)
