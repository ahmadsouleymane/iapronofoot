import type { InferSelectModel } from 'drizzle-orm';
import type { creditPackSchema } from '@/models/Schema';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/buttonVariants';

export const CreditPackCard = (props: { pack: InferSelectModel<typeof creditPackSchema> }) => {
  const t = useTranslations('CreditPackCard');

  return (
    <div className="rounded-xl border border-border px-6 py-8 text-center">
      <div className="text-lg font-semibold">{props.pack.name}</div>

      <div className="mt-3 text-4xl font-bold">
        {t('price_fcfa', { price: props.pack.priceFcfa })}
      </div>

      <div className="mt-2 mb-5 text-sm text-muted-foreground">
        {t('credits_amount', { credits: props.pack.creditsAmount })}
      </div>

      <a
        className={buttonVariants({ size: 'sm', className: 'w-full' })}
        href={`/api/checkout?variantId=${props.pack.lemonSqueezyVariantId}`}
      >
        {t('buy_button')}
      </a>
    </div>
  );
};
