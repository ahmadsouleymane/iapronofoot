"""Blends the XGBoost and LSTM probabilities (simple average) and reports the
final held-out accuracy/log-loss used to decide the API's default behavior.
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import xgboost as xgb
from sklearn.metrics import accuracy_score, log_loss

from train_lstm import MatchLSTM, build_sequences, to_tensors
from train_xgboost import FEATURE_COLUMNS, OUTCOME_TO_LABEL

PROCESSED_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


def xgb_test_probs():
    df = pd.read_csv(PROCESSED_DIR / "features.csv", parse_dates=["date"])
    df = pd.get_dummies(df, columns=["league"], prefix="league")
    league_cols = [c for c in df.columns if c.startswith("league_")]
    feature_cols = FEATURE_COLUMNS + league_cols
    df["label"] = df["outcome"].map(OUTCOME_TO_LABEL)

    test = df[df["date"] >= "2025-08-01"]

    booster = xgb.Booster()
    booster.load_model(str(MODELS_DIR / "xgboost_model.json"))
    dtest = xgb.DMatrix(test[feature_cols])

    return test["label"].to_numpy(), booster.predict(dtest)


def lstm_test_probs():
    df = build_sequences()
    test = df[df["date"] >= "2025-08-01"]
    test_home, test_away, test_labels = to_tensors(test)

    model = MatchLSTM()
    model.load_state_dict(torch.load(MODELS_DIR / "lstm_model.pt"))
    model.eval()

    with torch.no_grad():
        probs = torch.softmax(model(test_home, test_away), dim=1).numpy()

    return test_labels.numpy(), probs


def main() -> None:
    labels_xgb, probs_xgb = xgb_test_probs()
    labels_lstm, probs_lstm = lstm_test_probs()

    assert np.array_equal(labels_xgb, labels_lstm), "test set ordering mismatch between models"

    blended = (probs_xgb + probs_lstm) / 2
    preds = blended.argmax(axis=1)

    accuracy = accuracy_score(labels_xgb, preds)
    loss = log_loss(labels_xgb, blended, labels=[0, 1, 2])

    print(f"Blended (XGBoost + LSTM) test season 2025-26 ({len(labels_xgb)} matches):")
    print(f"  accuracy = {accuracy:.3f}")
    print(f"  log-loss = {loss:.3f}")

    metrics_path = MODELS_DIR / "metrics.json"
    metrics = json.loads(metrics_path.read_text())
    metrics["blended_test_accuracy"] = accuracy
    metrics["blended_test_log_loss"] = loss
    metrics_path.write_text(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
