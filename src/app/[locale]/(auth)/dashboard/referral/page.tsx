import { auth } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { Env } from '@/libs/Env';
import { getOrCreateReferralCode } from '@/libs/Referral';

export default async function DashboardReferralPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'DashboardReferralPage',
  });

  const { userId } = await auth();
  const code = userId ? await getOrCreateReferralCode(userId) : null;
  const link = code ? `${Env.NEXT_PUBLIC_APP_URL ?? ''}/r/${code}` : '';

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      {link && (
        <div className="rounded-xl border border-border px-6 py-8">
          <p className="text-sm text-muted-foreground">{t('share_instructions')}</p>
          <p className="mt-3 font-mono text-sm break-all">{link}</p>
        </div>
      )}
    </>
  );
}
