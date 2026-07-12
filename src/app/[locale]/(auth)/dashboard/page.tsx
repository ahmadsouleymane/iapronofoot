import { auth } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { PredictionsBoard } from '@/features/predictions/PredictionsBoard';
import { ReferralLinker } from '@/features/referral/ReferralLinker';
import { getBalance } from '@/libs/Credits';

export default async function DashboardIndexPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'DashboardIndexPage',
  });

  const { userId } = await auth();
  const balance = userId ? await getBalance(userId) : 0;

  return (
    <>
      <ReferralLinker />
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <PredictionsBoard initialBalance={balance} />
    </>
  );
};
