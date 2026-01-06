import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = (process.env.VITE_SITE_URL || '').replace(/\/$/, '');

function envMissing(name: string) { return `${name} is not configured on the server`; }

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
    await logAppError('stripe:portal:missing_env', envMissing('STRIPE_SECRET_KEY'));
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    await logAppError('stripe:portal:missing_env', envMissing('SUPABASE_SERVICE_ROLE_KEY'));
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (!SITE_URL) {
    await logAppError('stripe:portal:missing_env', envMissing('VITE_SITE_URL'));
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const authUser: any = await getSupabaseAuthUser(token as string);
    if (!authUser || !authUser.id) return res.status(401).json({ error: 'Unauthorized' });

    // Use Supabase service role to read user row
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: userRow, error: userErr } = await supabaseAdmin.from('users').select('id,email,stripe_customer_id').eq('id', authUser.id).limit(1).maybeSingle();
    if (userErr) {
      await logAppError('stripe:portal:fetch_user_failed', userErr);
      return res.status(500).json({ error: 'Failed to fetch user' });
    }
    if (!userRow) return res.status(400).json({ error: 'User record not found' });

    if (!userRow.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found for this user (no Stripe customer).' });
    }

    // Load stripe package at runtime (avoid TS build-time issues)
    let Stripe: any;
    try {
      Stripe = new Function('return require')()('stripe');
    } catch (e) {
      await logAppError('stripe:portal:require_failed', 'stripe package not present on server');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-11-15' });

    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: userRow.stripe_customer_id,
        return_url: `${SITE_URL}/dashboard`
      });

      if (!portalSession || !portalSession.url) {
        await logAppError('stripe:portal:no_session_url', portalSession);
        return res.status(500).json({ error: 'Failed to create billing portal session' });
      }

      return res.status(200).json({ url: portalSession.url });
    } catch (err: any) {
      await logAppError('stripe:portal:create_session_failed', err?.message || err);
      return res.status(500).json({ error: 'Failed to create billing portal session' });
    }
  } catch (err: any) {
    await logAppError('stripe:portal:unexpected', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
}
