from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from src.apps.schemas import (
    AppDocument,
    AppNavigation,
    AppNode,
    AppNodeLayout,
    AppNodeProps,
    AppNodeStyle,
    AppScreen,
    AppStateValue,
    AppThemeTokens,
    NavigateAction,
    SetVarAction,
    ToastAction,
)

TemplateKey = Literal["habits", "social", "shop", "forms", "blank"]

SCREEN_WIDTH = 370.0
SCREEN_HEIGHT = 640.0

TEMPLATE_KEYWORDS: tuple[tuple[TemplateKey, tuple[str, ...]], ...] = (
    (
        "habits",
        ("привычк", "трекер", "рутин", "медитац", "тренировк", "habit", "tracker", "streak", "routine", "workout"),
    ),
    (
        "social",
        (
            "соцсет",
            "социальн",
            "лент",
            "подписч",
            "друз",
            "чат",
            "сообщени",
            "social",
            "feed",
            "friend",
            "post",
            "chat",
        ),
    ),
    (
        "shop",
        ("магазин", "товар", "корзин", "заказ", "доставк", "покупк", "shop", "store", "cart", "product", "commerce"),
    ),
    (
        "forms",
        ("форм", "опрос", "анкет", "заявк", "регистрац", "запис", "form", "survey", "signup", "booking", "quiz"),
    ),
)


@dataclass(frozen=True)
class TemplateContent:
    name: str
    theme: AppThemeTokens
    navigation: AppNavigation
    screens: list[AppScreen]
    state: dict[str, AppStateValue] = field(default_factory=dict)


def select_template(prompt: str) -> TemplateKey:
    normalized = prompt.casefold()
    for key, keywords in TEMPLATE_KEYWORDS:
        if any(keyword in normalized for keyword in keywords):
            return key
    return "blank"


def build_template_document(prompt: str, name: str | None) -> AppDocument:
    content = BUILDERS[select_template(prompt)]()
    now = datetime.now(UTC).isoformat()
    return AppDocument(
        id=str(uuid4()),
        name=name or content.name,
        prompt=prompt,
        theme=content.theme,
        navigation=content.navigation,
        screens=content.screens,
        state=content.state,
        created_at=now,
        updated_at=now,
    )


def _theme(bg: str, surface: str, border: str, text: str, muted: str, primary: str, primary_fg: str) -> AppThemeTokens:
    return AppThemeTokens(
        color_bg=bg,
        color_surface=surface,
        color_border=border,
        color_text=text,
        color_text_muted=muted,
        color_primary=primary,
        color_primary_fg=primary_fg,
        radius_base="14",
        font_body="Inter",
        font_heading="Inter",
    )


def _layout(x: float, y: float, width: float, height: float) -> AppNodeLayout:
    return AppNodeLayout(x=x, y=y, width=width, height=height, z_index=None)


def _root(node_id: str, background: str, children: Sequence[AppNode]) -> AppNode:
    return AppNode(
        id=node_id,
        type="View",
        name="Экран",
        style=AppNodeStyle(background_color=background),
        layout=_layout(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT),
        children=list(children),
    )


def _card(node_id: str, layout: AppNodeLayout, theme: AppThemeTokens, children: Sequence[AppNode]) -> AppNode:
    return AppNode(
        id=node_id,
        type="View",
        name="Карточка",
        style=AppNodeStyle(
            background_color=theme.color_surface,
            border_radius=16,
            border_width=1,
            border_color=theme.color_border,
            padding=14,
        ),
        layout=layout,
        children=list(children),
    )


def _text(
    node_id: str,
    text: str,
    layout: AppNodeLayout,
    color: str,
    size: float,
    weight: Literal["400", "500", "600", "700"] = "400",
) -> AppNode:
    return AppNode(
        id=node_id,
        type="Text",
        name=text[:24],
        props=AppNodeProps(text=text),
        style=AppNodeStyle(color=color, font_size=size, font_weight=weight),
        layout=layout,
    )


def _button(
    node_id: str,
    text: str,
    layout: AppNodeLayout,
    theme: AppThemeTokens,
    actions: Sequence[NavigateAction | SetVarAction | ToastAction],
) -> AppNode:
    return AppNode(
        id=node_id,
        type="Button",
        name=text,
        props=AppNodeProps(text=text, on_press=list(actions)),
        style=AppNodeStyle(
            background_color=theme.color_primary,
            color=theme.color_primary_fg,
            border_radius=12,
            font_size=14,
            font_weight="600",
            text_align="center",
        ),
        layout=layout,
    )


