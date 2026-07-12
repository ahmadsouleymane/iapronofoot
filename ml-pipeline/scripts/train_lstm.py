"""Trains an LSTM over each team's recent match sequence (last 10 results,
goal difference, home/away flag) to capture momentum patterns that the
tabular XGBoost model does not see directly. Predictions from both models
are blended (simple average) for the final served probabilities.
"""

import json
from collections import defaultdict, deque
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, log_loss
from torch import nn

PROCESSED_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"

SEQ_LEN = 10
FEATURES_PER_STEP = 3  # [result_points_normalized, goal_diff_normalized, was_home]
OUTCOME_TO_LABEL = {"home": 0, "draw": 1, "away": 2}


def build_sequences():
    matches = pd.read_csv(PROCESSED_DIR / "matches.csv", parse_dates=["date"])
    matches = matches.sort_values(["date", "match_id"]).reset_index(drop=True)

    history: dict[str, deque] = defaultdict(lambda: deque(maxlen=SEQ_LEN))
    rows = []

    for row in matches.itertuples():
        home, away = row.home_team, row.away_team

        def seq_array(team: str) -> np.ndarray:
            seq = list(history[team])
            padded = [[0.0, 0.0, 0.0]] * (SEQ_LEN - len(seq)) + seq
            return np.array(padded, dtype=np.float32)

        rows.append({
            "match_id": row.match_id,
            "date": row.date,
            "home_seq": seq_array(home),
            "away_seq": seq_array(away),
            "label": OUTCOME_TO_LABEL[row.outcome],
        })

        points_home = 3 if row.outcome == "home" else 1 if row.outcome == "draw" else 0
        points_away = 3 if row.outcome == "away" else 1 if row.outcome == "draw" else 0
        goal_diff_home = row.home_goals - row.away_goals

        history[home].append([points_home / 3.0, np.clip(goal_diff_home, -5, 5) / 5.0, 1.0])
        history[away].append([points_away / 3.0, np.clip(-goal_diff_home, -5, 5) / 5.0, 0.0])

    return pd.DataFrame(rows)


class MatchLSTM(nn.Module):
    def __init__(self, hidden_size: int = 16):
        super().__init__()
        self.home_lstm = nn.LSTM(FEATURES_PER_STEP, hidden_size, batch_first=True)
        self.away_lstm = nn.LSTM(FEATURES_PER_STEP, hidden_size, batch_first=True)
        self.head = nn.Sequential(
            nn.Linear(hidden_size * 2, 32),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(32, 3),
        )

    def forward(self, home_seq: torch.Tensor, away_seq: torch.Tensor) -> torch.Tensor:
        _, (home_h, _) = self.home_lstm(home_seq)
        _, (away_h, _) = self.away_lstm(away_seq)
        combined = torch.cat([home_h[-1], away_h[-1]], dim=1)
        return self.head(combined)


def to_tensors(df: pd.DataFrame):
    home = torch.tensor(np.stack(df["home_seq"].to_numpy()), dtype=torch.float32)
    away = torch.tensor(np.stack(df["away_seq"].to_numpy()), dtype=torch.float32)
    labels = torch.tensor(df["label"].to_numpy(), dtype=torch.long)
    return home, away, labels


def main() -> None:
    df = build_sequences()

    train = df[df["date"] < "2024-08-01"]
    val = df[(df["date"] >= "2024-08-01") & (df["date"] < "2025-08-01")]
    test = df[df["date"] >= "2025-08-01"]
    print(f"train={len(train)} val={len(val)} test={len(test)}")

    train_home, train_away, train_labels = to_tensors(train)
    val_home, val_away, val_labels = to_tensors(val)
    test_home, test_away, test_labels = to_tensors(test)

    torch.manual_seed(42)
    model = MatchLSTM()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-5)
    criterion = nn.CrossEntropyLoss()

    batch_size = 256
    n = len(train)
    best_val_loss = float("inf")
    best_state = None
    patience, patience_left = 5, 5

    for epoch in range(60):
        model.train()
        perm = torch.randperm(n)
        for start in range(0, n, batch_size):
            idx = perm[start:start + batch_size]
            optimizer.zero_grad()
            logits = model(train_home[idx], train_away[idx])
            loss = criterion(logits, train_labels[idx])
            loss.backward()
            optimizer.step()

        model.eval()
        with torch.no_grad():
            val_logits = model(val_home, val_away)
            val_loss = criterion(val_logits, val_labels).item()

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            patience_left = patience
        else:
            patience_left -= 1

        if epoch % 10 == 0 or patience_left == 0:
            print(f"  epoch {epoch}: val_loss={val_loss:.4f}")

        if patience_left == 0:
            print(f"  early stop at epoch {epoch}")
            break

    model.load_state_dict(best_state)
    model.eval()

    with torch.no_grad():
        test_logits = model(test_home, test_away)
        test_probs = torch.softmax(test_logits, dim=1).numpy()

    test_preds = test_probs.argmax(axis=1)
    accuracy = accuracy_score(test["label"], test_preds)
    loss = log_loss(test["label"], test_probs, labels=[0, 1, 2])

    print(f"\nLSTM test season 2025-26 ({len(test)} matches):")
    print(f"  accuracy = {accuracy:.3f}")
    print(f"  log-loss = {loss:.3f}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), MODELS_DIR / "lstm_model.pt")

    metrics_path = MODELS_DIR / "metrics.json"
    metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else {}
    metrics["lstm_test_accuracy"] = accuracy
    metrics["lstm_test_log_loss"] = loss
    metrics_path.write_text(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
