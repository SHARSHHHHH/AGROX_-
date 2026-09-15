"""Pest detection via Kindwise crop.health — hybrid KB grounding.

Kindwise crop.health (the same provider and CROP_HEALTH_API_KEY already
used by Plant Health) is now the primary vision source for pest photos too,
so both flows share one working image-identification backend. Kindwise
only supplies a label, confidence and its own treatment text; every
severity/IPM decision downstream still comes from PEST_KB, never invented.

Hybrid matching, in order:
  1. Exact match against PEST_KB (fast path, the original behaviour).
  2. Semantic match — embed Kindwise's free-text pest name/description and
     compare against PEST_KB entries by meaning
     (pest_embeddings.semantic_match_pest). Lets a differently-worded pest
     name still resolve to the correct verified KB entry instead of being
     force-fit into the nearest LISTED name or dismissed as unknown.
  3. RAG fallback — if nothing matches closely enough, hand back the
     nearest reference entries for pest_pipeline to run through
     pest_rag_fallback.grounded_fallback(), which hedges instead of
     guessing.

Kindwise's own treatment guidance (kindwise_medicine) is carried through on
every branch above — including the fallback path — since it comes from
Kindwise directly and isn't something this app invents, unlike the
generic, brand-free PEST_KB chemical guidance.

If Kindwise itself is unreachable/misconfigured and VISION_ALLOW_FALLBACK
is set, detection falls back to the legacy Gemini-based prompt below
(kept only as a fallback path — Groq was never used here and is not
reintroduced).

  - low confidence -> explicit "Unknown / Low confidence", never a guess
    dressed up as certainty
"""
from __future__ import annotations

import json
import logging
import re

from PIL import Image
from app.core.config import settings
from app.ml.pest_knowledge import PEST_KB, KNOWN_PESTS
from app.ml.pest_embeddings import semantic_match_pest, nearest_kb_entries

log = logging.getLogger("agri.pest_vision")

# Reuse the same confidence bar as disease detection for consistency.
CONFIDENCE_THRESHOLD = 0.55

# Keyword heuristics for turning Kindwise's free-text severity/spreading
# description into the none|low|moderate|high bucket the severity engine
# expects (Kindwise doesn't return a numeric % affected like the legacy
# Gemini prompt did).
_INFESTATION_KEYWORDS = (
    (("severe", "heavy", "extensive", "widespread", "high"), "high"),
    (("moderate", "medium"), "moderate"),
    (("mild", "slight", "minor", "early", "low", "localized", "localised"), "low"),
)


def validate_image(path: str) -> bool:
    """Same basic validation as disease detection: real image, not tiny."""
    try:
        img = Image.open(path)
        img.verify()
        img = Image.open(path)
        w, h = img.size
        return w >= 64 and h >= 64
    except Exception:
        return False


async def detect_pest(path: str, crop: str = "") -> dict:
    """Return a structured pest determination for an image.

    Result shape (never raises for model issues — degrades honestly):
      {
        "type": "pest" | "pest_unmatched" | "disease" | "healthy" | "uncertain",
        "pest_name": str | None,
        "crop": str,
        "confidence": float,
        "visible_infestation": "none|low|moderate|high|unknown",
        "affected_leaf_pct": float | None,
        "kb": <PEST_KB entry> | None,
        "uncertain": bool,
        "message": str | None,        # present when uncertain
        "model_guess": str | None,    # low-confidence guess, if any
        "matched_via": "exact" | "semantic" | None,
        "nearest_candidates": [(name, score), ...],   # only for pest_unmatched
        "kindwise_medicine": {"chemical": [...], "biological": [...], ...},
      }
    """
    if not validate_image(path):
        return _uncertain("The uploaded file does not look like a valid plant image. "
                          "Please upload a clear photo of the affected leaves or the insect.")

    try:
        data = await _kindwise_pest(path, crop)
    except Exception as e:
        log.warning("Kindwise crop.health pest detection failed (%s): %s",
                    type(e).__name__, e)
        if not settings.VISION_ALLOW_FALLBACK:
            return _uncertain(
                f"Crop health service is unavailable right now ({type(e).__name__}). "
                "Please try again shortly or consult an agricultural expert.")
        try:
            data = await _gemini_pest(path, crop)
        except Exception as e2:
            log.error("Gemini pest fallback also failed (%s): %s", type(e2).__name__, e2)
            return _uncertain(
                "Crop health analysis is unavailable right now (both the primary and "
                "fallback vision services failed). Please try again shortly or "
                "consult an agricultural expert.")

    return await _resolve_pest(data, crop)


