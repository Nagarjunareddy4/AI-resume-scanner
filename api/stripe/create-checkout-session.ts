import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID || undefined;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = (process.env.VITE_SITE_URL || '').replace(/\/$/, '');

// Defensive checks for required environment variables
function envMissing(name: string) { return `${name} is not configured on the server`; }

async function logAppError(tag: string, error: any) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) { console.error(tag, error); return; }
    // best-effort: fire-and-forget insert into app_errors
    const url = `${SUPABASE_URL}/rest/v1/app_errors`;
    fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tag, error: (typeof error === 'string' ? error : (error && error.message) || String(error)), created_at: new Date().toISOString() })
    }).catch((e) => console.error('logAppError failed', e));
  } catch (e) { console.error('logAppError internal', e); }
}

// Helper: fetch authenticated user from Supabase using the user's access token
async function getSupabaseAuthUser(accessToken: string) {
  if (!SUPABASE_URL || !accessToken) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}



export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!STRIPE_SECRET_KEY) {
    await logAppError('stripe:missing_env', envMissing('STRIPE_SECRET_KEY'));
    return res.status(500).json({ error: 'Stripe is not configured on the server' });
  }
  if (!STRIPE_PRICE_ID) {
    await logAppError('stripe:missing_env', envMissing('STRIPE_PRICE_ID'));
    return res.status(500).json({ error: 'Stripe price ID is not configured' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    await logAppError('stripe:missing_env', envMissing('SUPABASE_SERVICE_ROLE_KEY'));
    return res.status(500).json({ error: 'Supabase service role key is not configured' });
  }
  if (!SITE_URL) {
    await logAppError('stripe:missing_env', envMissing('VITE_SITE_URL'));
    return res.status(500).json({ error: 'Site URL is not configured' });
  }

  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const authUser: any = await getSupabaseAuthUser(token as string);
    if (!authUser || !authUser.id || !authUser.email) return res.status(401).json({ error: 'Unauthorized' });

    // Server-side Supabase client using service role for secure writes
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

    // Fetch the user's row in public.users
    const { data: userRow, error: userErr } = await supabaseAdmin.from('users').select('id,email,plan,stripe_customer_id').eq('id', authUser.id).limit(1).maybeSingle();
    if (userErr) {
      await logAppError('stripe:fetch_user_error', userErr);
      return res.status(500).json({ error: 'Failed to fetch user' });
    }
    if (!userRow) return res.status(400).json({ error: 'User record not found. Please sign in again.' });

    if (userRow.plan === 'pro') return res.status(400).json({ error: 'User already on Pro' });

    // Initialize Stripe SDK using a dynamic require to avoid TypeScript resolution issues when stripe package/types
    // are not present in the dev environment. This executes at runtime in Vercel where stripe will be installed.
    let StripeConstructor: any;
    try {
      StripeConstructor = new Function('return require')()('stripe');
    } catch (e) {
      await logAppError('stripe:require_missing', 'stripe package not available on server');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const stripe = new StripeConstructor(STRIPE_SECRET_KEY, { apiVersion: '2023-11-15' });

    // Ensure Stripe customer exists
    let stripeCustomerId: string | null = userRow.stripe_customer_id || null;

    if (!stripeCustomerId) {
      try {
        const customer = await stripe.customers.create({ email: userRow.email, metadata: { user_id: userRow.id } });
        stripeCustomerId = customer.id;
        // Save to Supabase (server-side with service role)
        const { error: upErr } = await supabaseAdmin.from('users').update({ stripe_customer_id: stripeCustomerId }).eq('id', userRow.id);
        if (upErr) {
          // Log but don't block checkout creation; we still have the customer id to use
          await logAppError('stripe:update_user_customer_id_failed', upErr);
        }
      } catch (err: any) {
        await logAppError('stripe:create_customer_failed', err?.message || err);
        return res.status(500).json({ error: 'Failed to create Stripe customer' });
      }
    }

    // Create Checkout Session
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
        allow_promotion_codes: true,
        customer: stripeCustomerId as string,
        success_url: `${SITE_URL}/billing/success`,
        cancel_url: `${SITE_URL}/billing/cancel`,
        subscription_data: { metadata: { user_id: userRow.id, user_email: userRow.email } },
        metadata: { user_id: userRow.id, user_email: userRow.email }
      });

      return res.status(200).json({ url: session.url });
    } catch (err: any) {
      await logAppError('stripe:create_session_failed', err?.message || err);
      return res.status(500).json({ error: 'Failed to create checkout session' });
    }
  } catch (err: any) {
    await logAppError('stripe:unexpected', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
}
