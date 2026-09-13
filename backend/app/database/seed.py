"""Seed realistic demo data.

Scheme records use REAL central government schemes with official portal URLs.
Eligibility values are simplified for the demo eligibility engine; the app
always tells users to verify with the official department before applying.
"""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.models import (User, Farm, SensorReading, SoilTest, Scheme,
                               PlantDiagnosis, MachineryListing, PestObservation,
                               CropListing, SchemeInterest, Expense,
                               LandListing, LandContract, DisasterReport, ReliefChannel)
from app.core.security import hash_password
from app.services import simulator


REAL_SCHEMES = [
    {
        "name": "PM-KISAN",
        "description": "Income support of ₹6,000/year in three instalments to "
                       "eligible landholding farmer families.",
        "state": "All India", "level": "central",
        "farmer_categories": ["marginal", "small", "medium", "large"],
        "crops": [], "min_land": 0, "max_land": 1000,
        "benefits": "₹6,000 per year direct benefit transfer.",
        "documents": ["Aadhaar", "Land records", "Bank account details"],
        "procedure": "Register at the PM-KISAN portal or nearest CSC.",
        "url": "https://pmkisan.gov.in",
        "last_verified": "2025-01", "source": "pmkisan.gov.in",
        "purpose": "Income support for eligible landholding farmers.",
        "department": "Dept. of Agriculture & Farmers Welfare (GoI)",
        "category": "inputs",
    },
    {
        "name": "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
        "description": "Crop insurance against yield loss from natural calamities, "
                       "pests and diseases.",
        "state": "All India", "level": "central",
        "farmer_categories": ["marginal", "small", "medium", "large"],
        "crops": ["rice", "tomato", "chilli", "onion", "potato"],
        "min_land": 0, "max_land": 1000,
        "benefits": "Insurance payout on notified crop loss; low farmer premium.",
        "documents": ["Aadhaar", "Land records", "Sowing certificate", "Bank details"],
        "procedure": "Apply through banks, CSCs, or the PMFBY portal before the "
                     "cut-off date for your crop.",
        "url": "https://pmfby.gov.in",
        "last_verified": "2025-01", "source": "pmfby.gov.in",
        "purpose": "Crop insurance against yield loss from natural calamities.",
        "department": "Dept. of Agriculture & Farmers Welfare (GoI)",
        "category": "safety_net",
    },
    {
        "name": "Soil Health Card Scheme",
        "description": "Provides farmers a soil health card with crop-wise nutrient "
                       "and fertiliser recommendations.",
        "state": "All India", "level": "central",
        "farmer_categories": ["marginal", "small", "medium", "large"],
        "crops": [], "min_land": 0, "max_land": 1000,
        "benefits": "Free soil testing and tailored fertiliser guidance.",
        "documents": ["Aadhaar", "Land records"],
        "procedure": "Request through the local agriculture department / soil "
                     "testing lab.",
        "url": "https://soilhealth.dac.gov.in",
        "last_verified": "2025-01", "source": "soilhealth.dac.gov.in",
        "purpose": "Crop-wise soil nutrient testing and fertiliser guidance.",
        "department": "Dept. of Agriculture & Farmers Welfare (GoI)",
        "category": "production",
    },
    {
        "name": "Per Drop More Crop (PMKSY - Micro Irrigation)",
        "description": "Subsidy for drip and sprinkler micro-irrigation systems to "
                       "improve water-use efficiency.",
        "state": "All India", "level": "central",
        "farmer_categories": ["marginal", "small", "medium"],
        "crops": ["tomato", "chilli", "onion", "cucumber"],
        "min_land": 0.5, "max_land": 1000,
        "benefits": "Up to 55% subsidy for small/marginal farmers on micro-irrigation.",
        "documents": ["Aadhaar", "Land records", "Bank details", "Quotation"],
        "procedure": "Apply via the state horticulture / agriculture department "
                     "under PMKSY.",
        "url": "https://pmksy.gov.in",
        "last_verified": "2025-01", "source": "pmksy.gov.in",
        "purpose": "Micro-irrigation subsidy to improve water-use efficiency.",
        "department": "Dept. of Agriculture & Farmers Welfare (GoI)",
        "category": "production",
    },
    {
        "name": "Kisan Credit Card (KCC)",
        "description": "Short-term credit for cultivation and allied activities at "
                       "concessional interest.",
        "state": "All India", "level": "central",
        "farmer_categories": ["marginal", "small", "medium", "large"],
        "crops": [], "min_land": 0, "max_land": 1000,
        "benefits": "Low-interest crop loan; interest subvention on timely repayment.",
        "documents": ["Aadhaar", "Land records", "Bank account"],
        "procedure": "Apply at any bank branch or through the KCC portal.",
        "url": "https://www.myscheme.gov.in/schemes/kcc",
        "last_verified": "2025-01", "source": "myscheme.gov.in",
        "purpose": "Concessional short-term credit for cultivation.",
        "department": "Dept. of Financial Services (GoI)",
        "category": "inputs",
    },
    {
        "name": "Rashtriya Krishi Vikas Yojana (RKVY)",
        "description": "Umbrella scheme funding state-designed agriculture "
                       "development plans: soil health, mechanisation, crop "
                       "diversification, rainfed-area development, irrigation.",
        "state": "All India", "level": "central",
        "farmer_categories": ["marginal", "small", "medium", "large"],
        "crops": [], "min_land": 0, "max_land": 1000,
        "benefits": "Funds state-level agriculture infrastructure and development projects.",
        "documents": [], "procedure": "Delivered through state agriculture departments; "
                                      "not an individual farmer application.",
        "url": "https://rkvy.nic.in",
        "last_verified": "2026-02", "source": "PRS India — Demand for Grants 2026-27 Analysis: "
                                              "Agriculture and Farmers Welfare",
        "purpose": "Incentivises state-designed comprehensive agricultural development plans.",
        "department": "Dept. of Agriculture & Farmers Welfare (GoI)",
        "category": "production",
    },
    {
        "name": "Krishonnati Yojana",
        "description": "Umbrella scheme subsuming agricultural marketing, the "
                       "National Food Security Mission, National Mission on "
                       "Horticulture, and agriculture census/statistics schemes.",
        "state": "All India", "level": "central",
        "farmer_categories": ["marginal", "small", "medium", "large"],
        "crops": [], "min_land": 0, "max_land": 1000,
        "benefits": "Funds marketing, food security, horticulture and statistics sub-schemes.",
        "documents": [], "procedure": "Delivered through state agriculture departments; "
                                      "not an individual farmer application.",
        "url": "https://agriwelfare.gov.in",
        "last_verified": "2026-02", "source": "PRS India — Demand for Grants 2026-27 Analysis: "
                                              "Agriculture and Farmers Welfare",
        "purpose": "Umbrella scheme for agri-marketing, food security and horticulture missions.",
        "department": "Dept. of Agriculture & Farmers Welfare (GoI)",
        "category": "market",
    },
    {
        "name": "Mukhyamantri Kisan Kalyan Yojana",
        "description": "Madhya Pradesh state scheme providing direct annual income "
                       "assistance to farmer families, supplementing PM-KISAN.",
        "state": "Madhya Pradesh", "level": "state",
        "farmer_categories": ["marginal", "small", "medium", "large"],
        "crops": [], "min_land": 0, "max_land": 1000,
        "benefits": "Up to ₹12,000/year assistance per farmer family (MP budget 2026-27 announcement).",
        "documents": ["Aadhaar", "Land records", "Bank account"],
        "procedure": "Apply through the MP Kisan Kalyan portal / local agriculture office.",
        "url": "https://kisankalyan.mp.gov.in",
        "last_verified": "2026-02", "source": "MP Budget 2026-27 (Tractorsdekho / press coverage "
                                              "of budget speech, 18 Feb 2026)",
        "purpose": "State top-up income assistance for MP farmer families.",
        "department": "MP Dept. of Farmer Welfare & Agriculture Development",
        "category": "inputs",
    },
    {
        "name": "MP Crop Diversification Programme",
        "description": "Encourages Madhya Pradesh farmers to shift from "
                       "water-intensive paddy to lower-water, higher-value crops "
                       "through input support and incentives.",
        "state": "Madhya Pradesh", "level": "state",
        "farmer_categories": ["marginal", "small", "medium", "large"],
        "crops": ["maize", "soybean", "chickpea", "mustard"],
        "min_land": 0, "max_land": 1000,
        "benefits": "Input subsidy for farmers switching to notified diversification crops.",
        "documents": ["Aadhaar", "Land records"],
        "procedure": "Apply through the MP Dept. of Agriculture at the district level.",
        "url": "https://mpkrishi.mp.gov.in",
        "last_verified": "2026-02", "source": "MP Dept. of Agriculture (state crop "
                                              "diversification programme)",
        "purpose": "Shift farmers from water-intensive paddy to diversified, higher-value crops.",
        "department": "MP Dept. of Agriculture",
        "category": "production",
    },
    {
        "name": "MP Natural Farming Mission",
        "description": "Promotes chemical-free natural farming practices in "
                       "Madhya Pradesh, aligned with the National Mission on "
                       "Natural Farming — training, demonstration plots and "
                       "farmer hand-holding support.",
        "state": "Madhya Pradesh", "level": "state",
        "farmer_categories": ["marginal", "small", "medium", "large"],
        "crops": [], "min_land": 0, "max_land": 1000,
        "benefits": "Training, demonstration-plot support and certification assistance "
                   "for natural farming conversion.",
        "documents": ["Aadhaar", "Land records"],
        "procedure": "Enroll through the MP Dept. of Agriculture / Natural Farming cell.",
        "url": "https://mpkrishi.mp.gov.in",
        "last_verified": "2026-02", "source": "National Mission on Natural Farming "
                                              "(Union Budget 2026-27 documentation) / "
                                              "MP Dept. of Agriculture",
        "purpose": "Promote chemical-free natural farming practices in MP.",
        "department": "MP Dept. of Agriculture",
        "category": "production",
    },
    {
        "name": "e-NAM (National Agriculture Market)",
        "description": "A pan-India electronic trading platform networking existing "
                       "APMC/mandi markets, so a farmer's produce can be discovered "
                       "and bid on by buyers beyond their local mandi.",
        "state": "All India", "level": "central",
        "farmer_categories": ["marginal", "small", "medium", "large"],
        "crops": [], "min_land": 0, "max_land": 1000,
        "benefits": "Online price discovery and bidding across integrated mandis; "
                   "a single trading license valid across all e-NAM markets; "
                   "online payment directly to the farmer's account.",
        "documents": ["Aadhaar", "Bank account details"],
        "procedure": "Register (free) at the e-NAM portal or through your local "
                     "integrated mandi/APMC.",
        "url": "https://www.enam.gov.in",
        "last_verified": "2025-01", "source": "enam.gov.in",
        "purpose": "Unify fragmented mandi markets into one electronic national market.",
        "department": "Small Farmers' Agribusiness Consortium (SFAC), "
                      "Dept. of Agriculture & Farmers Welfare (GoI)",
        "category": "market",
    },
    {
        "name": "Agriculture Infrastructure Fund (AIF)",
        "description": "A medium-to-long-term financing facility for investment in "
                       "post-harvest management infrastructure and community farming "
                       "assets — warehouses, cold storage, primary processing units, "
                       "and similar projects — with government interest support "
                       "so the loan is cheaper to service.",
        "state": "All India", "level": "central",
        "farmer_categories": ["marginal", "small", "medium", "large"],
        "crops": [], "min_land": 0, "max_land": 1000,
        "benefits": "3% annual interest subvention on loans up to ₹2 crore, plus "
                   "credit guarantee coverage under CGTMSE for eligible borrowers.",
        "documents": ["Detailed project report", "Land/site documents",
                     "Bank loan application"],
        "procedure": "Apply through any scheduled bank or the AIF portal with a "
                     "project proposal for the infrastructure to be built.",
        "url": "https://agriinfra.dac.gov.in",
        "last_verified": "2025-01", "source": "agriinfra.dac.gov.in",
        "purpose": "Finance post-harvest and community farming infrastructure to "
                  "reduce crop wastage and improve farmer realisation.",
        "department": "Dept. of Agriculture & Farmers Welfare (GoI)",
        "category": "production",
    },
]

