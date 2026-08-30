import json
from collections.abc import Sequence

from src.apps.schemas import AppDocument
from src.chat.models import ChatMessage as ChatMessageRecord
from src.chat.schemas import ChatTurnResponse
from src.generation.llm_client import ChatMessage, JsonSchema
from src.generation.prompt import SCREEN_HEIGHT, SCREEN_WIDTH

SCHEMA_NAME = "chat_turn_response"

RULES = f"""Ты ассистент редактора мобильных приложений Bildo. Пользователь ведёт с тобой диалог о своём
приложении: обсуждает идеи, просит внести изменения или просто задаёт вопросы.

Тебе доступен текущий документ приложения `AppDocument` и история переписки — они ниже.

Формат ответа — один JSON-объект по схеме `ChatTurnResponse`:
- `reply` — твоя реплика пользователю обычным текстом (не JSON), на языке разговора;
- `document` — предложенный новый `AppDocument` целиком, только когда ты реально предлагаешь правку приложения;
  когда правка не нужна (пользователь спрашивает, уточняет, просто общается) — не включай `document` в ответ.

Правила, когда предлагаешь `document`:
- Возвращай документ ЦЕЛИКОМ (весь `AppDocument`, не патч и не diff) — возьми текущий документ и примени к нему то,
  что просит пользователь, сохранив всё остальное как было.
- Не меняй `id`, `createdAt` документа и не трогай `revision` — сервер их всё равно перезапишет.
- Сцена экрана — {SCREEN_WIDTH} x {SCREEN_HEIGHT} точек, позиционирование абсолютное (`layout.x/y/width/height`).
- Восемь типов узлов: View, Text, Button, Image, TextInput, ScrollView, FlatList, Spacer.
- `navigation.roots` и действия `navigate` ссылаются только на существующие `route` экранов.
- `textBind`, `valueBind` и действие `setVar` ссылаются только на переменные, объявленные в `state`.

Формат ответа: только JSON-объект, без markdown-ограждений, без пояснений до или после."""


RESPONSE_SCHEMA: JsonSchema = ChatTurnResponse.model_json_schema(by_alias=True)
RESPONSE_SCHEMA_JSON = json.dumps(RESPONSE_SCHEMA, ensure_ascii=False)


def build_system_prompt(document: AppDocument) -> str:
    document_json = json.dumps(document.model_dump(mode="json", by_alias=True, exclude_none=True), ensure_ascii=False)
    return (
        f"{RULES}\n\n"
        f"Текущий документ приложения:\n{document_json}\n\n"
        f"JSON Schema ответа `ChatTurnResponse` (схема `AppDocument` — внутри неё):\n{RESPONSE_SCHEMA_JSON}"
    )


def build_messages(document: AppDocument, history: Sequence[ChatMessageRecord]) -> list[ChatMessage]:
    messages: list[ChatMessage] = [ChatMessage(role="system", content=build_system_prompt(document))]
    messages.extend(ChatMessage(role=record.role, content=record.content) for record in history)
    return messages
