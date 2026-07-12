# IAProNoFoot — Plateforme SaaS : design

Date : 2026-07-12
Statut : approuvé (en attente de revue finale utilisateur)

## Contexte

IAProNoFoot est une application de pronostics sportifs basée sur l'IA pour les parieurs d'Afrique de l'Ouest, couvrant les grandes ligues européennes (Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Ligue des Champions). Le projet a été amorcé à partir du template SaaS interne Justmaley (Next.js, Tailwind, Shadcn UI, Clerk, Drizzle ORM, Lemon Squeezy) dans `~/dev/iapronofoot`.

Ce document couvre uniquement le **sous-projet plateforme SaaS** (authentification, crédits, paiement, interface de pronostics, parrainage). Le **pipeline de données et de machine learning** (XGBoost + LSTM + LLM contextuel) est un sous-projet distinct, spécifié séparément, et consommé ici comme une API externe.

### Décision de planning

Le lancement initialement visé fin juillet 2026 est repoussé : construire et valider un pipeline ML fiable (85%+ de précision visée) dans un délai de 2-3 semaines n'est pas réaliste. La nouvelle date de lancement sera fixée une fois le plan d'implémentation du pipeline ML estimé — elle n'est pas bloquante pour la conception de la plateforme SaaS, qui peut être développée en parallèle.

## Périmètre

