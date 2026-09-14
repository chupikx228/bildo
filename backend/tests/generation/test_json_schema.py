from typing import Any

import pytest

from src.apps.schemas import AppDocument
from src.chat.schemas import ChatTurnResponse
from src.generation.json_schema import to_strict_json_schema


def test_adds_additional_properties_false_to_the_root() -> None:
    schema = to_strict_json_schema({"type": "object", "properties": {"name": {"type": "string"}}})

    assert schema["additionalProperties"] is False


def test_adds_additional_properties_false_inside_defs_and_array_items() -> None:
    schema = to_strict_json_schema(
        {
            "type": "object",
            "properties": {"items": {"type": "array", "items": {"$ref": "#/$defs/Item"}}},
            "$defs": {
                "Item": {"type": "object", "properties": {"label": {"type": "string"}}},
            },
        }
    )

    assert schema["additionalProperties"] is False
    assert schema["$defs"]["Item"]["additionalProperties"] is False


def test_adds_additional_properties_false_inside_a_union_branch() -> None:
    schema = to_strict_json_schema(
        {
            "type": "object",
            "properties": {
                "value": {
                    "anyOf": [
                        {"$ref": "#/$defs/Variant"},
                        {"type": "null"},
                    ],
                },
            },
            "$defs": {
                "Variant": {"type": "object", "properties": {"x": {"type": "string"}}},
            },
        }
    )

    assert schema["$defs"]["Variant"]["additionalProperties"] is False


def test_required_lists_every_property_including_optional_ones() -> None:
    schema = to_strict_json_schema(
        {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "nickname": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": None},
            },
            "required": ["name"],
        }
    )

    assert schema["required"] == ["name", "nickname"]


def test_leaves_a_genuine_dict_valued_additional_properties_schema_alone() -> None:
    schema = to_strict_json_schema(
        {
            "type": "object",
            "properties": {
                "state": {"type": "object", "additionalProperties": {"type": "string"}},
            },
            "required": ["state"],
        }
    )

    assert schema["properties"]["state"]["additionalProperties"] == {"type": "string"}


def test_folds_discriminated_union_one_of_into_any_of() -> None:
    schema = to_strict_json_schema(
        {
            "type": "array",
            "items": {
                "discriminator": {"propertyName": "type", "mapping": {"a": "#/$defs/A"}},
                "oneOf": [{"$ref": "#/$defs/A"}],
            },
            "$defs": {"A": {"type": "object", "properties": {"type": {"const": "a"}}}},
        }
    )

    items = schema["items"]
    assert "oneOf" not in items
    assert "discriminator" not in items
    assert items["anyOf"] == [{"$ref": "#/$defs/A"}]


def test_unravels_a_single_item_all_of_wrapping_a_ref_with_a_sibling_description() -> None:
    # Pydantic emits this shape for a `$ref`'d field that also carries a `Field(description=...)`
    # — none of our models use `description=` today, but the transform must still handle it.
    schema = to_strict_json_schema(
        {
            "type": "object",
            "properties": {
                "item": {"allOf": [{"$ref": "#/$defs/Item"}], "description": "the item"},
            },
            "$defs": {"Item": {"type": "object", "properties": {"label": {"type": "string"}}}},
        }
    )

    item = schema["properties"]["item"]
    assert "allOf" not in item
    assert item["description"] == "the item"
    assert item["additionalProperties"] is False
    assert item["required"] == ["label"]


def test_walks_every_branch_of_a_multi_item_all_of() -> None:
    schema = to_strict_json_schema(
        {
            "type": "object",
            "properties": {
                "item": {
                    "allOf": [
                        {"$ref": "#/$defs/A"},
                        {"$ref": "#/$defs/B"},
                    ],
                },
            },
            "$defs": {
                "A": {"type": "object", "properties": {"a": {"type": "string"}}},
                "B": {"type": "object", "properties": {"b": {"type": "string"}}},
            },
        }
    )

    assert schema["$defs"]["A"]["additionalProperties"] is False
    assert schema["$defs"]["B"]["additionalProperties"] is False


def test_resolve_ref_rejects_a_non_local_pointer() -> None:
    with pytest.raises(ValueError, match="local pointer"):
        to_strict_json_schema(
            {
                "type": "object",
                "properties": {"item": {"$ref": "other.json#/Foo", "description": "external"}},
            }
        )


def test_strips_a_none_default_but_keeps_other_defaults() -> None:
    schema = to_strict_json_schema(
        {
            "type": "object",
            "properties": {
                "a": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": None},
                "b": {"type": "integer", "default": 3},
            },
        }
    )

    assert "default" not in schema["properties"]["a"]
    assert schema["properties"]["b"]["default"] == 3


def _walk_objects(node: object) -> list[dict[str, Any]]:
    if not isinstance(node, dict):
        return []
    found = [node] if node.get("type") == "object" and "properties" in node else []
    for value in node.values():
        if isinstance(value, dict):
            found.extend(_walk_objects(value))
        elif isinstance(value, list):
            for entry in value:
                found.extend(_walk_objects(entry))
    return found


def _assert_strict_compliant(schema: dict[str, Any]) -> None:
    for obj in _walk_objects(schema):
        assert obj["additionalProperties"] is False, obj
        assert sorted(obj["required"]) == sorted(obj["properties"].keys()), obj
    assert "oneOf" not in _dump(schema)
    assert "discriminator" not in _dump(schema)


def _dump(schema: dict[str, Any]) -> str:
    import json

    return json.dumps(schema)


def test_app_document_schema_is_fully_strict_compliant() -> None:
    schema = to_strict_json_schema(AppDocument.model_json_schema(by_alias=True))

    assert schema["additionalProperties"] is False
    _assert_strict_compliant(schema)
    # the one legitimate map type in the document keeps a real value schema, not `false`
    state_schema = schema["properties"]["state"]["anyOf"][0]
    assert state_schema["additionalProperties"] == {
        "anyOf": [{"type": "string"}, {"type": "integer"}, {"type": "boolean"}]
    }


def test_chat_turn_response_schema_shares_the_same_fix_as_app_document() -> None:
    schema = to_strict_json_schema(ChatTurnResponse.model_json_schema(by_alias=True))

    assert schema["additionalProperties"] is False
    _assert_strict_compliant(schema)
    # AppDocument is nested inside ChatTurnResponse.document — confirms one fix covers both call sites
    assert "AppDocument" in schema["$defs"]
    assert schema["$defs"]["AppDocument"]["additionalProperties"] is False
