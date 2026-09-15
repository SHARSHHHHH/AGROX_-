import asyncio

from app.core.config import settings
from app.services.kindwise_crop_health import _issue_type, describe_status


def test_kindwise_maps_animalia_to_pest():
    suggestion = {"name": "whiteflies", "details": {"type": "animalia"}}
    assert _issue_type(suggestion) == "pest"


def test_kindwise_maps_fungi_to_disease():
    suggestion = {"name": "early blight", "details": {"type": "fungi"}}
    assert _issue_type(suggestion) == "disease"


def test_kindwise_status_never_mentions_llm_vision(monkeypatch):
    monkeypatch.setattr(settings, "CROP_HEALTH_API_KEY", "test-key")
    status = describe_status()
    assert status["provider"] == "kindwise_crop_health"
    assert status["ready"] is True
