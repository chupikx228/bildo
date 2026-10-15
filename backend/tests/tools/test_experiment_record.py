import json
import time
from collections import Counter
from pathlib import Path

import pytest

from experiments import record as record_module
from experiments.record import (
    CeilingExceededError,
    Experiment,
    UnsafeLocationError,
    extract_usage,
    parse_json_text,
    redact_text,
    redact_value,
    response_text,
    walk_dicts,
)

KEY = "rk-live-0123456789abcdefABCDEF"


@pytest.fixture(autouse=True)
def isolated_secrets(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(record_module, "BACKEND_ENV_FILE", tmp_path / "missing.env")
    monkeypatch.delenv("BILDO_EXPERIMENTS_DIR", raising=False)
    monkeypatch.delenv("ROUTERAI_API_KEY", raising=False)


@pytest.fixture
def experiment(tmp_path: Path) -> Experiment:
    return Experiment("BIL-999", base_dir=tmp_path / "exp", ceiling=1.0)


def completion(content: str, *, cost: float | None = 0.25, provider: str = "Baidu") -> dict[str, object]:
    return {
        "provider": provider,
        "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": content}}],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 20,
            "completion_tokens_details": {"reasoning_tokens": 5},
            "cost": cost,
        },
    }


def test_layout_is_ticket_directory_under_base(experiment: Experiment, tmp_path: Path) -> None:
    assert experiment.root == (tmp_path / "exp" / "BIL-999").resolve()
    assert experiment.root.is_dir()


def test_base_dir_comes_from_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("BILDO_EXPERIMENTS_DIR", str(tmp_path / "from-env"))
    assert Experiment("BIL-1").root == (tmp_path / "from-env" / "BIL-1").resolve()