def _infestation_from_text(*texts: str) -> str:
    combined = " ".join(t for t in texts if t).lower()
    for keywords, level in _INFESTATION_KEYWORDS:
        if any(k in combined for k in keywords):
            return level
    return "unknown"


async def _kindwise_pest(path: str, crop: str) -> dict:
    """Pest detection via Kindwise crop.health — the same integration and
    API key already used by Plant Health, so pest photos no longer need a
    separate provider or a separate key."""
    from app.services.kindwise_crop_health import identify_crop_health

    result = await identify_crop_health(path, crop)
    top = result.get("top") or {}
    issue_type = result.get("type")  # healthy | disease | pest | uncertain
    kind = issue_type if issue_type in ("healthy", "disease", "pest") else "uncertain"

    confidence = float(top.get("probability") or 0.0)
    description = " ".join(
        part for part in (top.get("description", ""), top.get("symptoms", "")) if part
    ).strip()

    if kind != "pest":
        return {
            "type": kind,
            "pest_name": top.get("name") if kind == "uncertain" else None,
            "pest_description": "",
            "confidence": confidence,
            "visible_infestation": "unknown",
            "affected_leaf_pct": None,
            "visible_indicators": description,
        }

    infestation = _infestation_from_text(top.get("severity", ""), top.get("spreading", ""))

    return {
        "type": "pest",
        "pest_name": top.get("name") or "",
        "pest_description": description,
        "confidence": confidence,
        "visible_infestation": infestation,
        "affected_leaf_pct": None,
        "visible_indicators": description,
        "kindwise_medicine": top.get("medicine") or {},
        "kindwise_scientific_name": top.get("scientific_name", ""),
        "kindwise_wiki_url": top.get("wiki_url", ""),
    }


def _pest_prompt(crop: str) -> str:
    pest_list = ", ".join(KNOWN_PESTS)
    return (
        f"You are an agricultural entomologist. Examine this {crop or 'crop'} image "
        f"for INSECT PESTS. First decide whether the main problem is a pest, a "
        f"disease, or a healthy plant. If it is a pest, check whether it matches one "
        f"of these known pests: [{pest_list}]. If it clearly matches one, use that "
        f"exact name. If it looks like a real pest but does NOT match any of these "
        f"well, set pest_name to \"other\" and instead describe it precisely in "
        f"pest_description (what it looks like, the damage pattern, which insect "
        f"family it resembles) — do not force-fit it to the closest listed name. "
        f"Also estimate how much of the visible foliage is affected. "
        f"Respond ONLY as JSON with these keys: "
        f'{{"type": "pest|disease|healthy", '
        f'"pest_name": "<exact name from the list, \\"other\\", or empty if not a pest>", '
        f'"pest_description": "<only when pest_name is \\"other\\": a precise free-text '
        f'description>", '
        f'"confidence": <0.0-1.0>, '
        f'"visible_infestation": "none|low|moderate|high", '
        f'"affected_leaf_pct": <integer 0-100>, '
        f'"visible_indicators": "<short description of what you see>"}}. '
        f"Be honest about confidence; if you are unsure, use a low number. Do not "
        f"guess a specific pest you cannot actually see, and do not force an "
        f"unfamiliar pest into the known list just because it's the closest name."
    )


async def _gemini_pest(path: str, crop: str) -> dict:
    """Pest detection via Google Gemini Vision."""
    from app.ml.gemini_vision import gemini_vision_json
    data = await gemini_vision_json(path, _pest_prompt(crop))
    return data


