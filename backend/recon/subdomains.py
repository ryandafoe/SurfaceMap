"""
subdomains.py — Subdomain enumeration via crt.sh.

Responsibilities:
- Accept a target domain as input
- Query the crt.sh Certificate Transparency API (https://crt.sh/?q=<domain>&output=json)
- Parse and deduplicate subdomain results from the JSON response
- Return a list of unique subdomains to the caller

Dependencies: httpx (async HTTP client)
"""

import httpx


async def fetch_subdomains(domain: str) -> list[str]:
    """
    Query crt.sh for subdomains of the given domain.

    Returns a sorted list of unique subdomains, excluding wildcards.
    Raises RuntimeError on network or parse failures.
    """
    url = f"https://crt.sh/?q=%.{domain}&output=json"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=30)
            response.raise_for_status()
    except httpx.TimeoutException:
        raise RuntimeError(f"Request to crt.sh timed out for domain: {domain}")
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"crt.sh returned HTTP {e.response.status_code} for domain: {domain}")
    except httpx.RequestError as e:
        raise RuntimeError(f"Network error querying crt.sh: {e}")

    try:
        entries = response.json()
    except Exception:
        raise RuntimeError("Failed to parse JSON response from crt.sh")

    subdomains = set()
    for entry in entries:
        # name_value can contain newline-separated names
        for name in entry.get("name_value", "").split("\n"):
            name = name.strip().lower()
            if name and not name.startswith("*"):
                subdomains.add(name)

    return sorted(subdomains)