# Central-scheme 2026-27 Budget Estimates, VERIFIED against the Union Budget
# 2026-27 Demand for Grants via PRS India's published analysis
# (https://prsindia.org/budgets/parliament/demand-for-grants-2026-27-analysis-agriculture-and-farmers-welfare).
# MP state-scheme figures are VERIFIED against MP Budget 2026-27 press
# coverage where a figure was reported; district/beneficiary/utilization
# breakdowns are DEMO (illustrative) since no public source disaggregates
# them to that level — see government_funding.py's module docstring.
SCHEME_BUDGETS_2026_27 = {
    "PM-KISAN": {
        "budget_estimate_cr": 63500, "revised_estimate_cr": 63500,
        "funds_released_cr": 58420, "funds_utilized_cr": 47924,
        "beneficiaries_target": 9.5, "beneficiaries_actual": 8.6,  # crore farmer families
        "source": "Union Budget 2026-27 Demand for Grants (via PRS India)",
        "source_url": "https://prsindia.org/budgets/parliament/demand-for-grants-2026-27-analysis-agriculture-and-farmers-welfare",
        "data_status": "VERIFIED", "last_updated": "2026-02-01",
        "released_utilized_is_demo": True,  # BE/RE verified; release/utilization illustrative
    },
    "Pradhan Mantri Fasal Bima Yojana (PMFBY)": {
        "budget_estimate_cr": 12200, "revised_estimate_cr": 12267,
        "funds_released_cr": 10870, "funds_utilized_cr": 7830,
        "beneficiaries_target": 5.5, "beneficiaries_actual": 4.1,
        "source": "Union Budget 2026-27 Demand for Grants (via PRS India)",
        "source_url": "https://prsindia.org/budgets/parliament/demand-for-grants-2026-27-analysis-agriculture-and-farmers-welfare",
        "data_status": "VERIFIED", "last_updated": "2026-02-01",
        "released_utilized_is_demo": True,
    },
    "Rashtriya Krishi Vikas Yojana (RKVY)": {
        "budget_estimate_cr": 8550, "revised_estimate_cr": 7000,
        "funds_released_cr": 6120, "funds_utilized_cr": 4340,
        "beneficiaries_target": None, "beneficiaries_actual": None,
        "source": "Union Budget 2026-27 Demand for Grants (via PRS India)",
        "source_url": "https://prsindia.org/budgets/parliament/demand-for-grants-2026-27-analysis-agriculture-and-farmers-welfare",
        "data_status": "VERIFIED", "last_updated": "2026-02-01",
        "released_utilized_is_demo": True,
    },
    "Krishonnati Yojana": {
        "budget_estimate_cr": 11200, "revised_estimate_cr": 6800,
        "funds_released_cr": 9200, "funds_utilized_cr": 6100,
        "beneficiaries_target": None, "beneficiaries_actual": None,
        "source": "Union Budget 2026-27 Demand for Grants (via PRS India)",
        "source_url": "https://prsindia.org/budgets/parliament/demand-for-grants-2026-27-analysis-agriculture-and-farmers-welfare",
        "data_status": "VERIFIED", "last_updated": "2026-02-01",
        "released_utilized_is_demo": True,
    },
    "Soil Health Card Scheme": {
        "budget_estimate_cr": 568, "revised_estimate_cr": 568,
        "funds_released_cr": 420, "funds_utilized_cr": 355,
        "beneficiaries_target": 22, "beneficiaries_actual": 14,
        "source": "DEMO — illustrative figures; no single-line BE figure independently "
                 "located during this build", "source_url": "",
        "data_status": "DEMO", "last_updated": "",
    },
    "Per Drop More Crop (PMKSY - Micro Irrigation)": {
        "budget_estimate_cr": 2500, "revised_estimate_cr": 2200,
        "funds_released_cr": 1890, "funds_utilized_cr": 1120,
        "beneficiaries_target": 12, "beneficiaries_actual": 6.8,
        "source": "DEMO — illustrative figures", "source_url": "",
        "data_status": "DEMO", "last_updated": "",
    },
    "Kisan Credit Card (KCC)": {
        "budget_estimate_cr": 22600, "revised_estimate_cr": 22600,
        "funds_released_cr": 21400, "funds_utilized_cr": 19870,
        "beneficiaries_target": 7.4, "beneficiaries_actual": 6.9,
        "source": "Union Budget 2026-27 (Modified Interest Subvention Scheme, via PRS India)",
        "source_url": "https://prsindia.org/budgets/parliament/demand-for-grants-2026-27-analysis-agriculture-and-farmers-welfare",
        "data_status": "VERIFIED", "last_updated": "2026-02-01",
        "released_utilized_is_demo": True,
    },
    "Mukhyamantri Kisan Kalyan Yojana": {
        "budget_estimate_cr": 5500, "revised_estimate_cr": 5500,
        "funds_released_cr": 4650, "funds_utilized_cr": 3980,
        "beneficiaries_target": 0.81, "beneficiaries_actual": 0.74,  # crore MP farmer families
        "source": "MP Budget 2026-27 (press coverage of budget speech, 18 Feb 2026)",
        "source_url": "https://www.tractorsdekho.com/tractor-news/madhya-pradesh-budget-2026-27-highlights-big-announcements-for-farmers-women-rural-developmen-1034.html",
        "data_status": "VERIFIED", "last_updated": "2026-02-18",
        "released_utilized_is_demo": True,
    },
    "MP Crop Diversification Programme": {
        "budget_estimate_cr": 1400, "revised_estimate_cr": 1200,
        "funds_released_cr": 980, "funds_utilized_cr": 610,
        "beneficiaries_target": 3.2, "beneficiaries_actual": 1.6,
        "source": "DEMO — illustrative figures", "source_url": "",
        "data_status": "DEMO", "last_updated": "",
    },
    "MP Natural Farming Mission": {
        "budget_estimate_cr": 850, "revised_estimate_cr": 700,
        "funds_released_cr": 540, "funds_utilized_cr": 260,
        "beneficiaries_target": 1.0, "beneficiaries_actual": 0.31,
        "source": "DEMO — illustrative figures", "source_url": "",
        "data_status": "DEMO", "last_updated": "",
    },
}

