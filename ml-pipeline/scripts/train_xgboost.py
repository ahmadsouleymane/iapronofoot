"""Trains the XGBoost 1X2 classifier on pre-match features, with a strict
chronological split (no shuffling) so evaluation reflects real forecasting
conditions: train on everything through 2023-24, validate on 2024-25, and
report a final held-out test on 2025-26 (the most recent complete season).
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score, log_loss

PROCESSED_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"

FEATURE_COLUMNS = [
    "elo_home", "elo_away", "elo_diff",
    "form_home", "form_away", "form_diff",
    "goals_scored_avg_home", "goals_conceded_avg_home",
    "goals_scored_avg_away", "goals_conceded_avg_away",
    "home_matches_played", "away_matches_played",
    "h2h_home_win_rate",
]

OUTCOME_TO_LABEL = {"home": 0, "draw": 1, "away": 2}
LABEL_TO_OUTCOME = {v: k for k, v in OUTCOME_TO_LABEL.items()}


def load_split():
    df = pd.read_csv(PROCESSED_DIR / "features.csv", parse_dates=["date"])
    df = pd.get_dummies(df, columns=["league"], prefix="league")
    league_cols = [c for c in df.columns if c.startswith("league_")]

    feature_cols = FEATURE_COLUMNS + league_cols
    df["label"] = df["outcome"].map(OUTCOME_TO_LABEL)

    train = df[df["date"] < "2024-08-01"]
    val = df[(df["date"] >= "2024-08-01") & (df["date"] < "2025-08-01")]
    test = df[df["date"] >= "2025-08-01"]

    return train, val, test, feature_cols


def main() -> None:
    train, val, test, feature_cols = load_split()
    print(f"train={len(train)} val={len(val)} test={len(test)}")

    dtrain = xgb.DMatrix(train[feature_cols], label=train["label"])
    dval = xgb.DMatrix(val[feature_cols], label=val["label"])
    dtest = xgb.DMatrix(test[feature_cols], label=test["label"])

    params = {
        "objective": "multi:softprob",
        "num_class": 3,
        "eval_metric": "mlogloss",
        "max_depth": 4,
        "eta": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "seed": 42,
    }

    booster = xgb.train(
        params,
        dtrain,
        num_boost_round=500,
        evals=[(dtrain, "train"), (dval, "val")],
        early_stopping_rounds=30,
        verbose_eval=50,
    )

    test_probs = booster.predict(dtest)
    test_preds = test_probs.argmax(axis=1)

    accuracy = accuracy_score(test["label"], test_preds)
    loss = log_loss(test["label"], test_probs, labels=[0, 1, 2])

    # Baseline: always predict the majority class ("home").
    baseline_preds = np.zeros(len(test))
    baseline_accuracy = accuracy_score(test["label"], baseline_preds)

    print(f"\nTest season 2025-26 ({len(test)} matches):")
    print(f"  model accuracy    = {accuracy:.3f}")
    print(f"  model log-loss    = {loss:.3f}")
    print(f"  baseline accuracy = {baseline_accuracy:.3f} (always predict home win)")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(MODELS_DIR / "xgboost_model.json"))
    (MODELS_DIR / "feature_columns.json").write_text(json.dumps(feature_cols))
    (MODELS_DIR / "metrics.json").write_text(json.dumps({
        "xgboost_test_accuracy": accuracy,
        "xgboost_test_log_loss": loss,
        "baseline_test_accuracy": baseline_accuracy,
        "test_matches": len(test),
    }, indent=2))


if __name__ == "__main__":
    main()
