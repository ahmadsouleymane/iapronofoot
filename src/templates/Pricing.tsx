import { getTranslations } from 'next-intl/server';
import { CreditPackCard } from '@/features/credits/CreditPackCard';
import { Section } from '@/features/landing/Section';
import { getActiveCreditPacks } from '@/libs/CreditPacks';

export const Pricing = async () => {
  const t = await getTranslations('Pricing');
  const packs = await getActiveCreditPacks();

  return (
    <Section
      subtitle={t('section_subtitle')}
      title={t('section_title')}
      description={t('section_description')}
    >
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
    </Section>
  );
};
