'use client';

import { useEffect, useState } from 'react';
import {
  getEnvironmentConfig,
  getStageFromHostname,
  shouldShowBanner,
  type Stage,
} from '@/lib/environment';

export function EnvironmentBanner() {
  const [stage, setStage] = useState<Stage | null>(null);

  useEffect(() => {
    // Detect stage from hostname on client side
    const detectedStage = getStageFromHostname(window.location.hostname);
    setStage(detectedStage);
  }, []);

  // Don't render until we've detected the stage on client
  if (stage === null || !shouldShowBanner(stage)) {
    return null;
  }

  const config = getEnvironmentConfig(stage);

  return (
    <div
      className="text-white text-center py-1.5 text-sm font-medium sticky top-0 z-50 shadow-sm"
      style={{ backgroundColor: config.bannerColor }}
    >
      <span className="inline-flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
        {config.label} Environment
      </span>
    </div>
  );
}