async def _resolve_pest(data: dict, crop: str) -> dict:
    """Interpret the vision result (Kindwise crop.health, or the Gemini
    fallback), resolve the pest name against the KB (exact then semantic),
    and ground facts in PEST_KB — or route to the RAG fallback when nothing
    matches closely enough."""
    kind = str(data.get("type", "")).lower()
    pest_name = (data.get("pest_name") or "").strip()
    pest_description = (data.get("pest_description") or "").strip()
    conf = float(data.get("confidence", 0) or 0)
    infest = str(data.get("visible_infestation", "unknown")).lower()
    pct = data.get("affected_leaf_pct")
    try:
        pct = float(pct) if pct is not None else None
    except (TypeError, ValueError):
        pct = None
    indicators = data.get("visible_indicators", "")
    # Present only when detection came from Kindwise crop.health; absent
    # (defaults to {}/"" ) on the legacy Gemini fallback path.
    kindwise_medicine = data.get("kindwise_medicine") or {}
    kindwise_scientific_name = data.get("kindwise_scientific_name", "")
    kindwise_wiki_url = data.get("kindwise_wiki_url", "")

    # Healthy plant
    if kind == "healthy" and conf >= CONFIDENCE_THRESHOLD:
        return {
            "type": "healthy", "pest_name": None, "crop": crop,
            "confidence": round(conf or 0.8, 2), "visible_infestation": "none",
            "affected_leaf_pct": pct if pct is not None else 0.0,
            "kb": None, "uncertain": False,
            "message": "No obvious pest infestation detected. Continue regular monitoring.",
            "visible_indicators": indicators,
        }

    # Model thinks it's a disease, not a pest -> hand back to disease workflow.
    if kind == "disease" and conf >= CONFIDENCE_THRESHOLD:
        return {
            "type": "disease", "pest_name": None, "crop": crop,
            "confidence": round(conf, 2), "visible_infestation": "unknown",
            "affected_leaf_pct": pct, "kb": None, "uncertain": False,
            "message": "This looks like a plant disease rather than an insect pest. "
                       "Use the Plant Health (disease) analysis for a diagnosis.",
            "visible_indicators": indicators,
        }

    # Not confident, or no pest claim at all -> honest uncertainty.
    if conf < CONFIDENCE_THRESHOLD or (not pest_name):
        return _uncertain(
            "I couldn't confidently identify the pest from this image. Please upload "
            "a clearer image showing the affected leaves or the insect close-up.",
            partial={"pest_name": pest_name or None, "confidence": round(conf, 2)})

    # 1) Exact match — the original fast path.
    if pest_name in PEST_KB:
        return {
            "type": "pest", "pest_name": pest_name, "crop": crop,
            "confidence": round(conf, 2),
            "visible_infestation": infest if infest in ("none", "low", "moderate", "high") else "unknown",
            "affected_leaf_pct": pct, "kb": PEST_KB[pest_name], "uncertain": False,
            "message": None, "visible_indicators": indicators, "matched_via": "exact",
            "kindwise_medicine": kindwise_medicine,
            "kindwise_scientific_name": kindwise_scientific_name,
            "kindwise_wiki_url": kindwise_wiki_url,
        }

    # 2) "other" or an unlisted name -> try semantic match against the KB by
    #    meaning before giving up.
    query_name = pest_description or pest_name
    matched_name, score = await semantic_match_pest(pest_name, pest_description)
    if matched_name:
        return {
            "type": "pest", "pest_name": matched_name, "crop": crop,
            "confidence": round(conf, 2),
            "visible_infestation": infest if infest in ("none", "low", "moderate", "high") else "unknown",
            "affected_leaf_pct": pct, "kb": PEST_KB[matched_name], "uncertain": False,
            "message": None, "visible_indicators": indicators,
            "matched_via": "semantic", "original_guess": query_name,
            "match_similarity": round(score, 3),
            "kindwise_medicine": kindwise_medicine,
            "kindwise_scientific_name": kindwise_scientific_name,
            "kindwise_wiki_url": kindwise_wiki_url,
        }

    # 3) Nothing in the KB is close enough -> RAG fallback territory. Hand
    #    back the nearest reference entries so the pipeline doesn't need a
    #    second embedding round-trip. Kindwise's own medicine guidance is
    #    still carried through here — it's Kindwise's sourced text, not a
    #    guess, so it's safe to show even for a pest outside the curated KB.
    nearest = await nearest_kb_entries(pest_name, pest_description, k=3)
    return {
        "type": "pest_unmatched", "pest_name": query_name, "crop": crop,
        "confidence": round(conf, 2),
        "visible_infestation": infest if infest in ("none", "low", "moderate", "high") else "unknown",
        "affected_leaf_pct": pct, "kb": None, "uncertain": False,
        "message": None, "visible_indicators": indicators,
        "nearest_candidates": nearest,
        "kindwise_medicine": kindwise_medicine,
        "kindwise_scientific_name": kindwise_scientific_name,
        "kindwise_wiki_url": kindwise_wiki_url,
    }


def _uncertain(message: str, partial: dict | None = None) -> dict:
    out = {
        "type": "uncertain",
        "pest_name": None,
        "crop": "",
        "confidence": partial.get("confidence", 0.0) if partial else 0.0,
        "visible_infestation": "unknown",
        "affected_leaf_pct": None,
        "kb": None,
        "uncertain": True,
        "message": message,
    }
    if partial and partial.get("pest_name"):
        out["model_guess"] = partial["pest_name"]
    return out


def _parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
    return {}