# NOTE: state/district share constants (DEMO_STATE_SHARE, STATE_DISTRICTS)
# live in app/services/government_funding.py — the single source of
# truth, imported directly inside seed_government_funding() below, rather
# than duplicated here where they could drift out of sync.


def seed(db: Session):
    if db.query(User).first():
        return  # already seeded

    # Admin (government/officer) account
    admin = User(name="Agri Officer", email="admin@agri.gov",
                 hashed_password=hash_password("admin123"), role="admin",
                 mode="farm", language="en", state="Tamil Nadu", district="Chennai")
    db.add(admin)

    # Sample farmer
    farmer = User(name="Ravi Kumar", email="farmer@demo.com",
                  hashed_password=hash_password("demo123"), role="farmer",
                  mode="farm", language="ta", state="Tamil Nadu", district="Coimbatore")
    db.add(farmer)

    # Sample balcony grower
    grower = User(name="Anita", email="balcony@demo.com",
                  hashed_password=hash_password("demo123"), role="balcony",
                  mode="balcony", language="en", state="Karnataka", district="Bengaluru")
    db.add(grower)

    # Sample buyer
    buyer = User(name="Meena Traders", email="buyer@demo.com",
                 hashed_password=hash_password("demo123"), role="buyer",
                 mode="buyer", language="en", state="Tamil Nadu", district="Chennai")
    db.add(buyer)
    db.commit(); db.refresh(farmer); db.refresh(grower); db.refresh(admin); db.refresh(buyer)

    db.add(Farm(user_id=farmer.id, mode="farm", name="Ravi's Farm",
                state="Tamil Nadu", district="Coimbatore", village="Sulur",
                area="2 acres", crop="tomato", variety="Local", growth_stage="flowering",
                soil_type="loamy", irrigation_type="drip", farming_method="conventional",
                device_id="ESP32-001", farmer_category="small", land_size_acres=2.0))
    db.add(Farm(user_id=grower.id, mode="balcony", name="Anita's Balcony",
                location="Bengaluru", crop="chilli", area="12 inch pot",
                growth_stage="vegetative", sunlight="6 hours", growing_medium="potting mix",
                watering_method="manual", device_id="ESP32-002",
                farmer_category="marginal", land_size_acres=0.1))

    # Soil tests (for fertility dashboard)
    db.add(SoilTest(user_id=farmer.id, nitrogen=35, phosphorus=18, potassium=90,
                    ph=6.2, source="manual"))
    db.add(SoilTest(user_id=grower.id, nitrogen=70, phosphorus=40, potassium=60,
                    ph=6.5, source="manual"))

    # Sensor history (simulated, clearly tagged)
    base = datetime.utcnow() - timedelta(hours=12)
    for i in range(24):
        r = simulator.generate("ESP32-001")
        db.add(SensorReading(device_id="ESP32-001", soil_moisture=r["soil_moisture"],
                             temperature=r["temperature"], humidity=r["humidity"],
                             water_level=r["water_level"], water_flow=r["water_flow"],
                             source="simulated", created_at=base + timedelta(minutes=30 * i)))

    # A sample diagnosis (for admin problem stats)
    db.add(PlantDiagnosis(user_id=farmer.id, crop="tomato", image_path="",
                          disease="Early Blight", confidence=0.91, severity="moderate",
                          recommendation="Remove affected leaves; apply fungicide.",
                          uncertain=False))

    # Sample pest reports (for the state-wise admin pest-complaints view)
    db.add(PestObservation(user_id=farmer.id, crop="tomato", pest_name="Fruit borer",
                           confidence=0.86, severity="MODERATE", result_type="pest",
                           recommendation="Install pheromone traps; hand-pick affected fruit."))
    db.add(PestObservation(user_id=farmer.id, crop="tomato", pest_name="Whitefly",
                           confidence=0.78, severity="LOW", result_type="pest",
                           recommendation="Yellow sticky traps; neem-based spray."))

    for s in REAL_SCHEMES:
        db.add(Scheme(**s))
    db.commit()

    # A farmer marking interest in a scheme (for the state-wise "schemes
    # chosen" view — otherwise that panel would always be empty on a fresh
    # install, which looks broken rather than simply unused yet).
    first_scheme = db.query(Scheme).first()
    if first_scheme:
        db.add(SchemeInterest(user_id=farmer.id, scheme_id=first_scheme.id,
                              state=farmer.state))

    # Sample marketplace listings, so the buyer demo account and the admin
    # "most sold crops" / production-trend views have real rows to show
    # instead of an empty page on first run.
    sown = datetime.utcnow() - timedelta(days=100)
    db.add(CropListing(farmer_id=farmer.id, crop="tomato", variety="Local",
                       sowing_date=sown,
                       predicted_maturity_date=sown + timedelta(days=95),
                       maturity_source="lifecycle", intends_to_sell=True,
                       quantity_kg=500, price_per_kg=18.0,
                       state=farmer.state, district=farmer.district, village="Sulur",
                       status="available", farmer_name=farmer.name,
                       contact_phone="9876543210"))
    db.add(CropListing(farmer_id=farmer.id, crop="soybean", variety="JS-335",
                       sowing_date=sown - timedelta(days=20),
                       predicted_maturity_date=sown - timedelta(days=20) + timedelta(days=95),
                       maturity_source="lifecycle", intends_to_sell=True,
                       quantity_kg=1200, price_per_kg=42.0,
                       state=farmer.state, district=farmer.district, village="Sulur",
                       status="sold", farmer_name=farmer.name,
                       contact_phone="9876543210"))

    # Sample expenses, so the demo farmer's Analytics "Spent & earned"
    # dropdown shows a real net figure on first login instead of ₹0 spent
    # (which is honest but looks unfinished for a demo).
    db.add(Expense(user_id=farmer.id, category="seeds", amount=3500,
                   note="Soybean seed (JS-335)", crop="soybean",
                   created_at=sown - timedelta(days=25)))
    db.add(Expense(user_id=farmer.id, category="fertilizer", amount=6200,
                   note="DAP + urea", crop="soybean",
                   created_at=sown - timedelta(days=10)))
    db.add(Expense(user_id=farmer.id, category="labor", amount=4800,
                   note="Sowing and weeding labour", crop="tomato",
                   created_at=sown + timedelta(days=5)))

    db.commit()
    seed_machinery(db, farmer.id)
    seed_vendor_listings(db)
    seed_land_listings(db)
    seed_government_funding(db)
    print("✅ Seeded: admin@agri.gov/admin123, farmer@demo.com/demo123, "
          "balcony@demo.com/demo123, buyer@demo.com/demo123")


# ---------------------------------------------------------------------------
# Demo machinery listings spread across India, so the distance filter has
# something real to sort. Phone numbers are obviously fake demo numbers.
# ---------------------------------------------------------------------------

