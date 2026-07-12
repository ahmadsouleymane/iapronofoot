import { expect, test } from '@playwright/test';

test.describe('Referral link capture', () => {
  test('redirects a referral link to sign-up and sets the referral cookie', async ({ page, context }) => {
    await page.goto('/r/e2e-test-code');

    await expect(page).toHaveURL(/\/sign-up/);

    const cookies = await context.cookies();
    const referralCookie = cookies.find(cookie => cookie.name === 'referral_code');

    expect(referralCookie?.value).toBe('e2e-test-code');
  });
});
