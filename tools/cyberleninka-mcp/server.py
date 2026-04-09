"""
CyberLeninka MCP Server — search and retrieve articles from cyberleninka.ru,
the largest Russian open-access academic database.

Usage:
    python server.py          # stdio transport (default for MCP)
    python server.py --sse    # SSE transport for HTTP
"""

from __future__ import annotations

import asyncio
import html
import json
import re
import time
from typing import Any
from urllib.parse import urljoin

import httpx
from fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "https://cyberleninka.ru"
SEARCH_API = f"{BASE_URL}/api/search"
PAGE_SIZE = 10  # CyberLeninka default

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": BASE_URL,
    "Referer": f"{BASE_URL}/search",
}

HTML_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml",
}

# Rate-limiting: minimum interval between requests (seconds)
_MIN_INTERVAL = 1.0
_last_request_time: float = 0.0
_rate_lock = asyncio.Lock()

# ---------------------------------------------------------------------------
# MCP app
# ---------------------------------------------------------------------------

mcp = FastMCP(
    "CyberLeninka",
    instructions=(
        "Search and retrieve open-access academic articles from CyberLeninka "
        "(cyberleninka.ru) — the largest Russian scientific paper repository."
    ),
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _strip_html(text: str | None) -> str:
    """Remove HTML tags and decode entities."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return text.strip()


async def _rate_limit() -> None:
    """Enforce polite rate-limiting (1 req/sec)."""
    global _last_request_time
    async with _rate_lock:
        now = time.monotonic()
        wait = _MIN_INTERVAL - (now - _last_request_time)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_request_time = time.monotonic()


async def _fetch_json(payload: dict[str, Any]) -> dict[str, Any]:
    """POST to the CyberLeninka search API and return parsed JSON."""
    await _rate_limit()
    async with httpx.AsyncClient(
        headers=HEADERS, timeout=20, follow_redirects=True
    ) as client:
        resp = await client.post(SEARCH_API, json=payload)
        resp.raise_for_status()
        return resp.json()


async def _fetch_html(url: str) -> str:
    """GET an HTML page from CyberLeninka."""
    await _rate_limit()
    async with httpx.AsyncClient(
        headers=HTML_HEADERS, timeout=20, follow_redirects=True
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.text


def _parse_search_results(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Convert raw API response into a clean list of article dicts."""
    articles: list[dict[str, Any]] = []
    for item in data.get("articles", []):
        article = {
            "title": _strip_html(item.get("name", "")),
            "authors": item.get("authors", []),
            "year": item.get("year"),
            "journal": item.get("journal", ""),
            "journal_url": urljoin(BASE_URL, item["journal_link"])
            if item.get("journal_link")
            else None,
            "snippet": _strip_html(item.get("annotation", "")),
            "url": urljoin(BASE_URL, item["link"]) if item.get("link") else None,
        }
        articles.append(article)
    return articles


def _extract_meta(html_text: str, name: str, multiple: bool = False) -> str | list[str]:
    """Extract <meta> content by name or property attribute."""
    pattern = re.compile(
        rf'<meta\s+[^>]*(?:name|property)="{re.escape(name)}"'
        rf'[^>]*content="([^"]*)"',
        re.IGNORECASE,
    )
    if multiple:
        return [html.unescape(m.group(1)) for m in pattern.finditer(html_text)]
    m = pattern.search(html_text)
    return html.unescape(m.group(1)) if m else ""


def _extract_full_text(html_text: str, max_chars: int = 5000) -> str:
    """Extract article full text from the OCR div."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html_text, "html.parser")
    # CyberLeninka stores full text in <div class="ocr"> or <div itemprop="articleBody">
    el = soup.select_one('div[itemprop="articleBody"]') or soup.select_one("div.ocr")
    if not el:
        return ""
    text = el.get_text(separator="\n", strip=True)
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[... truncated ...]"
    return text


def _extract_keywords(html_text: str) -> list[str]:
    """Extract keywords from citation_keywords meta tag."""
    raw = _extract_meta(html_text, "citation_keywords")
    if not raw:
        return []
    return [kw.strip() for kw in raw.split(",") if kw.strip()]


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
async def search_articles(
    query: str,
    year_from: int | None = None,
    year_to: int | None = None,
    page: int = 1,
) -> str:
    """Search CyberLeninka for academic articles.

    Args:
        query: Search query string (Russian or English).
        year_from: Filter results — minimum publication year (inclusive).
        year_to: Filter results — maximum publication year (inclusive).
        page: Results page number (1-based, 10 results per page).

    Returns:
        JSON object with `found` (total hits) and `articles` array.
        Each article has: title, authors, year, journal, snippet, url.
    """
    if page < 1:
        page = 1

    payload: dict[str, Any] = {
        "mode": "articles",
        "q": query,
        "size": PAGE_SIZE,
        "from": (page - 1) * PAGE_SIZE,
    }
    if year_from is not None:
        payload["year_from"] = int(year_from)
    if year_to is not None:
        payload["year_to"] = int(year_to)

    try:
        data = await _fetch_json(payload)
    except httpx.HTTPStatusError as exc:
        return json.dumps(
            {"error": f"HTTP {exc.response.status_code}", "detail": str(exc)},
            ensure_ascii=False,
        )
    except httpx.RequestError as exc:
        return json.dumps(
            {"error": "network_error", "detail": str(exc)},
            ensure_ascii=False,
        )

    articles = _parse_search_results(data)

    result = {
        "query": query,
        "page": page,
        "found": data.get("found", 0),
        "articles": articles,
    }
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
async def get_article(url: str) -> str:
    """Fetch a CyberLeninka article and extract structured metadata + text.

    Args:
        url: Full URL or path of a CyberLeninka article,
             e.g. "https://cyberleninka.ru/article/n/slug-here"
             or just "/article/n/slug-here".

    Returns:
        JSON object with: title, authors, year, journal, abstract,
        keywords, full_text (first ~5000 chars), pdf_url, article_url.
    """
    # Normalise URL
    if url.startswith("/"):
        url = urljoin(BASE_URL, url)
    if not url.startswith("http"):
        url = f"{BASE_URL}/article/n/{url}"

    try:
        html_text = await _fetch_html(url)
    except httpx.HTTPStatusError as exc:
        return json.dumps(
            {"error": f"HTTP {exc.response.status_code}", "detail": str(exc)},
            ensure_ascii=False,
        )
    except httpx.RequestError as exc:
        return json.dumps(
            {"error": "network_error", "detail": str(exc)},
            ensure_ascii=False,
        )

    # Extract from meta tags (most reliable)
    title = _extract_meta(html_text, "citation_title")
    authors = _extract_meta(html_text, "citation_author", multiple=True)
    year_str = _extract_meta(html_text, "citation_publication_date")
    journal = _extract_meta(html_text, "citation_journal_title")
    pdf_url = _extract_meta(html_text, "citation_pdf_url")
    volume = _extract_meta(html_text, "citation_volume")
    issue = _extract_meta(html_text, "citation_issue")
    issn = _extract_meta(html_text, "citation_issn")
    publisher = _extract_meta(html_text, "citation_publisher")
    pages = _extract_meta(html_text, "eprints.pagerange")

    # Abstract — try eprints.abstract (may have two: Russian + English)
    abstracts = _extract_meta(html_text, "eprints.abstract", multiple=True)
    abstract = "\n\n".join(abstracts) if abstracts else _extract_meta(html_text, "og:description")

    keywords = _extract_keywords(html_text)
    full_text = _extract_full_text(html_text)

    year: int | None = None
    try:
        year = int(year_str)
    except (ValueError, TypeError):
        pass

    result = {
        "title": title,
        "authors": authors,
        "year": year,
        "journal": journal,
        "volume": volume or None,
        "issue": issue or None,
        "pages": pages or None,
        "issn": issn or None,
        "publisher": publisher or None,
        "abstract": abstract,
        "keywords": keywords,
        "full_text": full_text,
        "pdf_url": pdf_url or None,
        "article_url": url,
    }
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
async def search_by_topic(
    topic: str,
    year_from: int | None = None,
    year_to: int | None = None,
    page: int = 1,
) -> str:
    """Search CyberLeninka by scientific topic or category.

    Convenience wrapper around search_articles that searches for a
    scientific topic and optionally filters by publication year range.

    Args:
        topic: Scientific topic or category name (e.g. "квантовая физика",
               "machine learning", "биоинформатика").
        year_from: Minimum publication year (inclusive).
        year_to: Maximum publication year (inclusive).
        page: Results page number (1-based).

    Returns:
        JSON object with `found` (total hits) and `articles` array,
        same structure as search_articles.
    """
    return await search_articles(
        query=topic,
        year_from=year_from,
        year_to=year_to,
        page=page,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    transport = "sse" if "--sse" in sys.argv else "stdio"
    mcp.run(transport=transport)
