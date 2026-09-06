"""Telegram notification service."""
import logging
from typing import Optional

from app.services.http_proxy import build_async_client

logger = logging.getLogger(__name__)


async def send_telegram_message(
    bot_token: str,
    chat_id: str,
    message: str,
    parse_mode: str = "HTML",
    proxy: Optional[str] = None,
) -> bool:
    """Send a message via Telegram Bot API.

    Optionally routed through ``proxy`` (SOCKS/HTTP) for networks that block
    ``api.telegram.org``.

    Returns True if successful, False otherwise.
    """
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": parse_mode,
    }

    try:
        async with build_async_client(proxy, timeout=15) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("ok"):
                    logger.info(f"Telegram message sent to {chat_id}")
                    return True
            logger.error(f"Telegram API error: {resp.status_code} - {resp.text}")
    except Exception as e:
        logger.error(f"Telegram message send failed: {e}")

    return False


def format_expiry_reminder(subscription_name: str, end_date, days_left: int) -> str:
    """Format an expiry reminder message."""
    emoji = "⚠️" if days_left <= 3 else "📢"
    return (
        f"{emoji} <b>订阅到期提醒</b>\n\n"
        f"📌 <b>{subscription_name}</b>\n"
        f"📅 到期日期: {end_date}\n"
        f"⏳ 剩余: <b>{days_left} 天</b>\n\n"
        f"{'🔴 即将到期，请及时处理！' if days_left <= 3 else '请注意续期时间。'}"
    )


def format_auto_renewal(subscription_name: str, cost_original, currency, new_end_date) -> str:
    """Format an auto-renewal notification."""
    return (
        f"🔄 <b>订阅自动续期</b>\n\n"
        f"📌 <b>{subscription_name}</b>\n"
        f"💰 费用: {cost_original} {currency}\n"
        f"📅 新到期日: {new_end_date}"
    )


def format_monthly_report(year: int, month: int, total_cost, currency: str, breakdown: list) -> str:
    """Format a monthly spending report."""
    lines = [
        f"📊 <b>{year}年{month}月 订阅支出报告</b>\n",
        f"💰 总支出: <b>{total_cost} {currency}</b>\n",
    ]

    if breakdown:
        lines.append("📂 <b>按分类统计:</b>")
        for item in breakdown:
            lines.append(f"  • {item['category_name']}: {item['total_cost']} {currency} ({item['subscription_count']}个)")

    return "\n".join(lines)