Dans le scope de ce document :
- Authentification (Clerk, inchangé par rapport au template)
- Système de crédits (packs, achat, dépense, ledger)
- Paiement via Lemon Squeezy (achats uniques de packs de crédits, pas d'abonnement)
- Interface de pronostic 1-clic (liste de matchs + résultat 1X2 avec score de confiance)
- Système de parrainage communautaire
- Interface francophone (locale par défaut `fr`, `en` en secours)

Hors scope (sous-projets séparés) :
- Pipeline de données sportives et entraînement des modèles ML
- Stratégie marketing (kiosques LONACI, groupes WhatsApp, micro-influenceurs)
- Extension multi-pays (Sénégal, Mali, Burkina Faso, Bénin, Togo) — la devise FCFA (XOF) est commune à ces pays, aucune adaptation multi-devise n'est nécessaire pour l'instant

## Décisions de conception validées

| Sujet | Décision |
|---|---|
| Authentification | Clerk conservé tel quel (email/mot de passe + Google). Le numéro de téléphone est un champ complémentaire du profil, pas une méthode de connexion. |
| Paiement | Lemon Squeezy conservé (déjà en place dans le template), adapté aux achats uniques de packs de crédits plutôt qu'aux abonnements. |
| Crédits | Système à paliers configurables (3-4 packs au lancement), 1 crédit = 1 pronostic consulté. Montants exacts ajustables après lancement sans changement de code. |
| Parrainage | Bonus de crédits aux deux côtés (parrain + filleul), déclenché au premier achat réussi du filleul (anti-fraude : pas de bonus à la simple inscription). |
| Pronostic | Résultat 1X2 (victoire domicile / nul / victoire extérieur) + score de confiance. Pas de marchés additionnels (BTTS, Over/Under) ni d'explication LLM au lancement — pourra être ajouté une fois le pipeline ML disponible. |
| API de prédiction externe | Une seule API fait à la fois la liste des matchs à venir (par ligue/date) et le pronostic à la demande pour un match donné. |

## Architecture

Le modèle d'abonnement par équipe (`subscriptionSchema`, limites `teamMember`/`website`/`storage`/`transfer`) est remplacé par un **portefeuille de crédits basé sur un grand livre (ledger)** : chaque mouvement de crédits (achat, dépense, bonus parrainage) est une ligne immuable et auditable, avec un solde mis en cache sur l'utilisateur pour des lectures rapides.

Alternative envisagée et écartée : un simple compteur `credits_balance` sans historique. Plus rapide à coder, mais sans traçabilité en cas de litige (webhook manqué, double débit) — inacceptable pour un produit qui manipule de l'argent réel dès le jour 1.

## Modèle de données

Remplace `subscriptionSchema` dans `src/models/Schema.ts`. Conserve le pattern `ownerId` du template (pas de notion d'équipe/organisation — modèle B2C mono-utilisateur).

- **`creditPackSchema`** : packs de crédits en vente.
  - `id`, `name`, `priceFcfa`, `creditsAmount`, `lemonSqueezyVariantId`, `active`
- **`creditTransactionSchema`** : ledger, source de vérité.
  - `id`, `ownerId`, `type` (`purchase` / `spend` / `referral_bonus` / `admin_adjustment`), `amount` (signé), `balanceAfter`, `relatedReference` (id de commande Lemon Squeezy ou id de pronostic), `createdAt`
- **`referralSchema`** : parrainage.
  - `id`, `ownerId` (parrain), `code`, `referredOwnerId` (nullable), `bonusGranted` (boolean), `createdAt`
- Champ `creditsBalance` mis en cache sur l'utilisateur, mis à jour dans la même transaction DB que l'insertion de la ligne ledger correspondante.

## Flux principaux

### Achat de crédits
1. L'utilisateur choisit un pack sur la page de tarifs.
2. Checkout Lemon Squeezy (achat unique — pas de flux d'abonnement).
3. Webhook `order_created` (route existante `src/app/api/webhooks/lemonsqueezy/route.ts`, à étendre) : mappe le `variant_id` acheté vers le `creditPackSchema` correspondant, crédite le solde utilisateur et insère une ligne ledger de type `purchase`.
4. Traitement idempotent : dédupliqué par id de commande Lemon Squeezy, pour supporter les retries de webhook sans double-crédit.

### Pronostic 1-clic
1. Route API interne (proxy) qui appelle l'API de prédiction externe pour lister les matchs à venir par ligue/date.
2. Au clic sur un match : transaction DB qui débite 1 crédit (ligne ledger `spend`) puis appelle l'API externe pour le pronostic du match.
3. Si l'appel externe échoue ou time-out : remboursement automatique du crédit (ligne ledger compensatoire), message d'erreur clair à l'utilisateur avec possibilité de réessayer.

### Parrainage
1. Chaque utilisateur a un code/lien de parrainage unique, affiché sur son tableau de bord.
2. À l'inscription via un lien de parrainage, le filleul est lié au parrain (`referredOwnerId`) sans bonus immédiat.
3. Au premier achat réussi de pack par le filleul : bonus de crédits accordé aux deux côtés (parrain + filleul), `bonusGranted` passé à `true` pour empêcher un second déclenchement.

## Gestion des erreurs

- Solde insuffisant pour un pronostic → redirection vers l'achat de pack, pas d'erreur bloquante.
- Webhook Lemon Squeezy avec `variant_id` inconnu (pack désactivé ou mal configuré) → rejet loggé + alerte Sentry (déjà configuré dans le template), aucun crédit fantôme.
- API de prédiction externe indisponible ou en erreur → remboursement automatique du crédit engagé + message utilisateur, retry manuel possible.
- Tentative de double déclenchement du bonus de parrainage → bloquée par le flag `bonusGranted`.

## Tests

- **Unitaires** : logique de ledger (le solde ne descend jamais sous zéro, idempotence du traitement webhook, calcul du solde après transaction).
- **Intégration** : webhook Lemon Squeezy → résolution `variant_id` → pack → crédit du solde.
- **E2E (Playwright)** : parcours complet achat de pack puis pronostic 1-clic, avec l'API de prédiction externe mockée (pas de dépendance à un vrai service ML pour les tests).

## Interface / API externe attendue (contrat)

À implémenter ou fournir par le sous-projet pipeline ML, consommée ici comme dépendance externe :

- `GET /fixtures?league=<id>&date=<yyyy-mm-dd>` → liste de matchs (id, ligue, équipes, date/heure).
- `GET /predict/<matchId>` → `{ homeWinPct, drawPct, awayWinPct, predictedOutcome, confidence }`.

Ce contrat sera figé et versionné dans la spec du pipeline ML séparée ; toute évolution incompatible devra être coordonnée avec ce sous-projet.
