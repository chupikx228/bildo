from src.apps.schemas import (
    AppDocument,
    AppNavigation,
    AppNode,
    AppNodeLayout,
    AppNodeProps,
    AppNodeStyle,
    AppScreen,
    AppThemeTokens,
    NavigateAction,
    OpenUrlAction,
    SetVarAction,
    ToastAction,
)

THEME = AppThemeTokens(
    color_bg="#0B0B0D",
    color_surface="#18181B",
    color_border="#27272A",
    color_text="#FAFAFA",
    color_text_muted="#A1A1AA",
    color_primary="#5C6CF5",
    color_primary_fg="#FFFFFF",
    radius_base="14",
    font_body="Inter",
    font_heading="Syne",
)

TRICKY_TEXT = "Кавычки 'внутри', слеш \\ и перенос \n хвост"


def _layout(x: float, y: float, width: float, height: float, z_index: int | None = None) -> AppNodeLayout:
    return AppNodeLayout(x=x, y=y, width=width, height=height, z_index=z_index)


def _index_screen() -> AppScreen:
    return AppScreen(
        id="screen-index",
        name="Главная",
        route="index",
        icon="home",
        root=AppNode(
            id="index-root",
            type="View",
            name="Корень",
            style=AppNodeStyle(
                background_color=THEME.color_bg,
                padding=16,
                gap=12,
                flex_direction="column",
                align_items="stretch",
                justify_content="flex-start",
            ),
            children=[
                AppNode(
                    id="text-plain",
                    type="Text",
                    layout=_layout(16, 24, 338, 28),
                    props=AppNodeProps(text=TRICKY_TEXT),
                    style=AppNodeStyle(
                        color=THEME.color_text,
                        font_size=22,
                        font_weight="700",
                        text_align="left",
                        letter_spacing=0.5,
                        line_height=28,
                        opacity=0.9,
                        animation="rise",
                    ),
                ),
                AppNode(
                    id="text-bound",
                    type="Text",
                    layout=_layout(16, 60, 338, 20, z_index=3),
                    props=AppNodeProps(text_bind="userName"),
                    style=AppNodeStyle(color=THEME.color_text_muted, font_size=13, width="100%"),
                ),
                AppNode(
                    id="button-all-actions",
                    type="Button",
                    layout=_layout(16, 92, 338, 48),
                    props=AppNodeProps(
                        text="Сделать всё",
                        href="user-profile",
                        on_press=[
                            NavigateAction(type="navigate", route="index"),
                            SetVarAction(type="setVar", name="counter", value=3),
                            SetVarAction(type="setVar", name="isReady", value=True),
                            SetVarAction(type="setVar", name="userName", value="Аня 'A'"),
                            ToastAction(type="toast", message="Готово, 'сохранено'"),
                            OpenUrlAction(type="openUrl", url="https://example.com/a?b=1&c='2'"),
                        ],
                    ),
                    style=AppNodeStyle(
                        background_color=THEME.color_primary,
                        border_radius=12,
                        border_width=1,
                        border_color=THEME.color_border,
                        shadow="0 6px 16px rgba(0,0,0,.3)",
                        background_gradient="linear-gradient(180deg,#6B7BFF,#4A55C9)",
                    ),
                ),
                AppNode(
                    id="button-bound-label",
                    type="Button",
                    layout=_layout(16, 148, 160, 40),
                    props=AppNodeProps(text_bind="userName"),
                    style=AppNodeStyle(background_color=THEME.color_surface, border_radius=10),
                ),
                AppNode(
                    id="button-default-label",
                    type="Button",
                    layout=_layout(194, 148, 160, 40),
                    props=AppNodeProps(on_press=[ToastAction(type="toast", message="Только тост")]),
                ),
                AppNode(
                    id="image-with-source",
                    type="Image",
                    layout=_layout(16, 200, 160, 120),
                    props=AppNodeProps(source="https://example.com/pic.png"),
                    style=AppNodeStyle(border_radius=16),
                ),
                AppNode(
                    id="image-placeholder",
                    type="Image",
                    layout=_layout(194, 200, 160, 120),
                    style=AppNodeStyle(border_radius=16),
                ),
                AppNode(
                    id="input-bound",
                    type="TextInput",
                    layout=_layout(16, 332, 338, 44),
                    props=AppNodeProps(
                        placeholder="Введите имя",
                        value_bind="userName",
                        on_change=[SetVarAction(type="setVar", name="touched", value=True)],
                    ),
                    style=AppNodeStyle(
                        background_color=THEME.color_surface,
                        color=THEME.color_text,
                        border_radius=10,
                        padding_horizontal=12,
                        padding_vertical=8,
                    ),
                ),
                AppNode(
                    id="input-plain",
                    type="TextInput",
                    layout=_layout(16, 384, 338, 44),
                    props=AppNodeProps(placeholder="Без привязки"),
                ),
                AppNode(
                    id="spacer",
                    type="Spacer",
                    layout=_layout(16, 436, 338, 16),
                    style=AppNodeStyle(margin=4, margin_top=2, margin_bottom=2),
                ),
                AppNode(
                    id="list-with-data",
                    type="FlatList",
                    layout=_layout(16, 460, 338, 100),
                    props=AppNodeProps(data=["Первый", "Второй 'в кавычках'", "Третий"]),
                    style=AppNodeStyle(gap=8),
                ),
                AppNode(
                    id="list-default-data",
                    type="FlatList",
                    layout=_layout(16, 568, 338, 60),
                ),
                AppNode(
                    id="scroll",
                    type="ScrollView",
                    layout=_layout(0, 0, 370, 640, z_index=-1),
                    style=AppNodeStyle(flex=1, padding_horizontal=8),
                    children=[
                        AppNode(
                            id="scroll-inner",
                            type="View",
                            layout=_layout(8, 8, 354, 200),
                            style=AppNodeStyle(background_color=THEME.color_surface, border_radius=14),
                            children=[
                                AppNode(
                                    id="scroll-inner-text",
                                    type="Text",
                                    layout=_layout(12, 12, 330, 20),
                                    props=AppNodeProps(text="Глубоко вложенный текст"),
                                    style=AppNodeStyle(color=THEME.color_text_muted, font_size=12, animation="shimmer"),
                                ),
                            ],
                        ),
                    ],
                ),
                AppNode(
                    id="no-layout-divider",
                    type="View",
                    style=AppNodeStyle(width="100%", height=2, background_color=THEME.color_border),
                ),
                AppNode(
                    id="hidden-branch",
                    type="View",
                    layout=_layout(0, 0, 10, 10),
                    hidden=True,
                    children=[
                        AppNode(
                            id="hidden-child",
                            type="Text",
                            layout=_layout(0, 0, 10, 10),
                            props=AppNodeProps(text="Скрытая ветка не попадает в код"),
                        ),
                    ],
                ),
                AppNode(
                    id="locked-node",
                    type="View",
                    layout=_layout(0, 620, 370, 20),
                    locked=True,
                    field=8,
                    group_id="group-1",
                    style=AppNodeStyle(background_color=THEME.color_border, height=20, width=370, opacity=1),
                ),
            ],
        ),
    )


