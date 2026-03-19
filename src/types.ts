export enum OrderType {
  MarketSwap = 0,
  LimitSwap = 1,
  MarketIncrease = 2,
  LimitIncrease = 3,
  MarketDecrease = 4,
  LimitDecrease = 5,
  StopLossDecrease = 6,
}

export enum DecreasePositionSwapType {
  NoSwap = 0,
  SwapPnlTokenToCollateralToken = 1,
  SwapCollateralTokenToPnlToken = 2,
}

export interface CreateOrderAddresses {
  receiver: string;
  cancellationReceiver: string;
  callbackContract: string;
  uiFeeReceiver: string;
  market: string;
  initialCollateralToken: string;
  swapPath: string[];
}

export interface CreateOrderNumbers {
  sizeDeltaUsd: bigint;
  initialCollateralDeltaAmount: bigint;
  triggerPrice: bigint;
  acceptablePrice: bigint;
  executionFee: bigint;
  callbackGasLimit: bigint;
  minOutputAmount: bigint;
}

export interface CreateOrderParams {
  addresses: CreateOrderAddresses;
  numbers: CreateOrderNumbers;
  orderType: OrderType;
  decreasePositionSwapType: DecreasePositionSwapType;
  isLong: boolean;
  shouldUnwrapNativeToken: boolean;
  autoCancel: boolean;
  referralCode: string;
}

export interface OpenPositionParams {
  /** 市场地址 (Market token address) */
  market: string;
  /** 抵押品代币地址 */
  collateralToken: string;
  /** 抵押品数量 (原始精度, 如 USDT 6位小数则传 5000000 = 5 USDT) */
  collateralAmount: bigint;
  /** 仓位大小 USD (30位精度, 如 10 USD = 10n * 10n**30n) */
  sizeDeltaUsd: bigint;
  /** 是否做多 */
  isLong: boolean;
  /** 可接受价格 (30位精度), 做多传极大值, 做空传0 */
  acceptablePrice: bigint;
  /** 执行费 (CELO, wei 单位) */
  executionFee: bigint;
  /** swap 路径, 默认空数组 */
  swapPath?: string[];
  /** referral code, 默认 bytes32(0) */
  referralCode?: string;
}

export interface ClosePositionParams {
  /** 市场地址 */
  market: string;
  /** 抵押品代币地址 */
  collateralToken: string;
  /** 要减少的仓位大小 USD (30位精度) */
  sizeDeltaUsd: bigint;
  /** 是否做多仓位 */
  isLong: boolean;
  /** 可接受价格 (30位精度), 平多传极小值, 平空传极大值 */
  acceptablePrice: bigint;
  /** 执行费 (CELO, wei 单位) */
  executionFee: bigint;
  /** 要提取的抵押品数量, 默认 0 */
  initialCollateralDeltaAmount?: bigint;
  /** 最小输出数量, 默认 0 */
  minOutputAmount?: bigint;
  /** swap 路径 */
  swapPath?: string[];
  /** 平仓时 PnL 的 swap 类型 */
  decreasePositionSwapType?: DecreasePositionSwapType;
  /** referral code */
  referralCode?: string;
}

export interface UpdownConfig {
  /** Celo RPC URL */
  rpcUrl?: string;
  /** 合约地址覆盖 */
  contracts?: Partial<ContractAddresses>;
}

export interface ContractAddresses {
  exchangeRouter: string;
  router: string;
  orderVault: string;
  dataStore: string;
  eventEmitter: string;
  referralStorage: string;
}
