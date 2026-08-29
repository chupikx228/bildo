from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, SerializerFunctionWrapHandler, model_serializer
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class OmitNoneModel(CamelModel):
    @model_serializer(mode="wrap")
    def _omit_none(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        return {key: value for key, value in handler(self).items() if value is not None}


AppNavType = Literal["tabs", "stack", "drawer"]

GenerationStatus = Literal["pending", "ready", "failed"]

AppComponentType = Literal[
    "View",
    "Text",
    "Button",
    "Image",
    "TextInput",
    "ScrollView",
    "FlatList",
    "Spacer",
]

AppNodeAnimation = Literal["float", "pulse", "breathe", "shimmer", "rise", "drift"]

AppStateValue = str | int | bool


class AppThemeTokens(CamelModel):
    color_bg: str
    color_surface: str
    color_border: str
    color_text: str
    color_text_muted: str
    color_primary: str
    color_primary_fg: str
    radius_base: str
    font_body: str
    font_heading: str


class AppNodeLayout(OmitNoneModel):
    x: float
    y: float
    width: float
    height: float
    z_index: int | None = None


class AppNodeStyle(OmitNoneModel):
    flex: float | None = None
    flex_direction: Literal["row", "column"] | None = None
    align_items: Literal["flex-start", "center", "flex-end", "stretch"] | None = None
    justify_content: Literal["flex-start", "center", "flex-end", "space-between", "space-around"] | None = None
    gap: float | None = None
    padding: float | None = None
    padding_horizontal: float | None = None
    padding_vertical: float | None = None
    margin: float | None = None
    margin_top: float | None = None
    margin_bottom: float | None = None
    background_color: str | None = None
    background_gradient: str | None = None
    color: str | None = None
    font_size: float | None = None
    font_weight: Literal["400", "500", "600", "700"] | None = None
    text_align: Literal["left", "center", "right"] | None = None
    letter_spacing: float | None = None
    line_height: float | None = None
    border_radius: float | None = None
    border_width: float | None = None
    border_color: str | None = None
    shadow: str | None = None
    width: float | Literal["100%"] | None = None
    height: float | None = None
    opacity: float | None = None
    animation: AppNodeAnimation | None = None


class NavigateAction(CamelModel):
    type: Literal["navigate"]
    route: str


class SetVarAction(CamelModel):
    type: Literal["setVar"]
    name: str
    value: AppStateValue


class ToastAction(CamelModel):
    type: Literal["toast"]
    message: str


class OpenUrlAction(CamelModel):
    type: Literal["openUrl"]
    url: str


AppAction = Annotated[
    NavigateAction | SetVarAction | ToastAction | OpenUrlAction,
    Field(discriminator="type"),
]


class AppNodeProps(OmitNoneModel):
    text: str | None = None
    placeholder: str | None = None
    source: str | None = None
    href: str | None = None
    data: list[str] | None = None
    text_bind: str | None = None
    value_bind: str | None = None
    on_press: list[AppAction] | None = None
    on_change: list[AppAction] | None = None


class AppNode(OmitNoneModel):
    id: str
    type: AppComponentType
    name: str | None = None
    props: AppNodeProps | None = None
    style: AppNodeStyle | None = None
    layout: AppNodeLayout | None = None
    field: int | None = None
    group_id: str | None = None
    hidden: bool | None = None
    locked: bool | None = None
    children: list[AppNode] = Field(default_factory=list)


AppNode.model_rebuild()


class AppScreen(OmitNoneModel):
    id: str
    name: str
    route: str
    icon: str | None = None
    root: AppNode


class AppNavigation(CamelModel):
    type: AppNavType
    roots: list[str]


class AppDocument(OmitNoneModel):
    id: str
    name: str
    slug: str | None = None
    prompt: str | None = None
    theme: AppThemeTokens
    navigation: AppNavigation
    screens: list[AppScreen]
    state: dict[str, AppStateValue] | None = None
    created_at: str
    updated_at: str


class AppSummary(OmitNoneModel):
    id: str
    name: str
    slug: str | None = None
    updated_at: str


class CreateAppRequest(CamelModel):
    prompt: Annotated[str, Field(min_length=3)]
    name: str | None = None
    model: str | None = None


class CreateAppResponse(CamelModel):
    id: str


class AppListResponse(CamelModel):
    apps: list[AppSummary]


class AppDetailResponse(CamelModel):
    id: str
    name: str
    slug: str | None = None
    document: AppDocument
    generation_status: GenerationStatus
    generation_error: str | None = None
