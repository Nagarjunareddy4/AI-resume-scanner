Stripe Integration (TEST MODE)

Summary
- Serverless endpoints (Vercel) added:
  - POST /api/stripe/create-checkout-session -> creates customer/product/price + Checkout Session (redirect to Stripe)
  - POST /api/stripe/webhook -> processes checkout.session.completed, customer.subscription.updated, customer.subscription.deleted

Important Notes
- Stripe keys must be configured in Vercel environment variables:
  - STRIPE_SECRET_KEY (required)
  - STRIPE_WEBHOOK_SECRET (recommended for production; if missing, the webhook will accept events but log a console warning)
- Client-side environment variables that the app already uses: VITE_SITE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

How it works (short)
1. The frontend calls POST /api/stripe/create-checkout-session (with Authorization: Bearer <supabase session access token>).
2. Server verifies the access token via Supabase auth REST (/auth/v1/user) and reads the user's public.users row.
3. Server creates a Stripe customer and a monthly recurring price (INR test amount), then creates a Checkout Session and returns the session URL.
4. Client redirects user to Stripe Checkout (same tab). On success Stripe redirects to SITE_URL/?session_id={CHECKOUT_SESSION_ID}.
5. The webhook (/api/stripe/webhook) listens to events and updates public.users.plan via the Supabase REST API (using the anon key). All plan changes happen server-side only.

Testing
- Use Stripe test cards (e.g., 4242 4242 4242 4242) — the app shows a small toast saying payments are in test mode.
- After completing a checkout, wait a short moment for the webhook to process; the app will attempt to refresh user state immediately and again after ~12s.

Security & Constraints
- The implementation avoids adding any client-side DB writes for plan/role — all plan updates happen via the webhook.
- No top-level awaits were added; all async logic is wrapped inside handlers.
- Do not put your real (production) Stripe keys into public places.

If you want, I can also add unit tests or a small script to simulate Stripe events locally using stripe CLI (recommended for CI/testing).