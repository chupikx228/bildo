import difflib
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from src.apps.schemas import AppDocument
from src.codegen.service import ExpoFileMap, generate_files
from tests.codegen.max_coverage_document import build_max_coverage_document
from tests.generation.template_fixtures import TemplateKey, build_template_document, select_template

REPO_ROOT = Path(__file__).resolve().parents[3]
CODEGEN_CLI = REPO_ROOT / "frontend" / "apps" / "web" / "scripts" / "codegen-cli.ts"

TEMPLATE_PROMPTS: dict[TemplateKey, str] = {
    "habits": "трекер привычек и серии дней",
    "social": "социальная сеть и лента постов",
    "shop": "магазин мебели и корзина",
    "forms": "форма заявки на консультацию",
    "blank": "приложение про космос",
}

requires_node = pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not available")


def run_ts_codegen(document: AppDocument) -> ExpoFileMap:
    node = shutil.which("node")
    assert node is not None
    payload = json.dumps(document.model_dump(mode="json", by_alias=True))

    result = subprocess.run(  # noqa: S603
        [node, str(CODEGEN_CLI)],
        input=payload.encode(),
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        pytest.fail(
            f"{CODEGEN_CLI} exited with code {result.returncode}\n"
            f"--- stderr ---\n{result.stderr.decode(errors='replace')}\n"
            f"--- stdout ---\n{result.stdout.decode(errors='replace')[:2000]}"
        )

    raw = result.stdout.decode()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        pytest.fail(f"{CODEGEN_CLI} produced output that is not JSON: {error}\n--- stdout ---\n{raw[:2000]}")

    files = parsed["files"]
    assert isinstance(files, dict)
    return {str(path): str(content) for path, content in files.items()}


def describe_difference(label: str, python_files: ExpoFileMap, js_files: ExpoFileMap) -> str:
    lines = [f"Python and TypeScript generators disagree on {label}."]

    only_python = sorted(set(python_files) - set(js_files))
    only_js = sorted(set(js_files) - set(python_files))
    if only_python:
        lines.append(f"Files only in the Python output: {only_python}")
    if only_js:
        lines.append(f"Files only in the TypeScript output: {only_js}")

    for path in sorted(set(python_files) & set(js_files)):
        if python_files[path] == js_files[path]:
            continue
        diff = difflib.unified_diff(
            python_files[path].splitlines(),
            js_files[path].splitlines(),
            fromfile=f"python:{path}",
            tofile=f"typescript:{path}",
            lineterm="",
        )
        lines.append("\n".join(list(diff)[:80]))

    return "\n".join(lines)


def assert_generators_agree(label: str, document: AppDocument) -> None:
    python_files = generate_files(document)
    js_files = run_ts_codegen(document)
    assert python_files == js_files, describe_difference(label, python_files, js_files)


@requires_node
def test_codegen_cli_script_exists() -> None:
    assert CODEGEN_CLI.is_file(), f"Codegen CLI wrapper not found at {CODEGEN_CLI}"


@requires_node
@pytest.mark.parametrize("template", sorted(TEMPLATE_PROMPTS))
def test_generators_agree_on_template_documents(template: TemplateKey) -> None:
    prompt = TEMPLATE_PROMPTS[template]
    assert select_template(prompt) == template
    document = build_template_document(prompt, None)

    assert_generators_agree(f"the {template} template", document)


@requires_node
def test_generators_agree_on_max_coverage_document() -> None:
    assert_generators_agree("the max coverage document", build_max_coverage_document())


@requires_node
def test_failing_codegen_cli_reports_stderr() -> None:
    node = shutil.which("node")
    assert node is not None

    result = subprocess.run(  # noqa: S603
        [node, str(CODEGEN_CLI)],
        input=b"not json at all",
        capture_output=True,
        check=False,
    )

    assert result.returncode != 0
    assert b"codegen-cli" in result.stderr