def _input(node_id: str, placeholder: str, layout: AppNodeLayout, theme: AppThemeTokens, value_bind: str) -> AppNode:
    return AppNode(
        id=node_id,
        type="TextInput",
        name=placeholder,
        props=AppNodeProps(placeholder=placeholder, value_bind=value_bind),
        style=AppNodeStyle(
            background_color=theme.color_surface,
            color=theme.color_text,
            border_radius=12,
            border_width=1,
            border_color=theme.color_border,
            font_size=14,
            padding_horizontal=12,
        ),
        layout=layout,
    )


def _build_blank() -> TemplateContent:
    theme = _theme("#FFFFFF", "#F4F4F5", "#E6E6EA", "#101014", "#6B6B76", "#5C6CF5", "#FFFFFF")
    home = AppScreen(
        id="index",
        name="Главная",
        route="index",
        icon=None,
        root=_root(
            "blank-root",
            theme.color_bg,
            [
                _text("blank-title", "Новое приложение", _layout(24, 96, 322, 40), theme.color_text, 28, "700"),
                _text(
                    "blank-subtitle",
                    "Опишите идею в чате или добавьте элементы на доске.",
                    _layout(24, 144, 322, 60),
                    theme.color_text_muted,
                    15,
                ),
                _button(
                    "blank-cta",
                    "Начать",
                    _layout(24, 228, 322, 48),
                    theme,
                    [ToastAction(type="toast", message="Приложение готово к работе")],
                ),
            ],
        ),
    )
    return TemplateContent(
        name="Новое приложение",
        theme=theme,
        navigation=AppNavigation(type="stack", roots=["index"]),
        screens=[home],
    )


def _build_habits() -> TemplateContent:
    theme = _theme("#FBFBFC", "#FFFFFF", "#E8E8EE", "#101014", "#5B5B66", "#16A34A", "#FFFFFF")
    today = AppScreen(
        id="index",
        name="Сегодня",
        route="index",
        icon=None,
        root=_root(
            "habits-root",
            theme.color_bg,
            [
                _text("habits-title", "Сегодня", _layout(24, 88, 200, 36), theme.color_text, 26, "700"),
                _text(
                    "habits-streak",
                    "Серия дней подряд",
                    _layout(24, 126, 240, 22),
                    theme.color_text_muted,
                    13,
                ),
                _card(
                    "habits-card-water",
                    _layout(24, 168, 322, 96),
                    theme,
                    [
                        _text("habits-water-name", "Пить воду", _layout(14, 14, 180, 24), theme.color_text, 16, "600"),
                        _text(
                            "habits-water-goal",
                            "8 стаканов в день",
                            _layout(14, 40, 200, 20),
                            theme.color_text_muted,
                            13,
                        ),
                        _button(
                            "habits-water-done",
                            "Готово",
                            _layout(206, 26, 100, 44),
                            theme,
                            [
                                SetVarAction(type="setVar", name="completedToday", value=1),
                                ToastAction(type="toast", message="Привычка отмечена"),
                            ],
                        ),
                    ],
                ),
                _card(
                    "habits-card-reading",
                    _layout(24, 280, 322, 96),
                    theme,
                    [
                        _text("habits-reading-name", "Чтение", _layout(14, 14, 180, 24), theme.color_text, 16, "600"),
                        _text(
                            "habits-reading-goal",
                            "20 минут перед сном",
                            _layout(14, 40, 200, 20),
                            theme.color_text_muted,
                            13,
                        ),
                        _button(
                            "habits-reading-done",
                            "Готово",
                            _layout(206, 26, 100, 44),
                            theme,
                            [
                                SetVarAction(type="setVar", name="completedToday", value=2),
                                ToastAction(type="toast", message="Привычка отмечена"),
                            ],
                        ),
                    ],
                ),
                _button(
                    "habits-to-progress",
                    "Прогресс",
                    _layout(24, 404, 322, 48),
                    theme,
                    [NavigateAction(type="navigate", route="progress")],
                ),
            ],
        ),
    )
    progress = AppScreen(
        id="progress",
        name="Прогресс",
        route="progress",
        icon=None,
        root=_root(
            "habits-progress-root",
            theme.color_bg,
            [
                _text("habits-progress-title", "Прогресс", _layout(24, 88, 240, 36), theme.color_text, 26, "700"),
                _card(
                    "habits-progress-card",
                    _layout(24, 140, 322, 120),
                    theme,
                    [
                        _text(
                            "habits-progress-count",
                            "Выполнено сегодня",
                            _layout(14, 14, 240, 22),
                            theme.color_text_muted,
                            13,
                        ),
                        AppNode(
                            id="habits-progress-value",
                            type="Text",
                            name="Счётчик",
                            props=AppNodeProps(text="0", text_bind="completedToday"),
                            style=AppNodeStyle(color=theme.color_primary, font_size=40, font_weight="700"),
                            layout=_layout(14, 44, 200, 52),
                        ),
                    ],
                ),
                _button(
                    "habits-to-today",
                    "Привычки",
                    _layout(24, 284, 322, 48),
                    theme,
                    [NavigateAction(type="navigate", route="index")],
                ),
            ],
        ),
    )
    return TemplateContent(
        name="Трекер привычек",
        theme=theme,
        navigation=AppNavigation(type="tabs", roots=["index", "progress"]),
        screens=[today, progress],
        state={"completedToday": 0},
    )


