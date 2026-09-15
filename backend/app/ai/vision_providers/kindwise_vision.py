"""Kindwise crop.health adapter for the BaseVisionProvider interface.

This lets Kindwise participate in the same describe_active()/get_vision_provider()
plumbing as the legacy Gemini/HuggingFace providers (used by /api/health
and the diagnostics self-test), even though the primary crop-disease pipeline
(app.ml.vision.analyze_image) calls app.services.kindwise_crop_health directly
for its richer, Kindwise-specific response shape.
"""
from __future__ import annotations

from app.ai.vision_providers.base import (BaseVisionProvider, VisionObservation,
                                          VisionProviderError)
from app.core.config import settings


class KindwiseVisionProvider(BaseVisionProvider):
    name = "kindwise_crop_health"

    async def analyze(self, image_path: str, crop: str = "") -> VisionObservation:
        from app.services.kindwise_crop_health import (CropHealthError,
                                                        identify_crop_health)
        try:
            result = await identify_crop_health(image_path, crop)
        except CropHealthError as exc:
            raise VisionProviderError("request_failed", str(exc), self.name) from exc

        top = result.get("top") or {}
        issue_type = result.get("type")
        confidence = float(top.get("probability") or 0.0)
        name = top.get("name") or ""

        kind = "healthy" if issue_type == "healthy" else (
            issue_type if issue_type in ("pest", "disease") else "unknown")

        return VisionObservation(
            crop=result.get("crop") or crop,
            problem="Healthy" if kind == "healthy" else name,
            kind=kind,
            confidence=confidence,
            symptoms=[top.get("symptoms")] if top.get("symptoms") else [],
            severity=top.get("severity") or "unknown",
            visible_evidence=top.get("description") or "",
            provider=self.name,
        )

    def describe(self) -> dict:
        configured = bool((settings.CROP_HEALTH_API_KEY or "").strip())
        return {
            "provider": self.name,
            "configured": configured,
            "ready": configured,
            "endpoint": settings.CROP_HEALTH_API_URL,
        }
