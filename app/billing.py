from __future__ import annotations

import os


def config_for(user: dict | None) -> dict:
    addr = (os.getenv("USDT_TRC20_ADDRESS") or "").strip()
    amount = float(os.getenv("USDT_AMOUNT", "16") or 16)
    status = "none"
    if user:
        status = user.get("payment_status") or "none"
    return {
        "usdt_address": addr,
        "amount_usdt": amount,
        "network": "TRC20",
        "network_label": "TRX Tron (TRC20)",
        "payment_status": status,
        "plan_price_label": f"US${amount:g} / mes",
    }
