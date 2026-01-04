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
    } else {
      // Optionally log success in debug
      console.debug('Supabase inserted scan:', data);
    }
  } catch (err) {
    console.error('Supabase insertScan exception:', err);
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
    if (error) console.error('Supabase insertJobDescription error:', error);
    else console.debug('Supabase inserted JD:', data);
  } catch (err) {
    console.error('Supabase insertJobDescription exception:', err);
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
      return null;
    }
    return data;
  } catch (err) {
    console.error('Supabase fetchJobDescriptionsByUser exception:', err);
    return null;
  }
}