DEMO_MACHINERY = [
    ("tractor", "Mahindra 575 DI, 47 HP", "Mahindra", 2021, 1400,
     "Madhya Pradesh", "Indore", "Depalpur", 22.85, 75.54, "Ramesh Patidar",
     "9876500001", True, True,
     "Well maintained, regularly serviced. Driver available on request."),
    ("rotavator", "6-feet rotavator, tractor mounted", "Shaktiman", 2022, 1600,
     "Madhya Pradesh", "Indore", "Sanwer", 22.97, 75.83, "Suresh Yadav",
     "9876500002", False, False,
     "Fits 45 HP and above. Blades replaced last season."),
    ("harvester", "Self-propelled combine harvester", "Preet", 2020, 3800,
     "Madhya Pradesh", "Ujjain", "", 23.18, 75.78, "Dinesh Chouhan",
     "9876500003", False, True,
     "Suitable for wheat, soybean and chickpea. Book early for the season."),
    ("seed_drill", "9-tyne seed cum fertiliser drill", "Landforce", 2023, 1100,
     "Madhya Pradesh", "Bhopal", "Berasia", 23.63, 77.43, "Anil Verma",
     "9876500004", False, False,
     "Sows seed and places fertiliser in one pass."),
    ("sprayer", "HTP power sprayer with 100m hose", "Aspee", 2022, 600,
     "Madhya Pradesh", "Dewas", "", 22.96, 76.05, "Prakash Malviya",
     "9876500005", False, False,
     "Includes hose and two spray guns. Please return cleaned."),
    ("laser_leveller", "Laser land leveller with receiver", "KS Group", 2021, 3200,
     "Punjab", "Ludhiana", "", 30.90, 75.85, "Gurpreet Singh",
     "9876500006", False, True,
     "Operator included. Levels roughly 2 acres a day."),
    ("happy_seeder", "Happy Seeder for wheat after paddy", "Amar", 2023, 2800,
     "Punjab", "Patiala", "", 30.34, 76.38, "Jaswinder Singh",
     "9876500007", False, True,
     "Sows straight into paddy stubble. No burning needed."),
    ("drone_sprayer", "10L agricultural spray drone", "Garuda", 2024, 4500,
     "Maharashtra", "Nashik", "", 19.99, 73.79, "Sandeep Pawar",
     "9876500008", False, True,
     "Trained pilot included. Covers around 20 acres a day."),
    ("thresher", "Multi-crop thresher", "Dasmesh", 2019, 1200,
     "Uttar Pradesh", "Meerut", "", 28.98, 77.70, "Rakesh Kumar",
     "9876500009", False, False,
     "Handles wheat, gram and mustard."),
    ("power_tiller", "13 HP power tiller", "VST Shakti", 2022, 750,
     "Tamil Nadu", "Thanjavur", "", 10.79, 79.14, "Murugan S",
     "9876500010", False, False,
     "Ideal for wet paddy fields and small plots."),
    ("water_pump", "5 HP diesel pump set", "Kirloskar", 2020, 500,
     "Karnataka", "Belagavi", "", 15.85, 74.50, "Basavaraj H",
     "9876500011", False, False,
     "Includes 20 feet suction pipe."),
    ("trolley", "Hydraulic tractor trolley, 5 tonne", "Local", 2021, 900,
     "Rajasthan", "Kota", "", 25.21, 75.86, "Mahesh Sharma",
     "9876500012", False, False,
     "Hydraulic tipping. Good for mandi transport."),
    ("baler", "Round straw baler", "New Holland", 2022, 3500,
     "Haryana", "Karnal", "", 29.69, 76.99, "Satbir Dhaka",
     "9876500013", False, True,
     "Makes round bales. Ideal after combine harvest."),
    ("cultivator", "9-tyne spring cultivator", "Fieldking", 2021, 850,
     "Gujarat", "Rajkot", "", 22.30, 70.80, "Bharat Patel",
     "9876500014", False, False,
     "Good for pre-sowing tillage and weeding."),
]


# ---------------------------------------------------------------------------
# Regional farmer seed.
#
# The admin District Ranking, District Funding, Crop Health Map and State
# Intelligence tabs all derive their per-district lists from the Users table
# (see admin_intel.list_districts) and the DistrictFunding table. On a
# database that already has users, seed() above returns early, so those tabs
# would only ever show the handful of demo accounts. seed_regional_farmers()
# fixes that: it is idempotent (guarded per email) and safe to run on any
# install, adding real-looking, hardcoded farmers across EVERY district in
# STATE_DISTRICTS. Districts are real administrative districts; farmers,
# phone numbers and values are clearly illustrative demo data.
# ---------------------------------------------------------------------------

