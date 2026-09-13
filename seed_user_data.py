import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from app.database.db import SessionLocal
from app.models.models import User, Farm, HarvestCalendar, LandListing
from datetime import datetime, timedelta

def run():
    db = SessionLocal()
    farmers = db.query(User).filter(User.role == "farmer").all()
    if not farmers:
        print("No farmer users found")
        return
        
    for user in farmers:
        print(f"Seeding for user {user.name} ({user.id})")
        
        # 1. Update Farm coordinates
        farm = db.query(Farm).filter(Farm.user_id == user.id).first()
        if not farm:
            farm = Farm(user_id=user.id, name="My Demo Farm", latitude=23.2599, longitude=77.4126, land_size_acres=5.0)
            db.add(farm)
            db.commit()
            db.refresh(farm)
        
        farm.latitude = 23.2599
        farm.longitude = 77.4126
            
        # 2. Add Harvest entries
        existing = db.query(HarvestCalendar).filter(HarvestCalendar.farmer_id == user.id).count()
        if existing == 0:
            h1 = HarvestCalendar(farm_id=farm.id, farmer_id=user.id, crop="Wheat", variety="Sharbati", sowing_date=datetime.now() - timedelta(days=90), expected_harvest_date=datetime.now() + timedelta(days=30), estimated_quantity_kg=2500, status="growing")
            h2 = HarvestCalendar(farm_id=farm.id, farmer_id=user.id, crop="Mustard", variety="Pusa", sowing_date=datetime.now() - timedelta(days=60), expected_harvest_date=datetime.now() + timedelta(days=45), estimated_quantity_kg=1200, status="growing")
            db.add_all([h1, h2])
            
        # 3. Add own listing for "My Land"
        own_listings = db.query(LandListing).filter(LandListing.farmer_id == user.id).count()
        if own_listings == 0:
            l1 = LandListing(
                farmer_id=user.id, title=f"5 Acres Fertile Land in Sehore ({user.name})", description="Good for wheat and soybean. Fully irrigated with tube well.",
                state="Madhya Pradesh", district="Sehore", area_acres=5.0, price_per_acre_per_season=15000,
                soil_type="Black Cotton Soil", water_source="Tube Well", status="active", available_from=datetime.now() + timedelta(days=10)
            )
            db.add(l1)
            
    # 4. Add a dummy contractor listing for everyone to browse
    other_user = db.query(User).filter(User.phone == "9999999999").first()
    if not other_user:
        other_user = User(name="Suresh (Demo Contractor)", phone="9999999999", role="farmer", hashed_password="dummy")
        db.add(other_user)
        db.commit()
        db.refresh(other_user)
        
    dummy_listings = db.query(LandListing).filter(LandListing.farmer_id == other_user.id).count()
    if dummy_listings == 0:
        l2 = LandListing(
            farmer_id=other_user.id, title="10 Acres near Bhopal Highway", description="Excellent road access. Suitable for vegetables or cash crops.",
            state="Madhya Pradesh", district="Bhopal", area_acres=10.0, price_per_acre_per_season=20000,
            soil_type="Alluvial", water_source="Canal", status="active", available_from=datetime.now()
        )
        db.add(l2)
        
    db.commit()
    print("Done seeding for all farmers.")

if __name__ == "__main__":
    run()
