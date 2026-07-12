import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/buttonVariants';
import { PricingCard } from '@/features/billing/PricingCard';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { db } from '@/libs/DB';
import { subscriptionSchema } from '@/models/Schema';
import { AllPlans } from '@/utils/PricingPlans';

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
  const [subscription] = userId
    ? await db
        .select()
        .from(subscriptionSchema)
        .where(eq(subscriptionSchema.ownerId, userId))
        .limit(1)
    : [];

  if (subscription?.status === 'active' && subscription.customerPortalUrl) {
    return (
      <>
        <TitleBar
          title={t('title_bar')}
          description={t('title_bar_description')}
        />

        <a
          className={buttonVariants({ size: 'sm' })}
          href={subscription.customerPortalUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t('manage_subscription_button')}
        </a>
      </>
    );
  }

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <div className="
        grid grid-cols-1 gap-x-6 gap-y-8
        @xl:grid-cols-2
        @4xl:grid-cols-3
      "
      >
        {AllPlans.map(plan => (
          <PricingCard
            key={plan.name}
            plan={plan}
            button={
              plan.lemonSqueezyVariantId
                ? (
                    <a
                      className={buttonVariants({ size: 'sm', className: 'w-full' })}
                      href={`/api/checkout?variantId=${plan.lemonSqueezyVariantId}`}
                    >
                      {t('subscribe_button')}
                    </a>
                  )
                : (
                    <span className={buttonVariants({ size: 'sm', className: 'w-full', variant: 'secondary' })}>
                      {t('current_plan_button')}
                    </span>
                  )
            }
          />
        ))}
      </div>
    </>
  );
}
