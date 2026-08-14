# Top-up payments: EPC QR vs Stripe

The wallet top-up flow is gated by the `TOP_UP_EPC_QR_ENABLED` / `TOP_UP_STRIPE_ENABLED` environment variables. For a **non-profit closed-loop wallet** (members preload balance, then spend at the kiosk), the right choice depends on whether you need **automatic** balance updates.

## EPC QR (SEPA Credit Transfer QR)

**Good fit when:**

- You want **no payment-processor fees** (money goes straight to the org's bank account)
- Members are fine opening their banking app and approving a transfer
- Manual or daily reconciliation by a volunteer/treasurer is acceptable

**Limitations:**

- **Not instant** — bank transfers take minutes to days
- **No webhook** — the app cannot know when payment arrived unless you add a bank feed (e.g. Ponto, Tink, Isabel Connect) or manual admin approval
- Requires a **structured reference** (e.g. member ID) in the QR so transfers can be matched

## Stripe (or Mollie / Bancontact in BE/NL)

**Good fit when:**

- Members should top up **immediately** at the kiosk or on their phone
- You want **webhook-driven** balance updates
- Card/Bancontact/Apple Pay UX matters

**Notes:**

- Stripe offers [discounted non-profit pricing](https://stripe.com/pricing) in supported regions (still per-transaction fees)
- Mollie is a common EU/Belgian alternative with Bancontact support

## Recommendation

| Approach | Best for |
|----------|----------|
| **EPC QR only** | Low volume, treasurer reconciles daily, zero processor fees |
| **Stripe/Mollie only** | Self-service kiosk, instant wallet credit, small fee acceptable |
| **Hybrid (recommended)** | EPC QR for "bank transfer" + card/Bancontact via Mollie/Stripe for instant top-up |

A realistic phase 1: **admin manual top-up** (already supported) → add **EPC QR display** with a member-specific reference (no auto-credit) → add a **Mollie or Stripe webhook** later for automated instant top-up.
