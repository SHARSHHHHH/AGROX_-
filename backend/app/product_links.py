from urllib.parse import quote_plus

MARKETPLACES = {
    "amazon": "https://www.amazon.in/s?k={query}",
    "flipkart": "https://www.flipkart.com/search?q={query}",
    "indiamart": "https://dir.indiamart.com/search.mp?ss={query}",
    "bighaat": "https://www.bighaat.com/search?type=product&q={query}",
}

def generate_marketplace_links(product_name: str) -> dict:
    """Given a recommended product name (fertilizer/pesticide), return
    marketplace search URLs. Does NOT recommend products itself."""
    query = quote_plus(product_name.strip())
    return {
        site: url.format(query=query)
        for site, url in MARKETPLACES.items()
    }