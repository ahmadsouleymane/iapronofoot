"""Downloads historical + in-progress match data from the openfootball public-domain
dataset (https://github.com/openfootball/football.json) for the five domestic leagues
in scope. No API key required.
"""

import json
import urllib.request
import urllib.error
from pathlib import Path

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"

LEAGUES = {
    "premier-league": "en.1",
    "laliga": "es.1",
    "serie-a": "it.1",
    "bundesliga": "de.1",
    "ligue-1": "fr.1",
}

SEASONS = [
    "2016-17", "2017-18", "2018-19", "2019-20", "2020-21",
    "2021-22", "2022-23", "2023-24", "2024-25", "2025-26",
]

BASE_URL = "https://raw.githubusercontent.com/openfootball/football.json/master"


def fetch(season: str, league: str, code: str) -> None:
    url = f"{BASE_URL}/{season}/{code}.json"
    dest = RAW_DIR / f"{season}_{league}.json"

    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            data = response.read()
    except urllib.error.HTTPError as error:
        print(f"  skip {season} {league}: HTTP {error.code}")
        return

    dest.write_bytes(data)
    matches = json.loads(data).get("matches", [])
    print(f"  {season} {league}: {len(matches)} matches")


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    for league, code in LEAGUES.items():
        print(f"Fetching {league} ({code})")
        for season in SEASONS:
            fetch(season, league, code)


if __name__ == "__main__":
    main()
