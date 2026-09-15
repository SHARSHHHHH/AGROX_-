"""
Irrigation decision logic.

Combines live sensor readings (soil moisture, air humidity), a weather
forecast, and a crop's water profile (from config/crop_water_profiles.py)
to decide whether to irrigate and how much water to apply.

This module intentionally holds no crop data itself — it only reads it
via get_crop_profile(). Keeping the algorithm separate from the data
means either can change independently (e.g. swapping this rule-based
logic for an ML model later without touching the crop database).
"""

from config.crop_water_profiles import get_crop_profile

# Base water dose unit (ml) multiplied by deficit/sensitivity/humidity factor.
# Tune this against your actual pump flow rate and bed/pot size.
BASE_UNIT_ML = 100

# Rain forecast probability (%) at or above which irrigation is skipped.
RAIN_SKIP_THRESHOLD = 70

# Air humidity bands that scale how much extra/less water is needed
# due to evapotranspiration rate.
LOW_HUMIDITY_THRESHOLD = 40
HIGH_HUMIDITY_THRESHOLD = 70
LOW_HUMIDITY_FACTOR = 1.3   # dry air -> faster water loss -> water more
HIGH_HUMIDITY_FACTOR = 0.8  # humid air -> slower water loss -> water less


def irrigation_decision(soil_moisture: float, air_humidity: float,
                         rain_forecast_pct: float, crop_name: str) -> dict:
    """
    Decide whether to irrigate and how much, for one sensor reading cycle.

    Args:
        soil_moisture: current volumetric soil moisture (%) from the soil sensor.
        air_humidity: current relative humidity (%) from the DHT22.
        rain_forecast_pct: chance of rain (%) from the weather API.
        crop_name: crop selected in the farmer's farm setup (e.g. "soybean").

    Returns:
        dict with keys:
            irrigate (bool)
            amount_ml (int, present only if irrigate is True)
            reason (str) - human-readable explanation, useful for farmer app logs
    """
    profile = get_crop_profile(crop_name)

    if rain_forecast_pct >= RAIN_SKIP_THRESHOLD:
        return {"irrigate": False, "reason": "Rain expected soon"}

    deficit = profile["ideal_min"] - soil_moisture  # positive = too dry

    if deficit <= 0:
        return {"irrigate": False, "reason": "Soil moisture sufficient"}

    if air_humidity < LOW_HUMIDITY_THRESHOLD:
        humidity_factor = LOW_HUMIDITY_FACTOR
    elif air_humidity > HIGH_HUMIDITY_THRESHOLD:
        humidity_factor = HIGH_HUMIDITY_FACTOR
    else:
        humidity_factor = 1.0

    water_amount_ml = deficit * profile["sensitivity"] * humidity_factor * BASE_UNIT_ML

    return {
        "irrigate": True,
        "amount_ml": round(water_amount_ml),
        "reason": f"{crop_name}: soil {deficit:.1f}% below ideal, humidity {air_humidity}%",
    }