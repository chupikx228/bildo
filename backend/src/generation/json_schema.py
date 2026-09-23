from typing import Any, cast

JsonSchema = dict[str, Any]

_DEFS_KEYS = ("$defs", "definitions")


def to_strict_json_schema(schema: JsonSchema) -> JsonSchema:
    """Rewrites a Pydantic `model_json_schema()` output into the "strict" shape
    OpenAI-family models require for `response_format={"type": "json_schema", "strict": True}`.

    Calling `additionalProperties=False`/`required=[...properties]` by hand only on the
    root schema is not enough: OpenAI's strict-mode validator checks *every* object schema
    it can reach — root, every entry under `$defs`, every array's `items`, every branch of
    an `anyOf`/`oneOf` union, every unravelled `$ref` — and rejects the whole request the
    first time it finds one missing `additionalProperties: false` or a `required` list that
    doesn't cover all of that object's `properties`. Pydantic itself never sets either of
    those for a plain model, so a schema built straight from `model_json_schema()` fails on
    the first nested object it contains (BIL-69). Such a rejection fails the generation
    outright with `StrictSchemaUnsupportedError` (BIL-83) — it used to silently downgrade the
    model to `json_object`, which is how the BIL-69 schema bug went unnoticed.

    Nullable/optional fields stay optional the way OpenAI's strict mode represents
    optionality: through their `anyOf: [..., {"type": "null"}]` branch, not through being
    left out of `required` — Pydantic already emits that branch for `X | None` fields, this
    function only adds the field to `required` alongside it.

    Pydantic renders a `Field(discriminator=...)` union (our `AppAction`) as `oneOf` plus a
    `discriminator` keyword (the OpenAPI convention) — confirmed live against RouterAI,
    strict mode rejects `oneOf` outright ("'oneOf' is not permitted"). Both are folded into
    a plain `anyOf`, which strict mode does support and validates identically for our case
    (the variants are mutually exclusive on their literal `type` field either way).
    """
    return cast(JsonSchema, _walk(schema, root=schema))


def _walk(node: object, *, root: JsonSchema) -> Any:
    if not isinstance(node, dict):
        return node

    result: JsonSchema = dict(node)

    for defs_key in _DEFS_KEYS:
        defs = result.get(defs_key)
        if isinstance(defs, dict):
            result[defs_key] = {name: _walk(def_schema, root=root) for name, def_schema in defs.items()}

    if result.get("type") == "object" and "additionalProperties" not in result:
        result["additionalProperties"] = False

    properties = result.get("properties")
    if isinstance(properties, dict):
        result["required"] = list(properties.keys())
        result["properties"] = {key: _walk(value, root=root) for key, value in properties.items()}

    items = result.get("items")
    if isinstance(items, dict):
        result["items"] = _walk(items, root=root)

    one_of = result.pop("oneOf", None)
    if isinstance(one_of, list):
        result.pop("discriminator", None)
        result["anyOf"] = [*result.get("anyOf", []), *one_of]

    any_of = result.get("anyOf")
    if isinstance(any_of, list):
        result["anyOf"] = [_walk(variant, root=root) for variant in any_of]

    all_of = result.get("allOf")
    if isinstance(all_of, list):
        if len(all_of) == 1:
            # A bare `{"$ref": ...}` alone is left as-is by the `$ref` handling below (it only
            # unwraps a `$ref` that has sibling keys) -- but merging it with this wrapper's own
            # siblings (typically `description`) can turn it into exactly that case, so the
            # merged result has to go through `_walk` again rather than being returned as-is.
            merged = {**result, **_walk(all_of[0], root=root)}
            del merged["allOf"]
            return _walk(merged, root=root)
        result["allOf"] = [_walk(entry, root=root) for entry in all_of]

    ref = result.get("$ref")
    if isinstance(ref, str) and len(result) > 1:
        resolved = _resolve_ref(root, ref)
        merged = {**resolved, **{key: value for key, value in result.items() if key != "$ref"}}
        return _walk(merged, root=root)

    if result.get("default", ...) is None:
        del result["default"]

    return result


def _resolve_ref(root: JsonSchema, ref: str) -> JsonSchema:
    if not ref.startswith("#/"):
        raise ValueError(f"Unsupported $ref (expected a local pointer): {ref}")
    node: Any = root
    for part in ref.removeprefix("#/").split("/"):
        node = node[part]
    return cast(JsonSchema, node)
