"""Favicon fetching service."""
import logging
from typing import Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)


async def fetch_favicon(url: str) -> Optional[str]:
    """Attempt to fetch a favicon URL for a given website URL.
    
    Strategy:
    1. Try Google Favicon Service (most reliable)
    2. Try direct /favicon.ico
    3. Parse HTML for <link rel="icon"> (fallback)
    """
    try:
        parsed = urlparse(url)
        domain = parsed.netloc or parsed.path.split("/")[0]
        if not domain:
            return None

        # Strategy 1: Google Favicon Service (works for most sites)
        google_url = f"https://www.google.com/s2/favicons?domain={domain}&sz=64"
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.head(google_url)
            if resp.status_code == 200:
                return google_url

        # Strategy 2: Direct favicon.ico
        scheme = parsed.scheme or "https"
        direct_url = f"{scheme}://{domain}/favicon.ico"
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.head(direct_url)
            if resp.status_code == 200:
                return direct_url

    except Exception as e:
        logger.warning(f"Failed to fetch favicon for {url}: {e}")

    return None
