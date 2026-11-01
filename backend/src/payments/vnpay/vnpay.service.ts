import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { getVnpayConfig, type VnpayConfig } from '../../config/app-config.js';

export function formatVnpDate(d: Date): string {
  // VNPay yêu cầu ngày giờ theo GMT+7
  const gmt7 = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const yyyy = gmt7.getUTCFullYear();
  const MM = String(gmt7.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(gmt7.getUTCDate()).padStart(2, '0');
  const HH = String(gmt7.getUTCHours()).padStart(2, '0');
  const mm = String(gmt7.getUTCMinutes()).padStart(2, '0');
  const ss = String(gmt7.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
}

export function sortObject(obj: Record<string, unknown>): Record<string, string> {
  const sorted: Record<string, string> = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined && val !== null && val !== '') {
      sorted[encodeURIComponent(key)] = encodeURIComponent(String(val)).replace(/%20/g, '+');
    }
  }
  return sorted;
}

export function buildQueryString(sorted: Record<string, string>): string {
  return Object.entries(sorted)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

export function hmacSha512(secret: string, data: string): string {
  return createHmac('sha512', secret).update(Buffer.from(data, 'utf-8')).digest('hex');
}

export interface CreateVnpayUrlInput {
  orderId: number;
  paymentId: number;
  amount: number; // VND
  ipAddr?: string;
  cancelAfter?: Date | null;
  bankCode?: string; // Optional: 'VNPAYQR', 'VNBANK', 'INTCARD'
}

export interface VnpayIpnQuery {
  vnp_TmnCode?: string;
  vnp_Amount?: string;
  vnp_BankCode?: string;
  vnp_BankTranNo?: string;
  vnp_CardType?: string;
  vnp_PayDate?: string;
  vnp_OrderInfo?: string;
  vnp_TransactionNo?: string;
  vnp_ResponseCode?: string;
  vnp_TransactionStatus?: string;
  vnp_TxnRef?: string;
  vnp_SecureHashType?: string;
  vnp_SecureHash?: string;
  [key: string]: unknown;
}

export interface VnpayIpnResult {
  isValidSignature: boolean;
  rspCode: string;
  message: string;
  orderId?: number;
  paymentId?: number;
  amount?: number;
  vnpTxnRef?: string;
  transactionNo?: string;
  bankCode?: string;
  cardType?: string;
  payDate?: Date;
  isSuccess: boolean;
}

@Injectable()
export class VnpayService {
  private readonly logger = new Logger(VnpayService.name);
  private readonly config: VnpayConfig;

  constructor() {
    this.config = getVnpayConfig();
  }

  /**
   * Tạo TxnRef độc nhất cho giao dịch VNPay
   * Format: {orderId}_{paymentId}_{timestamp}
   */
  generateTxnRef(orderId: number, paymentId: number): string {
    return `${orderId}_${paymentId}_${Date.now()}`;
  }

  parseTxnRef(txnRef: string): { orderId: number; paymentId: number } | null {
    const parts = txnRef.split('_');
    if (parts.length < 2) return null;
    const orderId = Number(parts[0]);
    const paymentId = Number(parts[1]);
    if (!Number.isSafeInteger(orderId) || !Number.isSafeInteger(paymentId)) return null;
    return { orderId, paymentId };
  }

  createPaymentUrl(input: CreateVnpayUrlInput): { checkoutUrl: string; txnRef: string } {
    const now = new Date();
    const createDate = formatVnpDate(now);
    const expireDate = input.cancelAfter
      ? formatVnpDate(input.cancelAfter)
      : formatVnpDate(new Date(now.getTime() + 30 * 60 * 1000));

    const txnRef = this.generateTxnRef(input.orderId, input.paymentId);
    const vnpParams: Record<string, unknown> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.config.tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: `Thanh toan don hang #${input.orderId} BrewLite`,
      vnp_OrderType: 'other',
      vnp_Amount: Math.round(input.amount * 100),
      vnp_ReturnUrl: this.config.returnUrl,
      vnp_IpAddr: input.ipAddr || '127.0.0.1',
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    if (input.bankCode) {
      vnpParams.vnp_BankCode = input.bankCode;
    }

    const sorted = sortObject(vnpParams);
    const signData = buildQueryString(sorted);
    const secureHash = hmacSha512(this.config.hashSecret, signData);

    const checkoutUrl = `${this.config.url}?${signData}&vnp_SecureHash=${secureHash}`;
    return { checkoutUrl, txnRef };
  }

  verifyIpnSignature(query: VnpayIpnQuery): boolean {
    const secureHash = query.vnp_SecureHash;
    if (!secureHash || typeof secureHash !== 'string') {
      return false;
    }

    const clone: Record<string, unknown> = { ...query };
    delete clone.vnp_SecureHash;
    delete clone.vnp_SecureHashType;

    const sorted = sortObject(clone);
    const signData = buildQueryString(sorted);
    const calculatedHash = hmacSha512(this.config.hashSecret, signData);

    return secureHash.toLowerCase() === calculatedHash.toLowerCase();
  }

  parseIpnPayDate(raw: string | undefined): Date | undefined {
    if (!raw || raw.length !== 14) return undefined;
    const yyyy = Number(raw.substring(0, 4));
    const MM = Number(raw.substring(4, 6)) - 1;
    const dd = Number(raw.substring(6, 8));
    const HH = Number(raw.substring(8, 10));
    const mm = Number(raw.substring(10, 12));
    const ss = Number(raw.substring(12, 14));
    // VNPay gửi giờ GMT+7, chuyển về UTC Date
    return new Date(Date.UTC(yyyy, MM, dd, HH - 7, mm, ss));
  }
}
