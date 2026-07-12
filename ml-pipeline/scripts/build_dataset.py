"""Parses the raw openfootball season JSON files into a single chronological
matches table (data/processed/matches.csv), one row per played match.
"""

import json
from pathlib import Path

import pandas as pd

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
PROCESSED_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"


def extract_score(match: dict) -> tuple[int, int] | None:
    score = match.get("score")

    if score is None:
        return None

    if isinstance(score, list):
        return int(score[0]), int(score[1])

    ft = score.get("ft")

    if not ft:
        return None

    return int(ft[0]), int(ft[1])


def main() -> None:
    rows = []

    for path in sorted(RAW_DIR.glob("*.json")):
        season, league = path.stem.split("_", 1)
        data = json.loads(path.read_text())

        for match in data.get("matches", []):
            score = extract_score(match)

            if score is None:
                continue

            home_goals, away_goals = score
            outcome = "home" if home_goals > away_goals else "away" if away_goals > home_goals else "draw"

            rows.append({
                "season": season,
                "league": league,
                "date": match["date"],
                "time": match.get("time", "15:00"),
                "home_team": match["team1"],
                "away_team": match["team2"],
                "home_goals": home_goals,
                "away_goals": away_goals,
                "outcome": outcome,
            })

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(["date", "league"]).reset_index(drop=True)
    df["match_id"] = df.index.map(lambda i: f"m{i:06d}")

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / "matches.csv", index=False)

    print(f"{len(df)} matches across {df['league'].nunique()} leagues, "
          f"{df['date'].min().date()} to {df['date'].max().date()}")
    print(df["outcome"].value_counts(normalize=True).round(3).to_dict())


if __name__ == "__main__":
    main()
