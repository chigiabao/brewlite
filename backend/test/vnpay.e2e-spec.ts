import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  buildQueryString,
  hmacSha512,
  sortObject,
} from '../src/payments/vnpay/vnpay.service.js';
import { getVnpayConfig } from '../src/config/app-config.js';

const USER_ID = 3;

describe('VNPay Checkout & IPN E2E (real PostgreSQL)', () => {
  let moduleRef: TestingModule;
  let app: any;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authToken: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Dọn dẹp dữ liệu của USER_ID
    const orders = await prisma.order.findMany({
      where: { userId: USER_ID },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);

    if (orderIds.length > 0) {
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.loyaltyEntry.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }

    await prisma.user.upsert({
      where: { id: USER_ID },
      update: { loyaltyPoints: 0 },
      create: {
        id: USER_ID,
        email: 'vnpay-test@brewlite.test',
        passwordHash: 'fixture_hash',
      },
    });

    authToken = jwtService.sign({
      sub: USER_ID,
      email: 'vnpay-test@brewlite.test',
    });
  });

  function seedOrder(total = 60000) {
    return prisma.order.create({
      data: { userId: USER_ID, total, status: 'PENDING' },
    });
  }

  function signVnpayParams(params: Record<string, unknown>): Record<string, unknown> {
    const { hashSecret } = getVnpayConfig();
    const sorted = sortObject(params);
    const signData = buildQueryString(sorted);
    const hash = hmacSha512(hashSecret, signData);
    return { ...params, vnp_SecureHash: hash };
  }

  it('return status uses the exact owned VNPay attempt and never settles from URL codes', async () => {
    const order = await seedOrder();
    const checkout = await request(app.getHttpServer()).post('/payments/checkout')
      .set('Authorization', `Bearer ${authToken}`).set('Idempotency-Key', `return-${order.id}`)
      .send({ orderId: order.id, method: 'VNPAY' }).expect(200);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.body.paymentId } });
    const path = `/payments/vnpay/status/${payment.vnpTxnRef}`;
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer()).get(`${path}?vnp_ResponseCode=00&vnp_TransactionStatus=00`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200, { orderId: order.id, orderStatus: 'PENDING', paymentStatus: 'PENDING' });
    const otherToken = jwtService.sign({ sub: USER_ID + 100000, email: 'other@example.test' });
    await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${otherToken}`).expect(404);
    await request(app.getHttpServer()).get(`/payments/vnpay/status/${order.id}_999999_123`)
      .set('Authorization', `Bearer ${authToken}`).expect(404);
    await request(app.getHttpServer()).get('/payments/vnpay/status/invalid')
      .set('Authorization', `Bearer ${authToken}`).expect(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PENDING');
  });

  it('POST /payments/checkout với method VNPAY -> trả về checkoutUrl VNPay sandbox và lưu txnRef', async () => {
    const order = await seedOrder();
    const idemKey = `vnp-e2e-${Date.now()}`;

    const res = await request(app.getHttpServer())
      .post('/payments/checkout')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', idemKey)
      .send({ orderId: order.id, method: 'VNPAY' });

    expect(res.status).toBe(200);
    expect(res.body.checkoutUrl).toContain('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?');
    expect(res.body.checkoutUrl).toContain(`vnp_Amount=${order.total * 100}`);

    const payment = await prisma.payment.findUnique({
      where: { id: res.body.paymentId },
    });
    expect(payment).toBeDefined();
    expect(payment?.gateway).toBe('VNPAY');
    expect(payment?.vnpTxnRef).toBeDefined();
  });

  it('GET /payments/vnpay/ipn chữ ký giả mạo -> trả về RspCode 97', async () => {
    const res = await request(app.getHttpServer())
      .get('/payments/vnpay/ipn')
      .query({
        vnp_TxnRef: 'fake_123',
        vnp_SecureHash: 'invalid_tampered_hash',
      });

    expect(res.status).toBe(200);
    expect(res.body.RspCode).toBe('97');
  });

  it('GET /payments/vnpay/ipn thanh toán thành công (00) -> cập nhật DB và cộng điểm thưởng', async () => {
    const order = await seedOrder();
    const idemKey = `vnp-e2e-success-${Date.now()}`;

    const checkoutRes = await request(app.getHttpServer())
      .post('/payments/checkout')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', idemKey)
      .send({ orderId: order.id, method: 'VNPAY' });

    const payment = await prisma.payment.findUnique({
      where: { id: checkoutRes.body.paymentId },
    });
    expect(payment?.vnpTxnRef).toBeDefined();

    const ipnParams = signVnpayParams({
      vnp_Amount: String(order.total * 100),
      vnp_BankCode: 'NCB',
      vnp_BankTranNo: 'VNP140001',
      vnp_CardType: 'ATM',
      vnp_OrderInfo: `Thanh toan don ${order.id}`,
      vnp_PayDate: '20261031140000',
      vnp_ResponseCode: '00',
      vnp_TmnCode: '2QXUI4B4',
      vnp_TransactionNo: '14123456',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: payment!.vnpTxnRef!,
    });

    const ipnRes = await request(app.getHttpServer())
      .get('/payments/vnpay/ipn')
      .query(ipnParams);

    expect(ipnRes.status).toBe(200);
    expect(ipnRes.body.RspCode).toBe('00');

    // Kiểm tra Payment trong DB
    const updatedPayment = await prisma.payment.findUnique({
      where: { id: payment!.id },
    });
    expect(updatedPayment?.status).toBe('SUCCEEDED');
    expect(updatedPayment?.vnpTransactionNo).toBe('14123456');
    expect(updatedPayment?.paidAt).toBeDefined();

    // Kiểm tra Order trong DB
    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });
    expect(updatedOrder?.status).toBe('PAID');

    // Gọi lại IPN lần 2 -> Idempotent replay, RspCode 02
    const replayRes = await request(app.getHttpServer())
      .get('/payments/vnpay/ipn')
      .query(ipnParams);

    expect(replayRes.status).toBe(200);
    expect(replayRes.body.RspCode).toBe('02');
  });

  it('GET /payments/vnpay/ipn khách hủy thanh toán (24) -> Payment FAILED, Order PAYMENT_FAILED', async () => {
    const order = await seedOrder();
    const idemKey = `vnp-e2e-fail-${Date.now()}`;

    const checkoutRes = await request(app.getHttpServer())
      .post('/payments/checkout')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', idemKey)
      .send({ orderId: order.id, method: 'VNPAY' });

    const payment = await prisma.payment.findUnique({
      where: { id: checkoutRes.body.paymentId },
    });

    const ipnParams = signVnpayParams({
      vnp_Amount: String(order.total * 100),
      vnp_ResponseCode: '24', // Khách hủy
      vnp_TmnCode: '2QXUI4B4',
      vnp_TxnRef: payment!.vnpTxnRef!,
    });

    const ipnRes = await request(app.getHttpServer())
      .get('/payments/vnpay/ipn')
      .query(ipnParams);

    expect(ipnRes.status).toBe(200);
    expect(ipnRes.body.RspCode).toBe('00');

    const updatedPayment = await prisma.payment.findUnique({
      where: { id: payment!.id },
    });
    expect(updatedPayment?.status).toBe('FAILED');

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });
    expect(updatedOrder?.status).toBe('PAYMENT_FAILED');
  });
});
