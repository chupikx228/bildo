from typing import Literal

import pytest

from src.apps.schemas import (
    AppDocument,
    AppNavigation,
    AppNode,
    AppNodeLayout,
    AppNodeProps,
    AppScreen,
    SetVarAction,
)
from src.codegen.service import generate_files
from tests.codegen.max_coverage_document import THEME


def _document(navigation: Literal["tabs", "stack"]) -> AppDocument:
    return AppDocument(
        id="doc-state",
        name="State",
        theme=THEME,
        navigation=AppNavigation(type=navigation, roots=["screen-index", "screen-profile"]),
        screens=[
            AppScreen(
                id="screen-index",
                name="Главная",
                route="index",
                root=AppNode(
                    id="root-index",
                    type="View",
                    children=[
                        AppNode(
                            id="greeting",
                            type="Text",
                            layout=AppNodeLayout(x=16, y=24, width=200, height=24),
                            props=AppNodeProps(text_bind="userName"),
                        ),
                        AppNode(
                            id="rename",
                            type="Button",
                            layout=AppNodeLayout(x=16, y=64, width=200, height=44),
                            props=AppNodeProps(
                                text="Сменить имя",
                                on_press=[SetVarAction(type="setVar", name="userName", value="Аня")],
                            ),
                        ),
                    ],
                ),
            ),
            AppScreen(
                id="screen-profile",
                name="Профиль",
                route="profile",
                root=AppNode(id="root-profile", type="View"),
            ),
        ],
        state={"userName": "Гость"},
        revision=1,
        created_at="2026-10-01T10:00:00+00:00",
        updated_at="2026-10-01T10:00:00+00:00",
    )


@pytest.mark.parametrize("navigation", ["tabs", "stack"])
def test_state_module_lives_outside_the_routes_directory(navigation: Literal["tabs", "stack"]) -> None:
    files = generate_files(_document(navigation))

    assert "lib/state.ts" in files
    assert "app/state.tsx" not in files
    assert {path for path in files if path.startswith("app/")} == {
        "app/_layout.tsx",
        "app/index.tsx",
        "app/profile.tsx",
    }


def test_state_module_has_no_jsx() -> None:
    state = generate_files(_document("stack"))["lib/state.ts"]

    assert "return createElement(Ctx.Provider, { value }, children);" in state
    assert "<Ctx.Provider" not in state
    assert "import { createContext, createElement, useCallback, useContext, useMemo, useState," in state
    assert '"userName": "Гость"' in state


@pytest.mark.parametrize("navigation", ["tabs", "stack"])
def test_layout_and_screens_import_state_from_lib(navigation: Literal["tabs", "stack"]) -> None:
    files = generate_files(_document(navigation))

    assert "import { AppStateProvider } from '../lib/state';\n" in files["app/_layout.tsx"]
    assert "import { useAppState } from '../lib/state';\n" in files["app/index.tsx"]
    assert "lib/state" not in files["app/profile.tsx"]
    assert all("from './state'" not in content for content in files.values())


def test_tabs_layout_declares_only_screen_routes() -> None:
    layout = generate_files(_document("tabs"))["app/_layout.tsx"]

    assert layout.count("<Tabs.Screen ") == 2
    assert '<Tabs.Screen name="state"' not in layout
