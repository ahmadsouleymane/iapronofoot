"""Prediction API serving the contract consumed by src/libs/PredictionApi.ts
in the iapronofoot Next.js app:

  GET /fixtures?league=<id>&date=<yyyy-mm-dd>  -> Fixture[]
  GET /predict/<matchId>                        -> Prediction

Fixtures are served from real historical match data (openfootball, public
domain) for any date actually covered by the dataset. There is currently no
live fixture feed wired in, so requests for dates outside the dataset's
range return an empty list rather than fabricated matches -- see
ml-pipeline/README.md for what a production fixture feed integration would
need.

Predictions are produced by a blended XGBoost + LSTM model, using only
features available strictly before kickoff (no result leakage), so even
predictions for matches that already happened in the dataset are genuine
blind forecasts.
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import xgboost as xgb
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"
MODELS_DIR = BASE_DIR / "models"

sys.path.insert(0, str(BASE_DIR / "scripts"))
from train_xgboost import FEATURE_COLUMNS as BASE_FEATURE_COLUMNS  # noqa: E402
from train_lstm import MatchLSTM  # noqa: E402

API_KEY = os.environ.get("PREDICTION_API_KEY")
LABEL_TO_OUTCOME = {0: "home", 1: "draw", 2: "away"}

app = FastAPI(title="IAProNoFoot Prediction API")


class Fixture(BaseModel):
    id: str
    league: str
    homeTeam: str
    awayTeam: str
    kickoffAt: str


class Prediction(BaseModel):
    homeWinPct: float
    drawPct: float
    awayWinPct: float
    predictedOutcome: str
    confidence: float


MATCHES = pd.read_csv(PROCESSED_DIR / "matches.csv", parse_dates=["date"])
FEATURES = pd.read_csv(PROCESSED_DIR / "features.csv", parse_dates=["date"]).set_index("match_id")
ALL_FEATURE_COLUMNS: list[str] = json.loads((MODELS_DIR / "feature_columns.json").read_text())
LEAGUE_COLUMNS = [c for c in ALL_FEATURE_COLUMNS if c.startswith("league_")]

BOOSTER = xgb.Booster()
BOOSTER.load_model(str(MODELS_DIR / "xgboost_model.json"))

LSTM_MODEL = MatchLSTM()
LSTM_MODEL.load_state_dict(torch.load(MODELS_DIR / "lstm_model.pt"))
LSTM_MODEL.eval()


def check_auth(authorization: str | None) -> None:
    if not API_KEY:
        return

    if not authorization or authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@app.get("/fixtures", response_model=list[Fixture])
def get_fixtures(league: str, date: str, authorization: str | None = Header(default=None)):
    check_auth(authorization)

    subset = MATCHES[(MATCHES["league"] == league) & (MATCHES["date"].dt.strftime("%Y-%m-%d") == date)]

    return [
        Fixture(
            id=row.match_id,
            league=row.league,
            homeTeam=row.home_team,
            awayTeam=row.away_team,
            kickoffAt=f"{row.date.strftime('%Y-%m-%d')}T{row.time}:00Z",
        )
        for row in subset.itertuples()
    ]


def _xgb_probs(feature_row: pd.Series) -> np.ndarray:
    values = [float(feature_row[name]) for name in BASE_FEATURE_COLUMNS]
    values += [1.0 if name == f"league_{feature_row['league']}" else 0.0 for name in LEAGUE_COLUMNS]

    dmatrix = xgb.DMatrix(np.array(values, dtype=np.float32).reshape(1, -1), feature_names=ALL_FEATURE_COLUMNS)
    return BOOSTER.predict(dmatrix)[0]


def _team_sequence_before(team: str, match_date) -> torch.Tensor:
    """Rebuilds a team's last-10-match sequence strictly before match_date (no leakage)."""
    history = MATCHES[MATCHES["date"] < match_date]
    team_matches = history[(history["home_team"] == team) | (history["away_team"] == team)].tail(10)

    steps = []
    for row in team_matches.itertuples():
        is_home = row.home_team == team
        goal_diff = (row.home_goals - row.away_goals) if is_home else (row.away_goals - row.home_goals)
        won = (row.outcome == "home" and is_home) or (row.outcome == "away" and not is_home)
        points = 3 if won else 1 if row.outcome == "draw" else 0
        steps.append([points / 3.0, float(np.clip(goal_diff, -5, 5)) / 5.0, 1.0 if is_home else 0.0])

    padded = [[0.0, 0.0, 0.0]] * (10 - len(steps)) + steps
    return torch.tensor(np.array(padded, dtype=np.float32)).unsqueeze(0)


def _lstm_probs(home_team: str, away_team: str, match_date) -> np.ndarray:
    home_seq = _team_sequence_before(home_team, match_date)
    away_seq = _team_sequence_before(away_team, match_date)

    with torch.no_grad():
        logits = LSTM_MODEL(home_seq, away_seq)
        return torch.softmax(logits, dim=1).numpy()[0]


@app.get("/predict/{match_id}", response_model=Prediction)
def predict(match_id: str, authorization: str | None = Header(default=None)):
    check_auth(authorization)

    if match_id not in FEATURES.index:
        raise HTTPException(status_code=404, detail="Unknown match id")

    feature_row = FEATURES.loc[match_id]

    xgb_probs = _xgb_probs(feature_row)
    lstm_probs = _lstm_probs(feature_row["home_team"], feature_row["away_team"], feature_row["date"])
    blended = (xgb_probs + lstm_probs) / 2
    predicted_label = int(blended.argmax())

    return Prediction(
        homeWinPct=round(float(blended[0]) * 100, 1),
        drawPct=round(float(blended[1]) * 100, 1),
        awayWinPct=round(float(blended[2]) * 100, 1),
        predictedOutcome=LABEL_TO_OUTCOME[predicted_label],
        confidence=round(float(blended[predicted_label]), 3),
    )


@app.get("/health")
def health():
    return {"status": "ok", "matches": len(MATCHES), "leagues": sorted(MATCHES["league"].unique().tolist())}
