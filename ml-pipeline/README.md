# IAProNoFoot — Pipeline de prédiction ML

Sous-projet séparé de la plateforme SaaS (voir `docs/superpowers/specs/2026-07-12-plateforme-saas-design.md`),
consommé par l'app Next.js comme dépendance externe via `PREDICTION_API_URL`.

## Ce qui est réel, ce qui ne l'est pas

- **Données réelles** : ~17 900 matchs (2016 à 2026) pour Premier League, LaLiga, Serie A,
  Bundesliga et Ligue 1, issus du dataset domaine public [openfootball/football.json](https://github.com/openfootball/football.json)
  (pas de clé API requise).
- **Modèles réels, entraînés sur ces données** : XGBoost (classifieur 1X2) + LSTM (séquence de forme
  récente par équipe), combinés par moyenne simple. Aucune fuite de données : chaque feature est
  calculée strictement à partir de l'historique *avant* le match prédit.
- **Performance mesurée honnêtement** : évaluée sur la saison 2025-26 complète (jamais vue à
  l'entraînement), 1751 matchs.

  | Modèle | Accuracy | Log-loss |
  |---|---|---|
  | Baseline (toujours "victoire domicile") | 44.0% | — |
  | XGBoost | 50.7% | 1.003 |
  | LSTM | 49.6% | 1.019 |
  | **Blend (servi par l'API)** | **50.7%** | **1.004** |

  Pour référence, même les meilleurs modèles de bookmakers professionnels dépassent rarement 55-58%
  de précision sur le 1X2 — le football a une variance intrinsèquement élevée. L'objectif "85%+"
  mentionné dans la première note de planning n'était pas réaliste ; ce chiffre a été retiré du scope.

- **Limite connue — pas de flux de matchs à venir en temps réel** : le dataset public ne contient
  que des matchs déjà joués (saison 2025-26 terminée en mai 2026, saison 2026-27 pas encore publiée
  par la source). L'endpoint `/fixtures` sert donc des matchs réels pour toute date déjà couverte par
  le dataset, mais renvoie une liste vide pour une date hors de cette plage plutôt que d'inventer des
  matchs. Pour un vrai flux de matchs à venir, il faut brancher un fournisseur temps réel (API-Football,
  SportMonks, etc.) — c'est le principal travail restant avant un lancement en production.
- **Pas d'explication LLM contextuelle** : hors scope pour cette itération, conformément à la
  décision de conception de la spec SaaS (`Pronostic affiché : résultat 1X2 + score de confiance
  uniquement`).

## Structure

```
ml-pipeline/
  data/raw/          fichiers JSON bruts téléchargés (openfootball, par saison/ligue)
  data/processed/     matches.csv, features.csv, team_state.json
  scripts/
    fetch_data.py      télécharge les données brutes
    build_dataset.py    parse en table de matchs chronologique
    build_features.py   calcule les features pré-match (Elo, forme, historique face-à-face)
    train_xgboost.py    entraîne le classifieur XGBoost
    train_lstm.py       entraîne le modèle LSTM
    evaluate_ensemble.py  évalue le blend des deux modèles
  models/             artefacts entraînés (xgboost_model.json, lstm_model.pt, metrics.json)
  api/main.py         API FastAPI servant le contrat GET /fixtures, GET /predict/:matchId
```

## Reproduire le pipeline

```bash
pip install -r requirements.txt
python scripts/fetch_data.py
python scripts/build_dataset.py
python scripts/build_features.py
python scripts/train_xgboost.py
python scripts/train_lstm.py
cd scripts && python evaluate_ensemble.py
```

## Lancer l'API

```bash
cd ml-pipeline
uvicorn api.main:app --host 0.0.0.0 --port 8008
```

Puis, côté app Next.js, dans `.env.local` :

```
PREDICTION_API_URL=http://localhost:8008
PREDICTION_API_KEY=<optionnel — si défini ici, doit aussi être défini côté API via la variable d'env PREDICTION_API_KEY>
```

## Contrat API (déjà consommé par `src/libs/PredictionApi.ts`)

- `GET /fixtures?league=<premier-league|laliga|serie-a|bundesliga|ligue-1>&date=<yyyy-mm-dd>` → `Fixture[]`
- `GET /predict/<matchId>` → `{ homeWinPct, drawPct, awayWinPct, predictedOutcome, confidence }`

## Prochaines étapes suggérées

1. Brancher un fournisseur de matchs à venir en temps réel pour `/fixtures`.
2. Étendre la couverture à la Ligue des Champions (pas de source domaine public équivalente trouvée
   pour l'instant).
3. Réentraîner périodiquement à mesure que de nouvelles saisons sont publiées.
4. Envisager des features supplémentaires (blessures, calendrier de repos, cotes de marché) si une
   source de données est disponible.
