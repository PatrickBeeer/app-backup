export type AppPlatform = {
  user: { id: number; username: string; credits: number };
  credits: number;
  checkBalance: (amount: number) => boolean;
  deductCredits: (amount: number) => Promise<boolean>;
  refreshCredits: () => Promise<void>;
  showRecharge: () => void;
  openTaskManager: () => void;
  onBack: () => void;
};

export type AppProps = {
  platform: AppPlatform;
  costs?: Record<string, number>;
};
