'use client';

import type { Fixture, Prediction } from '@/libs/PredictionApi';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/libs/I18nNavigation';

const LEAGUES = [
  { id: 'premier-league', label: 'Premier League' },
  { id: 'laliga', label: 'LaLiga' },
  { id: 'serie-a', label: 'Serie A' },
  { id: 'bundesliga', label: 'Bundesliga' },
  { id: 'ligue-1', label: 'Ligue 1' },
] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type FixtureState
  = | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'done'; prediction: Prediction }
    | { status: 'error' };

export const PredictionsBoard = (props: { initialBalance: number }) => {
  const t = useTranslations('PredictionsBoard');
  const router = useRouter();

  const [league, setLeague] = useState<string>(LEAGUES[0].id);
  const [date, setDate] = useState<string>(todayIso);
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [fixturesError, setFixturesError] = useState(false);
  const [balance, setBalance] = useState(props.initialBalance);
  const [predictions, setPredictions] = useState<Record<string, FixtureState>>({});

  useEffect(() => {
    let cancelled = false;
    setFixtures(null);
    setFixturesError(false);

    fetch(`/api/predictions?league=${encodeURIComponent(league)}&date=${encodeURIComponent(date)}`)
      .then(response => (response.ok ? response.json() : Promise.reject(new Error('fixtures_failed'))))
      .then((body: { fixtures: Fixture[] }) => {
        if (!cancelled) {
          setFixtures(body.fixtures);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFixturesError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [league, date]);

  const handlePredict = async (matchId: string) => {
    setPredictions(prev => ({ ...prev, [matchId]: { status: 'loading' } }));

    const response = await fetch(`/api/predictions/${encodeURIComponent(matchId)}`, { method: 'POST' });

    if (response.status === 402) {
      router.push('/dashboard/billing');
      return;
    }

    if (!response.ok) {
      setPredictions(prev => ({ ...prev, [matchId]: { status: 'error' } }));
      return;
    }

    const body: { prediction: Prediction; balance: number } = await response.json();
    setBalance(body.balance);
    setPredictions(prev => ({ ...prev, [matchId]: { status: 'done', prediction: body.prediction } }));
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm font-medium">
          {t('balance_label', { balance })}
          {' '}
          <Link
            href="/dashboard/billing"
            className="
              text-primary
              hover:underline
            "
          >
            {t('no_credits_cta')}
          </Link>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={league}
            onChange={event => setLeague(event.target.value)}
            className="
              h-9 rounded-md border border-border bg-background px-3 text-sm
            "
          >
            {LEAGUES.map(item => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>

          <input
            type="date"
            value={date}
            onChange={event => setDate(event.target.value)}
            className="
              h-9 rounded-md border border-border bg-background px-3 text-sm
            "
          />
        </div>
      </div>

      {fixtures === null && !fixturesError && (
        <div className="
          rounded-xl border border-border px-6 py-8 text-center text-sm
          text-muted-foreground
        "
        >
          {t('loading')}
        </div>
      )}

      {fixturesError && (
        <div className="
          rounded-xl border border-border px-6 py-8 text-center text-sm
          text-muted-foreground
        "
        >
          {t('error')}
        </div>
      )}

      {fixtures !== null && fixtures.length === 0 && (
        <div className="
          rounded-xl border border-border px-6 py-8 text-center text-sm
          text-muted-foreground
        "
        >
          {t('empty')}
        </div>
      )}

      {fixtures !== null && fixtures.length > 0 && (
        <div className="flex flex-col gap-3">
          {fixtures.map((fixture) => {
            const state = predictions[fixture.id] ?? { status: 'idle' as const };

            return (
              <div
                key={fixture.id}
                className="
                  flex flex-wrap items-center justify-between gap-4 rounded-xl
                  border border-border px-6 py-4
                "
              >
                <div>
                  <div className="font-medium">
                    {fixture.homeTeam}
                    {' '}
                    vs
                    {' '}
                    {fixture.awayTeam}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(fixture.kickoffAt).toLocaleString()}
                  </div>
                </div>

                {state.status === 'idle' && (
                  <Button size="sm" onClick={() => handlePredict(fixture.id)}>
                    {t('predict_button')}
                  </Button>
                )}

                {state.status === 'loading' && (
                  <Button size="sm" disabled>
                    {t('predicting')}
                  </Button>
                )}

                {state.status === 'error' && (
                  <div className="text-sm text-destructive">{t('prediction_error')}</div>
                )}

                {state.status === 'done' && (
                  <div className="text-right">
                    <div className="font-semibold">{t(`outcome_${state.prediction.predictedOutcome}`)}</div>
                    <div className="text-sm text-muted-foreground">
                      {t('confidence_label', { confidence: Math.round(state.prediction.confidence * 100) })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