def test_default_base_dir_is_under_home(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    assert Experiment("BIL-1").root == (tmp_path / "bildo-experiments" / "BIL-1").resolve()


def test_refuses_a_directory_inside_a_git_work_tree(tmp_path: Path) -> None:
    (tmp_path / "repo" / ".git").mkdir(parents=True)
    with pytest.raises(UnsafeLocationError):
        Experiment("BIL-1", base_dir=tmp_path / "repo" / "data")
    assert Experiment("BIL-1", base_dir=tmp_path / "repo" / "data", allow_in_repo=True).root.is_dir()


@pytest.mark.parametrize("bad", ["", "../escape", "a/b", ".hidden", "with space"])
def test_unsafe_names_are_rejected(experiment: Experiment, bad: str) -> None:
    with pytest.raises(ValueError, match="must match"):
        Experiment(bad, base_dir=experiment.root.parent)
    with pytest.raises(ValueError, match="must match"):
        experiment.save_raw(bad, "x", kind="response")


def test_save_raw_writes_exact_bytes_and_leaves_no_temp_files(experiment: Experiment) -> None:
    path = experiment.save_raw("a1", '{"x": "ключ"}', kind="response")
    assert path == experiment.root / "a1" / "response.json"
    assert path.read_bytes() == '{"x": "ключ"}'.encode()
    assert [p.name for p in path.parent.iterdir()] == ["response.json"]


def test_save_raw_never_overwrites(experiment: Experiment) -> None:
    first = experiment.save_raw("a1", "first", kind="response")
    second = experiment.save_raw("a1", "second", kind="response")
    third = experiment.save_raw("a1", "third", kind="response")
    assert (first.name, second.name, third.name) == ("response.json", "response.2.json", "response.3.json")
    assert [p.read_text() for p in (first, second, third)] == ["first", "second", "third"]


def test_save_raw_keeps_non_utf8_bytes(experiment: Experiment) -> None:
    payload = b'{"a": "\xff\xfe"}'
    assert experiment.save_raw("a1", payload, kind="response").read_bytes() == payload


def test_save_raw_redacts_keys_and_bearer_tokens(experiment: Experiment) -> None:
    body = f'{{"echo": "Authorization: Bearer abcdef1234567890", "k": "{KEY}", "sk": "sk-abcdefghijklmnop1234"}}'
    experiment_with_secret = Experiment("BIL-998", base_dir=experiment.root.parent, secrets=[KEY])
    text = experiment_with_secret.save_raw("a1", body, kind="request").read_text()
    assert KEY not in text
    assert "abcdef1234567890" not in text
    assert "sk-abcdefghijklmnop1234" not in text
    assert json.loads(text)["k"] == "[REDACTED]"


def test_secrets_are_discovered_from_env_and_dotenv(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, experiment: Experiment
) -> None:
    dotenv = tmp_path / ".env"
    dotenv.write_text('# c\nROUTERAI_API_KEY="dotenv-secret-value-1"\nROUTERAI_MODEL=deepseek/deepseek-v4-flash\n')
    monkeypatch.setattr(record_module, "BACKEND_ENV_FILE", dotenv)
    monkeypatch.setenv("OTHER_API_KEY", "env-secret-value-2")
    scrubbed = Experiment("BIL-997", base_dir=experiment.root.parent)
    text = scrubbed.redact("a dotenv-secret-value-1 b env-secret-value-2 c deepseek/deepseek-v4-flash")
    assert text == "a [REDACTED] b [REDACTED] c deepseek/deepseek-v4-flash"


def test_redaction_ignores_ordinary_text() -> None:
    plain = "risk-adjusted return, task-oriented, a bearer of news, max_tokens: 64000"
    assert redact_text(plain) == plain


def test_redact_value_drops_header_keys_and_scrubs_nested_strings() -> None:
    value = {
        "headers": {"Authorization": "Bearer abcdef1234567890"},
        "request": {"Authorization": "Basic zzz", "note": "Bearer abcdef1234567890", "n": 3},
        "items": [{"x": "sk-abcdefghijklmnop1234"}],
    }
    assert redact_value(value) == {
        "request": {"note": "Bearer [REDACTED]", "n": 3},
        "items": [{"x": "[REDACTED]"}],
    }


def test_record_appends_json_lines_and_scrubs_meta(experiment: Experiment) -> None:
    experiment.record("a1", {"model": "m", "note": "Bearer abcdef1234567890", "headers": {"k": "v"}})
    experiment.record("a2", {"model": "m", "cost": 0.5})
    lines = experiment.results_path.read_text().splitlines()
    assert len(lines) == 2
    first = json.loads(lines[0])
    assert first["ticket"] == "BIL-999"
    assert first["run_id"] == "a1"
    assert first["note"] == "Bearer [REDACTED]"
    assert "headers" not in first
    assert "recorded_at" in first
    assert [r["run_id"] for r in experiment.iter_results()] == ["a1", "a2"]


def test_record_cannot_override_identity_fields(experiment: Experiment) -> None:
    entry = experiment.record("a1", {"ticket": "OTHER", "run_id": "zzz"})
    assert (entry["ticket"], entry["run_id"]) == ("BIL-999", "a1")


def test_iter_results_skips_a_torn_last_line_unless_strict(experiment: Experiment) -> None:
    experiment.record("a1", {"model": "m"})
    with experiment.results_path.open("a") as handle:
        handle.write('{"run_id": "a2", "mod')
    assert [r["run_id"] for r in experiment.iter_results()] == ["a1"]
    with pytest.raises(ValueError, match=r"results\.jsonl:2"):
        list(experiment.iter_results(strict=True))


def test_iter_results_on_empty_experiment(experiment: Experiment) -> None:
    assert list(experiment.iter_results()) == []


def test_ledger_persists_across_instances(experiment: Experiment) -> None:
    assert experiment.add_spend(0.25, "a1") == pytest.approx(0.25)
    again = Experiment("BIL-999", base_dir=experiment.root.parent, ceiling=1.0)
    assert again.spent() == pytest.approx(0.25)
    assert again.add_spend(0.5, "a2") == pytest.approx(0.75)
    ledger = json.loads(experiment.ledger_path.read_text())
    assert ledger["spent"] == pytest.approx(0.75)
    assert [e["note"] for e in ledger["entries"]] == ["a1", "a2"]


def test_guard_raises_before_exceeding_the_ceiling(experiment: Experiment) -> None:
    experiment.add_spend(0.8, "earlier run")
    restarted = Experiment("BIL-999", base_dir=experiment.root.parent)
    restarted.guard(0.2, ceiling=1.0)
    with pytest.raises(CeilingExceededError):
        restarted.guard(0.2001, ceiling=1.0)
    with pytest.raises(CeilingExceededError):
        experiment.guard(0.21)


def test_guard_needs_a_ceiling(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="no ceiling"):
        Experiment("BIL-1", base_dir=tmp_path).guard(0.1)


@pytest.mark.parametrize("amount", [-0.1, float("nan"), float("inf")])
def test_add_spend_rejects_nonsense(experiment: Experiment, amount: float) -> None:
    with pytest.raises(ValueError, match="finite non-negative"):
        experiment.add_spend(amount)


def test_a_corrupt_ledger_is_not_silently_reset(experiment: Experiment) -> None:
    experiment.ledger_path.write_text("{not json")
    with pytest.raises(ValueError):
        experiment.spent()
    experiment.ledger_path.write_text('{"entries": 3}')
    with pytest.raises(ValueError, match="not a ledger"):
        experiment.add_spend(0.1)


def test_run_records_timing_raw_usage_and_spend(experiment: Experiment) -> None:
    body = completion('{"alpha": "red"}')
    with experiment.run("a1", variant="a", model="m1", balance_before=10.0) as run:
        run.save_raw(json.dumps(body), kind="response")
        run.apply_usage(body)
        run.checks["follows"] = "schema-keys"
        run.set(balance_after=9.75)
    (entry,) = experiment.iter_results()
    assert entry["variant"] == "a"
    assert entry["model"] == "m1"
    assert entry["provider"] == "Baidu"
    assert entry["finish_reason"] == "stop"
    assert (entry["input_tokens"], entry["output_tokens"], entry["reasoning_tokens"]) == (10, 20, 5)
    assert entry["cost"] == 0.25
    assert (entry["balance_before"], entry["balance_after"]) == (10.0, 9.75)
    assert entry["checks"] == {"follows": "schema-keys"}
    assert entry["raw_file"] == "a1/response.json"
    assert entry["raw_files"] == {"response": "a1/response.json"}
    assert entry["wall_seconds"] >= 0
    assert entry["monotonic_seconds"] >= 0
    assert entry["suspected_sleep"] is False
    assert {"started_at", "started_monotonic", "clock_skew_seconds"} <= entry.keys()
    assert experiment.spent() == pytest.approx(0.25)


def test_run_writes_a_record_even_when_the_body_raises(experiment: Experiment) -> None:
    with pytest.raises(RuntimeError, match="boom"), experiment.run("a1", model="m") as run:
        run.save_raw("partial", kind="response")
        raise RuntimeError("boom")
    (entry,) = experiment.iter_results()
    assert entry["error"] == "RuntimeError: boom"
    assert entry["raw_file"] == "a1/response.json"
    assert experiment.spent() == 0


def test_run_flags_a_wall_clock_that_outran_the_monotonic_clock(
    experiment: Experiment, monkeypatch: pytest.MonkeyPatch
) -> None:
    wall = iter([1000.0, 1100.0])
    monotonic = iter([50.0, 52.0])
    monkeypatch.setattr(time, "time", lambda: next(wall))
    monkeypatch.setattr(time, "monotonic", lambda: next(monotonic))
    with experiment.run("a1"):
        pass
    (entry,) = experiment.iter_results()
    assert entry["wall_seconds"] == 100.0
    assert entry["monotonic_seconds"] == 2.0
    assert entry["suspected_sleep"] is True


def test_extract_usage_tolerates_gateway_errors() -> None:
    assert extract_usage({"choices": None, "usage": None})["cost"] is None
    assert extract_usage({"error": "x"})["finish_reason"] is None


def test_parse_json_text_variants() -> None:
    assert parse_json_text('  \n {"a": 1} \n') == {"a": 1}
    assert parse_json_text('Sure:\n```json\n{"a": [1, 2]}\n```\nDone') == {"a": [1, 2]}
    assert parse_json_text('Here it is {"a": 1} and more text') == {"a": 1}
    assert parse_json_text("no json here") is None
    assert response_text(completion("hi")) == "hi"
    assert response_text({"choices": None}) == ""


def icons(document: object) -> list[str]:
    props = (node.get("props") for node in walk_dicts(document))
    return [p["icon"] for p in props if isinstance(p, dict) and "icon" in p]


def test_count_values_groups_distinct_values_per_model(experiment: Experiment) -> None:
    documents = {
        "a1": (
            "m1",
            {"screens": [{"root": {"children": [{"props": {"icon": "home"}}, {"props": {"icon": "check"}}]}}]},
        ),
        "a2": ("m1", {"screens": [{"root": {"children": [{"props": {"icon": "home"}}]}}]}),
        "b1": ("m2", {"screens": [{"root": {"props": {"icon": "rocket"}}}]}),
    }
    for run_id, (model, document) in documents.items():
        with experiment.run(run_id, model=model) as run:
            body = completion("```json\n" + json.dumps(document) + "\n```")
            run.save_raw(json.dumps(body), kind="response")
    counts = experiment.count_values(icons)
    assert counts == {"m1": Counter({"home": 2, "check": 1}), "m2": Counter({"rocket": 1})}
    only_m2 = experiment.count_values(icons, where=lambda r: r["model"] == "m2")
    assert set(only_m2) == {"m2"}


def test_count_values_warns_about_unreadable_records(experiment: Experiment) -> None:
    experiment.record("a1", {"model": "m1", "raw_file": "gone/response.json"})
    experiment.record("a2", {"model": "m1"})
    with pytest.warns(UserWarning, match="2 record"):
        assert experiment.count_values(icons) == {}


def test_legacy_layout_with_raw_file_relative_to_ticket_dir_is_readable(experiment: Experiment) -> None:
    (experiment.root / "raw").mkdir()
    (experiment.root / "raw" / "a1.json").write_text("\n   \n" + json.dumps(completion('{"props": {"icon": "x"}}')))
    experiment.results_path.write_text(json.dumps({"model": "m1", "raw_file": "raw/a1.json"}) + "\n")
    assert experiment.count_values(icons) == {"m1": Counter({"x": 1})}


def test_walk_dicts_yields_every_nested_dict() -> None:
    document = {"a": [{"b": {"c": 1}}, 2], "d": {"e": [{"f": 3}]}}
    assert len(list(walk_dicts(document))) == 5
