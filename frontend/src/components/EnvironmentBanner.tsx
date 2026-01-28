'use client';

import { getEnvironmentConfig, shouldShowBanner } from '@/lib/environment';

export function EnvironmentBanner() {
  if (!shouldShowBanner()) {
    return null;
  }

  const config = getEnvironmentConfig();

  return (
    <div
      className={`${config.bannerBgColor} ${config.bannerTextColor} text-center py-1.5 text-sm font-medium sticky top-0 z-50 shadow-sm`}
    >
      <span className="inline-flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
        {config.label} Environment
      </span>
    </div>
  );
}
