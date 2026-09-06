"""Outbound proxy support for external integrations.

Only three features reach the public internet: Telegram notifications, favicon
lookup (via Google) and the exchange-rate API. In networks where those hosts are
blocked, the user can configure a single SOCKS/HTTP proxy in system settings that
is applied *only* to those requests. Nothing else in the app is affected, and the
proxy is never read from ambient environment variables.
"""
import logging
from typing import Optional
from urllib.parse import urlparse

import httpx
from sqlalchemy.orm import Session

from app.models import SystemConfig

logger = logging.getLogger(__name__)

# SystemConfig keys
PROXY_URL_KEY = "outbound_proxy_url"
PROXY_ENABLED_KEY = "outbound_proxy_enabled"

# Schemes httpx can route through (socks needs the `socksio` extra)
ALLOWED_PROXY_SCHEMES = ("socks5", "socks5h", "socks4", "http", "https")


def validate_proxy_url(url: str) -> str:
    """Return a cleaned proxy URL or raise ValueError if it is malformed."""
    cleaned = (url or "").strip()
    if not cleaned:
        return ""
    parsed = urlparse(cleaned)
    if parsed.scheme.lower() not in ALLOWED_PROXY_SCHEMES:
        raise ValueError(
            f"不支持的代理协议 '{parsed.scheme}'，可用: {', '.join(ALLOWED_PROXY_SCHEMES)}"
        )
    if not parsed.hostname:
        raise ValueError("代理地址缺少主机名")
    return cleaned


def get_proxy_url(db: Session) -> Optional[str]:
    """Return the configured proxy URL, or None when unset/disabled.

    Never falls back to HTTP(S)_PROXY / ALL_PROXY environment variables.
    """
    rows = {
        c.key: c.value
        for c in db.query(SystemConfig).filter(
            SystemConfig.key.in_([PROXY_URL_KEY, PROXY_ENABLED_KEY])
        ).all()
    }
    if rows.get(PROXY_ENABLED_KEY) != "true":
        return None
    url = (rows.get(PROXY_URL_KEY) or "").strip()
    return url or None


def build_async_client(proxy: Optional[str] = None, **kwargs) -> httpx.AsyncClient:
    """Create an ``httpx.AsyncClient``, routed through ``proxy`` when given.

    With no proxy the client is identical to a plain ``httpx.AsyncClient(**kwargs)``
    so existing behaviour is unchanged. When a proxy is set, ``trust_env`` is
    disabled so only the explicitly configured proxy is used.
    """
    if proxy:
        kwargs["proxy"] = proxy
        kwargs.setdefault("trust_env", False)
    return httpx.AsyncClient(**kwargs)
