import { createClient } from '@supabase/supabase-js';

// Read Supabase keys from Vite environment variables. Ensure these are set locally as
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. We intentionally do not hardcode keys.
// Support both Vite-prefixed keys (VITE_SUPABASE_*) and generic SUPABASE_* if present in the environment.
// Support both Vite-prefixed keys (VITE_SUPABASE_*) and generic SUPABASE_* if present in the environment.
// Also support Node process.env for dev scripts (process.env.SUPABASE_* or process.env.VITE_SUPABASE_*).
const importMetaEnv: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
const SUPABASE_URL = (importMetaEnv ? (importMetaEnv.VITE_SUPABASE_URL || importMetaEnv.SUPABASE_URL) : undefined) || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = (importMetaEnv ? (importMetaEnv.VITE_SUPABASE_ANON_KEY || importMetaEnv.SUPABASE_ANON_KEY) : undefined) || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

// Flag that indicates at-runtime whether supabase keys exist. This is used to avoid silent failures in production
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Initialize the Supabase client. If env keys are missing, provide a harmless no-op stub so
// the rest of the app (and dev scripts) can import this module without throwing at import-time.
let _supabase: any = null;
if (!isSupabaseConfigured) {
  console.error('[supabase] Missing configuration: please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time. Supabase operations will be skipped.');
  // Better stub that also mirrors the auth surface used in the app so auth checks fail loudly and predictably.
  _supabase = {
    auth: {
      getUser: async () => ({ data: null, error: new Error('Supabase not configured') }),
      getSession: async () => ({ data: null, error: new Error('Supabase not configured') }),
      signInWithPassword: async (_creds: any) => ({ data: null, error: new Error('Supabase not configured') }),
      signUp: async (_creds: any) => ({ data: null, error: new Error('Supabase not configured') }),
      signOut: async () => ({ data: null, error: new Error('Supabase not configured') }),
      // legacy compatibility
      user: () => null
    },
    from: (_table: string) => ({
      insert: async (_payload: any) => ({ data: null, error: new Error('Supabase not configured') }),
      select: (_cols?: any) => ({
        eq: (_col: string, _val: any) => ({ order: async (_c: string, _opts: any) => ({ data: null, error: new Error('Supabase not configured') }) }),
        is: (_col: string, _val: any) => ({ order: async (_c: string, _opts: any) => ({ data: null, error: new Error('Supabase not configured') }) }),
        order: async (_col: string, _opts: any) => ({ data: null, error: new Error('Supabase not configured') })
      })
    })
  };
} else {
  _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.debug('[supabase] client initialized');
}

export const supabase = _supabase;

/**
 * Insert a scan record into the 'scans' table.
 * This function is intentionally "best-effort": any error is logged to console
 * and does not affect the UI flow (to keep UX unchanged).
 */
export async function insertScanRecord(scan: any, userEmail?: string | null) {
  if (!isSupabaseConfigured) { console.error('[supabase] insertScanRecord skipped: Supabase not configured. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'); return; }
  try {
    // Map existing scan object into the `scans` table schema defined in DB.
    // Required columns per schema: user_email, owner_type ('guest'|'user'), mode ('candidate'|'recruiter'), match_score (integer), result (jsonb).
    // We preserve existing semantics: if a user email is provided (and is not the literal 'guest'), treat owner_type as 'user', otherwise 'guest'.
    const ownerType = userEmail && userEmail !== 'guest' ? 'user' : 'guest';
    const userEmailForDb = userEmail && userEmail !== 'guest' ? userEmail : null;
    const mode = (scan.role as string) || 'candidate';
    const matchScoreRaw = scan.insights?.matchScore ?? scan.insights?.match_score ?? 0;
    const matchScore = Number.isFinite(matchScoreRaw) ? Math.round(Number(matchScoreRaw)) : 0;

    const payload = {
      user_email: userEmailForDb,
      owner_type: ownerType,
      mode,
      match_score: matchScore,
      result: scan.insights || {}
    };

    const { data, error } = await supabase.from('scans').insert(payload);
    if (error) {
      console.error('Supabase insertScan error:', error);
      await logAppError('insertScanRecord', error);
    } else {
      // Optionally log success in debug
      console.debug('Supabase inserted scan:', data);
    }
  } catch (err) {
    console.error('Supabase insertScan exception:', err);
    await logAppError('insertScanRecord', err);
  }
}

