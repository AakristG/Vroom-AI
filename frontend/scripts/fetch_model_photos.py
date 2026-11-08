"""Download a freely licensed photo per Toyota nameplate from Wikimedia Commons.

Usage: py -I frontend/scripts/fetch_model_photos.py frontend/public/media/models [slug ...]
Then copy manifest.json to backend/apps/vehicles/model_photos.json so the API uses the same photos.
Writes <slug>.jpg files and manifest.json (author, license, source page) into output_dir.
"""
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

UA = "HackUTD-ToyotaNextMove/1.0 (student hackathon project; image attribution script)"
WIDTH = 1280

# slug -> (Wikipedia article, NHTSA/account names that use it)
MODELS = {
    "4runner": ("Toyota 4Runner", ["4Runner"]),
    "86": ("Toyota 86", ["86", "GR86"]),
    "avalon": ("Toyota Avalon", ["Avalon", "Avalon Hybrid"]),
    "c-hr": ("Toyota C-HR", ["C-HR"]),
    "camry": ("Toyota Camry", ["Camry", "Camry Hybrid"]),
    "corolla": ("Toyota Corolla", ["Corolla", "Corolla Hybrid"]),
    "corolla-cross": ("Toyota Corolla Cross", ["Corolla Cross", "Corolla Cross Hybrid"]),
    "corolla-im": ("Toyota Auris", ["Corolla iM"]),
    "crown": ("File:2023 Toyota Crown Crossover G in Black, front left.jpg", ["Crown"]),
    "crown-signia": ("File:2025 Toyota Crown Signia Limited in Storm Cloud, front right, 2025-04-14.jpg", ["Crown Signia"]),
    "gr-corolla": ("Toyota GR Corolla", ["GR Corolla"]),
    "grand-highlander": ("Toyota Grand Highlander", ["Grand Highlander", "Grand Highlander Hybrid"]),
    "highlander": ("Toyota Highlander", ["Highlander", "Highlander Hybrid"]),
    "land-cruiser": ("Toyota Land Cruiser Prado", ["Land Cruiser"]),
    "mirai": ("Toyota Mirai", ["Mirai"]),
    "prius": ("Toyota Prius", ["Prius", "Prius Prime", "Prius Prime (PHEV)", "Prius Plug-in Hybrid"]),
    "prius-c": ("Toyota Aqua", ["Prius C", "Prius c"]),
    "rav4": ("Toyota RAV4", ["RAV4", "RAV4 Hybrid", "RAV4 Prime", "RAV4 Prime (PHEV)", "RAV4 Plug-in Hybrid"]),
    "sequoia": ("Toyota Sequoia", ["Sequoia"]),
    "sienna": ("Toyota Sienna", ["Sienna"]),
    "supra": ("File:2023 Toyota GR Supra 3.0 in Cu Later, Front Left, 04-23-2023.jpg", ["Supra", "GR Supra"]),
    "tacoma": ("Toyota Tacoma", ["Tacoma", "Tacoma Hybrid"]),
    "tundra": ("Toyota Tundra", ["Tundra", "Tundra Hybrid"]),
    "venza": ("Toyota Venza", ["Venza"]),
    "yaris": ("Toyota Yaris", ["Yaris", "Yaris iA"]),
    "bz4x": ("Toyota bZ4X", ["bZ4X", "bZ"]),
    "bz-woodland": ("File:2026 Toyota bZ Woodland au SIAM 2026.JPG", ["bZ Woodland"]),
}

FREE = re.compile(r"^(cc0|cc[- ]by|public domain|pd|gfdl|attribution)", re.I)


def fetch(url):
    for attempt in range(6):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or attempt == 5:
                raise
            wait = int(exc.headers.get("Retry-After") or 0) or 10 * (attempt + 1)
            print(f"     429, waiting {wait}s")
            time.sleep(wait)


def get_json(url, params):
    q = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
    return json.loads(fetch(f"{url}?{q}"))


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def lead_file(article):
    if article.startswith("File:"):
        return None, article[5:]
    data = get_json("https://en.wikipedia.org/w/api.php", {
        "action": "query", "titles": article, "prop": "pageimages", "piprop": "name", "redirects": 1,
    })
    page = data["query"]["pages"][0]
    return page.get("title"), page.get("pageimage")


def file_info(name):
    data = get_json("https://commons.wikimedia.org/w/api.php", {
        "action": "query", "titles": f"File:{name}", "prop": "imageinfo",
        "iiprop": "url|extmetadata", "iiurlwidth": WIDTH,
    })
    page = data["query"]["pages"][0]
    if page.get("missing"):
        return None
    return page["imageinfo"][0]


def download(url, dest):
    dest.write_bytes(fetch(url))


def main(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    mpath = out / "manifest.json"
    manifest = json.loads(mpath.read_text(encoding="utf-8")) if mpath.exists() else {}
    only = set(sys.argv[2:])
    for slug, (article, names) in MODELS.items():
        if (slug in manifest and not only) or (only and slug not in only):
            continue
        try:
            title, name = lead_file(article)
            if not name:
                print(f"SKIP {slug}: no lead image for {article}")
                continue
            info = file_info(name)
            if not info:
                print(f"SKIP {slug}: {name} not on Commons (likely non-free)")
                continue
            meta = info.get("extmetadata", {})
            lic = strip_tags(meta.get("LicenseShortName", {}).get("value"))
            if not FREE.match(lic):
                print(f"SKIP {slug}: license '{lic}'")
                continue
            ext = Path(urllib.parse.urlparse(info["thumburl"]).path).suffix.lower()
            if ext not in (".jpg", ".jpeg"):
                print(f"SKIP {slug}: {ext} file")
                continue
            dest = out / f"{slug}.jpg"
            download(info["thumburl"], dest)
            manifest[slug] = {
                "names": names,
                "file": f"{slug}.jpg",
                "article": title,
                "commons_file": name,
                "source_page": info["descriptionurl"],
                "author": strip_tags(meta.get("Artist", {}).get("value")) or "Unknown",
                "license": lic,
                "license_url": meta.get("LicenseUrl", {}).get("value"),
                "description": strip_tags(meta.get("ImageDescription", {}).get("value"))[:200],
            }
            print(f"OK   {slug}: {name} [{lic}] {dest.stat().st_size // 1024} KB")
        except Exception as exc:  # keep going; report what failed
            print(f"FAIL {slug}: {exc}")
        mpath.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        time.sleep(3)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1])
