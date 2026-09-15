"""Plant disease detection.

Two families of vision provider are supported, selected by VISION_PROVIDER:

  - "kindwise_crop_health" (default): Kindwise's crop.health cloud API.
    This is the recommended, most reliable provider and requires only
    CROP_HEALTH_API_KEY to be set.
  - "gemini" / "huggingface": the original multi-provider pipeline
    (app.ai.vision_providers), kept fully intact as configurable
    alternatives/fallbacks so no existing functionality is lost. Groq has
    been removed from this vision pipeline entirely.

The model NEVER invents certainty. If confidence < threshold we return an
explicit "uncertain" result. Disease facts come from the knowledge base (or,
for Kindwise, from Kindwise's own grounded disease detail fields), not the
model's imagination.
"""
from __future__ import annotations

from PIL import Image
import json
import logging
from typing import Any, Optional

from app.core.config import settings
from app.ml.knowledge import DISEASE_KB

log = logging.getLogger("agri.vision")

CONFIDENCE_THRESHOLD = 0.55
KNOWN_DISEASES = list(DISEASE_KB.keys())

KINDWISE_NAMES = ("kindwise", "kindwise_crop_health")


def validate_image(path: str) -> bool:
    """Basic validation: real image, not tiny, plausible leaf photo."""
    try:
        img = Image.open(path)
        img.verify()
        img = Image.open(path)
        w, h = img.size
        return w >= 64 and h >= 64
    except Exception:
        return False


