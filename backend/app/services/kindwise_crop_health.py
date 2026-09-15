"""Kindwise crop.health integration.

This is the single image-identification backend for crop disease/pest photos.
The API key is read only from the server-side environment and is never sent to
or exposed by the React application.
"""
from __future__ import annotations

import base64
import os
from typing import Any

import httpx

from app.core.config import settings

DEFAULT_URL = "https://crop.kindwise.com/api/v1/identification"


class CropHealthError(RuntimeError):
    pass


def _b64_image(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


def _suggestion_details(suggestion: dict[str, Any]) -> dict[str, Any]:
    details = suggestion.get("details") or {}
    if not isinstance(details, dict):
        return {}
    return details


def _issue_type(suggestion: dict[str, Any]) -> str:
    """Map Kindwise's disease taxonomy to AGROX's stable issue types.

    crop.health reports pests as ``animalia`` (for example whiteflies), while
    diseases/health issues can be ``fungi``, ``bacteria``, ``virus``,
    ``viroid`` or ``abiotic``.  Some responses expose the type through
    taxonomy rather than directly on ``details``, so both locations are
    checked.
    """
    details = _suggestion_details(suggestion)
    taxonomy = details.get("taxonomy") or suggestion.get("taxonomy") or {}
    if not isinstance(taxonomy, dict):
        taxonomy = {}

    issue_type = str(
        details.get("type")
        or suggestion.get("type")
        or taxonomy.get("kingdom")
        or ""
    ).strip().lower()

    if issue_type in {"animalia", "insect", "arthropoda", "pest"}:
        return "pest"
    if issue_type in {
        "fungi", "fungus", "bacteria", "bacterium", "virus", "viroid",
        "abiotic", "disease", "nutrient deficiency",
    }:
        return "disease"

    name = str(suggestion.get("name") or "").strip().lower()
    if name == "healthy":
        return "healthy"
    return "unknown"


def describe_status() -> dict[str, Any]:
    """Return non-secret Kindwise readiness information for /api/health."""
    configured = bool((settings.CROP_HEALTH_API_KEY or os.getenv("CROP_HEALTH_API_KEY", "")).strip())
    return {
        "provider": "kindwise_crop_health",
        "configured": configured,
        "ready": configured,
        "endpoint": settings.CROP_HEALTH_API_URL or DEFAULT_URL,
        "message": (
            "Kindwise crop.health is configured."
            if configured
            else "CROP_HEALTH_API_KEY is missing from backend/.env."
        ),
    }


# Kindwise returns "treatment" in several shapes depending on the issue
# (a nested {category: [...]} dict is the common case for crop.health, but
# a flat string/list shows up too). This is the fixed set of IPM-style
# buckets the frontend renders, so "medicine" is always the same shape no
# matter what Kindwise sent back for a given suggestion.
_MEDICINE_CATEGORIES = ("chemical", "biological", "cultural", "prevention")


def _as_str_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value).strip()
    return [text] if text else []


def _medicine_from_treatment(treatment: Any, prevention_fallback: str = "") -> dict[str, list[str]]:
    """Break Kindwise's own treatment guidance into named categories so the
    UI can show a clear "suggested medicine" (chemical) section separately
    from biological/cultural/prevention advice, instead of one unstructured
    paragraph. Everything here is Kindwise's own text — nothing invented.
    """
    out: dict[str, list[str]] = {cat: [] for cat in _MEDICINE_CATEGORIES}
    if isinstance(treatment, dict):
        for cat in _MEDICINE_CATEGORIES:
            out[cat] = _as_str_list(treatment.get(cat))
        # crop.health sometimes nests mechanical/physical advice under a
        # differently-named key; fold anything else in as "cultural" rather
        # than silently dropping it.
        known = set(_MEDICINE_CATEGORIES) | {"biologicalcontrol"}
        extra = [v for k, v in treatment.items() if k not in known]
        for v in extra:
            out["cultural"].extend(_as_str_list(v))
    else:
        # Flat string/list treatment isn't category-labelled by Kindwise;
        # surface it under "chemical" since that's what a farmer is usually
        # asking "what should I use on this" about.
        out["chemical"] = _as_str_list(treatment)
    if not out["prevention"] and prevention_fallback:
        out["prevention"] = _as_str_list(prevention_fallback)
    return {cat: items for cat, items in out.items() if items}