REGIONAL_FARMERS = [
    # state, district, village, name, phone | crop, variety, stage, acres, cat, soil, irrigation
    # soil(n,p,k,ph), device, moisture | pests[(name, sev)], diseases[(name, sev)], scheme, listing
    dict(state="Madhya Pradesh", district="Indore", village="Depalpur", name="Prakash Solanki", phone="9900000101",
         crop="soybean", variety="JS-335", growth_stage="vegetative", land=1.5, category="small", soil="loamy",
         irrigation="drip", soil_vals=(40, 22, 80, 6.4), device="ESP32-010", moisture="normal",
         pests=[("Pod borer", "MODERATE")], diseases=[], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Indore", village="Sanwer", name="Geeta Verma", phone="9900000102",
         crop="wheat", variety="GW-322", growth_stage="tillering", land=2.0, category="small", soil="clay loam",
         irrigation="flood", soil_vals=(55, 18, 70, 6.8), device="", moisture="",
         pests=[], diseases=[], scheme="Mukhyamantri Kisan Kalyan Yojana", listing=True,
         manure=("fym", "Farmyard manure from own cattle", 500, 4)),
    dict(state="Madhya Pradesh", district="Bhopal", village="Kolar", name="Ramesh Patil", phone="9900000103",
         crop="soybean", variety="JS-9560", growth_stage="pod-fill", land=3.0, category="medium", soil="loamy",
         irrigation="drip", soil_vals=(35, 20, 85, 6.5), device="ESP32-011", moisture="watch",
         pests=[("Girdle beetle", "MODERATE")], diseases=[("Yellow Mosaic", "moderate")], scheme="PM-KISAN", listing=True,
         manure=("vermicompost", "Vermicompost from own worm beds", 150, 24)),
    dict(state="Madhya Pradesh", district="Bhopal", village="Raisen Rd", name="Sunita Choudhary", phone="9900000104",
         crop="chickpea", variety="JG-16", growth_stage="vegetative", land=1.2, category="small", soil="sandy loam",
         irrigation="rainfed", soil_vals=(45, 15, 60, 6.6), device="", moisture="",
         pests=[], diseases=[], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Ujjain", village="Mahidpur", name="Kamal Malviya", phone="9900000105",
         crop="soybean", variety="JS-335", growth_stage="flowering", land=2.2, category="small", soil="black",
         irrigation="drip", soil_vals=(50, 25, 90, 6.3), device="ESP32-012", moisture="stressed",
         pests=[("Leaf hopper", "HIGH")], diseases=[], scheme="PM-KISAN", listing=True,
         manure=("compost", "Decomposed compost from cattle dung and farm waste", 300, 7)),
    dict(state="Madhya Pradesh", district="Ujjain", village="Tarana", name="Bhupendra Sisodia", phone="9900000106",
         crop="chickpea", variety="JG-130", growth_stage="branching", land=1.8, category="small", soil="black",
         irrigation="rainfed", soil_vals=(48, 14, 55, 6.7), device="", moisture="",
         pests=[], diseases=[], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Jabalpur", village="Katangi", name="Devendra Mehta", phone="9900000107",
         crop="paddy", variety="MTU-1010", growth_stage="milk", land=3.5, category="medium", soil="clay",
         irrigation="canal", soil_vals=(60, 25, 95, 6.4), device="ESP32-013", moisture="normal",
         pests=[("Brown plant hopper", "MODERATE")], diseases=[("Blast", "moderate")], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Jabalpur", village="Sihora", name="Laxmi Shukla", phone="9900000108",
         crop="wheat", variety="MP-3336", growth_stage="tillering", land=2.4, category="small", soil="clay loam",
         irrigation="flood", soil_vals=(52, 17, 72, 6.9), device="", moisture="",
         pests=[], diseases=[], scheme="Mukhyamantri Kisan Kalyan Yojana", listing=True),
    dict(state="Madhya Pradesh", district="Dewas", village="Sonkatch", name="Narayan Yadav", phone="9900000109",
         crop="soybean", variety="JS-335", growth_stage="flowering", land=2.6, category="small", soil="black",
         irrigation="drip", soil_vals=(38, 21, 78, 6.5), device="", moisture="",
         pests=[("Pod borer", "MODERATE"), ("Semi looper", "LOW")], diseases=[], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Dewas", village="Kannod", name="Anita Baghel", phone="9900000110",
         crop="onion", variety="Agrifound Dark Red", growth_stage="bulb", land=0.8, category="marginal", soil="loamy",
         irrigation="drip", soil_vals=(42, 24, 65, 6.2), device="ESP32-014", moisture="critical",
         pests=[("Thrips", "HIGH")], diseases=[], scheme="PMKSY - Micro Irrigation", listing=True,
         manure=("fym", "Farmyard manure from own cattle", 400, 4)),
    dict(state="Madhya Pradesh", district="Sagar", village="Deori", name="Ramlal Ahirwar", phone="9900000111",
         crop="wheat", variety="GW-366", growth_stage="tillering", land=3.8, category="medium", soil="clay loam",
         irrigation="flood", soil_vals=(58, 16, 60, 7.0), device="", moisture="",
         pests=[], diseases=[("Leaf Rust", "low")], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Sagar", village="Khurai", name="Shobha Sahu", phone="9900000112",
         crop="chickpea", variety="JG-16", growth_stage="branching", land=1.4, category="small", soil="sandy loam",
         irrigation="rainfed", soil_vals=(44, 12, 50, 6.8), device="", moisture="",
         pests=[], diseases=[], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Gwalior", village="Dabra", name="Dinesh Prajapati", phone="9900000113",
         crop="mustard", variety="NRCHB-101", growth_stage="flowering", land=2.9, category="small", soil="loamy",
         irrigation="flood", soil_vals=(47, 19, 85, 6.5), device="", moisture="",
         pests=[("Aphid", "MODERATE")], diseases=[], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Gwalior", village="Bhitarwar", name="Kavita Rajawat", phone="9900000114",
         crop="wheat", variety="GW-322", growth_stage="grain-fill", land=2.1, category="small", soil="clay loam",
         irrigation="flood", soil_vals=(56, 15, 58, 6.9), device="", moisture="",
         pests=[], diseases=[], scheme="Mukhyamantri Kisan Kalyan Yojana", listing=True),
    dict(state="Madhya Pradesh", district="Vidisha", village="Gyaraspur", name="Mohan Tiwari", phone="9900000115",
         crop="soybean", variety="JS-9560", growth_stage="pod-fill", land=4.2, category="medium", soil="black",
         irrigation="drip", soil_vals=(37, 20, 82, 6.4), device="ESP32-015", moisture="watch",
         pests=[("Tobacco caterpillar", "HIGH"), ("Girdle beetle", "MODERATE")], diseases=[], scheme="PM-KISAN", listing=True,
         manure=("liquid", "Liquid organic manure (fermented cow-dung slurry)", 120, 15)),
    dict(state="Madhya Pradesh", district="Ratlam", village="Sailana", name="Suresh Bhuria", phone="9900000116",
         crop="maize", variety="PMH-1", growth_stage="tasseling", land=1.6, category="small", soil="loamy",
         irrigation="rainfed", soil_vals=(49, 23, 75, 6.6), device="", moisture="",
         pests=[("Stem borer", "MODERATE")], diseases=[], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Satna", village="Maihar", name="Rajan Gupta", phone="9900000117",
         crop="paddy", variety="IR-64", growth_stage="milk", land=5.0, category="medium", soil="clay",
         irrigation="canal", soil_vals=(62, 26, 90, 6.3), device="ESP32-016", moisture="normal",
         pests=[("Armyworm", "HIGH"), ("Stem borer", "MODERATE")], diseases=[("Sheath Blight", "high")], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Khargone", village="Kasrawad", name="Ramesh Bhilala", phone="9900000118",
         crop="cotton", variety="Bunny Jassid", growth_stage="square", land=3.2, category="medium", soil="black",
         irrigation="drip", soil_vals=(45, 28, 88, 6.5), device="ESP32-017", moisture="watch",
         pests=[("Pink bollworm", "HIGH"), ("Jayate", "MODERATE"), ("Jassid", "MODERATE")], diseases=[], scheme="PM-KISAN", listing=True,
         manure=("fym", "Farmyard manure (cattle shed)", 650, 4)),
    dict(state="Madhya Pradesh", district="Mandsaur", village="Malhargarh", name="Poonam Jain", phone="9900000119",
         crop="garlic", variety="G-282", growth_stage="bulb", land=0.9, category="marginal", soil="black",
         irrigation="drip", soil_vals=(40, 27, 92, 6.2), device="", moisture="",
         pests=[("Thrips", "MODERATE")], diseases=[], scheme="PM-KISAN", listing=True,
         manure=("compost", "Compost from vegetable waste and dung", 180, 7)),
    dict(state="Madhya Pradesh", district="Chhindwara", village="Mohkhed", name="Arjun Gond", phone="9900000120",
         crop="paddy", variety="HKR-47", growth_stage="milk", land=2.7, category="small", soil="clay",
         irrigation="canal", soil_vals=(58, 24, 88, 6.6), device="ESP32-018", moisture="normal",
         pests=[("Leaf folder", "MODERATE"), ("Stem borer", "MODERATE")], diseases=[], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Betul", village="Shahpur", name="Mukesh Patle", phone="9900000121",
         crop="wheat", variety="GW-366", growth_stage="grain-fill", land=2.3, category="small", soil="clay loam",
         irrigation="flood", soil_vals=(54, 16, 62, 6.9), device="", moisture="",
         pests=[], diseases=[("Leaf Blight", "moderate")], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Hoshangabad", village="Itarsi", name="Vandana Khandelwal", phone="9900000122",
         crop="soybean", variety="JS-335", growth_stage="flowering", land=3.4, category="medium", soil="loamy",
         irrigation="drip", soil_vals=(41, 21, 80, 6.5), device="", moisture="",
         pests=[("Pod borer", "LOW")], diseases=[], scheme="PM-KISAN", listing=True),
    dict(state="Madhya Pradesh", district="Rewa", village="Huzur", name="Sanjay Patel", phone="9900000123",
         crop="paddy", variety="MTU-1010", growth_stage="milk", land=4.4, category="medium", soil="clay",
         irrigation="canal", soil_vals=(60, 25, 92, 6.4), device="ESP32-019", moisture="normal",
         pests=[("Stem borer", "HIGH")], diseases=[("Blast", "moderate")], scheme="PM-KISAN", listing=True,
         manure=("compost", "Pit compost from straw and dung", 220, 6)),
    dict(state="Madhya Pradesh", district="Vidisha", village="Nateran", name="Rekha Sharma", phone="9900000124",
         crop="wheat", variety="GW-322", growth_stage="tillering", land=1.7, category="small", soil="clay loam",
         irrigation="flood", soil_vals=(53, 17, 68, 6.8), device="", moisture="",
         pests=[], diseases=[], scheme="Mukhyamantri Kisan Kalyan Yojana", listing=True),
    dict(state="Tamil Nadu", district="Madurai", village="Melur", name="Muthu Thevar", phone="9900000125",
         crop="cotton", variety="MCU-5", growth_stage="square", land=2.5, category="small", soil="red loam",
         irrigation="drip", soil_vals=(44, 22, 70, 6.4), device="ESP32-020", moisture="normal",
         pests=[("Pink bollworm", "MODERATE")], diseases=[], scheme="PM-KISAN", listing=True,
         manure=("vermicompost", "Vermicompost from own beds", 100, 25)),
    dict(state="Tamil Nadu", district="Salem", village="Omalur", name="Selvi Muthusamy", phone="9900000126",
         crop="tapioca", variety="H-226", growth_stage="vegetative", land=1.3, category="small", soil="sandy loam",
         irrigation="rainfed", soil_vals=(46, 15, 55, 6.3), device="", moisture="",
         pests=[], diseases=[], scheme="PM-KISAN", listing=True),
    dict(state="Karnataka", district="Davangere", village="Harapanahalli", name="Basavaraj Hiremath", phone="9900000127",
         crop="cotton", variety="DCH-32", growth_stage="square", land=3.1, category="medium", soil="black",
         irrigation="drip", soil_vals=(47, 26, 86, 6.6), device="ESP32-021", moisture="watch",
         pests=[("Pink bollworm", "HIGH")], diseases=[], scheme="PM-KISAN", listing=True,
         manure=("fym", "Farmyard manure from cattle shed", 500, 5)),
    dict(state="Karnataka", district="Mandya", village="Pandavapura", name="Nagendra Gowda", phone="9900000128",
         crop="paddy", variety="BPT-5204", growth_stage="milk", land=2.8, category="small", soil="clay",
         irrigation="canal", soil_vals=(59, 24, 84, 6.5), device="", moisture="",
         pests=[("Brown plant hopper", "MODERATE")], diseases=[], scheme="PM-KISAN", listing=True),
]


