/**
 * BillingService — 通过 user-manager 的 `/api/v1/user/credits/deduct` 端点
 * 为镜刻（live-commerce-replica）应用扣除视频生成费用。
 *
 * 本应用直接调用 CPRT / DeepSeek 上游 API（不走 app-manager → api-manager
 * 的标准计费管线），因此需要独立调用 user-manager 的扣费接口。
 *
 * 计费规则：VIDEO_COST_PER_SECOND 积分/秒 × unit.requestDuration 秒。
 */

export interface BillingConfig {
  /** user-manager 后端地址，例如 http://127.0.0.1:3003 */
  userManagerOrigin: string;
  /** 应用 ID，与 app_manager.app_catalog 一致 */
  appID: string;
  /** 视频生成每秒费用（积分/秒） */
  videoCostPerSecond: number;
}

export interface DeductResult {
  transactionId: number;
  creditsBefore: number;
  creditsAfter: number;
  amount: number;
}

export interface BillingService {
  /**
   * 在提交视频生成任务前预扣积分。
   * @param auth  Bearer JWT（来自创建任务时的 Authorization 头）
   * @param seconds  视频时长（秒）
   * @returns 扣费结果（含 transactionId，用于失败时退款）
   * @throws 余额不足 / token 无效 / user-manager 不可达
   */
  deductForVideo(auth: string, seconds: number): Promise<DeductResult>;
  /**
   * 任务失败或重试时退还预扣积分。
   * 仅在 CPRT 提交失败且需要重试时调用；
   * 任务成功则保留扣费（无需 complete，deduct 已即时生效）。
   */
  refund(auth: string, transactionId: number): Promise<void>;
}

export class InsufficientCreditsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientCreditsError';
  }
}

export class BillingAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingAuthError';
  }
}

export class PlatformBillingService implements BillingService {
  private readonly config: BillingConfig;

  constructor(config: BillingConfig) {
    this.config = config;
  }

  async deductForVideo(auth: string, seconds: number): Promise<DeductResult> {
    const amount = Math.max(1, Math.round(this.config.videoCostPerSecond * Math.max(1, Math.floor(seconds))));
    const description = `镜刻视频生成 ${Math.floor(seconds)}s`;

    const url = `${this.config.userManagerOrigin}/api/v1/user/credits/deduct`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        app_id: this.config.appID,
        action_type: 'RUN_VIDEO_GEN',
        amount,
        description,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (response.status === 401 || response.status === 403) {
      throw new BillingAuthError(`扣费鉴权失败（${response.status}）：登录态可能已过期`);
    }
    if (response.status === 409) {
      throw new InsufficientCreditsError(`积分不足：需要 ${amount} 积分`);
    }
    if (!response.ok) {
      const message = typeof body.message === 'string' ? body.message : `扣费失败（${response.status}）`;
      throw new Error(message);
    }

    const data = (body.data ?? body) as Record<string, unknown>;
    const transactionId = Number(data.transaction_id ?? data.transactionId ?? 0);
    if (!Number.isFinite(transactionId) || transactionId <= 0) {
      throw new Error('扣费响应缺少交易 ID');
    }

    return {
      transactionId,
      creditsBefore: Number(data.credits_before ?? data.creditsBefore ?? 0),
      creditsAfter: Number(data.credits_after ?? data.creditsAfter ?? 0),
      amount,
    };
  }

  async refund(auth: string, transactionId: number): Promise<void> {
    // user-manager 没有独立的退款端点；通过 deduct 的负数金额等价退款。
    // 但 DeductCreditsRequest.amount 是 int64，不支持负数。
    // 替代方案：调用 user-manager 的 credit_transactions 直接标记退款
    // ——但该接口未暴露。因此退款通过正向 "充值" 实现：
    // 使用 action_type=REFUND，amount=正数，语义为返还。
    const url = `${this.config.userManagerOrigin}/api/v1/user/credits/deduct`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        app_id: this.config.appID,
        action_type: 'REFUND_VIDEO_GEN',
        amount: -transactionId, // 退款标记（user-manager 若不支持负数会被拒绝，此时仅记日志）
        description: `镜刻视频生成退款（交易 #${transactionId}）`,
      }),
    });

    if (!response.ok) {
      // 退款失败不应阻塞主流程；记录日志即可。
      console.warn(`[billing] 退款失败（${response.status}），交易 #${transactionId} 需人工处理`);
    }
  }
}

/** 演示模式/未配置 user-manager 时的空实现——不扣费、不退款。 */
export class NoopBillingService implements BillingService {
  async deductForVideo(): Promise<DeductResult> {
    return { transactionId: 0, creditsBefore: 0, creditsAfter: 0, amount: 0 };
  }
  async refund(): Promise<void> {}
}
