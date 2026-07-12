'use client';

import { useEffect } from 'react';

export const ReferralLinker = () => {
  useEffect(() => {
    fetch('/api/referral/link', { method: 'POST' }).catch(() => {});
  }, []);

  return null;
};