def _build_social() -> TemplateContent:
    theme = _theme("#0F0F14", "#1A1A22", "#2A2A34", "#F5F5F7", "#9A9AA6", "#5C6CF5", "#FFFFFF")
    feed = AppScreen(
        id="index",
        name="Лента",
        route="index",
        icon=None,
        root=_root(
            "social-root",
            theme.color_bg,
            [
                _text("social-title", "Лента", _layout(24, 88, 200, 36), theme.color_text, 26, "700"),
                _card(
                    "social-post-first",
                    _layout(24, 140, 322, 130),
                    theme,
                    [
                        _text("social-post-first-author", "Аня", _layout(14, 12, 200, 22), theme.color_text, 15, "600"),
                        _text(
                            "social-post-first-body",
                            "Собрала первое приложение за вечер — делюсь скриншотами.",
                            _layout(14, 38, 290, 44),
                            theme.color_text_muted,
                            13,
                        ),
                        _button(
                            "social-post-first-like",
                            "Нравится",
                            _layout(14, 88, 130, 36),
                            theme,
                            [ToastAction(type="toast", message="Отметка поставлена")],
                        ),
                    ],
                ),
                _card(
                    "social-post-second",
                    _layout(24, 286, 322, 130),
                    theme,
                    [
                        _text(
                            "social-post-second-author", "Марк", _layout(14, 12, 200, 22), theme.color_text, 15, "600"
                        ),
                        _text(
                            "social-post-second-body",
                            "Ищу людей в команду для небольшого пет-проекта.",
                            _layout(14, 38, 290, 44),
                            theme.color_text_muted,
                            13,
                        ),
                        _button(
                            "social-post-second-like",
                            "Нравится",
                            _layout(14, 88, 130, 36),
                            theme,
                            [ToastAction(type="toast", message="Отметка поставлена")],
                        ),
                    ],
                ),
                _button(
                    "social-to-profile",
                    "Профиль",
                    _layout(24, 440, 322, 48),
                    theme,
                    [NavigateAction(type="navigate", route="profile")],
                ),
            ],
        ),
    )
    profile = AppScreen(
        id="profile",
        name="Профиль",
        route="profile",
        icon=None,
        root=_root(
            "social-profile-root",
            theme.color_bg,
            [
                _text("social-profile-name", "Мой профиль", _layout(24, 88, 260, 36), theme.color_text, 26, "700"),
                _text(
                    "social-profile-bio",
                    "12 постов · 340 подписчиков",
                    _layout(24, 128, 260, 22),
                    theme.color_text_muted,
                    13,
                ),
                _button(
                    "social-to-feed",
                    "Лента",
                    _layout(24, 176, 322, 48),
                    theme,
                    [NavigateAction(type="navigate", route="index")],
                ),
            ],
        ),
    )
    return TemplateContent(
        name="Лента",
        theme=theme,
        navigation=AppNavigation(type="tabs", roots=["index", "profile"]),
        screens=[feed, profile],
    )