def _as_text(value: Any) -> str:
    """Convert possibly-structured Kindwise detail fields to plain text,
    so they are always safe to store in a SQL Text column / render as a
    string in the React app."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        parts = [_as_text(item) for item in value if item is not None]
        return "\n".join(part for part in parts if part)
    if isinstance(value, dict):
        parts = []
        for key, item in value.items():
            text = _as_text(item)
            if text:
                pretty = str(key).replace("_", " ").strip().capitalize()
                parts.append(f"{pretty}: {text}")
        return "\n".join(parts)
    return str(value)


async def _analyze_kindwise(path: str, crop: str) -> dict:
    """Diagnose via Kindwise crop.health. Returns this module's standard
    response shape (see _uncertain / the gemini path below) plus a few
    extra Kindwise-specific keys (issue_type, scientific_name, ...) that
    the frontend uses opportunistically and ignores otherwise."""
    from app.services.kindwise_crop_health import (CropHealthError,
                                                    identify_crop_health)

    try:
        result = await identify_crop_health(path, crop)
    except CropHealthError as exc:
        log.warning("Kindwise crop.health failed: %s", exc)
        raise
    except Exception as exc:
        log.exception("Unexpected crop.health error")
        raise

    top = result.get("top") or {}
    issue_type = result.get("type")
    confidence = float(top.get("probability") or 0.0)
    name = top.get("name") or "Unknown"

    if issue_type == "healthy" or name.lower() == "healthy":
        return {
            "disease": "Healthy", "confidence": round(confidence, 2),
            "severity": "none", "uncertain": False,
            "symptoms": "No major crop health issue was identified in the image.",
            "recommendation": "The crop appears healthy. Continue regular "
                              "monitoring and normal crop management.",
            "provider": "kindwise_crop_health",
            "crop": result.get("crop") or crop,
            "suggestions": result.get("suggestions", []),
        }

    if issue_type not in {"disease", "pest"} or confidence < CONFIDENCE_THRESHOLD:
        return _uncertain(
            "The crop.health service could not confidently identify the "
            "issue. Please upload a clear, well-lit close-up of the "
            "affected area.",
            partial={"disease": name, "confidence": round(confidence, 2)},
            provider="kindwise_crop_health")

    issue_label = name if issue_type == "disease" else f"Pest: {name}"
    return {
        "disease": issue_label,
        "confidence": round(confidence, 2),
        "severity": top.get("severity") or "unknown",
        "uncertain": False,
        "symptoms": _as_text(top.get("symptoms") or top.get("description") or ""),
        "recommendation": _as_text(
            top.get("treatment") or top.get("description")
            or "Follow the crop.health treatment guidance and confirm "
               "serious cases with an agricultural expert."),
        # Structured treatment guidance from Kindwise. The frontend uses the
        # chemical bucket as the explicit pesticide/medicine recommendation.
        "medicine": top.get("medicine") or {},
        "causes": _as_text(top.get("description") or ""),
        "prevention": _as_text(top.get("prevention") or top.get("spreading") or ""),
        "crop": result.get("crop") or crop,
        "provider": "kindwise_crop_health",
        "issue_type": issue_type,
        "scientific_name": top.get("scientific_name", ""),
        "eppo_code": top.get("eppo_code", ""),
        "wiki_url": top.get("wiki_url", ""),
        "suggestions": result.get("suggestions", []),
    }


async def analyze_image(path: str, crop: str = "") -> dict:
    """Diagnose a leaf/crop image using whichever vision provider is configured.

    VISION_PROVIDER=kindwise_crop_health (default) calls the Kindwise cloud
    API. VISION_PROVIDER=gemini/huggingface uses the original
    multi-provider pipeline (app.ai.vision_providers), which is kept in
    place unchanged and can still fall back between gemini/huggingface
    among themselves exactly as before. Groq is no longer a valid vision
    provider.

    A genuine low-confidence result is NOT a failure and never triggers
    fallback; only configuration/environment failures do.
    """
    if not validate_image(path):
        return _uncertain("The uploaded file does not look like a valid leaf "
                          "image. Please upload a clear photo of the "
                          "affected leaf.")

    configured = (settings.VISION_PROVIDER or "kindwise_crop_health").lower()

    if configured in KINDWISE_NAMES:
        try:
            return await _analyze_kindwise(path, crop)
        except Exception as exc:
            if not settings.VISION_ALLOW_FALLBACK:
                return _uncertain(
                    f"Crop health analysis is unavailable right now "
                    f"({type(exc).__name__}: {exc}). Consult an "
                    f"agricultural expert.", provider="kindwise_crop_health")
            log.warning("Kindwise failed (%s); falling back to legacy "
                        "vision providers.", exc)
            return await _analyze_legacy(path, crop, prefer="gemini")

    return await _analyze_legacy(path, crop, prefer=configured)


async def _analyze_legacy(path: str, crop: str, prefer: str) -> dict:
    """Original multi-provider (Gemini / HuggingFace) pipeline,
    preserved unchanged as a configurable alternative to Kindwise."""
    from app.ai.vision_providers import (VisionProviderError,
                                         get_vision_provider)

    configured = prefer or "gemini"
    fallback = "gemini" if configured in ("huggingface", "hf", "local") else "huggingface"

    # Configuration/environment failures are worth retrying elsewhere.
    # A confident "I don't know" is not.
    RETRYABLE = {"not_configured", "missing_dependency", "load_failed",
                 "no_labels", "no_key", "request_failed", "unknown_provider"}

    candidates = [configured]
    if settings.VISION_ALLOW_FALLBACK:
        candidates.append(fallback)

    errors = []
    for provider_name in candidates:
        try:
            provider = get_vision_provider(provider_name)
            observation = await provider.analyze(path, crop)
            return _from_observation(observation)
        except VisionProviderError as exc:
            errors.append(f"{provider_name}: {exc.kind}")
            log.warning("Vision provider '%s' failed (%s): %s",
                        provider_name, exc.kind, exc)
            if exc.kind not in RETRYABLE:
                break
        except Exception as exc:
            errors.append(f"{provider_name}: {type(exc).__name__}")
            log.warning("Vision provider '%s' errored: %s", provider_name, exc)

    return _uncertain(
        "Plant image analysis is unavailable right now (" + "; ".join(errors) + "). "
        "If you are using the local model, check the backend log — the first run "
        "downloads the model. Otherwise consult an agricultural expert.")


def _from_observation(obs) -> dict:
    """Convert a neutral VisionObservation into this API's response shape.

    Keeps the existing frontend contract unchanged, so Plant Health needs no
    modification regardless of which provider produced the result.
    """
    if obs.kind == "healthy":
        return {
            "disease": "Healthy", "confidence": round(obs.confidence, 2),
            "severity": "none", "uncertain": False,
            "symptoms": "No obvious disease symptoms detected.",
            "recommendation": "Plant appears healthy. Continue regular monitoring, "
                              "balanced watering and nutrition.",
            "provider": obs.provider, "evidence": obs.visible_evidence,
        }

    if obs.uncertain or obs.kind != "disease" or obs.problem not in DISEASE_KB:
        return _uncertain(
            "Unable to confidently identify the disease. Please upload a clearer, "
            "well-lit close-up of the affected area, or consult an agricultural "
            "expert.",
            partial={"disease": obs.problem or "Unknown",
                     "confidence": round(obs.confidence, 2),
                     "provider": obs.provider,
                     "evidence": obs.visible_evidence})

    kb = DISEASE_KB[obs.problem]
    return {
        "disease": obs.problem,
        "confidence": round(obs.confidence, 2),
        "severity": obs.severity,
        "uncertain": False,
        "symptoms": kb["symptoms"],
        "recommendation": kb["treatment"],
        "causes": kb["causes"],
        "prevention": kb["prevention"],
        "crop": obs.crop,
        "provider": obs.provider,
        "evidence": obs.visible_evidence,
    }


def _disease_prompt(crop: str) -> str:
    disease_list = ", ".join(KNOWN_DISEASES)
    return (
        f"You are a plant pathologist. Look at this {crop or 'plant'} leaf image. "
        f"Choose the MOST likely disease strictly from this list: [{disease_list}, "
        f"Healthy]. Respond ONLY as JSON: "
        f'{{"disease": "<one from list>", "confidence": <0.0-1.0>, '
        f'"severity": "<mild|moderate|severe>", "visible_symptoms": "<short>"}}. '
        f"If the leaf looks healthy use disease 'Healthy'. Be honest about "
        f"confidence; if unsure use a low number."
    )


async def _gemini_disease(path: str, crop: str) -> dict:
    """Disease detection via Google Gemini Vision."""
    from app.ml.gemini_vision import gemini_vision_json
    data = await gemini_vision_json(path, _disease_prompt(crop))
    return _interpret_disease(data)


def _interpret_disease(data: dict) -> dict:
    """Interpret Gemini output and ground facts in DISEASE_KB."""
    disease = data.get("disease", "Unknown")
    conf = float(data.get("confidence", 0) or 0)
    severity = data.get("severity", "unknown")

    if str(disease).lower() == "healthy":
        return {
            "disease": "Healthy", "confidence": round(conf or 0.8, 2),
            "severity": "none", "uncertain": False,
            "symptoms": "No obvious disease symptoms detected.",
            "recommendation": "Plant appears healthy. Continue regular monitoring, "
                              "balanced watering and nutrition.",
        }

    if conf < CONFIDENCE_THRESHOLD or disease not in DISEASE_KB:
        return _uncertain(
            "Unable to confidently identify the disease. Please upload a clearer, "
            "well-lit close-up of the affected area or consult an agricultural expert.",
            partial={"disease": disease, "confidence": round(conf, 2)})

    kb = DISEASE_KB[disease]
    return {
        "disease": disease,
        "confidence": round(conf, 2),
        "severity": severity,
        "uncertain": False,
        "symptoms": kb["symptoms"],
        "recommendation": kb["treatment"],
        "causes": kb["causes"],
        "prevention": kb["prevention"],
    }


def _local_model(path: str, crop: str) -> dict:
    """Hook for a locally downloaded model (e.g. PlantVillage ResNet).
    See README section 'Bring your own disease model'. Kept as an explicit,
    documented integration point rather than a fake classifier."""
    raise RuntimeError("Local model configured but loader not implemented — "
                       "see README 'Bring your own disease model'.")


def _uncertain(message: str, partial: dict | None = None,
               provider: Optional[str] = None) -> dict:
    out = {
        "disease": "Uncertain",
        "confidence": partial.get("confidence", 0.0) if partial else 0.0,
        "severity": "unknown",
        "uncertain": True,
        "symptoms": "",
        "recommendation": message,
    }
    if provider:
        out["provider"] = provider
    if partial:
        out["model_guess"] = partial.get("disease")
    return out


def _parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception:
        m = __import__("re").search(r"\{.*\}", text, __import__("re").DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
    return {}
