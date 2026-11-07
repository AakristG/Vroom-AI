import csv
import json
from pathlib import Path
from typing import Dict, List, Any

DATA_PACK_DIR = Path(__file__).resolve().parent.parent.parent / "data_pack"

class TFSEngine:
    def __init__(self):
        self.starter_prompt: str = ""
        self.profiles_by_id: Dict[str, Dict[str, Any]] = {}
        self.tables: Dict[str, List[Dict[str, Any]]] = {}
        self.active_ui_state: Dict[str, Dict[str, Any]] = {}
        self.load_data()

    def load_data(self):
        prompt_file = DATA_PACK_DIR / "starter_system_prompt.txt"
        if prompt_file.exists():
            self.starter_prompt = prompt_file.read_text(encoding="utf-8")

        profiles_file = DATA_PACK_DIR / "customer_profiles.json"
        if profiles_file.exists():
            raw_profiles = json.loads(profiles_file.read_text(encoding="utf-8"))
            if isinstance(raw_profiles, list):
                for p in raw_profiles:
                    cid = p.get("customer_id") or p.get("customer", {}).get("customer_id")
                    if cid:
                        self.profiles_by_id[cid] = p
            elif isinstance(raw_profiles, dict):
                self.profiles_by_id = raw_profiles

        csv_dir = DATA_PACK_DIR / "data"
        if csv_dir.exists():
            for f in csv_dir.glob("*.csv"):
                with open(f, mode="r", encoding="utf-8-sig") as csvfile:
                    self.tables[f.stem] = list(csv.DictReader(csvfile))

    def get_all_customers_summary(self) -> List[Dict[str, Any]]:
        customers = self.tables.get("customers", [])
        vehicles = {v["customer_id"]: v for v in self.tables.get("vehicles", [])}
        accounts = {a["customer_id"]: a for a in self.tables.get("accounts", [])}
        situations = {s["customer_id"]: s for s in self.tables.get("situations", [])}

        result = []
        for c in customers:
            cid = c["customer_id"]
            v = vehicles.get(cid, {})
            a = accounts.get(cid, {})
            s = situations.get(cid, {})
            result.append({
                "customer_id": cid,
                "first_name": c.get("first_name"),
                "city": c.get("city"),
                "occupation": c.get("occupation"),
                "credit_tier_now": c.get("credit_tier_now"),
                "vulnerable_flag": c.get("vulnerable_flag"),
                "vehicle": f"{v.get('model_year', '')} Toyota {v.get('model', '')} {v.get('trim', '')}".strip(),
                "contract_type": a.get("contract_type"),
                "monthly_payment": float(a.get("monthly_payment") or 0),
                "situation_prompt": s.get("customer_says", ""),
                "context_summary": s.get("context_summary", "")
            })
        return result

    def evaluate_customer_guardrails_and_options(self, customer_id: str) -> Dict[str, Any]:
        customer = next((c for c in self.tables.get("customers", []) if c["customer_id"] == customer_id), None)
        account = next((a for a in self.tables.get("accounts", []) if a["customer_id"] == customer_id), None)
        vehicle = next((v for v in self.tables.get("vehicles", []) if v["customer_id"] == customer_id), None)
        situation = next((s for s in self.tables.get("situations", []) if s["customer_id"] == customer_id), None)
        options = [o for o in self.tables.get("option_scenarios", []) if o["customer_id"] == customer_id]
        offers_map = {of["offer_id"]: of for of in self.tables.get("offers_catalog", [])}

        if not customer or not account:
            return {"error": f"Customer {customer_id} not found"}

        missed_payments = int(account.get("missed_payments_12m") or 0)
        vulnerable_flag = customer.get("vulnerable_flag", "N") == "Y"
        marketing_consent = customer.get("marketing_consent", "Y") == "Y"

        is_protected_hardship = vulnerable_flag or (missed_payments >= 2)
        active_guardrails = []

        if is_protected_hardship:
            active_guardrails.append(
                "RULE_6_HARDSHIP_PROTECTION: Customer has vulnerable_flag=Y or >=2 missed payments. "
                "STRICTLY BLOCK all upsells/marketing. Offer a human specialist (Follow-up)."
            )
        if not marketing_consent:
            active_guardrails.append(
                "RULE_7_NO_MARKETING_CONSENT: Customer has marketing_consent=N. "
                "Do NOT present new-vehicle purchase or trade-in marketing offers."
            )

        verified_options = []
        for opt in options:
            opt_id = opt["option_id"]
            is_eligible = opt.get("eligibility") == "Y"

            if not marketing_consent and opt_id in ["TRADE", "UPGRADE", "NEW_LEASE"]:
                continue
            if is_protected_hardship and opt_id in ["TRADE", "UPGRADE", "EXTRA_PAY"]:
                continue

            offer_meta = offers_map.get(opt_id, {})
            verified_options.append({
                "option_id": opt_id,
                "option_name": opt["option_name"],
                "eligible": is_eligible,
                "new_monthly_payment": float(opt["new_monthly_payment"] or 0),
                "monthly_payment_change": float(opt["monthly_payment_change"] or 0),
                "upfront_cost": float(opt["upfront_cost"] or 0),
                "total_cost_vs_keep_as_is": float(opt["total_cost_vs_keep_as_is"] or 0),
                "plain_language_summary": opt["plain_language_summary"],
                "key_assumption": opt["key_assumption"],
                "tradeoff": opt["tradeoff"],
                "next_step_type": "Follow-up" if is_protected_hardship else offer_meta.get("next_step_type", "Self-service"),
                "business_value": offer_meta.get("business_value", "Retention & customer trust"),
                "service_effort": offer_meta.get("service_effort", "Low (digital)")
            })

        return {
            "customer": customer,
            "account": account,
            "vehicle": vehicle,
            "situation": situation,
            "active_guardrails": active_guardrails,
            "is_protected_hardship": is_protected_hardship,
            "verified_options": verified_options,
            "value_drivers": self.tables.get("value_drivers", [])
        }

tfs_engine = TFSEngine()