def seed_regional_farmers(db: Session) -> int:
    """Add the REGIONAL_FARMERS above (idempotent, guarded per email) and
    DistrictFunding rows for every newly populated district, so the admin
    district tabs show real data even on an existing database."""
    now = datetime.utcnow()
    schemes_by_name = {s.name: s for s in db.query(Scheme).all()}
    created = 0
    for idx, rec in enumerate(REGIONAL_FARMERS):
        email = f"farmer{rec['phone'][-6:]}@agro.demo"
        if db.query(User).filter(User.email == email).first():
            continue
        u = User(name=rec["name"], email=email,
                 hashed_password=hash_password("demo123"), role="farmer",
                 mode="farm", language="en", state=rec["state"], district=rec["district"])
        db.add(u)
        db.flush()
        db.add(Farm(user_id=u.id, mode="farm", name=f"{rec['name']}'s Farm",
                    state=rec["state"], district=rec["district"], village=rec["village"],
                    area=f"{rec['land']} acres", crop=rec["crop"], variety=rec["variety"],
                    growth_stage=rec["growth_stage"], soil_type=rec["soil"],
                    irrigation_type=rec["irrigation"], farming_method="conventional",
                    device_id=rec["device"] or "", farmer_category=rec["category"],
                    land_size_acres=rec["land"]))
        n, p, k, ph = rec["soil_vals"]
        db.add(SoilTest(user_id=u.id, nitrogen=n, phosphorus=p, potassium=k,
                        ph=ph, source="manual"))
        if rec["device"]:
            moisture_map = {"normal": 50, "watch": 40, "stressed": 26, "critical": 15}
            target = moisture_map.get(rec["moisture"], 45)
            base = now - timedelta(hours=12)
            for i in range(24):
                r = simulator.generate(rec["device"])
                jitter = ((i * 37) % 7) - 3
                db.add(SensorReading(device_id=rec["device"],
                                     soil_moisture=round(target + jitter, 1),
                                     temperature=round(r["temperature"], 1),
                                     humidity=round(r["humidity"], 1),
                                     water_level=r["water_level"], water_flow=r["water_flow"],
                                     source="simulated",
                                     created_at=base + timedelta(minutes=30 * i)))
        for pest, sev in rec["pests"]:
            days = 7 + idx % 6
            db.add(PestObservation(user_id=u.id, crop=rec["crop"], pest_name=pest,
                                   confidence=0.84, severity=sev, result_type="pest",
                                   recommendation=f"Monitor {pest.lower()} and apply a "
                                                  f"labelled spray if numbers keep rising.",
                                   created_at=now - timedelta(days=days)))
        for disease, sev in rec["diseases"]:
            db.add(PlantDiagnosis(user_id=u.id, crop=rec["crop"], image_path="",
                                  disease=disease, confidence=0.9, severity=sev,
                                  recommendation="Field inspection recommended; treat "
                                                 "with a labelled fungicide.",
                                  created_at=now - timedelta(days=3 + idx % 5)))
        if rec["scheme"] and rec["scheme"] in schemes_by_name:
            db.add(SchemeInterest(user_id=u.id,
                                  scheme_id=schemes_by_name[rec["scheme"]].id,
                                  state=rec["state"]))
        if rec["listing"]:
            sown = now - timedelta(days=60)
            db.add(CropListing(farmer_id=u.id, crop=rec["crop"], variety=rec["variety"],
                               sowing_date=sown,
                               predicted_maturity_date=sown + timedelta(days=95),
                               maturity_source="lifecycle", intends_to_sell=True,
                               quantity_kg=400, price_per_kg=30.0,
                               state=rec["state"], district=rec["district"],
                               village=rec["village"], status="available",
                               farmer_name=rec["name"], contact_phone=rec["phone"]))
        if rec.get("manure"):
            method, product_name, qty, price = rec["manure"]
            db.add(CropListing(farmer_id=u.id, product_type="fertilizer",
                               product_name=product_name, crop=method,
                               intends_to_sell=True, quantity_kg=qty,
                               price_per_kg=price,
                               state=rec["state"], district=rec["district"],
                               village=rec["village"], status="available",
                               farmer_name=rec["name"], contact_phone=rec["phone"]))
        created += 1

    created_reports = _seed_disaster_reports(db, now)

    if created or created_reports:
        db.commit()
    _ensure_district_funding(db)
    if created or created_reports:
        print(f"✅ Seeded {created} regional farmers "
              f"({created_reports} disaster report(s), "
              f"{_district_funding_filled.STATUS} district-funding fill)" if False else "")
    return created


def _seed_disaster_reports(db: Session, now: datetime) -> int:
    """A few farmer-filed emergencies per state for the Priority Alerts and
    Disaster Reports tabs. Idempotent on reference_no."""
    rows = [
        # district is resolved via the farmer user's profile deliberately
        dict(district="Khargone", disaster_type="flood", crop="cotton",
             description="Flash flooding along the Narmada bank submerged the "
                         "cotton field for two days.",
             severity="HIGH",
             severity_reason="Reported disaster type: flood, baseline severity HIGH. "
                             "Description language and crop extent indicate broad impact.",
             filed_to="State Disaster Relief Cell — Madhya Pradesh",
             days_ago=3, lat=22.028, lon=75.480, media=["uploads/khargone_flood.jpg"]),
        dict(district="Betul", disaster_type="drought", crop="soybean",
             description="No rain for 25 days; soil cracked, soybean pods not filling.",
             severity="MODERATE",
             severity_reason="Reported disaster type: drought, baseline severity MODERATE.",
             filed_to="District Agriculture Office — Betul",
             days_ago=5, lat=21.902, lon=77.902, media=[]),
        dict(district="Satna", disaster_type="pest", crop="paddy",
             description="Armyworm outbreak spreading fast across the paddy crop in Maihar.",
             severity="CRITICAL",
             severity_reason="Reported disaster type: pest, baseline severity HIGH; "
                             "photo analysis independently flagged high severity.",
             filed_to="State Disaster Relief Cell — Madhya Pradesh",
             days_ago=1, lat=24.600, lon=80.833, media=["uploads/satna_pest.jpg"]),
        dict(district="Indore", disaster_type="other", crop="soybean",
             description="Severe hailstorm damaged pods a week before harvest.",
             severity="LOW",
             severity_reason="Reported disaster type: other, baseline severity LOW.",
             filed_to="District Agriculture Office — Indore",
             days_ago=8, lat=22.720, lon=75.857, media=[]),
    ]
    created = 0
    for r in rows:
        ref = f"DR-{now.strftime('%Y%m%d')}-{r['district'].upper()[:6]}"
        if db.query(DisasterReport).filter(DisasterReport.reference_no == ref).first():
            continue
        farmer = (db.query(User)
                  .filter(User.state == "Madhya Pradesh", User.district == r["district"],
                          User.role == "farmer").order_by(User.id).first())
        if not farmer:
            continue
        db.add(DisasterReport(
            user_id=farmer.id, reference_no=ref,
            disaster_type=r["disaster_type"], crop=r["crop"],
            description=r["description"], latitude=r["lat"], longitude=r["lon"],
            state="Madhya Pradesh", district=r["district"],
            severity=r["severity"], severity_reason=r["severity_reason"],
            media_paths=r["media"], filed_to=r["filed_to"], status="filed",
            created_at=now - timedelta(days=r["days_ago"])))
        created += 1
    return created


def _ensure_district_funding(db: Session) -> None:
    """Add DistrictFunding rows (district total + per-scheme) for every
    STATE_DISTRICTS district that now has registered farmers but no funding
    row yet — covers installs that seeded before STATE_DISTRICTS grew."""
    from app.models.models import DistrictFunding
    from app.services.government_funding import STATE_DISTRICTS, STATE_TOTALS_2026_27, INDIA_TOTAL_CR

    FY = "2026-27"
    schemes_by_name = {s.name: s for s in db.query(Scheme).all()}
    added = 0
    for state, districts in STATE_DISTRICTS.items():
        farmer_counts = {
            d: db.query(User).filter(User.state == state, User.district == d,
                                     User.role.in_(("farmer", "balcony"))).count()
            for d in districts
        }
        total_farmers = sum(farmer_counts.values())
        if not total_farmers:
            continue
        state_total = (STATE_TOTALS_2026_27.get(state, {}).get("amount_cr")
                      or round(INDIA_TOTAL_CR * 0.05))
        slice_amount = state_total * 0.02
        for district, count in farmer_counts.items():
            if db.query(DistrictFunding).filter(
                    DistrictFunding.state == state, DistrictFunding.district == district,
                    DistrictFunding.financial_year == FY,
                    DistrictFunding.scheme_id.is_(None)).first():
                continue
            weight = count / total_farmers
            amount = round(slice_amount * weight * len(districts), 1)
            released = round(amount * 0.8, 1)
            utilized = round(released * 0.62, 1)
            db.add(DistrictFunding(
                scheme_id=None, state=state, district=district, financial_year=FY,
                allocated_cr=amount, released_cr=released, utilized_cr=utilized,
                beneficiaries=round(count * 0.7, 0),
                source="DEMO — illustrative, proportional to registered farmers in this platform; "
                       "no public district-wise release data available",
                data_status="DEMO", last_updated=""))
            added += 1
            pmkisan = schemes_by_name.get("PM-KISAN")
            if pmkisan:
                db.add(DistrictFunding(
                    scheme_id=pmkisan.id, state=state, district=district, financial_year=FY,
                    allocated_cr=round(amount * 0.4, 1), released_cr=round(amount * 0.32, 1),
                    utilized_cr=round(amount * 0.2, 1), beneficiaries=round(count * 0.4, 0),
                    source="DEMO — illustrative", data_status="DEMO", last_updated=""))
                added += 1
    if added:
        db.commit()
    _district_funding_filled.STATUS = added


class _district_funding_filled:
    STATUS = 0


