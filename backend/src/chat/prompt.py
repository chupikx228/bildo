import json
import re
from collections.abc import Sequence

from src.apps.schemas import AppDocument
from src.chat.models import ChatMessage as ChatMessageRecord
from src.chat.schemas import ChatTurnResponse
from src.generation.json_schema import to_strict_json_schema
from src.generation.llm_client import ChatMessage, JsonSchema
from src.generation.prompt import (
    DESIGN_RULES,
    EXPORT_RULES,
    NODE_TYPE_RULES,
    OMIT_OPTIONAL_RULE,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    START_ROUTE,
)
from src.generation.structured_output import VALIDATION_FEEDBACK_HEADER

SCHEMA_NAME = "chat_turn_response"

DOCUMENT_REQUEST_PATTERNS = (
    re.compile(
        r"\b(пришлите|пришли|отправьте|отправь|предоставьте|предоставь|скиньте|скинь|вставьте|вставь|приложите|приложи|"
        r"прикрепите|прикрепи|загрузите|загрузи|send|share|provide|paste|upload|attach)\b(?:(?!\b(?:и|and)\b)[^.!?\n]){0,60}"
        r"\b(документ\w*|json|appdocument|код\w*|макет\w*|разметк\w*|document|code)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bв (текущем|этом) (контексте|диалоге)\b[^.!?\n]{0,60}\bнет\b", re.IGNORECASE),
    re.compile(r"\b(документ\w*|макет\w*)\b[^.!?\n]{0,40}\b(не найден\w*|отсутству\w*)\b", re.IGNORECASE),
    re.compile(r"\bнет доступа\b[^.!?\n]{0,30}\bдокумент\w*", re.IGNORECASE),
    re.compile(r"\bмне нуж(?:ен|но увидеть)\b[^.!?\n]{0,30}\b(документ\w*|json|appdocument)\b", re.IGNORECASE),
)

QUOTED_TEXT = re.compile(r"«[^»]*»|“[^”]*”|\"[^\"]*\"")

EDIT_CLAIM_VERBS = (
    r"поменял|изменил|заменил|обновил|исправил|поправил|переименовал|добавил|удалил|убрал|сделал|переделал|внёс|внес"
)

EDIT_CLAIM_PATTERNS = (
    re.compile(r"^\W*(готово|сделано|выполнено|исправлено|обновлено|изменено|заменено|поменяно)\b", re.IGNORECASE),
    re.compile(
        rf"^\W*(?:я\s+)?(?:уже\s+)?(?:{EDIT_CLAIM_VERBS})(?:а|и)?\b(?!\s+бы\b)",
        re.IGNORECASE,
    ),
)

EDIT_CLAIM_PROBLEM = (
    "в `reply` ты сообщаешь, что внёс правку в приложение, а `document` — `null`: правки нет, пользователь получит "
    "ответ о несуществующем изменении. Если пользователь просит изменить приложение — внеси правку в текущий документ "
    "из системного сообщения и верни его целиком в `document`; если правка не нужна или просьба неясна — ответь без "
    "утверждений о том, что что-то изменено, и уточни, что именно сделать"
)

EDITED_WITHOUT_DOCUMENT_PROBLEM = (
    "ты поставил `edited: true`, а `document` — `null`: правка заявлена, но самого документа в ответе нет. "
    "Если ты вносишь правку — верни изменённый документ целиком в `document`; если правка не нужна или просьба "
    "неясна — поставь `edited: false` и ответь без утверждений о том, что что-то изменено"
)

DOCUMENT_REQUEST_PROBLEM = (
    "в `reply` ты просишь у пользователя документ приложения или пишешь, что его нет, а `document` — `null`. "
    "Текущий документ уже передан тебе целиком в системном сообщении, у пользователя просить его не нужно. "
    "Если пользователь просит изменить приложение — внеси правку в этот документ и верни его в `document`; "
    "если просьба неясна — уточни, что именно изменить, не прося документ"
)

ALL_KEYS_RULE = (
    "- в ответе обязаны присутствовать ВСЕ ключи из JSON Schema ниже, в том числе внутри `document`, когда он не "
    "`null`, —\n  для поля, для которого нет данных, ставь `null`, не опускай ключ."
)

OMIT_OPTIONAL_KEYS_RULE = (
    f"{OMIT_OPTIONAL_RULE.removesuffix(';')}; `document` и `edited` указывай в каждом ответе, как описано выше."
)

