# IAProNoFoot

Application de pronostics sportifs basée sur l'IA pour les parieurs d'Afrique de l'Ouest. Couvre les grandes ligues européennes (Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Ligue des Champions) via une architecture hybride XGBoost + LSTM + LLM contextuel. Paiement à l'usage par Mobile Money (Orange Money / MTN MoMo) avec des packs de crédits, interface francophone, pronostics en 1 clic et parrainage communautaire.

Basé sur le template interne Justmaley ([ixartz/SaaS-Boilerplate](https://github.com/ixartz/SaaS-Boilerplate) — Next.js, Tailwind, Shadcn UI, Clerk, Drizzle ORM).

## Charte graphique

Palette appliquée dans `src/styles/global.css` (`:root` et `.dark`) :

- Noir `#0A0A0A`
- Orange `#FC7A1E`
- Vert foncé `#172815`

**Police** : aucun système de police custom n'était en place dans le boilerplate d'origine (pas d'usage de `next/font`, pas de `--font-*` custom). La police par défaut du boilerplate a donc été conservée. Pour appliquer Coolvetica, il faudra l'ajouter via `next/font/local` et la référencer dans `src/app/[locale]/layout.tsx` + `tailwind`/`global.css`.

## Variables d'environnement à remplacer

Copier `.env` en local et renseigner, par projet client :

| Variable | Usage | Où l'obtenir |
|---|---|---|
| `CLERK_SECRET_KEY` | Authentification (clé serveur) | Dashboard Clerk du projet client |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Authentification (clé publique) | Dashboard Clerk du projet client |
| `DATABASE_URL` | Connexion base de données Postgres | Neon / fournisseur Postgres du projet |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'app | Domaine du client |
| `NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN` / `NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST` | Logging (optionnel) | Better Stack |
| `LEMONSQUEEZY_API_KEY` | Appels API (checkout) | Dashboard Lemon Squeezy → Settings → API |
| `LEMONSQUEEZY_STORE_ID` | Identifiant du store | Dashboard Lemon Squeezy → Settings → Stores |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Vérification de signature des webhooks | Choisi par toi (chaîne aléatoire), à coller à l'identique dans Dashboard Lemon Squeezy → Settings → Webhooks lors de la création |

## Paiement — Lemon Squeezy

Le paiement est géré par [Lemon Squeezy](https://www.lemonsqueezy.com/) (checkout hébergé, pas de SDK côté client). Avant de tester le flow complet, en local puis en staging :

1. **Créer le store** sur le dashboard Lemon Squeezy (mode test disponible, pas besoin d'activer le mode live pour développer).
2. **Créer les produits/variants** correspondant à `PLAN_NAME.PREMIUM` et `PLAN_NAME.ENTERPRISE` (`src/utils/PricingPlans.ts`), puis coller leurs `variant_id` réels dans ce fichier (`lemonSqueezyVariantId`).
3. **Configurer le webhook** : Dashboard → Settings → Webhooks → ajouter `https://<ton-domaine>/api/webhooks/lemonsqueezy`, cocher au minimum `order_created`, `subscription_created`, `subscription_updated`, `subscription_payment_success`, `subscription_cancelled`, `subscription_expired`, et renseigner un secret que tu choisis (= `LEMONSQUEEZY_WEBHOOK_SECRET`). Sans `subscription_cancelled`/`subscription_expired`, un utilisateur qui annule reste marqué "actif" en base.
4. **Mode test** : Lemon Squeezy propose un mode test complet (cartes de test, événements simulés) directement dans le dashboard — pas d'équivalent CLI comme `stripe listen` ; les webhooks de test pointent vers l'URL configurée à l'étape 3 (utiliser un tunnel type ngrok/Cloudflare Tunnel en local).
5. Lancer `npm run db:migrate` pour appliquer la migration `subscription` avant de tester.

## Workflow de déploiement

```bash
npm run build    # exécute les migrations DB puis le build Next.js
npm run start    # lance le serveur en production
```

CI/CD : GitHub Actions déjà configuré dans `.github/workflows/` (CI, releases). La revue de sécurité automatique tourne sur chaque PR via `.github/workflows/security-review.yml`.

Déploiement recommandé : Vercel (zero-config pour Next.js) ou tout hébergeur Node compatible, avec une base Postgres (Neon recommandé par le boilerplate d'origine).
