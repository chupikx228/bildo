import json

from src.apps.schemas import AppDocument
from src.generation.llm_client import ChatMessage, JsonSchema

SCHEMA_NAME = "app_document"

SCREEN_WIDTH = 370
SCREEN_HEIGHT = 640

RULES = f"""Ты генератор мобильных приложений для конструктора Bildo.
По описанию пользователя ты собираешь документ приложения `AppDocument` и возвращаешь его одним JSON-объектом.

Формат ответа:
- только JSON-объект документа, без markdown-ограждений, без пояснений до или после;
- ключи в camelCase ровно так, как в JSON Schema ниже;
- необязательные поля либо заполняй значением, либо опускай — не подставляй null;
- поля `id`, `createdAt`, `updatedAt` обязательны в схеме, но сервер их перезапишет: положи любые валидные строки.

Правила модели документа:
- Сцена экрана — {SCREEN_WIDTH} x {SCREEN_HEIGHT} точек. Всё позиционирование абсолютное: `layout` с `x`, `y`, `width`, `height` в этих координатах.
- Корневой узел каждого экрана — `View` с `layout` ровно 0, 0, {SCREEN_WIDTH}, {SCREEN_HEIGHT}. Координаты вложенных узлов отсчитываются от родителя.
- Узлы не выходят за пределы родителя и не перекрывают друг друга, если это не задумано.
- Восемь типов узлов: View, Text, Button, Image, TextInput, ScrollView, FlatList, Spacer.
- `id` узлов уникальны в пределах всего документа, латиницей через дефис.
- У экранов `route` — голый идентификатор без ведущего слэша. Стартовый экран всегда имеет `id` и `route`, равные `index`.
- `navigation.roots` содержит только существующие `route` экранов.
- Действия `navigate` ведут только на существующие `route`.
- Переменные объявляй в `state`; `textBind`, `valueBind` и действие `setVar` ссылаются только на них.
- Тема — 10 токенов, цвета в HEX. Тема контрастная и читаемая: текст различим на фоне и на кнопках.
- Названия экранов, тексты кнопок и подписи пиши на языке запроса пользователя.

Объём: от 2 до 5 экранов, каждый экран содержательный — заголовок, основной контент и переход на другие экраны."""


def app_document_schema() -> JsonSchema:
    return AppDocument.model_json_schema(by_alias=True)


def build_system_prompt() -> str:
    schema = json.dumps(app_document_schema(), ensure_ascii=False)
    return f"{RULES}\n\nJSON Schema документа:\n{schema}"


def build_messages(prompt: str, name: str | None) -> list[ChatMessage]:
    request = f"Собери приложение по описанию:\n{prompt}"
    if name is not None:
        request = f"{request}\n\nНазвание приложения: {name}"
    return [
        ChatMessage(role="system", content=build_system_prompt()),
        ChatMessage(role="user", content=request),
    ]


def build_retry_messages(raw_answer: str, error: str) -> list[ChatMessage]:
    return [
        ChatMessage(role="assistant", content=raw_answer),
        ChatMessage(
            role="user",
            content=(
                "Этот ответ не прошёл валидацию документа приложения:\n"
                f"{error}\n\n"
                "Исправь перечисленные ошибки и верни весь документ целиком одним JSON-объектом."
            ),
        ),
    ]