RULES = f"""Ты ассистент редактора мобильных приложений Bildo. Пользователь ведёт с тобой диалог о своём
приложении: обсуждает идеи, просит внести изменения или просто задаёт вопросы.

Тебе доступен текущий документ приложения `AppDocument` и история переписки — они ниже.

Формат ответа — один JSON-объект по схеме `ChatTurnResponse`:
- `reply` — твоя реплика пользователю обычным текстом (не JSON), на языке разговора;
- `document` — предложенный новый `AppDocument` целиком, только когда ты реально предлагаешь правку приложения;
  когда правка не нужна (пользователь спрашивает, уточняет, просто общается) — верни `document: null`;
- `edited` — `true`, если в этом ответе ты изменил документ и вернул его в `document`, иначе `false`. `edited: true`
  всегда идёт вместе с непустым `document`, `edited: false` — с `document: null`.
{ALL_KEYS_RULE}

Правила для `reply`:
- `reply` рассказывает пользователю о том, о чём он просил: какую правку из его просьбы ты внёс в `document`, или
  ответ на его вопрос. Если `document` — `null`, не пиши, что что-то изменил: правки нет.
- Если после твоего ответа приходит сообщение «{VALIDATION_FEEDBACK_HEADER} …», это автоматическая проверка сервера,
  а не реплика пользователя: пользователь её не видит и не знает, что твой прошлый ответ был отклонён. Исправь
  ошибки, но пиши `reply` так, будто это твой первый ответ на просьбу пользователя.
- Не упоминай в `reply` проверку, валидацию, ошибки, исправления, повторные попытки и технические поправки, о которых
  пользователь не просил (`route`, `navigation.roots`, `layout` корня экрана, `id` узлов).

Правила, когда предлагаешь `document`:
- Возвращай документ ЦЕЛИКОМ (весь `AppDocument`, не патч и не diff) — возьми текущий документ и примени к нему то,
  что просит пользователь, сохранив всё остальное как было.
- Не меняй `id`, `createdAt` документа и не трогай `revision` — сервер их всё равно перезапишет.
- Сцена экрана — {SCREEN_WIDTH} x {SCREEN_HEIGHT} точек, позиционирование абсолютное (`layout.x/y/width/height`).
- Корневой узел каждого экрана — `View` с `layout` ровно 0, 0, {SCREEN_WIDTH}, {SCREEN_HEIGHT}: он занимает всю сцену,
  вложенные узлы располагай внутри него. Добавляя новый экран, давай его корню ровно такой `layout`.
{NODE_TYPE_RULES}
- В документе всегда есть стартовый экран — тот, чей `route` буквально `{START_ROUTE}`. Не переименовывай и не переводи
  этот `route`, даже когда пользователь просит назвать стартовый экран иначе, — новое название пиши в `name` экрана.
  Если пользователь просит убрать стартовый экран, `route` `{START_ROUTE}` получает экран, который становится стартовым.
- `navigation.roots` — список `id` корневых экранов (при `navigation.type` `tabs` — вкладки, в этом порядке), а не их
  `route`. Он не бывает пустым и ссылается только на `id` существующих экранов. Добавляя экран, который должен
  стать вкладкой, добавь его `id` в `navigation.roots`; удаляя экран, убери его `id` оттуда. Не меняй `id`
  существующих экранов: на них ссылается `navigation.roots`.
- Действия `navigate` ссылаются только на существующие `route` экранов.
- `textBind`, `valueBind` и действие `setVar` ссылаются только на переменные, объявленные в `state`.
- Сохраняй дизайн-направление, которое уже сложилось в документе: палитру темы, layout-архетип экранов и их плотность.
  Меняй визуальный стиль только когда пользователь прямо просит об этом; правка контента, текстов или логики —
  не повод перебирать палитру и переставлять компоновку заново.

Формат ответа: только JSON-объект, без markdown-ограждений, без пояснений до или после."""


def response_schema(*, strict: bool = True) -> JsonSchema:
    schema = ChatTurnResponse.model_json_schema(by_alias=True)
    return to_strict_json_schema(schema) if strict else schema


def build_system_prompt(document: AppDocument, *, strict_schema: bool = True) -> str:
    document_json = json.dumps(document.model_dump(mode="json", by_alias=True, exclude_none=True), ensure_ascii=False)
    schema_json = json.dumps(response_schema(strict=strict_schema), ensure_ascii=False)
    rules = RULES if strict_schema else RULES.replace(ALL_KEYS_RULE, OMIT_OPTIONAL_KEYS_RULE)
    return (
        f"{DESIGN_RULES}\n\n"
        f"{EXPORT_RULES}\n\n"
        f"{rules}\n\n"
        f"Текущий документ приложения:\n{document_json}\n\n"
        f"JSON Schema ответа `ChatTurnResponse` (схема `AppDocument` — внутри неё):\n{schema_json}"
    )


def build_messages(
    document: AppDocument, history: Sequence[ChatMessageRecord], *, strict_schema: bool = True
) -> list[ChatMessage]:
    messages: list[ChatMessage] = [
        ChatMessage(role="system", content=build_system_prompt(document, strict_schema=strict_schema))
    ]
    messages.extend(ChatMessage(role=record.role, content=record.content) for record in history)
    return messages