def _profile_screen() -> AppScreen:
    return AppScreen(
        id="screen-profile",
        name="Профиль пользователя",
        route="user-profile",
        root=AppNode(
            id="profile-root",
            type="View",
            style=AppNodeStyle(background_color=THEME.color_bg, padding=20),
            children=[
                AppNode(
                    id="profile-title",
                    type="Text",
                    layout=_layout(20, 32, 330, 26),
                    props=AppNodeProps(text="Профиль"),
                    style=AppNodeStyle(color=THEME.color_text, font_size=20, font_weight="600"),
                ),
                AppNode(
                    id="profile-open-url",
                    type="Button",
                    layout=_layout(20, 76, 330, 44),
                    props=AppNodeProps(
                        text="Открыть сайт",
                        on_press=[OpenUrlAction(type="openUrl", url="https://example.com")],
                    ),
                ),
            ],
        ),
    )


def _settings_screen() -> AppScreen:
    return AppScreen(
        id="screen-settings",
        name="Настройки",
        route="app_settings",
        root=AppNode(
            id="settings-root",
            type="ScrollView",
            style=AppNodeStyle(background_color=THEME.color_bg),
            children=[
                AppNode(
                    id="settings-back",
                    type="Button",
                    layout=_layout(20, 24, 330, 40),
                    props=AppNodeProps(text="Назад", href="index"),
                ),
            ],
        ),
    )


def build_max_coverage_document() -> AppDocument:
    return AppDocument(
        id="doc-max-coverage",
        name="Максимальное покрытие 2.0",
        slug="max-coverage",
        prompt="документ, покрывающий все типы узлов и действия",
        theme=THEME,
        navigation=AppNavigation(type="drawer", roots=["screen-index", "screen-profile"]),
        screens=[_index_screen(), _profile_screen(), _settings_screen()],
        state={"userName": "Аня", "counter": 0, "isReady": False, "touched": False},
        created_at="2026-08-16T10:00:00+00:00",
        updated_at="2026-08-16T10:30:00+00:00",
    )