/**
 * Insert a job description record into the 'job_descriptions' table.
 * We store filename and optionally extracted text; this is a best-effort operation.
 */
export async function insertJobDescriptionRecord(jdFile: File | null, jdText?: string, userEmail?: string | null) {
  if (!isSupabaseConfigured) { console.error('[supabase] insertJobDescriptionRecord skipped: Supabase not configured. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'); return; }
  if (!jdFile && !jdText) return;
  try {
    const payload = {
      file_name: jdFile?.name || null,
      text_snippet: jdText || jdFile?.name || null,
      user_email: userEmail || null,
      uploaded_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('job_descriptions').insert(payload);
    if (error) { console.error('Supabase insertJobDescription error:', error); await logAppError('insertJobDescriptionRecord', error); }
    else console.debug('Supabase inserted JD:', data);
  } catch (err) {
    console.error('Supabase insertJobDescription exception:', err);
    await logAppError('insertJobDescriptionRecord', err);
  }
}

/**
 * Fetch scans for a given user (or guest identifier). Returns rows ordered by created_at desc.
 * - If emailOrGuest is undefined, returns all scans.
 * - If emailOrGuest is null, returns scans where user_email IS NULL.
 * Errors are logged to console only.
 */
export async function fetchScansByUser(emailOrGuest?: string | null) {
  if (!isSupabaseConfigured) { console.error('[supabase] fetchScansByUser skipped: Supabase not configured. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'); return null; }
  try {
    let query = supabase.from('scans').select('*');
    if (emailOrGuest === null) {
      query = query.is('user_email', null as any);
    } else if (emailOrGuest !== undefined) {
      query = query.eq('user_email', emailOrGuest);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      console.error('Supabase fetchScansByUser error:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Supabase fetchScansByUser exception:', err);
    return null;
  }
}

/**
 * Fetch job descriptions for a given user (or guest identifier). Returns rows ordered by created_at desc.
 * - If emailOrGuest is undefined, returns all job descriptions.
 * - If emailOrGuest is null, returns JDs where user_email IS NULL.
 * Errors are logged to console only.
 */
export async function fetchJobDescriptionsByUser(emailOrGuest?: string | null) {
  if (!isSupabaseConfigured) { console.error('[supabase] fetchJobDescriptionsByUser skipped: Supabase not configured. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'); return null; }
  try {
    let query = supabase.from('job_descriptions').select('*');
    if (emailOrGuest === null) {
      query = query.is('user_email', null as any);
    } else if (emailOrGuest !== undefined) {
      query = query.eq('user_email', emailOrGuest);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      console.error('Supabase fetchJobDescriptionsByUser error:', error);
      await logAppError('fetchJobDescriptionsByUser', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Supabase fetchJobDescriptionsByUser exception:', err);
    await logAppError('fetchJobDescriptionsByUser', err);
    return null;
  }
}

/**
 * Log an application-level error into the `app_errors` table.
 * Non-blocking: failures while logging are printed to console but do not throw.
 */
export async function logAppError(source: string, error: any) {
  try {
    const msg = error?.message || String(error);
    const stack = error?.stack || (typeof error === 'object' ? JSON.stringify(error) : String(error));
    if (!isSupabaseConfigured) {
      console.error('[app_error] (supabase not configured) ', source, msg);
      return;
    }
    await supabase.from('app_errors').insert({ source, message: msg, stack });
  } catch (err) {
    // Intentionally non-throwing: we don't want error logging to disrupt the main flow
    console.error('Failed to log app error:', err);
  }
}

/**
 * Create a user record in `users` table. If the row already exists return it.
 */
export async function createUserRecord({ id, email, role = 'candidate', name, plan = 'free' }: { id?: string, email: string, role?: string, name?: string, plan?: string }) {
  if (!isSupabaseConfigured) { console.error('[supabase] createUserRecord skipped: Supabase not configured.'); return null; }
  try {
    // If user exists, return it
    const { data: existing } = await supabase.from('users').select('*').eq('email', email).limit(1).throwOnError().maybeSingle();
    if (existing) return existing;

    // Enforce role/plan policy: recruiter requires pro plan
    if (role === 'recruiter' && plan !== 'pro') {
      const err = new Error('Cannot assign recruiter role without pro plan');
      await logAppError('createUserRecord:rolePolicy', err);
      throw err;
    }

    const payload: any = { email, role, plan };
    if (id) payload.id = id;
    if (name) payload.name = name;

    const { data, error } = await supabase.from('users').insert(payload).select().maybeSingle();
    if (error) {
      await logAppError('createUserRecord', error);
      throw error;
    }
    return data;
  } catch (err) {
    await logAppError('createUserRecord', err);
    throw err;
  }
}

/**
 * Insert an auth log into `auth_logs` table. Non-blocking helper.
 */
export async function insertAuthLog({ user_id, email, action }: { user_id?: string | null, email?: string | null, action: 'LOGIN' | 'LOGOUT' }) {
  try {
    if (!isSupabaseConfigured) { console.error('[supabase] insertAuthLog skipped: Supabase not configured.'); return; }
    await supabase.from('auth_logs').insert({ user_id: user_id || null, email: email || null, action });
  } catch (err) {
    await logAppError('insertAuthLog', err);
  }
}

/**
 * Update a user's role while enforcing plan rules.
 * Returns { user } on success or { error } on failure.
 */
export async function updateUserRole(userId: string, newRole: string) {
  if (!isSupabaseConfigured) { return { error: 'Supabase not configured' }; }
  try {
    if (newRole !== 'candidate' && newRole !== 'recruiter') return { error: 'Invalid role' };

    const { data: rows, error: fetchErr } = await supabase.from('users').select('*').eq('id', userId).limit(1);
    if (fetchErr) {
      await logAppError('updateUserRole:fetch', fetchErr);
      return { error: 'Failed to fetch user' };
    }
    if (!rows || rows.length === 0) return { error: 'User not found' };

    const userRow = rows[0];
    const plan = userRow.plan || 'free';

    if (newRole === 'recruiter' && plan !== 'pro') {
      const errMsg = 'Upgrade to Pro to use recruiter role';
      await logAppError('updateUserRole:policy', { userId, plan, attemptedRole: newRole });
      return { error: errMsg };
    }

    const { data: updated, error: updateErr } = await supabase.from('users').update({ role: newRole }).eq('id', userId).select().maybeSingle();
    if (updateErr) {
      await logAppError('updateUserRole:update', updateErr);
      return { error: 'Failed to update role' };
    }

    return { user: updated };
  } catch (err) {
    await logAppError('updateUserRole:exception', err);
    return { error: err?.message || 'Exception' };
  }
}

/**
 * Verify whether a user is eligible to start an upgrade to Pro.
 * Returns { ok: true } when allowed, or { ok: false, reason } when blocked.
 * This helper is suitable for server-side guards (call from backend before creating a payment session).
 */
export async function verifyUserForUpgrade(userId: string) {
  if (!isSupabaseConfigured) return { ok: false, reason: 'supabase_not_configured' };
  try {
    const { data: rows, error } = await supabase.from('users').select('*').eq('id', userId).limit(1);
    if (error) { await logAppError('verifyUserForUpgrade:fetch', error); return { ok: false, reason: 'failed_fetch' }; }
    if (!rows || rows.length === 0) return { ok: false, reason: 'user_not_found' };
    const row = rows[0];

    // If DB has an email_verified column and it's false, block upgrade
    if ('email_verified' in row && row.email_verified === false) return { ok: false, reason: 'email_not_verified' };

    // Fall back to auth metadata if available
    try {
      const { data: current } = await supabase.auth.getUser();
      const user = (current as any).data?.user;
      if (user && user.email) {
        const provider = (user as any).app_metadata?.provider || (user as any).provider;
        const isEmail = provider ? String(provider).toLowerCase() === 'email' : true;
        const emailConfirmed = !!(user as any).email_confirmed_at || !isEmail; // treat OAuth as confirmed
        if (isEmail && !emailConfirmed) return { ok: false, reason: 'email_not_verified' };
      }
    } catch (err) {
      // ignore - best-effort
    }

    return { ok: true };
  } catch (err) {
    await logAppError('verifyUserForUpgrade', err);
    return { ok: false, reason: 'exception' };
  }
}

/**
 * Sign up a user using Supabase Auth and create a corresponding users row.
 * Enforces duplicate email check per requirements.
 */
export async function signUpWithEmail({ name, email, password, role = 'candidate' }: { name?: string, email: string, password: string, role?: string }) {
  try {
    if (!isSupabaseConfigured) {
      // Fallback behaviour is handled by the app's local storage layer.
      throw new Error('Supabase not configured');
    }

    // Validate role
    if (role !== 'candidate' && role !== 'recruiter') role = 'candidate';

    // Check if user exists in users table
    const { data: exists, error: existsErr } = await supabase.from('users').select('*').eq('email', email).limit(1);
    if (existsErr) {
      await logAppError('signUpWithEmail:check', existsErr);
      return { error: 'Failed to validate email' };
    }
    if (exists && exists.length > 0) {
      return { error: 'Email already exists, please sign in' };
    }

    // Create auth user
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) {
      await logAppError('signUpWithEmail:auth', signUpErr);
      return { error: signUpErr.message || 'Failed to sign up' };
    }

    const userId = signUpData?.user?.id;

    // Insert into users table with auth uid
    try {
      const userRow = await createUserRecord({ id: userId, email, role, name });
      return { user: userRow };
    } catch (err) {
      await logAppError('signUpWithEmail:createUser', err);
      return { error: 'Failed to create user record' };
    }
  } catch (err) {
    await logAppError('signUpWithEmail', err);
    return { error: err?.message || 'Unknown signup error' };
  }
}

/**
 * Sign in a user using Supabase Auth, verify presence in `users` table, and insert LOGIN auth_log.
 */
export async function signInWithEmail({ email, password }: { email: string, password: string }) {
  try {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase not configured');
    }

    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) {
      await logAppError('signInWithEmail:auth', signInErr);
      return { error: signInErr.message || 'Sign-in failed' };
    }

    const userId = signInData?.user?.id;

    // Ensure there's a users row
    const { data: userRows, error: userErr } = await supabase.from('users').select('*').eq('email', email).limit(1);
    if (userErr) {
      await logAppError('signInWithEmail:checkUser', userErr);
      return { error: 'Failed to validate user' };
    }
    if (!userRows || userRows.length === 0) {
      const e = new Error('No user row exists for this email');
      await logAppError('signInWithEmail:missingUserRow', e);

      // Proactively sign out the auth session that was just created to avoid stray sessions
      try { await supabase.auth.signOut(); } catch (ignore) {}

      return { error: 'Access denied. Please sign up.' };
    }

    // Enforce role validation
    const role = userRows[0].role;
    if (role !== 'candidate' && role !== 'recruiter') {
      const e = new Error('Invalid user role');
      await logAppError('signInWithEmail:invalidRole', e);
      return { error: 'Access denied.' };
    }

    // Insert LOGIN auth log (non-blocking)
    insertAuthLog({ user_id: userRows[0].id, email, action: 'LOGIN' });

    return { user: userRows[0] };
  } catch (err) {
    await logAppError('signInWithEmail', err);
    return { error: err?.message || 'Unknown sign-in error' };
  }
}

/**
 * Sign out current user and attempt to insert a LOGOUT auth_log without blocking the sign-out UX.
 */
export async function signOutUser() {
  try {
    if (!isSupabaseConfigured) {
      // Fallback: clear session on client side only
      try { await supabase.auth.signOut(); } catch (ignore) {}
      return;
    }

    await supabase.auth.signOut();

    // Fire-and-forget insertion of logout log (should never block UX)
    (async () => {
      try {
        const { data: current, error } = await supabase.auth.getUser();
        const email = (current && (current as any).data && (current as any).data.user && (current as any).data.user.email) || null;
        const userId = (current && (current as any).data && (current as any).data.user && (current as any).data.user.id) || null;
        await insertAuthLog({ user_id: userId, email, action: 'LOGOUT' });
      } catch (err) {
        await logAppError('signOutUser:insertLog', err);
      }
    })();

  } catch (err) {
    await logAppError('signOutUser', err);
  }
}

/**
 * Ensure there is a canonical `users` row for the given Supabase auth user.
 * - Uses auth user id (auth.users.id) as the single source of truth.
 * - If no `users` row exists with that id, will attempt to create one.
 * - If a `users` row exists for the same email but a different id, this is treated
 *   as a conflict and the auth session is signed out to block access.
 * - Non-blocking logging to `app_errors` occurs on failures.
 */
export async function ensureUserRowForAuth(authUser: any) {
  if (!isSupabaseConfigured) {
    console.warn('[supabase] ensureUserRowForAuth skipped: Supabase not configured');
    return { ok: true };
  }

  try {
    const uid = authUser?.id;
    const email = authUser?.email;
    const name = authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || authUser?.user_metadata?.preferred_username || null;
    if (!uid || !email) {
      await logAppError('ensureUserRowForAuth:missingAuthFields', { uid, email });
      // Block by signing out
      try { await supabase.auth.signOut(); } catch (e) {}
      return { ok: false, error: 'Missing auth user data' };
    }

    // 1) Check for an exact match by auth id
    const { data: byId, error: byIdErr } = await supabase.from('users').select('*').eq('id', uid).limit(1);
    if (byIdErr) {
      await logAppError('ensureUserRowForAuth:checkById', byIdErr);
      try { await supabase.auth.signOut(); } catch (e) {}
      return { ok: false, error: 'DB error' };
    }

    if (byId && byId.length > 0) {
      // Verify email consistency
      if (byId[0].email !== email) {
        await logAppError('ensureUserRowForAuth:idEmailMismatch', { uid, authEmail: email, userRowEmail: byId[0].email });
        try { await supabase.auth.signOut(); } catch (e) {}
        return { ok: false, error: 'User record inconsistency' };
      }

      // Good: existing row matches auth id and email
      insertAuthLog({ user_id: uid, email, action: 'LOGIN' });
      return { ok: true, user: byId[0] };
    }

    // 2) No row for id: check if a row exists for this email
    const { data: byEmail, error: byEmailErr } = await supabase.from('users').select('*').eq('email', email).limit(1);
    if (byEmailErr) {
      await logAppError('ensureUserRowForAuth:checkByEmail', byEmailErr);
      try { await supabase.auth.signOut(); } catch (e) {}
      return { ok: false, error: 'DB error' };
    }

    if (byEmail && byEmail.length > 0) {
      // Email exists but with different id -> potential duplicate/conflict; do NOT auto-merge
      await logAppError('ensureUserRowForAuth:emailConflict', { uid, email, existing: byEmail[0] });
      try { await supabase.auth.signOut(); } catch (e) {}
      return { ok: false, error: 'Email already in use' };
    }

    // 3) No existing user: create a users row with id = auth uid
    const payload: any = { id: uid, email, role: 'candidate' };
    if (name) payload.name = name;
    const { data: inserted, error: insertErr } = await supabase.from('users').insert(payload).select().maybeSingle();
    if (insertErr) {
      await logAppError('ensureUserRowForAuth:insert', insertErr);
      try { await supabase.auth.signOut(); } catch (e) {}
      return { ok: false, error: 'Failed to create user record' };
    }

    insertAuthLog({ user_id: uid, email, action: 'LOGIN' });
    return { ok: true, user: inserted };
  } catch (err) {
    await logAppError('ensureUserRowForAuth:exception', err);
    try { await supabase.auth.signOut(); } catch (e) {}
    return { ok: false, error: 'Exception' };
  }
}

// Register an auth state change listener to verify users on sign-in (OAuth and others)
if (isSupabaseConfigured && supabase.auth && typeof (supabase.auth as any).onAuthStateChange === 'function') {
  try {
    (supabase.auth as any).onAuthStateChange(async (event: string, session: any) => {
      try {
        if (!session) return;
        const user = session?.user || ((session as any)?.data?.user) || null;
        if (!user) return;

        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          // Ensure canonical users row exists and validate it. Do not create duplicates.
          const res = await ensureUserRowForAuth(user);
          if (!res.ok) {
            console.warn('User verification failed on auth state change:', res.error);
            // Optionally surface a UX signal... currently we just sign them out above.
          }
        }

        if (event === 'SIGNED_OUT') {
          // Record logout for bookkeeping
          const userId = user?.id || null;
          const email = user?.email || null;
          await insertAuthLog({ user_id: userId, email, action: 'LOGOUT' });
        }
      } catch (innerErr) {
        await logAppError('onAuthStateChange:handler', innerErr);
      }
    });
  } catch (err) {
    // Registration failure should not break app
    console.error('Failed to register onAuthStateChange listener:', err);
    // Fire-and-forget logging to avoid top-level await in module scope
    void logAppError('registerAuthListener', err);
  }
}
