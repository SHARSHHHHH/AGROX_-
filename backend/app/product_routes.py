from fastapi import APIRouter, Query
from app.product_links import generate_marketplace_links

router = APIRouter(prefix="/api/products", tags=["product-links"])

@router.get("/search-links")
def get_product_links(product_name: str = Query(..., description="Recommended fertilizer/pesticide name")):
    links = generate_marketplace_links(product_name)
    return {"product_name": product_name, "links": links}