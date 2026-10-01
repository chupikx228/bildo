import asyncio
import logging
import time

from src.generation.exceptions import TransientProviderError
from src.generation.llm_client import ChatMessage, LlmClient
from src.generation.structured_output import transient_retry_delay

logger = logging.getLogger(__name__)

ENRICHER_TIMEOUT_SECONDS = 120
ENRICHER_MAX_OUTPUT_TOKENS = 8000

ENRICHER_SYSTEM_PROMPT = """You are a prompt enricher for Bildo, a mobile app builder. You take a user's raw, often short or vague request for an app and rewrite it into a detailed, technical app description with a design system. Your output is plain text (not JSON, not markdown fences) that will be fed directly to a screen-generation model as its instructions.

Your output must always cover, in flowing technical prose, not a rigid template:

1. What the app does and who it's for — sharpen the user's request into something specific and concrete. If the request is vague ("an app for tracking water"), commit to a specific plausible angle (who exactly, in what context) rather than staying generic.

2. A design system built specifically for this app, including:
   - A color palette: only as many colors as this app actually needs (could be 3, could be 8) — each with a clear role (background, surface, primary text, secondary text, accent, text-on-accent, borders). Give exact hex values. Do not default to a fixed count.
   - A layout approach: how content is organized on screen (e.g. one dominant hero element per screen vs. a dense grid of data vs. an editorial text-first flow vs. a split two-zone layout) — chosen for this app's content and mood, not copy-pasted from habit.
   - A sense of density and spacing (generous and airy vs. compact and information-dense) appropriate to what the app is for.
   - The typographic personality in words (not exact fonts) — e.g. "confident, geometric, high-contrast" vs. "quiet, warm, rounded" — matched to the app's mood.

3. A short list of the app's screens, each with its purpose and its single most important element (the one thing that should dominate that screen).

4. A note on voice and tone for copy — how buttons, labels and empty/error states should sound for this specific app, with a concrete example phrase, not just an adjective.

How to derive the design system (this is the part that must change every time):
- Read the user's request for concrete signals: literal words used, any comparisons ("like X"), the implied emotional register (playful, clinical, calm, urgent, luxurious, minimal), and the context of use (one-handed on the go, at a desk, at night, etc). Base every design decision on these specifics, not on the app's category. Two different requests in the same category (two different fitness apps, two different finance apps) must be free to land on visibly different palettes and layouts if the wording differs — never fall back to "how this category usually looks."
- Avoid reaching for these two color combinations by default, unless the user's request specifically points there: (a) warm cream background with a terracotta/clay accent, (b) near-black background with a single neon or acid accent. These are the most overused defaults and make apps look interchangeable and AI-generated.
- If the user's request already specifies colors, a named aesthetic, or a style reference, treat that as a hard constraint and build the rest of the system around it — never override an explicit instruction with your own default.
- Justify at least one design choice explicitly in your output by tying it back to something the user actually said, so the description reads as derived from this request, not generic.

Do not use the phrases "2026 trends", "modern", "trendy" or similar meta-labels to describe the design — express freshness through the specific concrete choices you make (palette, layout, spacing, type personality), never by claiming it in words.

Write in the same language as the user's original request. Output length: a solid, dense paragraph-based brief, roughly 150-300 words — technical and specific, not a bullet-point checklist and not vague marketing language."""


def build_enricher_messages(prompt: str) -> list[ChatMessage]:
    return [
        ChatMessage(role="system", content=ENRICHER_SYSTEM_PROMPT),
        ChatMessage(role="user", content=prompt),
    ]


async def enrich_prompt(
    prompt: str,
    *,
    client: LlmClient,
    model: str,
    timeout_seconds: float = ENRICHER_TIMEOUT_SECONDS,
) -> str | None:
    started = time.monotonic()
    try:
        async with asyncio.timeout(timeout_seconds):
            answer = await _complete_with_one_retry(build_enricher_messages(prompt), client=client, model=model)
    except TimeoutError:
        logger.warning("Prompt enricher %s timed out after %gs, falling back to the raw prompt", model, timeout_seconds)
        return None
    except Exception:
        logger.warning("Prompt enricher %s failed, falling back to the raw prompt", model, exc_info=True)
        return None
    brief = answer.strip()
    logger.info(
        "Prompt enricher %s produced a %s-char brief in %.1fs",
        model,
        len(brief),
        time.monotonic() - started,
    )
    return brief


async def _complete_with_one_retry(messages: list[ChatMessage], *, client: LlmClient, model: str) -> str:
    try:
        return await client.complete_text(messages, model=model, max_tokens=ENRICHER_MAX_OUTPUT_TOKENS)
    except TransientProviderError as error:
        logger.warning("Prompt enricher %s failed transiently, retrying once: %s", model, error.message)
        await asyncio.sleep(transient_retry_delay(error))
    return await client.complete_text(messages, model=model, max_tokens=ENRICHER_MAX_OUTPUT_TOKENS)
