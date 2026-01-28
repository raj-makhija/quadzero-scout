export type Stage = 'dev' | 'qa' | 'prod';

export interface EnvironmentConfig {
  stage: Stage;
  label: string;
  showBanner: boolean;
  bannerColor: string; // Hex color for background
}

const ENV_CONFIG: Record<Stage, EnvironmentConfig> = {
  dev: {
    stage: 'dev',
    label: 'Development',
    showBanner: true,
    bannerColor: '#f59e0b', // amber-500
  },
  qa: {
    stage: 'qa',
    label: 'QA / Staging',
    showBanner: true,
    bannerColor: '#9333ea', // purple-600
  },
  prod: {
    stage: 'prod',
    label: 'Production',
    showBanner: false,
    bannerColor: '',
  },
};

/**
 * Detect stage from hostname (client-side)
 * - localhost or dev.scout.quadzero.com → dev
 * - qa.scout.quadzero.com → qa
 * - scout.quadzero.com → prod
 */
export function getStageFromHostname(hostname: string): Stage {
  if (hostname.includes('localhost') || hostname.startsWith('dev.')) {
    return 'dev';
  }
  if (hostname.startsWith('qa.')) {
    return 'qa';
  }
  return 'prod';
}

/**
 * Get stage from environment variable (server-side fallback)
 */
export function getStage(): Stage {
  const stage = process.env.NEXT_PUBLIC_STAGE as Stage;
  return stage && ['dev', 'qa', 'prod'].includes(stage) ? stage : 'dev';
}

export function getEnvironmentConfig(stage?: Stage): EnvironmentConfig {
  return ENV_CONFIG[stage ?? getStage()];
}

export function shouldShowBanner(stage?: Stage): boolean {
  return getEnvironmentConfig(stage).showBanner;
}

export function getPageTitlePrefix(): string {
  const stage = getStage();
  return stage !== 'prod' ? `[${stage.toUpperCase()}] ` : '';
}
