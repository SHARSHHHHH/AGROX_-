"""
Crop water profiles for major Madhya Pradesh crop varieties.

Soil moisture ranges are volumetric water content (%) targets for common
loamy / black-cotton (vertisol) soils typical of MP. These are sane
engineering defaults for irrigation scheduling — not lab-calibrated for
any specific field. Tune ideal_min / ideal_max per local soil texture and
field-capacity tests if available.

sensitivity: relative scaling factor used when computing irrigation dose.
Higher sensitivity = crop suffers more from underwatering and should get
a larger corrective dose for the same moisture deficit.
"""

CROP_WATER_PROFILES = {
    "soybean": {
        "ideal_min": 45,
        "ideal_max": 65,
        "sensitivity": 1.2,
        "season": "Kharif",
        "notes": "MP is India's largest soybean producer; moderate-high water need, sensitive to waterlogging",
    },
    "wheat": {
        "ideal_min": 40,
        "ideal_max": 60,
        "sensitivity": 1.1,
        "season": "Rabi",
        "notes": "Needs consistent moisture at crown root initiation and grain filling stages",
    },
    "gram": {  # chickpea
        "ideal_min": 25,
        "ideal_max": 40,
        "sensitivity": 0.6,
        "season": "Rabi",
        "notes": "Drought-tolerant pulse; overwatering increases wilt / root rot risk",
    },
    "cotton": {
        "ideal_min": 40,
        "ideal_max": 60,
        "sensitivity": 1.0,
        "season": "Kharif",
        "notes": "Grown mainly in the Nimar region; needs steady moisture through boll development",
    },
    "maize": {
        "ideal_min": 45,
        "ideal_max": 65,
        "sensitivity": 1.15,
        "season": "Kharif/Rabi",
        "notes": "High sensitivity during tasseling and silking stages",
    },
    "mustard": {
        "ideal_min": 30,
        "ideal_max": 50,
        "sensitivity": 0.75,
        "season": "Rabi",
        "notes": "Low-moderate water need; mostly rainfed with 1-2 supplemental irrigations",
    },
    "groundnut": {
        "ideal_min": 35,
        "ideal_max": 55,
        "sensitivity": 0.9,
        "season": "Kharif",
        "notes": "Critical stage is pegging / pod formation; avoid waterlogging",
    },
    "rice": {
        "ideal_min": 60,
        "ideal_max": 85,
        "sensitivity": 1.4,
        "season": "Kharif",
        "notes": "Grown in wetter eastern/southern MP districts; needs standing water for much of the cycle",
    },
}

DEFAULT_PROFILE = {
    "ideal_min": 40,
    "ideal_max": 60,
    "sensitivity": 1.0,
    "season": "Unknown",
    "notes": "Fallback profile used when crop is not in CROP_WATER_PROFILES",
}


def get_crop_profile(crop_name: str) -> dict:
    """
    Look up a crop's water profile by name (case-insensitive).
    Falls back to DEFAULT_PROFILE if the crop isn't in the table yet,
    so irrigation logic never breaks on an unrecognized crop name.
    """
    if not crop_name:
        return DEFAULT_PROFILE
    return CROP_WATER_PROFILES.get(crop_name.strip().lower(), DEFAULT_PROFILE)