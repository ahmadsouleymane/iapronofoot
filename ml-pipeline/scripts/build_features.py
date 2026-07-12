"""Builds pre-match features for every match in data/processed/matches.csv,
strictly from information available before kickoff (no leakage): Elo ratings,
rolling form, rolling goal averages, and head-to-head history.

Also persists the final Elo/form state per team so the serving API can compute
features for a team's *next* match without recomputing the whole history.
"""

import json
from collections import defaultdict, deque
from pathlib import Path

import pandas as pd

PROCESSED_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"

BASE_ELO = 1500.0
HOME_ADVANTAGE = 60.0
K_FACTOR = 20.0
FORM_WINDOW = 5
H2H_WINDOW = 5


def expected_score(elo_a: float, elo_b: float) -> float:
    return 1.0 / (1.0 + 10 ** ((elo_b - elo_a) / 400.0))


def goal_diff_multiplier(goal_diff: int) -> float:
    # Lightweight version of the FiveThirtyEight-style margin-of-victory multiplier.
    import math
    return math.log(abs(goal_diff) + 1) + 1.0


def update_elo(elo_home: float, elo_away: float, home_goals: int, away_goals: int) -> tuple[float, float]:
    if home_goals > away_goals:
        score_home = 1.0
    elif home_goals < away_goals:
        score_home = 0.0
    else:
        score_home = 0.5

    expected_home = expected_score(elo_home + HOME_ADVANTAGE, elo_away)
    multiplier = goal_diff_multiplier(home_goals - away_goals)
    delta = K_FACTOR * multiplier * (score_home - expected_home)

    return elo_home + delta, elo_away - delta


def main() -> None:
    matches = pd.read_csv(PROCESSED_DIR / "matches.csv", parse_dates=["date"])
    matches = matches.sort_values(["date", "match_id"]).reset_index(drop=True)

    elo: dict[str, float] = defaultdict(lambda: BASE_ELO)
    recent_results: dict[str, deque] = defaultdict(lambda: deque(maxlen=FORM_WINDOW))
    goals_scored: dict[str, deque] = defaultdict(lambda: deque(maxlen=FORM_WINDOW))
    goals_conceded: dict[str, deque] = defaultdict(lambda: deque(maxlen=FORM_WINDOW))
    matches_played: dict[str, int] = defaultdict(int)
    h2h: dict[tuple[str, str], deque] = defaultdict(lambda: deque(maxlen=H2H_WINDOW))

    feature_rows = []

    for row in matches.itertuples():
        home, away = row.home_team, row.away_team

        elo_home, elo_away = elo[home], elo[away]
        form_home = sum(recent_results[home]) if recent_results[home] else 0
        form_away = sum(recent_results[away]) if recent_results[away] else 0
        gs_home = sum(goals_scored[home]) / len(goals_scored[home]) if goals_scored[home] else 1.3
        gc_home = sum(goals_conceded[home]) / len(goals_conceded[home]) if goals_conceded[home] else 1.3
        gs_away = sum(goals_scored[away]) / len(goals_scored[away]) if goals_scored[away] else 1.1
        gc_away = sum(goals_conceded[away]) / len(goals_conceded[away]) if goals_conceded[away] else 1.1

        h2h_key = tuple(sorted([home, away]))
        past_meetings = h2h[h2h_key]
        if past_meetings:
            h2h_home_win_rate = sum(1 for winner in past_meetings if winner == home) / len(past_meetings)
        else:
            h2h_home_win_rate = 1 / 3

        feature_rows.append({
            "match_id": row.match_id,
            "date": row.date,
            "league": row.league,
            "home_team": home,
            "away_team": away,
            "elo_home": elo_home,
            "elo_away": elo_away,
            "elo_diff": elo_home - elo_away,
            "form_home": form_home,
            "form_away": form_away,
            "form_diff": form_home - form_away,
            "goals_scored_avg_home": gs_home,
            "goals_conceded_avg_home": gc_home,
            "goals_scored_avg_away": gs_away,
            "goals_conceded_avg_away": gc_away,
            "home_matches_played": matches_played[home],
            "away_matches_played": matches_played[away],
            "h2h_home_win_rate": h2h_home_win_rate,
            "outcome": row.outcome,
        })

        # Update state AFTER recording pre-match features, so nothing leaks.
        points_home = 3 if row.outcome == "home" else 1 if row.outcome == "draw" else 0
        points_away = 3 if row.outcome == "away" else 1 if row.outcome == "draw" else 0
        recent_results[home].append(points_home)
        recent_results[away].append(points_away)
        goals_scored[home].append(row.home_goals)
        goals_conceded[home].append(row.away_goals)
        goals_scored[away].append(row.away_goals)
        goals_conceded[away].append(row.home_goals)
        matches_played[home] += 1
        matches_played[away] += 1

        winner = home if row.outcome == "home" else away if row.outcome == "away" else None
        if winner:
            h2h[h2h_key].append(winner)

        new_elo_home, new_elo_away = update_elo(elo_home, elo_away, row.home_goals, row.away_goals)
        elo[home], elo[away] = new_elo_home, new_elo_away

    features = pd.DataFrame(feature_rows)
    features.to_csv(PROCESSED_DIR / "features.csv", index=False)

    # Persist final per-team state for the serving API (predicting future matches).
    state = {
        "elo": dict(elo),
        "recent_results": {team: list(dq) for team, dq in recent_results.items()},
        "goals_scored": {team: list(dq) for team, dq in goals_scored.items()},
        "goals_conceded": {team: list(dq) for team, dq in goals_conceded.items()},
        "matches_played": dict(matches_played),
        "h2h": {f"{a}|||{b}": list(dq) for (a, b), dq in h2h.items()},
    }
    (PROCESSED_DIR / "team_state.json").write_text(json.dumps(state))

    print(f"{len(features)} feature rows written to features.csv")
    print(features[["elo_diff", "form_diff", "h2h_home_win_rate"]].describe().round(2))


if __name__ == "__main__":
    main()
