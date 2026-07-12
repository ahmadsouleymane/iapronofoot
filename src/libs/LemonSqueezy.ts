import { lemonSqueezySetup } from '@lemonsqueezy/lemonsqueezy.js';
import { Env } from './Env';

lemonSqueezySetup({
  apiKey: Env.LEMONSQUEEZY_API_KEY ?? '',
  onError: (error) => {
    throw error;
  },
});
