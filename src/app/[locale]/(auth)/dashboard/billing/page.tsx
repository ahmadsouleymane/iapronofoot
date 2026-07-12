import { auth } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CreditPackCard } from '@/features/credits/CreditPackCard';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { getActiveCreditPacks } from '@/libs/CreditPacks';
import { getBalance } from '@/libs/Credits';

export default async function DashboardBillingPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'DashboardBillingPage',
  });

  const { userId } = await auth();
  const [balance, packs] = await Promise.all([
    userId ? getBalance(userId) : Promise.resolve(0),
    getActiveCreditPacks(),
  ]);

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description', { balance })}
      />

      <div className="
        grid grid-cols-1 gap-x-6 gap-y-8
        @xl:grid-cols-2
        @4xl:grid-cols-3
      "
      >
        {packs.map(pack => (
          <CreditPackCard key={pack.id} pack={pack} />
        ))}
      </div>
    </>
  );
}