def seed_machinery(db: Session, owner_id: int):
    """Demo listings. Skipped entirely once any listing exists."""
    if db.query(MachineryListing).count() > 0:
        return

    for (key, title, brand, year, rate, state, district, village,
         lat, lon, owner, phone, fuel, operator, desc) in DEMO_MACHINERY:
        db.add(MachineryListing(
            owner_id=owner_id, machine_key=key, title=title, brand=brand,
            model_year=year, daily_rate=rate, state=state, district=district,
            village=village, latitude=lat, longitude=lon, owner_name=owner,
            contact_phone=phone, fuel_included=fuel,
            operator_included=operator, description=desc,
            condition="good", available=True))
    db.commit()
    print(f"Seeded {len(DEMO_MACHINERY)} demo machinery listings")


# 10 vendor profiles x 5 crops = 50 listings, spread across states so the
# buyer's crop-icon grid ("same crop, different states") has something real
# to show on first run. Each vendor is a genuine User row (role=farmer), so
# contact-reveal, interest requests and everything else work exactly like a
# listing any real farmer created — no special-cased demo behaviour.
VENDOR_PROFILES = [
    ("Tamil Nadu", "Coimbatore", "Suresh Kumar", "9900000001"),
    ("Karnataka", "Mysuru", "Ravi Gowda", "9900000002"),
    ("Maharashtra", "Nashik", "Vikram Patil", "9900000003"),
    ("Punjab", "Ludhiana", "Gurpreet Singh", "9900000004"),
    ("Madhya Pradesh", "Indore", "Ramesh Yadav", "9900000005"),
    ("Uttar Pradesh", "Meerut", "Ajay Chaudhary", "9900000006"),
    ("Andhra Pradesh", "Guntur", "Venkatesh Reddy", "9900000007"),
    ("Gujarat", "Rajkot", "Bharat Patel", "9900000008"),
    ("Rajasthan", "Jaipur", "Om Prakash", "9900000009"),
    ("West Bengal", "Nadia", "Bimal Das", "9900000010"),
]
VENDOR_CROPS = ["tomato", "onion", "potato", "wheat", "rice"]
VARIETY_CYCLE = ["Local", "Hybrid", "Organic", "Desi", "Grade-A"]
# Only wheat is in lifecycle.py's supported set (soybean/wheat/chickpea/
# maize/cotton) — the rest use a farmer-estimated typical cycle length,
# honestly tagged maturity_source="farmer" rather than claiming a lifecycle
# calculation we don't actually have for these crops.
TYPICAL_CYCLE_DAYS = {"tomato": 75, "onion": 110, "potato": 90, "wheat": 130, "rice": 120}


def seed_vendor_listings(db: Session):
    """50 hardcoded vendor produce listings for the buyer marketplace's
    crop-icon browsing grid. Skipped once enough listings already exist, so
    re-running the seed script is safe."""
    if db.query(CropListing).count() >= 50:
        return

    now = datetime.utcnow()
    total = 0
    for v_idx, (state, district, name, phone) in enumerate(VENDOR_PROFILES):
        email = f"vendor{v_idx + 1}@marketplace.demo"
        vendor = db.query(User).filter(User.email == email).first()
        if not vendor:
            vendor = User(name=name, email=email,
                          hashed_password=hash_password("vendor123"), role="farmer",
                          mode="farm", language="en", state=state, district=district)
            db.add(vendor); db.commit(); db.refresh(vendor)

        for c_idx, crop in enumerate(VENDOR_CROPS):
            variety = VARIETY_CYCLE[(v_idx + c_idx) % len(VARIETY_CYCLE)]
            sowing = now - timedelta(days=20 + c_idx * 15)
            maturity = sowing + timedelta(days=TYPICAL_CYCLE_DAYS.get(crop, 100))
            status = "available" if maturity <= now else "growing"
            qty = 200 + (v_idx * 37 + c_idx * 19) % 600
            price = round(8.5 + (v_idx * 3 + c_idx * 5) % 40, 2)

            db.add(CropListing(
                farmer_id=vendor.id, crop=crop, variety=variety,
                sowing_date=sowing, predicted_maturity_date=maturity,
                maturity_source="lifecycle" if crop == "wheat" else "farmer",
                intends_to_sell=True, quantity_kg=qty, price_per_kg=price,
                state=state, district=district, village="",
                status=status, farmer_name=name, contact_phone=phone,
            ))
            total += 1
    db.commit()
    print(f"Seeded {total} demo vendor produce listings across {len(VENDOR_PROFILES)} states")


DEMO_LAND = [
    ("Tamil Nadu", "Coimbatore", "Thondamuthur", 5.0, "Red", "Borewell", True, ["Tomato", "Onion"], 12000, "9876543210", 11.0, 76.9),
    ("Karnataka", "Mysuru", "Nanjangud", 12.5, "Black", "Canal", True, ["Cotton"], 15000, "9900000002", 12.3, 76.6),
    ("Maharashtra", "Nashik", "Niphad", 3.0, "Loamy", "Rainfed", False, ["Onion", "Grapes"], 18000, "9900000003", 20.0, 74.1),
    ("Punjab", "Ludhiana", "Jagraon", 8.0, "Alluvial", "Canal", True, ["Wheat", "Rice"], 14000, "9900000004", 30.7, 75.4),
]

def seed_land_listings(db: Session):
    """Seed demo land listings for the new Land Contractors feature."""
    if db.query(LandListing).count() > 0:
        return

    farmer = db.query(User).filter(User.role == "farmer").first()
    buyer = db.query(User).filter(User.role == "buyer").first()
    if not farmer:
        return

    count = 0
    for state, district, village, acreage, soil, water, irr, crops, price, phone, lat, lon in DEMO_LAND:
        listing = LandListing(
            farmer_id=farmer.id,
            state=state,
            district=district,
            village=village,
            area_acres=acreage,
            soil_type=soil,
            water_source=water,
            irrigation_available=irr,
            suitable_crops=crops,
            price_per_acre_per_season=price,
            contact_phone=phone,
            latitude=lat,
            longitude=lon,
            status="available"
        )
        db.add(listing)
        count += 1
    db.commit()

    # Create one dummy contract for the buyer to see
    if count > 0 and buyer:
        first_listing = db.query(LandListing).first()
        if first_listing:
            first_listing.status = "rented"
            contract = LandContract(
                listing_id=first_listing.id,
                buyer_id=buyer.id,
                farmer_id=first_listing.farmer_id,
                start_date=datetime.utcnow(),
                end_date=datetime.utcnow() + timedelta(days=180),
                agreed_crop=first_listing.suitable_crops[0] if first_listing.suitable_crops else "Unknown",
                price_per_acre=first_listing.price_per_acre_per_season,
                total_price=first_listing.price_per_acre_per_season * first_listing.area_acres * 2, # Assuming 2 seasons
                status="active",
                terms_accepted=True,
                buyer_notes="Buyer gets all produce grown during this period."
            )
            db.add(contract)
            db.commit()

    print(f"Seeded {count} demo land listings and 1 contract.")




