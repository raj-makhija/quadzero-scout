export type Stage = 'dev' | 'qa' | 'prod';

export interface EnvironmentConfig {
  stage: Stage;
  label: string;
  showBanner: boolean;
  bannerBgColor: string;
  bannerTextColor: string;
}

const ENV_CONFIG: Record<Stage, EnvironmentConfig> = {
  dev: {
    stage: 'dev',
    label: 'Development',
    showBanner: true,
    bannerBgColor: 'bg-amber-500',
    bannerTextColor: 'text-white',
  },
  qa: {
    stage: 'qa',
    label: 'QA / Staging',
    showBanner: true,
    bannerBgColor: 'bg-purple-600',
    bannerTextColor: 'text-white',
  },
  prod: {
    stage: 'prod',
    label: 'Production',
    showBanner: false,
    bannerBgColor: '',
    bannerTextColor: '',
  },
};

export function getStage(): Stage {
  const stage = process.env.NEXT_PUBLIC_STAGE as Stage;
  return stage && ['dev', 'qa', 'prod'].includes(stage) ? stage : 'dev';
}

export function getEnvironmentConfig(): EnvironmentConfig {
  return ENV_CONFIG[getStage()];
}

export function shouldShowBanner(): boolean {
  return getEnvironmentConfig().showBanner;
}

export function getPageTitlePrefix(): string {
  const stage = getStage();
  return stage !== 'prod' ? `[${stage.toUpperCase()}] ` : '';
}