def _normalise_suggestion(suggestion: dict[str, Any]) -> dict[str, Any]:
    details = _suggestion_details(suggestion)
    issue_type = _issue_type(suggestion)
    name = str(suggestion.get("name") or "Unknown")
    treatment_raw = details.get("treatment")
    prevention_text = details.get("prevention") or ""
    return {
        "name": name,
        "scientific_name": suggestion.get("scientific_name") or details.get("scientific_name") or "",
        "probability": float(suggestion.get("probability") or 0.0),
        "type": issue_type,
        "raw_type": details.get("type") or suggestion.get("type") or "",
        "description": details.get("description") or details.get("wiki_description") or "",
        "symptoms": details.get("symptoms") or "",
        "treatment": treatment_raw or "",
        # Structured, source-labelled treatment categories (chemical =
        # "suitable medicine") derived from the same Kindwise data above.
        "medicine": _medicine_from_treatment(treatment_raw, prevention_text),
        "severity": details.get("severity") or "",
        "spreading": details.get("spreading") or "",
        "prevention": prevention_text,
        "taxonomy": details.get("taxonomy") or {},
        "eppo_code": details.get("eppo_code") or "",
        "wiki_url": details.get("wiki_url") or "",
    }


async def identify_crop_health(path: str, crop: str = "") -> dict[str, Any]:
    """Send an image to crop.health and return a stable AGROX-friendly shape."""
    api_key = (settings.CROP_HEALTH_API_KEY or os.getenv("CROP_HEALTH_API_KEY", "")).strip()
    if not api_key:
        raise CropHealthError("CROP_HEALTH_API_KEY is not configured in backend/.env")

    image = _b64_image(path)
    details = ",".join([
        "description", "symptoms", "treatment", "severity", "spreading",
        "taxonomy", "eppo_code", "wiki_url",
    ])
    params = {"details": details, "language": "en"}
    payload = {"images": [image]}
    headers = {"Content-Type": "application/json", "Api-Key": api_key}
    url = settings.CROP_HEALTH_API_URL or DEFAULT_URL
    timeout = httpx.Timeout(settings.CROP_HEALTH_TIMEOUT_S)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, params=params, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise CropHealthError(f"crop.health request failed: {exc}") from exc

    if response.status_code not in (200, 201):
        detail = response.text[:500]
        raise CropHealthError(f"crop.health returned HTTP {response.status_code}: {detail}")

    try:
        data = response.json()
    except ValueError as exc:
        raise CropHealthError("crop.health returned invalid JSON") from exc

    result = data.get("result") or {}
    crop_suggestions = ((result.get("crop") or {}).get("suggestions") or [])
    issue_suggestions = ((result.get("disease") or {}).get("suggestions") or [])
    issues = [_normalise_suggestion(s) for s in issue_suggestions if isinstance(s, dict)]
    top = issues[0] if issues else None

    if top and top["name"].strip().lower() == "healthy":
        issue_type = "healthy"
    elif top:
        issue_type = top["type"] if top["type"] in {"pest", "disease"} else "uncertain"
    else:
        issue_type = "uncertain"

    detected_crop = ""
    crop_confidence = 0.0
    if crop_suggestions:
        first_crop = crop_suggestions[0] or {}
        detected_crop = first_crop.get("name") or first_crop.get("scientific_name") or ""
        crop_confidence = float(first_crop.get("probability") or 0.0)

    return {
        "success": True,
        "type": issue_type,
        "crop": crop or detected_crop,
        "detected_crop": detected_crop,
        "crop_confidence": crop_confidence,
        "suggestions": issues,
        "top": top,
        "raw": data,
        "provider": "kindwise_crop_health",
    }