def seed_government_funding(db: Session):
    from app.models.models import SchemeBudget, StateFunding, DistrictFunding
    from app.services.government_funding import (
        STATE_TOTALS_2026_27, DEMO_STATE_SHARE, STATE_DISTRICTS, INDIA_TOTAL_CR,
    )

    if db.query(SchemeBudget).first():
        return  # already seeded

    FY = "2026-27"
    schemes_by_name = {s.name: s for s in db.query(Scheme).all()}

    # ---- SchemeBudget: one row per scheme for FY2026-27 ----
    for name, b in SCHEME_BUDGETS_2026_27.items():
        scheme = schemes_by_name.get(name)
        if not scheme:
            continue
        status = "DEMO" if b.get("released_utilized_is_demo") else b["data_status"]
        db.add(SchemeBudget(
            scheme_id=scheme.id, financial_year=FY,
            budget_estimate_cr=b["budget_estimate_cr"], revised_estimate_cr=b["revised_estimate_cr"],
            funds_released_cr=b["funds_released_cr"], funds_utilized_cr=b["funds_utilized_cr"],
            beneficiaries_target=b["beneficiaries_target"], beneficiaries_actual=b["beneficiaries_actual"],
            source=b["source"], source_url=b["source_url"],
            data_status=b["data_status"], last_updated=b["last_updated"],
        ))
        db.add(SchemeBudget(
            scheme_id=scheme.id, financial_year="2025-26",
            budget_estimate_cr=round(b["budget_estimate_cr"] * 0.92, 0) if b["budget_estimate_cr"] else None,
            funds_utilized_cr=round(b["funds_utilized_cr"] * 0.85, 0) if b["funds_utilized_cr"] else None,
            beneficiaries_actual=round(b["beneficiaries_actual"] * 0.9, 2) if b["beneficiaries_actual"] else None,
            source="DEMO — illustrative prior-year figure for trend display",
            data_status="DEMO", last_updated="",
        ))
    db.commit()

    # ---- StateFunding: whole-agriculture-budget totals by state ----
    # Verified states use their real cited figure; everything else is an
    # illustrative proportional share of the India total (clearly DEMO).
    for state, info in STATE_TOTALS_2026_27.items():
        db.add(StateFunding(
            scheme_id=None, state=state, financial_year=FY,
            allocated_cr=info["amount_cr"],
            released_cr=round(info["amount_cr"] * 0.83, 0),
            utilized_cr=round(info["amount_cr"] * 0.68, 0),
            beneficiaries=round((info["amount_cr"] / 10000) * 1.1, 2),
            source=info["source"], source_url=info["source_url"],
            data_status=info["data_status"], last_updated=info["last_updated"],
        ))
    for state, share in DEMO_STATE_SHARE.items():
        amount = round(INDIA_TOTAL_CR * share, 0)
        db.add(StateFunding(
            scheme_id=None, state=state, financial_year=FY,
            allocated_cr=amount, released_cr=round(amount * 0.83, 0),
            utilized_cr=round(amount * 0.68, 0), beneficiaries=round((amount / 10000) * 1.1, 2),
            source="DEMO — illustrative proportional split, not an official inter-state allocation",
            source_url="", data_status="DEMO", last_updated="",
        ))

    # ---- StateFunding: per-scheme state split (DEMO) ----
    all_states = list(STATE_TOTALS_2026_27.keys()) + list(DEMO_STATE_SHARE.keys())
    all_shares = {**{s: v["amount_cr"] / INDIA_TOTAL_CR for s, v in STATE_TOTALS_2026_27.items()},
                 **DEMO_STATE_SHARE}
    for name in ("PM-KISAN", "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
                "Rashtriya Krishi Vikas Yojana (RKVY)"):
        scheme = schemes_by_name.get(name)
        budget = SCHEME_BUDGETS_2026_27.get(name)
        if not scheme or not budget:
            continue
        for state in all_states:
            share = all_shares.get(state, 0.05)
            amount = round(budget["budget_estimate_cr"] * share, 1)
            db.add(StateFunding(
                scheme_id=scheme.id, state=state, financial_year=FY,
                allocated_cr=amount, released_cr=round(amount * 0.85, 1),
                utilized_cr=round(amount * 0.7, 1),
                beneficiaries=round(amount * 12, 0) if budget["beneficiaries_target"] else None,
                source="DEMO — illustrative proportional split, not an official state-wise release",
                data_status="DEMO", last_updated="",
            ))
    db.commit()

    # ---- DistrictFunding: district totals + per-scheme, for EVERY state ----
    # with a district registry — all DEMO, proportional to each district's
    # real registered-farmer count in this platform.
    for state, districts in STATE_DISTRICTS.items():
        state_total = (STATE_TOTALS_2026_27.get(state, {}).get("amount_cr")
                      or round(INDIA_TOTAL_CR * DEMO_STATE_SHARE.get(state, 0.05)))
        slice_amount = state_total * 0.02  # a modest illustrative slice reaching these districts

        district_farmer_counts = {
            d: db.query(User).filter(User.state == state, User.district == d,
                                     User.role.in_(("farmer", "balcony"))).count()
            for d in districts
        }
        total_farmers = sum(district_farmer_counts.values()) or 1

        for i, district in enumerate(districts):
            weight = district_farmer_counts[district] / total_farmers
            amount = round(slice_amount * weight * len(districts), 1)
            released = round(amount * 0.8, 1)
            # Vary utilization deliberately so financial_alerts() has real
            # things to flag (first district low, second high, rest mid).
            util_rate = 0.35 if i == 0 else 0.88 if i == 1 else 0.62
            utilized = round(released * util_rate, 1)
            beneficiaries = round(district_farmer_counts[district] * (0.25 if i == 0 else 0.7), 0)
            db.add(DistrictFunding(
                scheme_id=None, state=state, district=district, financial_year=FY,
                allocated_cr=amount, released_cr=released, utilized_cr=utilized,
                beneficiaries=beneficiaries,
                source="DEMO — illustrative, proportional to registered farmers in this platform; "
                      "no public district-wise release data available",
                data_status="DEMO", last_updated="",
            ))
            for name in ("PM-KISAN", "Mukhyamantri Kisan Kalyan Yojana"):
                scheme = schemes_by_name.get(name)
                if not scheme or (name == "Mukhyamantri Kisan Kalyan Yojana" and state != "Madhya Pradesh"):
                    continue
                s_amount = round(amount * 0.4, 1)
                s_released = round(s_amount * 0.8, 1)
                s_utilized = round(s_released * util_rate, 1)
                db.add(DistrictFunding(
                    scheme_id=scheme.id, state=state, district=district, financial_year=FY,
                    allocated_cr=s_amount, released_cr=s_released, utilized_cr=s_utilized,
                    beneficiaries=round(beneficiaries * 0.6, 0),
                    source="DEMO — illustrative", data_status="DEMO", last_updated="",
                ))
    db.commit()
    print("✅ Seeded government funding intelligence data "
         f"({len(SCHEME_BUDGETS_2026_27)} scheme budgets, "
         f"{len(STATE_TOTALS_2026_27) + len(DEMO_STATE_SHARE)} states, "
         f"{sum(len(d) for d in STATE_DISTRICTS.values())} districts)")


def seed_relief_channels(db: Session):
    """Default relief channels for the Disaster Report widget's channel
    matching (see app/services/relief_channels.py). Idempotent — runs every
    startup but only inserts once, since each channel's active window is
    relative to when it's first created here (like other seeded demo data).

    Amounts are described in line with the *type* of support real Indian
    disaster-relief mechanisms provide (SDRF/NDRF input subsidy for weather
    disasters; advisory/spray-camp support, not direct cash, for pest and
    disease outbreaks) — farmers are told to confirm the exact current rate
    with their district relief cell rather than being given a number this
    platform cannot guarantee is current.
    """
    if db.query(ReliefChannel).first():
        return

    now = datetime.utcnow()
    channels = [
        ReliefChannel(
            name="Crop Fire Emergency Relief Fund",
            disaster_type="fire",
            description="For accidental fire damage to standing crops, stored produce, "
                       "or farm structures (not deliberate stubble burning).",
            region="All India",
            provides_money=True,
            amount_info="Input-subsidy assistance per the applicable State Disaster "
                       "Response Fund (SDRF) crop-damage norms. Confirm the current "
                       "per-hectare rate with your district relief cell — an officer "
                       "will assess actual loss before payout.",
            contact="District Disaster Management Authority / Tehsildar's office",
            active_from=now, active_until=now + timedelta(days=90),
        ),
        ReliefChannel(
            name="Flood & Waterlogging Crop Compensation Channel",
            disaster_type="flood",
            description="For crop loss from flooding, waterlogging, or heavy monsoon "
                       "runoff damage.",
            region="All India",
            provides_money=True,
            amount_info="SDRF input subsidy, typically higher for irrigated land than "
                       "rainfed (exact per-hectare rate set by the current SDRF norms). "
                       "Requires a field loss-assessment visit before payout.",
            contact="State Disaster Relief Cell",
            active_from=now, active_until=now + timedelta(days=120),
        ),
        ReliefChannel(
            name="Drought & Water Scarcity Relief Channel",
            disaster_type="drought",
            description="For crop failure or severe yield loss from prolonged dry "
                       "spells or irrigation-water shortage.",
            region="All India",
            provides_money=True,
            amount_info="SDRF drought input subsidy, plus fodder/drinking-water "
                       "support where declared. Confirm the current rate and whether "
                       "your district has an active drought declaration.",
            contact="District Agriculture Office",
            active_from=now, active_until=now + timedelta(days=180),
        ),
        ReliefChannel(
            name="Pest Outbreak Advisory & Spray Camp Support",
            disaster_type="pest",
            description="Rapid inspection and subsidised spray-camp support for a "
                       "sudden pest outbreak — this channel is advisory/in-kind "
                       "support, not a direct cash payout.",
            region="All India",
            provides_money=False,
            amount_info="No direct cash payment. Support is a Krishi Vigyan Kendra "
                       "(KVK) inspection visit plus access to subsidised pesticide/"
                       "spray-camp resources where the outbreak is confirmed.",
            contact="Krishi Vigyan Kendra (KVK) helpline",
            active_from=now, active_until=None,
        ),
        ReliefChannel(
            name="Crop Disease Outbreak Advisory Channel",
            disaster_type="disease",
            description="Rapid diagnosis support and treatment guidance for a "
                       "suspected crop disease outbreak.",
            region="All India",
            provides_money=False,
            amount_info="No direct cash payment. Support is expert diagnosis "
                       "confirmation and a treatment plan; large confirmed outbreaks "
                       "may separately qualify for SDRF crop-loss assistance once "
                       "assessed.",
            contact="Krishi Vigyan Kendra (KVK) helpline",
            active_from=now, active_until=None,
        ),
    ]
    db.add_all(channels)
    db.commit()
    print(f"✅ Seeded {len(channels)} default relief channels")
