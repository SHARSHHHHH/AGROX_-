from app.services.disaster_triage import assess, route


def test_fire_is_critical_and_state_routed():
    result = assess("fire", "small field fire", None)
    assert result["level"] == "CRITICAL"
    assert route(result["level"], "Tamil Nadu", "Tiruvallur")["channel"] == "State Disaster Relief Cell"


def test_flood_escalates_from_high_to_critical_for_total_loss_language():
    result = assess("flood", "the entire field is completely destroyed", None)
    assert result["level"] == "CRITICAL"
    assert result["escalated"] is True


def test_drought_without_escalation_stays_moderate_and_district_routed():
    result = assess("drought", "water is getting low", None)
    assert result["level"] == "MODERATE"
    routed = route(result["level"], "Tamil Nadu", "Tiruvallur")
    assert routed["channel"] == "District Agriculture Office"
    assert "Tiruvallur" in routed["label"]


def test_vision_high_severity_escalates_pest():
    result = assess("pest", "some leaves are affected", {"severity": "HIGH", "label": "Fall Armyworm"})
    assert result["level"] == "HIGH"
    assert result["escalated"] is True
    assert "Fall Armyworm" in result["reason"]
