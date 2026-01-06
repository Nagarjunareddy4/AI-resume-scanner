import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function envMissing(name: string) { return `${name} not configured on server`; }

async function logAppError(tag: string, error: any) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) { console.error(tag, error); return; }
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

// Read raw body from Node request
function getRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err: any) => reject(err));
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  if (!STRIPE_SECRET_KEY) {
    await logAppError('stripe:webhook:missing_env', envMissing('STRIPE_SECRET_KEY'));
    return res.status(500).send('Stripe not configured');
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    await logAppError('stripe:webhook:missing_env', envMissing('STRIPE_WEBHOOK_SECRET'));
    return res.status(500).send('Webhook signing secret not configured');
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    await logAppError('stripe:webhook:missing_env', envMissing('SUPABASE_SERVICE_ROLE_KEY'));
    return res.status(500).send('Supabase service role key not configured');
  }

  let rawBody: Buffer;
  try {
    rawBody = await getRawBody(req);
  } catch (err: any) {
    await logAppError('stripe:webhook:read_raw_body_failed', err?.message || err);
    return res.status(400).send('Failed to read request body');
  }

  const sig = (req.headers && (req.headers['stripe-signature'] || req.headers['Stripe-Signature'])) as string | undefined;
  if (!sig) {
    await logAppError('stripe:webhook:missing_sig', 'stripe-signature header missing');
    return res.status(400).send('Missing stripe signature');
  }

  // dynamic require stripe to avoid build-time type issues if stripe package/types aren't installed in dev
  let Stripe: any;
  try {
    Stripe = new Function('return require')()('stripe');
  } catch (e) {
    await logAppError('stripe:webhook:stripe_missing', 'stripe package not installed on server');
    return res.status(500).send('Server configuration error');
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-11-15' });

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    await logAppError('stripe:webhook:invalid_signature', err?.message || err);
    return res.status(400).send(`Webhook Error: ${err?.message || 'invalid signature'}`);
  }

  // Supabase admin client
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const type = event.type;

    if (type === 'checkout.session.completed') {
      const session = event.data.object as any;
      // Prefer customer from session; if missing but subscription exists, fetch subscription
      let customerId: string | null = session.customer || null;
      if (!customerId && session.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          customerId = (sub && (sub as any).customer) || null;
        } catch (e) {
          await logAppError('stripe:webhook:fetch_subscription_failed', e?.message || e);
        }
      }

      if (!customerId) {
        await logAppError('stripe:webhook:no_customer', 'checkout.session.completed missing customer');
      } else {
        // Find user by stripe_customer_id
        const { data: users, error: userErr } = await supabaseAdmin.from('users').select('id,role').eq('stripe_customer_id', customerId).limit(1).maybeSingle();
        if (userErr) {
          await logAppError('stripe:webhook:find_user_failed', userErr);
        } else if (users) {
          // Update user: plan='pro', role='recruiter'
          const { error: updateErr } = await supabaseAdmin.from('users').update({ plan: 'pro', role: 'recruiter' }).eq('id', users.id);
          if (updateErr) await logAppError('stripe:webhook:update_user_failed', updateErr);
        } else {
          // No user found for customer; log and continue
          await logAppError('stripe:webhook:user_not_found_for_customer', customerId);
        }
      }
    } else if (type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;
      const customerId: string | null = subscription.customer || null;
      if (!customerId) {
        await logAppError('stripe:webhook:no_customer_on_subscription_deleted', 'subscription missing customer');
      } else {
        const { data: user, error: userErr } = await supabaseAdmin.from('users').select('id,role').eq('stripe_customer_id', customerId).limit(1).maybeSingle();
        if (userErr) {
          await logAppError('stripe:webhook:find_user_failed', userErr);
        } else if (user) {
          // Downgrade plan and demote role to candidate
          const { error: updateErr } = await supabaseAdmin.from('users').update({ plan: 'free', role: 'candidate' }).eq('id', user.id);
          if (updateErr) await logAppError('stripe:webhook:update_user_failed', updateErr);
        } else {
          await logAppError('stripe:webhook:user_not_found_for_customer', customerId);
        }
      }
    } else {
      // Ignore other event types
      // You can add logging for debugging if desired
    }

    // Respond quickly
    return res.status(200).json({ received: true });
  } catch (err: any) {
    await logAppError('stripe:webhook:processing_error', err?.message || err);
    return res.status(500).send('Server error');
  }
}
