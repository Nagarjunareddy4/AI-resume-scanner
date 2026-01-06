import { supabase, isSupabaseConfigured, signUpWithEmail, signInWithEmail, signOutUser, createUserRecord, fetchScansByUser, logAppError, updateUserRole } from './supabaseClient';

/**
 * AuthService provides a compatibility layer so existing UI code that calls
 * storage.getUsers / setUsers / getCurrentUser / setCurrentUser can continue to work
 * while backing persistence to Supabase when configured.
 */

export async function getUsers() {
  if (!isSupabaseConfigured) {
    const usersJson = localStorage.getItem('resuscan_users') || '[]';
    try { return JSON.parse(usersJson); } catch (err) { return []; }
  }

  try {
    const { data, error } = await supabase.from('users').select('id, email, name, role, created_at');
    if (error) {
      await logAppError('getUsers', error);
      return [];
    }
    // Map to UI expected shape (includes password omitted)
    return (data || []).map((u: any) => ({ name: u.name || '', email: u.email, scans: [], plan: 'free' }));
  } catch (err) {
    await logAppError('getUsers:exception', err);
    return [];
  }
}

export async function setUsers(_users: any[]) {
  // When using Supabase we don't allow bulk replacing users via client UI calls; keep operation as no-op but log.
  if (!isSupabaseConfigured) {
    localStorage.setItem('resuscan_users', JSON.stringify(_users));
    return;
  }
  // No-op when Supabase is configured to avoid accidental overwrites from UI.
  return;
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured) {
    const email = localStorage.getItem('resuscan_session');
    if (!email) return null;
    const usersJson = localStorage.getItem('resuscan_users') || '[]';
    try {
      const users = JSON.parse(usersJson);
      return users.find((u: any) => u.email === email) || null;
    } catch (err) {
      return null;
    }
  }

  try {
    const res = await supabase.auth.getUser();
    if (res.error) {
      await logAppError('getCurrentUser:getUser', res.error);
      return null;
    }
    const userInfo = (res as any).data?.user;
    if (!userInfo) return null;

    // Fetch row from users table
    const { data, error } = await supabase.from('users').select('*').eq('email', userInfo.email).limit(1);
    if (error) {
      await logAppError('getCurrentUser:fetchRow', error);
      return null;
    }
    if (!data || data.length === 0) return null;

    const row = data[0];

    // Derive verification and provider info
    const provider = (userInfo as any).app_metadata?.provider || (userInfo as any).provider || ((userInfo as any).identities && (userInfo as any).identities[0]?.provider) || null;
    const isOAuthUser = provider && String(provider).toLowerCase() !== 'email';
    const isEmailUser = provider ? String(provider).toLowerCase() === 'email' : true;
    const isEmailVerified = !!(userInfo as any).email_confirmed_at || isOAuthUser;

    // Optional DB sync: if users table contains 'email_verified' try to sync it (safe - non-blocking)
    (async () => {
      try {
        if (row && 'email_verified' in row) {
          await supabase.from('users').update({ email_verified: isEmailVerified }).eq('id', row.id);
        }
      } catch (err) {
        // ignore errors (column may not exist)
      }
    })();

    return { id: row.id, name: row.name || '', email: row.email, scans: await fetchScansByUser(row.email), plan: row.plan || 'free', isEmailVerified, isOAuthUser, isEmailUser };
  } catch (err) {
    await logAppError('getCurrentUser', err);
    return null;
  }
}

export async function setCurrentUser(email: string | null) {
  if (!isSupabaseConfigured) {
    if (email) localStorage.setItem('resuscan_session', email);
    else localStorage.removeItem('resuscan_session');
    return;
  }

  // With Supabase, the session is handled by the auth client. If email is null, sign out.
  if (!email) {
    try { await signOutUser(); } catch (err) { await logAppError('setCurrentUser:signOut', err); }
    return;
  }
  // For sign-in we do nothing here; signInWithEmail handles session creation.
}

export async function signUp(payload: { name?: string, email: string, password: string, role?: string }) {
  try {
    const { name, email, password, role } = payload;
    const res = await signUpWithEmail({ name, email, password, role: (role as any) || 'candidate' });
    if (res.error) return { error: res.error };

    // fetch created user row
    const user = res.user;
    // Newly signed up email/password users are unverified until Supabase confirms their email.
    return { user: { id: user.id, name: user.name || name || '', email: user.email, scans: [], plan: user.plan || 'free', isEmailVerified: false, isEmailUser: true, isOAuthUser: false } };
  } catch (err) {
    await logAppError('signUp', err);
    return { error: 'Unknown signup error' };
  }
}

export async function signIn(payload: { email: string, password: string }) {
  try {
    const { email, password } = payload;
    const res = await signInWithEmail({ email, password });
    if (res.error) return { error: res.error };

    const user = res.user;
    // fetch user's scans to mirror previous experience
    const scans = await fetchScansByUser(user.email).catch(() => []);
    // Derive auth flags from auth state
    const status = await getAuthStatus().catch(() => ({ isEmailVerified: false, isEmailUser: true, isOAuthUser: false } as any));
    return { user: { id: user.id, name: user.name || '', email: user.email, scans: scans || [], plan: user.plan || 'free', isEmailVerified: status.isEmailVerified, isEmailUser: status.isEmailUser, isOAuthUser: status.isOAuthUser } };
  } catch (err) {
    await logAppError('signIn', err);
    return { error: 'Unknown sign-in error' };
  }
}

