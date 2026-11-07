"""Join customer_profiles.json with golden_answers.csv + offers_catalog.csv into one file
the frontend can import. Usage: python3 -I build_profiles.py <data_pack_dir> <out.json>"""
import csv, json, sys, os

src, out = sys.argv[1], sys.argv[2]
profiles = json.load(open(os.path.join(src, "customer_profiles.json")))
golden = {r["customer_id"]: r for r in csv.DictReader(open(os.path.join(src, "data/golden_answers.csv")))}
offers = {r["offer_id"]: r for r in csv.DictReader(open(os.path.join(src, "data/offers_catalog.csv")))}
drivers = list(csv.DictReader(open(os.path.join(src, "data/value_drivers.csv"))))

# Short life-moment labels for the customer list (written from situations.csv context_summary).
moments = {
    "C001": "New job, better credit", "C002": "Hours cut, late payment", "C003": "Lease ending, high miles",
    "C004": "Wants a Tundra", "C005": "6 payments left", "C006": "Lease ending, low miles",
    "C007": "Baby on the way", "C008": "Income and credit up", "C009": "Open recall",
    "C010": "Moving to Denver", "C011": "Phone only", "C012": "Owes more than it's worth",
    "C013": "EV lease ending", "C014": "Two missed payments", "C015": "Extra cash monthly",
    "C016": "Long loan, negative equity", "C017": "Wants to keep leased car", "C018": "Due date vs payday",
    "C019": "Budget squeeze", "C020": "Tempted to trade early",
}

for p in profiles:
    cid = p["customer"]["customer_id"]
    g = dict(golden[cid])
    for k in ("value_if_completed_usd", "assumed_take_rate", "expected_value_usd"):
        g[k] = float(g[k]) if g[k] else 0.0
    g["value_driver_ids"] = [v for v in g["value_driver_ids"].split(",") if v] if g["value_driver_ids"] else []
    p["golden"] = g
    p["offer"] = offers.get(g["offer_id"])
    p["moment"] = moments[cid]

json.dump({"profiles": profiles, "valueDrivers": drivers}, open(out, "w"), indent=1)
print(f"wrote {len(profiles)} profiles -> {out}")
