import type { EnumValues } from './Enum';
import type { PLAN_NAME } from '@/utils/PricingPlans';

type PlanName = EnumValues<typeof PLAN_NAME>;

export type PricingPlan = {
  name: PlanName;
  price: number;
  /** Lemon Squeezy variant ID for this plan. Empty string = plan not purchasable (e.g. Free). */
  lemonSqueezyVariantId: string;
  limits: {
    teamMember: number;
    website: number;
    storage: number;
    transfer: number;
  };
};
