import { describe, expect, it } from 'vitest';
import {
  buildQueryString,
  formatVnpDate,
  hmacSha512,
  sortObject,
  VnpayService,
} from './vnpay.service.js';

describe('VnpayService', () => {
  const service = new VnpayService();

  describe('formatVnpDate', () => {
    it('định dạng ngày tháng chuẩn 14 ký tự GMT+7', () => {
      // 2026-10-31T06:00:00Z -> GMT+7 là 2026-10-31 13:00:00
      const d = new Date(Date.UTC(2026, 9, 31, 6, 0, 0));
      expect(formatVnpDate(d)).toBe('20261031130000');
    });
  });

  describe('sortObject & buildQueryString', () => {
    it('sắp xếp alphabet các key và băm đúng HMAC-SHA512', () => {
      const input = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_Amount: 5000000,
        vnp_TmnCode: '2QXUI4B4',
      };
      const sorted = sortObject(input);
      expect(Object.keys(sorted)).toEqual([
        'vnp_Amount',
        'vnp_Command',
        'vnp_TmnCode',
        'vnp_Version',
      ]);
      const qs = buildQueryString(sorted);
      expect(qs).toBe('vnp_Amount=5000000&vnp_Command=pay&vnp_TmnCode=2QXUI4B4&vnp_Version=2.1.0');
    });
  });

  describe('createPaymentUrl', () => {
    it('tạo URL chứa đầy đủ tham số và chữ ký vnp_SecureHash', () => {
      const result = service.createPaymentUrl({
        orderId: 101,
        paymentId: 202,
        amount: 85000,
      });

      expect(result.checkoutUrl).toContain('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?');
      expect(result.checkoutUrl).toContain('vnp_Amount=8500000');
      expect(result.checkoutUrl).toContain('vnp_TxnRef=');
      expect(result.checkoutUrl).toContain('vnp_SecureHash=');
      expect(result.txnRef).toMatch(/^101_202_\d+$/);
    });

    it('gán đúng vnp_BankCode khi được yêu cầu', () => {
      const result = service.createPaymentUrl({
        orderId: 101,
        paymentId: 202,
        amount: 50000,
        bankCode: 'VNPAYQR',
      });

      expect(result.checkoutUrl).toContain('vnp_BankCode=VNPAYQR');
    });
  });

  describe('verifyIpnSignature', () => {
    it('trả về true khi chữ ký khớp với HMAC-SHA512 của params', () => {
      const secret = 'RA3KNOEAW2MYGQG30C3L0B5O1W86Q78W';
      const params: Record<string, unknown> = {
        vnp_Amount: '5000000',
        vnp_BankCode: 'NCB',
        vnp_Command: 'pay',
        vnp_ResponseCode: '00',
        vnp_TmnCode: '2QXUI4B4',
        vnp_TxnRef: '101_202_123456789',
      };

      const sorted = sortObject(params);
      const signData = buildQueryString(sorted);
      const hash = hmacSha512(secret, signData);

      params.vnp_SecureHash = hash;
      params.vnp_SecureHashType = 'SHA512';

      expect(service.verifyIpnSignature(params)).toBe(true);
    });

    it('trả về false khi chữ ký bị sửa đổi hoặc giả mạo', () => {
      const params: Record<string, unknown> = {
        vnp_Amount: '5000000',
        vnp_ResponseCode: '00',
        vnp_TxnRef: '101_202_123456789',
        vnp_SecureHash: 'invalid_tampered_hash',
      };

      expect(service.verifyIpnSignature(params)).toBe(false);
    });
  });

  describe('parseTxnRef', () => {
    it('parse đúng orderId và paymentId từ TxnRef', () => {
      expect(service.parseTxnRef('101_202_1730000000')).toEqual({
        orderId: 101,
        paymentId: 202,
      });
      expect(service.parseTxnRef('invalid')).toBeNull();
    });
  });
});
