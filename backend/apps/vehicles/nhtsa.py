from functools import lru_cache
import requests

BASE = "https://api.nhtsa.gov"


@lru_cache(maxsize=256)
def recalls_for(make: str, model: str, year: int) -> list[dict]:
    r = requests.get(
        f"{BASE}/recalls/recallsByVehicle",
        params={"make": make, "model": model, "modelYear": year},
        timeout=8,
    )
    r.raise_for_status()
    body = r.json()
    items = body.get("results") or body.get("Results") or []
    return [
        {
            "campaign": i.get("NHTSACampaignNumber"),
            "component": i.get("Component"),
            "summary": i.get("Summary"),
            "remedy": i.get("Remedy"),
        }
        for i in items
    ]


@lru_cache(maxsize=256)
def safety_rating_for(make: str, model: str, year: int) -> dict | None:
    r = requests.get(
        f"{BASE}/SafetyRatings/modelyear/{year}/make/{make}/model/{model}", timeout=8
    )
    r.raise_for_status()
    variants = r.json().get("Results") or []
    if not variants:
        return None
    vid = variants[0].get("VehicleId")
    r2 = requests.get(f"{BASE}/SafetyRatings/VehicleId/{vid}", timeout=8)
    r2.raise_for_status()
    res = (r2.json().get("Results") or [{}])[0]
    return {"overall": res.get("OverallRating"), "description": res.get("VehicleDescription")}