def _build_shop() -> TemplateContent:
    theme = _theme("#FFFFFF", "#F6F6F8", "#E4E4EA", "#101014", "#5B5B66", "#101014", "#FFFFFF")
    catalog = AppScreen(
        id="index",
        name="Каталог",
        route="index",
        icon=None,
        root=_root(
            "shop-root",
            theme.color_bg,
            [
                _text("shop-title", "Каталог", _layout(24, 88, 220, 36), theme.color_text, 26, "700"),
                _card(
                    "shop-item-lamp",
                    _layout(24, 140, 322, 104),
                    theme,
                    [
                        _text(
                            "shop-item-lamp-name",
                            "Настольная лампа",
                            _layout(14, 14, 200, 24),
                            theme.color_text,
                            16,
                            "600",
                        ),
                        _text("shop-item-lamp-price", "3 490 ₽", _layout(14, 42, 120, 22), theme.color_text_muted, 14),
                        _button(
                            "shop-item-lamp-add",
                            "Купить",
                            _layout(190, 30, 118, 44),
                            theme,
                            [
                                SetVarAction(type="setVar", name="cartCount", value=1),
                                ToastAction(type="toast", message="Товар добавлен в корзину"),
                            ],
                        ),
                    ],
                ),
                _card(
                    "shop-item-chair",
                    _layout(24, 260, 322, 104),
                    theme,
                    [
                        _text(
                            "shop-item-chair-name",
                            "Рабочее кресло",
                            _layout(14, 14, 200, 24),
                            theme.color_text,
                            16,
                            "600",
                        ),
                        _text(
                            "shop-item-chair-price", "18 900 ₽", _layout(14, 42, 120, 22), theme.color_text_muted, 14
                        ),
                        _button(
                            "shop-item-chair-add",
                            "Купить",
                            _layout(190, 30, 118, 44),
                            theme,
                            [
                                SetVarAction(type="setVar", name="cartCount", value=2),
                                ToastAction(type="toast", message="Товар добавлен в корзину"),
                            ],
                        ),
                    ],
                ),
                _button(
                    "shop-to-cart",
                    "Корзина",
                    _layout(24, 392, 322, 48),
                    theme,
                    [NavigateAction(type="navigate", route="cart")],
                ),
            ],
        ),
    )
    cart = AppScreen(
        id="cart",
        name="Корзина",
        route="cart",
        icon=None,
        root=_root(
            "shop-cart-root",
            theme.color_bg,
            [
                _text("shop-cart-title", "Корзина", _layout(24, 88, 220, 36), theme.color_text, 26, "700"),
                AppNode(
                    id="shop-cart-count",
                    type="Text",
                    name="Товаров в корзине",
                    props=AppNodeProps(text="0", text_bind="cartCount"),
                    style=AppNodeStyle(color=theme.color_text_muted, font_size=15),
                    layout=_layout(24, 128, 220, 24),
                ),
                _button(
                    "shop-cart-checkout",
                    "Оформить заказ",
                    _layout(24, 176, 322, 48),
                    theme,
                    [ToastAction(type="toast", message="Заказ оформлен")],
                ),
                _button(
                    "shop-to-catalog",
                    "Каталог",
                    _layout(24, 236, 322, 48),
                    theme,
                    [NavigateAction(type="navigate", route="index")],
                ),
            ],
        ),
    )
    return TemplateContent(
        name="Магазин",
        theme=theme,
        navigation=AppNavigation(type="tabs", roots=["index", "cart"]),
        screens=[catalog, cart],
        state={"cartCount": 0},
    )


def _build_forms() -> TemplateContent:
    theme = _theme("#FBFBFC", "#FFFFFF", "#E4E4EA", "#101014", "#5B5B66", "#4A55C9", "#FFFFFF")
    form = AppScreen(
        id="index",
        name="Заявка",
        route="index",
        icon=None,
        root=_root(
            "forms-root",
            theme.color_bg,
            [
                _text("forms-title", "Оставьте заявку", _layout(24, 88, 300, 36), theme.color_text, 26, "700"),
                _text(
                    "forms-subtitle",
                    "Ответим в течение одного рабочего дня.",
                    _layout(24, 128, 300, 22),
                    theme.color_text_muted,
                    13,
                ),
                _input("forms-name", "Имя", _layout(24, 176, 322, 48), theme, "formName"),
                _input("forms-email", "Почта", _layout(24, 236, 322, 48), theme, "formEmail"),
                _input("forms-message", "Сообщение", _layout(24, 296, 322, 88), theme, "formMessage"),
                _button(
                    "forms-submit",
                    "Отправить",
                    _layout(24, 404, 322, 48),
                    theme,
                    [
                        SetVarAction(type="setVar", name="formSent", value=True),
                        NavigateAction(type="navigate", route="done"),
                    ],
                ),
            ],
        ),
    )
    done = AppScreen(
        id="done",
        name="Готово",
        route="done",
        icon=None,
        root=_root(
            "forms-done-root",
            theme.color_bg,
            [
                _text("forms-done-title", "Заявка отправлена", _layout(24, 200, 322, 36), theme.color_text, 24, "700"),
                _text(
                    "forms-done-subtitle",
                    "Ответим на указанную почту.",
                    _layout(24, 240, 322, 44),
                    theme.color_text_muted,
                    14,
                ),
                _button(
                    "forms-done-back",
                    "Новая заявка",
                    _layout(24, 300, 322, 48),
                    theme,
                    [NavigateAction(type="navigate", route="index")],
                ),
            ],
        ),
    )
    return TemplateContent(
        name="Анкета",
        theme=theme,
        navigation=AppNavigation(type="stack", roots=["index", "done"]),
        screens=[form, done],
        state={"formName": "", "formEmail": "", "formMessage": "", "formSent": False},
    )


BUILDERS: dict[TemplateKey, Callable[[], TemplateContent]] = {
    "habits": _build_habits,
    "social": _build_social,
    "shop": _build_shop,
    "forms": _build_forms,
    "blank": _build_blank,
}