export async function signOut() {
  try {
    await signOutUser();
  } catch (err) {
    await logAppError('signOut', err);
  }
}

/**
 * Update current user's role with backend guard. Returns { user } on success or { error } on failure.
 */
export async function updateCurrentUserRole(newRole: string) {
  try {
    if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
    const res = await supabase.auth.getUser();
    if (res.error) { await logAppError('updateCurrentUserRole:getUser', res.error); return { error: 'Failed to determine current user' }; }
    const user = (res as any).data?.user;
    if (!user) return { error: 'No authenticated user' };

    // Call backend helper
    const { error, user: updated } = await (updateUserRole as any)(user.id, newRole);
    if (error) return { error };
    return { user: updated };
  } catch (err) {
    await logAppError('updateCurrentUserRole', err);
    return { error: err?.message || 'Failed to update role' };
  }
}

/**
 * Determine whether the current session can change password from the UI.
 * Rules:
 * - If Supabase is not configured, local storage accounts with a password may change password.
 * - If Supabase is configured, only users whose identity provider is 'email' may change password (no OAuth, no anonymous).
 */
export async function canChangePassword() {
  try {
    if (!isSupabaseConfigured) {
      const email = (typeof window !== 'undefined') ? localStorage.getItem('resuscan_session') : null;
      if (!email) return false;
      try {
        const usersJson = localStorage.getItem('resuscan_users') || '[]';
        const users = JSON.parse(usersJson || '[]');
        const found = users.find((u: any) => u.email === email);
        return !!(found && found.password);
      } catch (err) {
        return false;
      }
    }

    const res = await supabase.auth.getUser();
    if (res.error) {
      await logAppError('canChangePassword:getUser', res.error);
      return false;
    }
    const user = (res as any).data?.user;
    if (!user) return false;

    // If identity metadata is available, prefer that
    const identities = (user as any).identities;
    if (Array.isArray(identities) && identities.length > 0) {
      return identities.some((i: any) => i && i.provider === 'email');
    }

    // Fallback: if app metadata or provider explicitly present
    const provider = (user as any).app_metadata?.provider || (user as any).provider;
    if (provider) return provider === 'email';

    // If we cannot determine provider safely, default to false to avoid exposing password UI to OAuth/anonymous users
    return false;
  } catch (err) {
    await logAppError('canChangePassword', err);
    return false;
  }
}

/**
 * Return the auth provider for the current session when available.
 * Prefers `app_metadata.provider` as requested, falls back to identities/provider.
 * Returns a lowercased provider string (e.g., 'google', 'github', 'email') or null when unknown.
 */
export async function getAuthProvider(): Promise<string | null> {
  try {
    if (!isSupabaseConfigured) return null;
    const res = await supabase.auth.getUser();
    if (res.error) {
      await logAppError('getAuthProvider:getUser', res.error);
      return null;
    }
    const user = (res as any).data?.user;
    if (!user) return null;

    // Prefer app metadata provider when present (per requirement)
    const appProvider = (user as any).app_metadata?.provider;
    if (appProvider) return String(appProvider).toLowerCase();

    // Otherwise check identities (array of {provider})
    const identities = (user as any).identities;
    if (Array.isArray(identities) && identities.length > 0) {
      const p = identities[0]?.provider;
      if (p) return String(p).toLowerCase();
    }

    // Last resort: top-level provider field
    const provider = (user as any).provider;
    if (provider) return String(provider).toLowerCase();

    return null;
  } catch (err) {
    await logAppError('getAuthProvider', err);
    return null;
  }
}

/**
 * Return the current auth session status and useful flags for UI gating.
 */
export async function getAuthStatus() {
  try {
    if (!isSupabaseConfigured) {
      const email = (typeof window !== 'undefined') ? localStorage.getItem('resuscan_session') : null;
      return { isGuest: !email, isOAuthUser: false, isEmailUser: !!email, isEmailVerified: false };
    }

    const res = await supabase.auth.getUser();
    if (res.error) {
      await logAppError('getAuthStatus:getUser', res.error);
      return { isGuest: true, isOAuthUser: false, isEmailUser: false, isEmailVerified: false };
    }
    const user = (res as any).data?.user;
    if (!user) return { isGuest: true, isOAuthUser: false, isEmailUser: false, isEmailVerified: false };

    const provider = (user as any).app_metadata?.provider || (user as any).provider || ((user as any).identities && (user as any).identities[0]?.provider) || null;
    const isOAuthUser = provider && String(provider).toLowerCase() !== 'email';
    const isEmailUser = provider ? String(provider).toLowerCase() === 'email' : true;
    const isEmailVerified = !!(user as any).email_confirmed_at || isOAuthUser;

    return { isGuest: false, isOAuthUser, isEmailUser, isEmailVerified };
  } catch (err) {
    await logAppError('getAuthStatus', err);
    return { isGuest: true, isOAuthUser: false, isEmailUser: false, isEmailVerified: false };
  }
}

/**
 * Resend verification email for the given address (returns { error } when present)
 */
export async function resendVerification(email: string) {
  try {
    if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) {
      await logAppError('resendVerification:resend', error);
      return { error };
    }
    return {};
  } catch (err) {
    await logAppError('resendVerification', err);
    return { error: err?.message || 'Failed to resend verification' };
  }
}