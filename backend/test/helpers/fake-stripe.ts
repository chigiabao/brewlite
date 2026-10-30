import Stripe from 'stripe';

type CreateParams = Stripe.Checkout.SessionCreateParams;
type RequestOptions = Stripe.RequestOptions;

let sessionSequence = 0;

export function stripeError(type: string, message = type): Error {
  return Object.assign(new Error(message), { type });
}

export class FakeStripe {
  readonly checkout = {
    sessions: {
      create: async (params: CreateParams, options?: RequestOptions) =>
        this.createSession(params, options),
      retrieve: async (id: string) => this.retrieveSession(id),
    },
  };

  readonly webhooks: Stripe['webhooks'];

  readonly createCalls: Array<{ params: CreateParams; options?: RequestOptions }> = [];
  readonly retrieveCalls: string[] = [];

  failNextCreate: Error | null = null;

  private readonly sessions = new Map<string, Stripe.Checkout.Session>();
  private readonly idempotency = new Map<string, Stripe.Checkout.Session>();

  constructor() {
    const real = new Stripe('sk_test_fake');
    this.webhooks = real.webhooks;
  }

  async createSession(
    params: CreateParams,
    options?: RequestOptions,
  ): Promise<Stripe.Checkout.Session> {
    // Check idempotency cache BEFORE recording the call — a cache-hit is a
    // replay, not a new Stripe session creation (matches real Stripe behaviour).
    const idempotencyKey = options?.idempotencyKey;
    if (idempotencyKey) {
      const cached = this.idempotency.get(idempotencyKey);
      if (cached) return cached;
    }

    this.createCalls.push({ params, options });

    if (this.failNextCreate) {
      const error = this.failNextCreate;
      this.failNextCreate = null;
      throw error;
    }

    sessionSequence += 1;
    const lineItem = params.line_items?.[0];
    const unitAmount =
      lineItem && 'price_data' in lineItem
        ? lineItem.price_data?.unit_amount ?? 0
        : 0;

    const session = {
      id: `cs_test_fake_${sessionSequence}`,
      object: 'checkout.session',
      amount_total: unitAmount,
      cancel_url: params.cancel_url ?? null,
      client_reference_id: params.client_reference_id ?? null,
      created: Math.floor(Date.now() / 1000),
      currency: 'vnd',
      expires_at: params.expires_at ?? Math.floor(Date.now() / 1000) + 1800,
      livemode: false,
      metadata: params.metadata ?? null,
      mode: 'payment',
      payment_intent: null,
      payment_status: 'unpaid',
      status: 'open',
      success_url: params.success_url ?? null,
      url: `https://checkout.stripe.com/c/pay/cs_test_fake_${sessionSequence}`,
    } as unknown as Stripe.Checkout.Session;

    this.sessions.set(session.id, session);
    if (idempotencyKey) this.idempotency.set(idempotencyKey, session);
    return session;
  }

  async retrieveSession(id: string): Promise<Stripe.Checkout.Session> {
    this.retrieveCalls.push(id);
    const session = this.sessions.get(id);
    if (!session) {
      throw stripeError('StripeInvalidRequestError', `No such session: ${id}`);
    }
    return session;
  }

  getSession(id: string): Stripe.Checkout.Session {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown fake session ${id}`);
    return session;
  }

  updateSession(id: string, patch: Partial<Stripe.Checkout.Session>): Stripe.Checkout.Session {
    const current = this.getSession(id);
    const next = { ...current, ...patch } as Stripe.Checkout.Session;
    this.sessions.set(id, next);
    return next;
  }

  markPaid(id: string, paymentIntentId = `pi_test_fake_${sessionSequence}`): Stripe.Checkout.Session {
    return this.updateSession(id, {
      status: 'complete',
      payment_status: 'paid',
      payment_intent: paymentIntentId,
    });
  }

  markExpired(id: string): Stripe.Checkout.Session {
    return this.updateSession(id, { status: 'expired', payment_status: 'unpaid' });
  }

  signedEvent(session: Stripe.Checkout.Session, type: string, secret: string) {
    const payload = JSON.stringify({
      id: `evt_test_${session.id}_${type}_${Date.now()}`,
      object: 'event',
      api_version: '2026-09-30.endive',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type,
      data: { object: session },
    });
    return {
      payload,
      header: this.webhooks.generateTestHeaderString({ payload, secret }),
    };
  }
}
