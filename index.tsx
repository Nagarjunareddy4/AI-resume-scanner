
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  ShieldCheck, 
  Upload, 
  FileText, 
  History, 
  User, 
  LogOut, 
  Moon, 
  Sun, 
  CheckCircle2, 
  Loader2, 
  ArrowRight, 
  Search,
  Info,
  ChevronRight,
  TrendingUp,
  Award,
  AlertCircle,
  Sparkles,
  Briefcase,
  UserCheck,
  Download,
  FileSpreadsheet,
  X,
  Zap,
  Lock
} from 'lucide-react';

// Supabase integration (best-effort insert of scans and job descriptions)
import { insertScanRecord, insertJobDescriptionRecord, supabase, logAppError } from './src/services/supabaseClient';

// --- Types & Constants ---

type Role = 'candidate' | 'recruiter';
type Plan = 'free' | 'pro';

type UserAccount = {
  name: string;
  email: string;
  password?: string;
  scans: ResumeScan[];
  plan: Plan;
};

type ResumeScan = {
  id: string;
  timestamp: number;
  fileName: string;
  role: Role;
  status: 'completed' | 'failed';
  insights: AIInsights;
};

type AIInsights = {
  summary: string;
  matchScore: number;
  skills: { name: string; level: 'Expert' | 'Intermediate' | 'Novice'; alignment: number }[];
  experienceHighlights: string[];
  strengths: string[];
  improvements: string[];
  suggestedSkills: string[];
  explanation: string;
  missingKeywords?: string[];
};

const APP_NAME = "ResuScan AI";
const GUEST_LIMIT = 2;
const OPENAI_MODEL = "gpt-4o-mini";

// --- Mock Storage Services ---

import { signIn, signUp, getCurrentUser as getCurrentUserFromAuth, setCurrentUser as setCurrentUserToAuth, signOut as authSignOut, canChangePassword, getAuthProvider, updateCurrentUserRole, getAuthStatus, resendVerification } from './src/services/authService';

const storage = {
  getUsers: (): UserAccount[] => JSON.parse(localStorage.getItem('resuscan_users') || '[]'),
  setUsers: (users: UserAccount[]) => localStorage.setItem('resuscan_users', JSON.stringify(users)),
  // getCurrentUser is now async-capable in the auth layer; provide a sync shim for legacy uses and use async call where needed.
  getCurrentUser: (): UserAccount | null => {
    const email = localStorage.getItem('resuscan_session');
    if (!email) return null;
    return storage.getUsers().find(u => u.email === email) || null;
  },
  setCurrentUser: (email: string | null) => {
    if (email) localStorage.setItem('resuscan_session', email);
    else localStorage.removeItem('resuscan_session');
    // Also inform the auth service in the background (non-blocking)
    if (!email) {
      (async () => { try { await authSignOut(); } catch (e) { console.error('Sign-out failed', e); } })();
    }
  },
  getGuestScans: (): ResumeScan[] => JSON.parse(localStorage.getItem('resuscan_guest_scans') || '[]'),
  setGuestScans: (scans: ResumeScan[]) => localStorage.setItem('resuscan_guest_scans', JSON.stringify(scans)),
  clearGuestScans: () => localStorage.removeItem('resuscan_guest_scans'),
};

// --- OpenAI Service ---

const runOpenAIScan = async (resumeText: string, jdText: string, role: Role): Promise<AIInsights> => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API Key is missing. Please set OPENAI_API_KEY.");
  }

  const systemPrompt = `You are an expert ${role === 'candidate' ? 'Career Coach' : 'HR Recruiter'}. 
  Analyze the provided resume against the job description. 
  Respond ONLY in JSON format.
  JSON Schema:
  {
    "summary": "2 sentence analysis",
    "matchScore": number (0-100),
    "skills": [{"name": "string", "level": "Expert/Intermediate/Novice", "alignment": number}],
    "experienceHighlights": ["string"],
    "strengths": ["string"],
    "improvements": ["string"],
    "suggestedSkills": ["string"],
    "missingKeywords": ["string"],
    "explanation": "short plain-language explanation"
  }`;

  const userPrompt = `JOB DESCRIPTION:
  ${jdText}
  
  RESUME:
  ${resumeText}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || "Failed to communicate with OpenAI");
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content) as AIInsights;
};

// --- Helper: CountUp Animation ---

const CountUp = ({ end, duration = 1000 }: { end: number, duration?: number }) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let startTime: number | null = null;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const val = Math.min(Math.floor((progress / duration) * end), end);
      setCount(val);
      if (progress < duration) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [end, duration]);
  return <>{count}</>;
};

// --- UI Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, type = 'button', icon: Icon }: any) => {
  const base = "flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] hover:shadow-lg hover:shadow-blue-500/20",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700",
    outline: "border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800",
    ghost: "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800",
    danger: "bg-red-500 text-white hover:bg-red-600",
    pro: "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-xl active:scale-[0.98]"
  };

  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${variants[variant as keyof typeof variants]} ${className}`}>
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
};

const Card = ({ children, className = "", ...props }: { children?: React.ReactNode, className?: string, [key: string]: any }) => (
  <div 
    className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm ${className}`}
    {...props}
  >
    {children}
  </div>
);

// --- Pages ---

const AuthPage = ({ onAuthSuccess, onGuestMode, showToast }: any) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  // Forgot password flow state
  const [forgotEmailOpen, setForgotEmailOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isLogin) {
      try {
        const res: any = await signIn({ email: formData.email, password: formData.password });
        if (res.error) {
          setError(res.error);
          return;
        }
        // Persist session in local storage for compatibility and update UI
        storage.setCurrentUser(res.user.email);
        onAuthSuccess(res.user);
      } catch (err: any) {
        console.error('Sign-in error:', err);
        setError(err?.message || 'Sign-in failed');
      }

    } else {
      try {

        const res: any = await signUp({ name: formData.name, email: formData.email, password: formData.password, role: 'candidate' });
        if (res.error) {
          setError(res.error);
          return;
        }
        storage.setCurrentUser(res.user.email);
        onAuthSuccess(res.user);

        // Inform user that Supabase sent the verification email (do NOT auto-resend)
        try {
          showToast && showToast({ type: 'info', message: 'Verification email sent. Please check your inbox.' });
          setTimeout(() => showToast && showToast(null), 4500);
        } catch (e) {
          console.error('Failed to show verification toast', e);
        }

      } catch (err: any) {
        console.error('Sign-up error:', err);
        setError(err?.message || 'Sign-up failed');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-black animate-fade-up">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
            <ShieldCheck className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{isLogin ? 'Sign In' : 'Create Account'}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-center text-sm">
            AI-powered resume analysis with industry-standard privacy.
          </p>
        </div>

        <div className="space-y-4">
          <Button variant="primary" className="w-full flex items-center justify-center gap-3" onClick={async () => {
            try {
              if (supabase && supabase.auth) {
                // Modern supabase client
                if (typeof (supabase.auth as any).signInWithOAuth === 'function') {
                  await (supabase.auth as any).signInWithOAuth({ provider: 'google' });
                  return;
                }
                // Older client compatibility
                if (typeof (supabase.auth as any).signInWithProvider === 'function') {
                  await (supabase.auth as any).signInWithProvider('google');
                  return;
                }
              }
              // Fallback: inform the user
              try { showToast && showToast({ type: 'info', message: 'Google sign-in is not available in this environment.' }); setTimeout(() => showToast && showToast(null), 3500); } catch (e) { /* ignore */ }
            } catch (err) {
              console.error('Google sign-in failed', err);
              try { await (await import('./src/services/supabaseClient')).logAppError('googleSignIn', err); } catch (e) { /* ignore */ }
            }
          }}>
            {/* Simple Google 'G' svg */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4">
              <path d="M21.6 12.227c0-.667-.06-1.307-.172-1.927H12v3.648h5.52c-.237 1.28-.96 2.366-2.048 3.09v2.573h3.31c1.938-1.786 3.058-4.41 3.058-7.384z" fill="#4285F4"/>
              <path d="M12 22c2.64 0 4.856-.874 6.475-2.373l-3.31-2.573c-.917.616-2.08.983-3.165.983-2.43 0-4.49-1.64-5.23-3.846H3.183v2.42C4.8 19.92 8.12 22 12 22z" fill="#34A853"/>
              <path d="M6.77 13.191a6.6 6.6 0 010-4.383V6.388H3.183a9.997 9.997 0 000 11.224l3.587-2.42z" fill="#FBBC05"/>
              <path d="M12 6.017c1.436 0 2.73.494 3.752 1.462l2.81-2.81C16.86 2.77 14.64 2 12 2 8.12 2 4.8 4.08 3.183 6.388l3.587 2.42C7.51 7.657 9.57 6.017 12 6.017z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>

          <div className="w-full flex items-center gap-2">
            <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
            <span className="text-xs text-gray-400 font-medium">OR</span>
            <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
              <input 
                required
                type="text"
                placeholder="John Doe"
                className="w-full px-4 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
            <input 
              required
              type="email"
              placeholder="name@company.com"
              className="w-full px-4 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <PasswordInput id="auth-password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="••••••••" />

            <div className="flex items-center justify-between mt-2">
              <div className="text-xs text-gray-500">{!isLogin ? 'Choose a secure password.' : ''}</div>
              {isLogin && (
                <button type="button" onClick={() => { setForgotEmailOpen(true); setForgotEmail(formData.email || ''); setResetError(null); setResetSent(false); }} className="text-sm text-blue-600 hover:underline font-medium">Forgot password?</button>
              )}
            </div>

            {/* Strength meter for Sign Up only */}
            {!isLogin && <StrengthMeter password={formData.password} />}

            {/* Forgot Password modal */}
            {forgotEmailOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                <Card className="w-full max-w-md p-6">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold">Reset Password</h3>
                    <p className="text-sm text-gray-500">Enter your email and we will send a password reset link if an account exists.</p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Email</label>
                      <input type="email" className="w-full px-4 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
                    </div>
                    {resetError && <div className="text-red-500 text-sm">{resetError}</div>}
                    {resetSent && <div className="text-sm text-green-600">If an account exists for that email, a reset link has been sent.</div>}
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" onClick={() => { setForgotEmailOpen(false); setResetError(null); }}>{resetSent ? 'Close' : 'Cancel'}</Button>
                      {!resetSent && <Button onClick={async () => {
                        setResetError(null);
                        setSendingReset(true);
                        try {
                          if (!forgotEmail) { setResetError('Please enter an email address.'); setSendingReset(false); return; }
                          if (supabase && supabase.auth) {
                            let res: any = { data: null, error: null };
                            if (typeof (supabase.auth as any).resetPasswordForEmail === 'function') {
                              res = await (supabase.auth as any).resetPasswordForEmail(forgotEmail, { redirectTo: window.location.origin + '?type=recovery' });
                            } else if ((supabase.auth as any).api && typeof (supabase.auth as any).api.resetPasswordForEmail === 'function') {
                              res = await (supabase.auth as any).api.resetPasswordForEmail(forgotEmail, { redirectTo: window.location.origin + '?type=recovery' });
                            } else {
                              res = { data: null, error: new Error('Password reset not available') };
                            }

                            if (res.error) {
                              console.error('Supabase reset error:', res.error);
                              try { await (await import('./src/services/supabaseClient')).logAppError('passwordReset', res.error); } catch (e) { /* ignore */ }
                              setResetError('Failed to send reset link. Please try again later.');
                            } else {
                              setResetSent(true);
                            }
                          } else {
                            setResetError('Password reset is not available in this environment.');
                          }
                        } catch (err) {
                          console.error('Reset request failed:', err);
                          setResetError('Failed to send reset link.');
                        }
                        setSendingReset(false);
                      }} disabled={sendingReset}>{sendingReset ? 'Sending...' : 'Send reset link'}</Button>}
                    </div>
                  </div>
                </Card>
              </div>
            )}

          </div>
          
          {error && <p className="text-red-500 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</p>}
          
          <Button type="submit" className="w-full mt-2">
            {isLogin ? 'Sign In' : 'Sign Up'}
          </Button>
        </form>

        <div className="mt-6 flex flex-col gap-4 items-center">
          <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-blue-600 hover:underline font-medium">
            {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
          </button>
          <button onClick={onGuestMode} className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            Try for free as Guest <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </Card>
    </div>
  );
};

const Dashboard = ({ user, scans, isGuest, role, setRole, setUser, onNewScan, onViewScan, onAuthRequired, onTriggerUpgrade, showToast }: any) => {
  const displayName = user ? user.name : "Guest";
  const isPro = user?.plan === 'pro';
  
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 animate-fade-up">
      {isGuest && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl shadow-blue-500/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm"><Sparkles className="w-6 h-6" /></div>
            <div>
              <p className="font-bold text-lg">You are in Guest Mode</p>
              <p className="text-sm opacity-90">Sign up to save history and unlock unlimited scans.</p>
            </div>
          </div>
          <Button variant="secondary" onClick={onAuthRequired}>Sign Up Now</Button>
        </div>
      )}

      {!isPro && !isGuest && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 px-6 py-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Zap className="w-6 h-6 text-amber-500" />
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Upgrade to Pro for unlimited scans, bulk uploads, and result exports.</p>
          </div>
          <Button variant="primary" className="bg-amber-600 hover:bg-amber-700" onClick={onTriggerUpgrade}>Upgrade to Pro</Button>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="animate-fade-in">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome back, {displayName} 👋</h2>
          <p className="text-gray-500 dark:text-gray-400">Your AI insights are ready.</p>
        </div>
        
        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl flex gap-1 self-start shadow-inner">
          <button 
            onClick={() => setRole('candidate')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${role === 'candidate' ? 'bg-white dark:bg-gray-900 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <UserCheck className="w-4 h-4" /> Candidate
          </button>
          <button 
            onClick={async () => {
              if (isGuest) { onAuthRequired(); return; }
              if (!isPro) {
                showToast({ type: 'info', message: 'Recruiter role requires a Pro upgrade', actionLabel: 'Upgrade', action: () => { onTriggerUpgrade(); showToast(null); } });
                setTimeout(() => showToast(null), 6000);
                return;
              }

              try {
                if (user && user.id) {
                  const res: any = await updateCurrentUserRole('recruiter');
                  if (res.error) { showToast({ type: 'error', message: res.error }); setTimeout(() => showToast(null), 6000); return; }
                  setUser(res.user);
                }
                setRole('recruiter');
                showToast({ type: 'success', message: 'Role updated to Recruiter' });
                setTimeout(() => showToast(null), 3500);
              } catch (err) {
                console.error('Failed to set recruiter role:', err);
                showToast({ type: 'error', message: 'Failed to set recruiter role. Please try again.' });
                setTimeout(() => showToast(null), 6000);
              }
            }}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${role === 'recruiter' ? 'bg-white dark:bg-gray-900 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'} ${!isPro ? 'opacity-60 cursor-not-allowed' : ''}`}
            disabled={!isPro}
          >
            <Briefcase className="w-4 h-4" /> Recruiter
          </button>
        </div>
        {!isPro && !isGuest && (
          <div className="mt-2 text-xs text-gray-500">Recruiter role requires a <button onClick={onTriggerUpgrade} className="text-blue-600 underline">Pro upgrade</button>.</div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30 group hover:scale-[1.02] transition-transform duration-300">
          <div className="flex items-center gap-3 mb-4 text-blue-600 dark:text-blue-400">
            <History className="w-6 h-6" /><h3 className="font-semibold">Scan History</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{isPro ? scans.length : `${scans.length} / ${GUEST_LIMIT}`}</p>
          <p className="text-sm text-gray-500">{isPro ? 'Unlimited scans active' : 'Free usage limit'}</p>
        </Card>
        <Card className="p-6 bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30 group hover:scale-[1.02] transition-transform duration-300">
          <div className="flex items-center gap-3 mb-4 text-green-600 dark:text-green-400">
            <ShieldCheck className="w-6 h-6" /><h3 className="font-semibold">Privacy Score</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">100%</p>
          <p className="text-sm text-gray-500">No training on user data</p>
        </Card>
        <Card className="p-6 bg-purple-50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-900/30 group hover:scale-[1.02] transition-transform duration-300">
          <div className="flex items-center gap-3 mb-4 text-purple-600 dark:text-purple-400">
            <TrendingUp className="w-6 h-6" /><h3 className="font-semibold">Active Mode</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white capitalize">{role}</p>
          <p className="text-sm text-gray-500">Optimized for you</p>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Your previous scans</h3>
          <Button onClick={onNewScan} icon={Upload}>New Analysis</Button>
        </div>
        {scans.length === 0 ? (
          <div className="text-center py-24 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-dashed dark:border-gray-800">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No previous scans found. Your scans are securely saved and private.</p>
            <Button variant="ghost" onClick={onNewScan} className="mt-4">Start your first analysis</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {scans.slice().reverse().map((scan: any) => (
              <Card key={scan.id} className="p-5 flex items-center justify-between group hover:border-blue-300 dark:hover:border-blue-800 transition-all cursor-pointer" onClick={() => onViewScan(scan)}>
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-2xl group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-colors"><FileText className="w-6 h-6 text-blue-600" /></div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">{scan.fileName}</h4>
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{new Date(scan.timestamp).toLocaleString()} • {scan.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-lg font-black text-blue-600">{scan.insights.matchScore}%</p>
                    <p className="text-[10px] text-gray-400 uppercase font-bold">Match Score</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-600 transition-all" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const UploadSection = ({ role, user, isGuest, onAnalyze, onTriggerUpgrade }: any) => {
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [jdText, setJdText] = useState<string>("");
  // Mode controls whether we show the typed JD textarea or the upload control. Default to 'upload'.
  // This ensures the Upload JD dropzone is visible on first render / refresh when no prior choice exists.
  const [jdMode, setJdMode] = useState<'type' | 'upload'>('upload');
  // If a JD file is set, prefer upload mode; if typed JD is present prefer type mode.
  useEffect(() => { if (jdFile && jdMode !== 'upload') { setJdMode('upload'); } }, [jdFile]);
  useEffect(() => { if (jdText && jdText.trim() && jdMode !== 'type') { setJdMode('type'); } }, [jdText]);
  const [resumes, setResumes] = useState<File[]>([]);
  const [guestName, setGuestName] = useState("");
  const [error, setError] = useState("");
  const isPro = user?.plan === 'pro';

  const handleAnalyze = () => {
    setError("");
    if (!jdFile && !jdText.trim()) { setError("Job Description is required."); return; }
    if (resumes.length === 0) { setError("At least one resume is required."); return; }
    
    // Pro Trigger for Bulk
    if (resumes.length > 1 && !isPro) {
      onTriggerUpgrade();
      return;
    }

    if (role === 'candidate') {
      const nameToCheck = isGuest ? guestName.toLowerCase() : user.name.toLowerCase();
      if (!nameToCheck) { setError("Please provide your name for validation."); return; }
      const firstResume = resumes[0].name.toLowerCase();
      if (!firstResume.includes(nameToCheck.split(' ')[0]) && !firstResume.includes(nameToCheck.split(' ').pop() || '')) {
        setError("Name mismatch: Resume file name must contain your name for Candidate mode.");
        return;
      }
    }
    onAnalyze(jdFile, resumes, jdText);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 animate-fade-up">
      <div className="text-center space-y-3">
        <h2 className="text-4xl font-extrabold tracking-tight">{role === 'candidate' ? 'Analyze Your Career Fit' : 'Bulk Candidate Screening'}</h2>
        <p className="text-gray-500 max-w-xl mx-auto">Smart resume decisions, powered by responsible AI. Analyze with confidence using privacy-first insights.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="p-8 space-y-5 hover:border-blue-200 dark:hover:border-blue-900 transition-colors">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2"><Briefcase className="w-5 h-5 text-blue-600" /> Job Description</h3>
            {/* Segmented control placed immediately below the title to feel integrated with the header. */}
            <div className="mt-3 flex justify-center">
              <div role="tablist" aria-label="Job description input mode" className="inline-flex rounded-full border border-gray-200 dark:border-gray-800 overflow-hidden">
                <button
                  role="tab"
                  aria-selected={jdMode === 'type'}
                  onClick={() => { setJdMode('type'); setJdFile(null); }}
                  className={`px-4 py-2 text-sm font-bold flex-1 text-center transition-colors duration-150 focus:outline-none ${jdMode === 'type' ? 'bg-blue-50 dark:bg-blue-900/10 text-blue-600 shadow-inner' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900/20' } rounded-l-full`}
                  style={{ lineHeight: '1' }}
                >
                  <span className="block leading-tight">Type JD</span>
                </button>
                <button
                  role="tab"
                  aria-selected={jdMode === 'upload'}
                  onClick={() => { setJdMode('upload'); setJdText(''); }}
                  className={`px-4 py-2 text-sm font-bold flex-1 text-center transition-colors duration-150 focus:outline-none ${jdMode === 'upload' ? 'bg-blue-50 dark:bg-blue-900/10 text-blue-600 shadow-inner' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900/20' } rounded-r-full`}
                  style={{ lineHeight: '1' }}
                >
                  <span className="block leading-tight">Upload JD</span>
                </button>
              </div>
            </div>
          </div>

          <div className={`p-10 border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 transition-all duration-300 ${jdFile ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-800 hover:border-blue-400'}`}>
            {/* Show only the selected input. Typed JD continues to take priority in processing logic. */}
            {jdMode === 'type' ? (
              <textarea
                placeholder="Paste or type the job description here (optional). If provided, this text will be used for analysis instead of uploaded JD file."
                className="w-full px-4 py-3 rounded-2xl border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                rows={4}
              />
            ) : (
              // Upload mode
              jdFile ? (
                <div className="flex items-center gap-4 w-full p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-green-100">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                  <span className="truncate flex-1 font-bold text-gray-800 dark:text-gray-200">{jdFile.name}</span>
                  <button onClick={() => setJdFile(null)} className="p-2 hover:bg-red-50 rounded-full text-gray-400 hover:text-red-500 transition-colors"><X className="w-5 h-5" /></button>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl"><Upload className="w-10 h-10 text-blue-600" /></div>
                  <input type="file" id="jd" className="hidden" onChange={(e) => setJdFile(e.target.files?.[0] || null)} accept=".pdf,.docx,.txt,.jpg,.jpeg,.png" />
                  <Button variant="outline" onClick={() => document.getElementById('jd')?.click()}>Upload JD</Button>
                  <p className="text-xs text-gray-400 font-medium">Supported: PDF, DOCX, TXT, or Image</p>
                </>
              )
            )}
          </div>
        </Card>

        <Card className="p-8 space-y-5 hover:border-blue-200 dark:hover:border-blue-900 transition-colors">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" /> 
            {role === 'candidate' ? 'Your Resume' : 'Candidate Resumes'}
          </h3>
          <div className={`p-10 border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 transition-all duration-300 ${resumes.length > 0 ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-800 hover:border-blue-400'}`}>
            {/* Hidden input always available so recruiter can append files even after first upload */}
            <input 
              type="file" 
              id="resumes" 
              className="hidden" 
              multiple={role === 'recruiter'} 
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (role === 'recruiter') {
                  // Append new resumes to existing list for recruiter mode
                  setResumes(prev => [...prev, ...files]);
                } else {
                  // Preserve existing single-file behavior for candidate/guest
                  setResumes(files);
                }
                // Reset the input so user can re-upload the same file or upload more files later
                try { (e.target as HTMLInputElement).value = ''; } catch (_) {}
              }} 
              accept=".pdf,.doc,.docx" 
            />

            {resumes.length > 0 ? (
              <div className="w-full space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-100">
                  <span className="text-sm font-black text-green-700 dark:text-green-400">{resumes.length} File(s) Selected</span>
                  <button onClick={() => setResumes([])} className="p-2 hover:bg-red-50 rounded-full text-gray-400 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
                  {resumes.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg text-xs font-medium border border-gray-100 dark:border-gray-700">
                      <FileText className="w-3 h-3 text-blue-500" />
                      <span className="truncate">{f.name}</span>
                    </div>
                  ))}
                </div>
                {resumes.length > 1 && !isPro && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-100 text-[10px] text-amber-700">
                    <Zap className="w-3 h-3" /> <span>Bulk upload requires Pro</span>
                  </div>
                )}
                {/* For recruiters, allow uploading more files even after initial selection */}
                {role === 'recruiter' && (
                  <div className="flex justify-center pt-2">
                    <Button variant="outline" onClick={() => document.getElementById('resumes')?.click()}>
                      Upload Resume{role === 'recruiter' ? 's' : ''}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl"><Upload className="w-10 h-10 text-blue-600" /></div>
                <Button variant="outline" onClick={() => document.getElementById('resumes')?.click()}>
                  Upload Resume{role === 'recruiter' ? 's' : ''}
                </Button>
                <p className="text-xs text-gray-400 font-medium">Supported: PDF, DOC, or DOCX</p>
              </>
            )}
          </div>
        </Card>
      </div>

      {role === 'candidate' && isGuest && (
        <Card className="p-8 max-w-md mx-auto animate-fade-up">
          <label className="block text-sm font-black mb-3 text-gray-700 dark:text-gray-300">Your Full Name (for validation)</label>
          <input 
            type="text" 
            placeholder="e.g. Nagarjuna Reddy" 
            className="w-full px-5 py-3 rounded-2xl border dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />
        </Card>
      )}

      {error && <div className="text-red-500 text-center font-bold animate-bounce flex items-center justify-center gap-2"><AlertCircle className="w-5 h-5" />{error}</div>}
      <div className="flex justify-center pt-4">
        <Button 
          variant={resumes.length > 1 && !isPro ? 'pro' : 'primary'} 
          className="w-full max-w-md h-14 text-lg" 
          onClick={handleAnalyze} 
          icon={resumes.length > 1 && !isPro ? Zap : TrendingUp}
        >
          {resumes.length > 1 && !isPro ? 'Upgrade to Pro for Bulk Scan' : 'Start Professional Analysis'}
        </Button>
      </div>
    </div>
  );
};

const RecruiterResults = ({ results, isPro, onBack, onExport, onTriggerUpgrade }: any) => {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 animate-fade-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-blue-600 font-medium transition-colors">
          <ArrowRight className="w-5 h-5 rotate-180" /> Dashboard
        </button>
        <div className="flex gap-3">
          {isPro ? (
            <Button variant="outline" onClick={() => onExport('csv')} icon={FileSpreadsheet}>Export Results (CSV)</Button>
          ) : (
            <Button variant="outline" className="opacity-70" onClick={onTriggerUpgrade} icon={Lock}>Export Disabled (Free)</Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600"><Briefcase className="w-6 h-6" /></div>
        <h2 className="text-3xl font-extrabold">Screening Results ({results.length} Candidates)</h2>
      </div>

      <div className="grid grid-cols-1 gap-5">
        {results.map((res: any, i: number) => (
          <Card key={i} className="p-8 flex flex-col md:flex-row justify-between items-center gap-8 group hover:shadow-lg transition-all border-l-4 border-l-transparent hover:border-l-blue-600">
            <div className="flex items-center gap-6 flex-1">
              <div className="w-14 h-14 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 group-hover:text-blue-600 transition-all font-black text-xl">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <h4 className="font-extrabold text-xl truncate group-hover:text-blue-600 transition-colors">{res.fileName}</h4>
                <div className="flex flex-wrap gap-2 mt-3">
                  {res.insights.skills.slice(0, 5).map((s: any, j: number) => (
                    <span key={j} className="text-[10px] px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold uppercase tracking-widest">{s.name}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-10 w-full md:w-auto">
              <div className="flex-1 md:w-56">
                <div className="flex justify-between text-[11px] mb-2 font-black uppercase tracking-wider text-gray-400">
                  <span>Match Probability</span>
                  <span className="text-blue-600"><CountUp end={res.insights.matchScore} />%</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-800 h-3 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-1000 ease-out shadow-sm" style={{ width: `${res.insights.matchScore}%` }} />
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-gray-300 group-hover:text-blue-600 transition-all" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const PrivacyModal = ({ isOpen, onConfirm, onCancel }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
      <Card className="w-full max-w-lg p-10 animate-fade-up border-none shadow-2xl">
        <div className="flex items-center gap-4 mb-8 text-blue-600">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl"><ShieldCheck className="w-10 h-10" /></div>
          <h3 className="text-3xl font-extrabold tracking-tight">AI Consent & Privacy</h3>
        </div>
        <div className="space-y-5 text-gray-600 dark:text-gray-400 text-sm mb-10 leading-relaxed">
          <p>This professional analysis is powered by <span className="font-black text-gray-900 dark:text-gray-100">OpenAI GPT-4o-mini</span>.</p>
          <ul className="space-y-4">
            <li className="flex gap-4"><CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" /> <span className="pt-0.5">Your data is processed <span className="font-bold">exclusively</span> for this specific resume analysis.</span></li>
            <li className="flex gap-4"><CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" /> <span className="pt-0.5">We <span className="font-bold">never</span> use your data to train or fine-tune AI models.</span></li>
            <li className="flex gap-4"><CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" /> <span className="pt-0.5">AI insights are generated only after your explicit consent.</span></li>
          </ul>
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 italic text-xs">
            "We prioritize your professional privacy. Your documents are volatile and deleted after the session unless saved to your secure history."
          </div>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" className="flex-1 py-4" onClick={onCancel}>Maybe later</Button>
          <Button variant="primary" className="flex-1 py-4" onClick={onConfirm}>I Agree & Continue</Button>
        </div>
      </Card>
    </div>
  );
};

const UpgradeModal = ({ isOpen, onAuth, onUpgradePro, onCancel }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
      <Card className="w-full max-w-lg p-10 animate-fade-up border-none shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5"><Zap className="w-32 h-32" /></div>
        <div className="flex items-center gap-4 mb-8 text-blue-600">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl animate-pulse"><Zap className="w-10 h-10" /></div>
          <h3 className="text-3xl font-extrabold tracking-tight">Unlock Full AI Resume Insights</h3>
        </div>
        
        <div className="space-y-6 text-gray-600 dark:text-gray-400 text-sm mb-10 leading-relaxed">
          <p className="text-lg font-medium text-gray-800 dark:text-gray-200">You’ve reached the free usage limit.</p>
          <p>Upgrade to Pro to continue analyzing resumes with advanced AI-powered insights.</p>
          
          <div className="grid grid-cols-1 gap-4 mt-6">
            <div className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" /> <span>Unlimited resume scans</span></div>
            <div className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" /> <span>Candidate & Recruiter modes</span></div>
            <div className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" /> <span>Bulk resume comparison (Priority)</span></div>
            <div className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" /> <span>Export results (PDF / CSV)</span></div>
            <div className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" /> <span>Secure scan history permanently saved</span></div>
          </div>

          <div className="flex items-center gap-2 pt-6 border-t border-gray-100 dark:border-gray-800">
            <Lock className="w-4 h-4 text-green-500" />
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">🔒 Your data is private.</p>
          </div>
          <p className="text-[10px] text-gray-400">Powered by OpenAI GPT-4.0-mini. We never use your data to train AI models or share it with others.</p>
        </div>

        <div className="flex flex-col gap-3">
          <Button variant="pro" className="w-full py-4 text-lg font-black" onClick={onUpgradePro}>Upgrade to Pro</Button>
          <Button variant="ghost" className="w-full py-3" onClick={onCancel}>Maybe later</Button>
        </div>
      </Card>
    </div>
  );
};

// Helper: Evaluate password strength (simple deterministic rules)
const getPasswordScore = (pw: string) => {
  let score = 0;
  if (!pw || pw.length === 0) return { score, label: '', pct: 0 };
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const capped = Math.min(score, 3);
  const label = capped <= 1 ? 'Weak' : (capped === 2 ? 'Medium' : 'Strong');
  const pct = Math.round((capped / 3) * 100);
  return { score: capped, label, pct };
};

// Reusable password input with emoji toggle
const PasswordInput = ({ value, onChange, id, placeholder, disabled, inputRefProp }: any) => {
  const [visible, setVisible] = useState(false);
  const localRef = useRef<HTMLInputElement | null>(null);
  const refToUse = inputRefProp || localRef;
  return (
    <div className="relative">
      <input
        id={id}
        ref={refToUse}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={disabled ? undefined : undefined}
        className={`w-full px-4 py-3 rounded-2xl border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        onMouseDown={(e) => e.preventDefault()} // prevent blur
        onClick={() => setVisible(v => !v)}
        disabled={disabled}
        className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm cursor-pointer select-none opacity-70 hover:opacity-100 transition-opacity ${disabled ? 'pointer-events-none opacity-40' : ''}`}
        style={{ lineHeight: 1 }}
      >
        {visible ? '👁️' : '🙈'}
      </button>
    </div>
  );
};

const StrengthMeter = ({ password }: any) => {
  const { label, pct } = getPasswordScore(password);
  if (!password || password.length === 0) return null;
  const colorClass = label === 'Weak' ? 'bg-red-500' : (label === 'Medium' ? 'bg-amber-500' : 'bg-green-500');
  return (
    <div className="mt-2">
      <div className="w-full bg-gray-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
        <div className={`${colorClass} h-2 transition-all duration-500 ease-out`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs font-bold text-gray-600 dark:text-gray-300">{label}</div>
    </div>
  );
};

// --- Main App ---

const App = () => {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [page, setPage] = useState<'dashboard' | 'upload' | 'processing' | 'results' | 'auth' | 'reset'>('auth');
  const [role, setRole] = useState<Role>('candidate');
  // Theme handling: respect system preference unless user explicitly chooses a theme. Do NOT persist system preference on mount.
  const [manualTheme, setManualTheme] = useState<'light' | 'dark' | null>(() => {
    try {
      const saved = localStorage.getItem('resuscan_theme');
      return (saved === 'light' || saved === 'dark') ? (saved as 'light' | 'dark') : null;
    } catch {
      return null;
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('resuscan_theme');
      if (saved === 'light' || saved === 'dark') return saved as 'light' | 'dark';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  // Profile dropdown state & handlers (minimal, accessible)
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const [canChangePw, setCanChangePw] = useState(false);
  const [authProvider, setAuthProvider] = useState<string | null>(null);
  // Email verification status for subtle UI badges and gating
  const [isEmailVerified, setIsEmailVerified] = useState<boolean | null>(null);
  const [isEmailUser, setIsEmailUser] = useState<boolean | null>(null);
  const [isOAuthUser, setIsOAuthUser] = useState<boolean | null>(null);

  // Reset Password modal state (opened from profile dropdown)
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetPw, setResetPw] = useState('');
  const [resetConfirmPw, setResetConfirmPw] = useState('');

  // Dedicated Reset Page (when user clicks recovery link)
  const [resetPageNew, setResetPageNew] = useState('');
  const [resetPageConfirm, setResetPageConfirm] = useState('');
  const [resetPageError, setResetPageError] = useState<string | null>(null);
  const [resetPageProcessing, setResetPageProcessing] = useState(false);

  // Change Password modal state (full flow with old/new/confirm)
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [cpOld, setCpOld] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpError, setCpError] = useState<string | null>(null);
  const [cpOldError, setCpOldError] = useState<string | null>(null);
  const [cpNewError, setCpNewError] = useState<string | null>(null);
  const [cpConfirmError, setCpConfirmError] = useState<string | null>(null);
  const [cpProcessing, setCpProcessing] = useState(false);
  const cpOldRef = useRef<HTMLInputElement | null>(null);

  // Toast system (replaces previous single successMessage)
  const [toast, setToast] = useState<null | { type: 'success' | 'info' | 'error', message: string, actionLabel?: string, action?: () => void }>(null);

  useEffect(() => {
    if (!profileOpen) return;
    let mounted = true;
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileOpen(false);
    };

    // Compute whether change password should be shown and detect auth provider for OAuth users
    (async () => {
      try {
        // If session is guest, quickly deny (UI passes isGuest state)
        if (isGuest) {
          if (mounted) { setCanChangePw(false); setAuthProvider(null); setIsEmailVerified(null); setIsEmailUser(null); setIsOAuthUser(null); }
        } else {
          const cp = await canChangePassword();
          if (mounted) setCanChangePw(!!cp);

          // Determine provider (google/github/email/other) for informational UI
          try {
            const provider = await getAuthProvider();
            if (mounted) setAuthProvider(provider ? String(provider).toLowerCase() : null);
          } catch (err) {
            if (mounted) setAuthProvider(null);
          }

          // Pull auth status (email verified / oauth / email user)
          try {
            const status = await getAuthStatus();
            if (mounted) {
              setIsEmailVerified(status.isEmailVerified);
              setIsEmailUser(status.isEmailUser);
              setIsOAuthUser(status.isOAuthUser);
            }
          } catch (err) {
            if (mounted) { setIsEmailVerified(null); setIsEmailUser(null); setIsOAuthUser(null); }
          }
        }
      } catch (err) {
        console.error('Failed to determine canChangePassword:', err);
        if (mounted) { setCanChangePw(false); setAuthProvider(null); }
      }
    })();

    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      mounted = false;
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen, isGuest]);

  // Close reset modal on Escape or outside click
  useEffect(() => {
    if (!resetModalOpen) return;
    const onClick = (e: MouseEvent) => {
      const el = document.getElementById('reset-modal');
      if (el && !el.contains(e.target as Node)) setResetModalOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setResetModalOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [resetModalOpen]);

  // Focus first input when change password modal opens
  useEffect(() => {
    if (!changePwOpen) return;
    setTimeout(() => { try { cpOldRef.current?.focus(); } catch (e) { /* ignore */ } }, 80);
  }, [changePwOpen]);

  // Reset change password state when dialog closes
  useEffect(() => {
    if (changePwOpen) return;
    setCpOld(''); setCpNew(''); setCpConfirm(''); setCpError(null); setCpOldError(null); setCpNewError(null); setCpConfirmError(null); setCpProcessing(false);
  }, [changePwOpen]);

  // Manage body scroll lock and ESC handling for change password modal, plus focus trap
  useEffect(() => {
    if (!changePwOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const modal = document.getElementById('change-pw-modal');
    // focus first input when opened
    const firstInput: HTMLElement | null = modal ? modal.querySelector('input') : null;
    firstInput?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChangePwOpen(false);
      if (e.key === 'Tab' && modal) {
        // Focus trap: keep tab within modal
        const focusable = Array.from(modal.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute('disabled'));
        if (focusable.length === 0) return;
        const idx = focusable.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && idx === 0) { e.preventDefault(); focusable[focusable.length - 1].focus(); }
        else if (!e.shiftKey && idx === focusable.length - 1) { e.preventDefault(); focusable[0].focus(); }
      }
    };
    const onClick = (e: MouseEvent) => {
      const el = document.getElementById('change-pw-modal');
      if (el && !el.contains(e.target as Node)) setChangePwOpen(false);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [changePwOpen]);

  const [guestScans, setGuestScans] = useState<ResumeScan[]>([]);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<{jd: File | null, resumes: File[], jdText?: string} | null>(null);
  const [activeScan, setActiveScan] = useState<ResumeScan | null>(null);
  const [recruiterResults, setRecruiterResults] = useState<ResumeScan[]>([]);

  useEffect(() => {
    (async () => {
      const guests = storage.getGuestScans();
      setGuestScans(guests);

      try {
        const svcUser = await getCurrentUserFromAuth();
        if (svcUser) { setUser(svcUser); setIsGuest(false); setPage('dashboard'); return; }
      } catch (err) {
        // Log but don't block UX
        console.error('Failed fetching current user from auth service:', err);
      }

      // Fallback to local storage session (for guest/dev flows)
      const session = storage.getCurrentUser();
      if (session) { setUser(session); setIsGuest(false); setPage('dashboard'); }
    })();

    // Detect Supabase reset link in URL: if present, show dedicated Reset Password page
    try {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
      if (params.get('type') === 'recovery' || params.get('access_token') || hashParams.get('access_token') || hashParams.get('type') === 'recovery') {
        setPage('reset');
      }
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    // Update the DOM class to reflect effective theme (do NOT persist here).
    document.documentElement.className = theme;
  }, [theme]);

  // Listen to system/theme preference changes and follow them unless the user explicitly picked a theme.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (!manualTheme) setTheme(e.matches ? 'dark' : 'light');
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener?.(onChange as any);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener?.(onChange as any);
    };
  }, [manualTheme]);

  const handleLogout = () => { storage.setCurrentUser(null); setUser(null); setIsGuest(false); setPage('auth'); };

  const handleAuthSuccess = (u: UserAccount) => {
    const guests = storage.getGuestScans();
    if (guests.length > 0) {
      u.scans = [...u.scans, ...guests].sort((a,b) => b.timestamp - a.timestamp);
      storage.setUsers(storage.getUsers().map(usr => usr.email === u.email ? u : usr));
      storage.clearGuestScans();
      setGuestScans([]);
    }
    setUser(u); setIsGuest(false); setPage('dashboard');
  };

  const executeAnalysis = async () => {
    if (!pendingAnalysis) return;
    setIsPrivacyOpen(false);

    // Double-check: ensure logged-in user's email is verified before kicking off AI work
    if (!isGuest && user) {
      try {
        let confirmed = true;
        if (supabase && supabase.auth) {
          if (typeof supabase.auth.getUser === 'function') {
            const { data, error } = await supabase.auth.getUser();
            if (error) console.error('Supabase getUser error:', error);
            const current = data?.user || (data as any);
            if (current && ('email_confirmed_at' in current)) confirmed = !!current.email_confirmed_at;
          } else if (typeof supabase.auth.getSession === 'function') {
            const { data, error } = await supabase.auth.getSession();
            if (error) console.error('Supabase getSession error:', error);
            const current = data?.session?.user;
            if (current && ('email_confirmed_at' in current)) confirmed = !!current.email_confirmed_at;
          } else if (typeof (supabase.auth.user) === 'function') {
            const current = (supabase.auth.user as any)();
            if (current && ('email_confirmed_at' in current)) confirmed = !!current.email_confirmed_at;
          }
        }
        if (!confirmed) {
          setToast({ type: 'info', message: 'Please verify your email to continue.' });
          setTimeout(() => setToast(null), 3500);
          setPage('dashboard');
          return;
        }
      } catch (err) {
        console.error('Error verifying user email status before analysis:', err);
        // Fail open and proceed if the check encounters unexpected errors
      }
    }

    setPage('processing');

    try {
      const results: ResumeScan[] = [];
      const jdText = pendingAnalysis.jdText && pendingAnalysis.jdText.trim() ? pendingAnalysis.jdText : (pendingAnalysis.jd ? `Job Description Context: ${pendingAnalysis.jd.name}. Core requirements include technical expertise, efficiency, and alignment with high-performance standards.` : '');

      for (const resume of pendingAnalysis.resumes) {
        const resumeText = `Professional Resume Context: ${resume.name}. Experience in domain, tools, and proven delivery metrics.`;
        const insights = await runOpenAIScan(resumeText, jdText, role);
        const scan: ResumeScan = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: Date.now(),
          fileName: resume.name,
          role,
          status: 'completed',
          insights
        };
        results.push(scan);
      }

      // Best-effort: persist the job description metadata and individual scan records to Supabase.
      // Any failures are logged to console but do NOT interrupt the user flow or UI.
      try {
        // Insert JD metadata if either typed JD text is present or a JD file was provided.
        // Preserve priority: if typed text exists use it as the text_snippet, otherwise fall back to the uploaded filename.
        const hasTypedJd = !!(pendingAnalysis.jdText && pendingAnalysis.jdText.trim());
        const hasJdFile = !!pendingAnalysis.jd;
        if (hasTypedJd || hasJdFile) {
          const jdTextToInsert = hasTypedJd ? pendingAnalysis.jdText!.trim() : (pendingAnalysis.jd ? pendingAnalysis.jd.name : undefined);
          await insertJobDescriptionRecord(pendingAnalysis.jd, jdTextToInsert as any, user?.email || (isGuest ? 'guest' : null));
        }
      } catch (err) {
        console.error('Supabase JD insert failed:', err);
      }

      for (const r of results) {
        try {
          await insertScanRecord(r, user?.email || (isGuest ? 'guest' : null));
        } catch (err) {
          console.error('Supabase Scan insert failed for', r.fileName, err);
        }
      }

      if (isGuest) {
        const updated = [...guestScans, ...results];
        setGuestScans(updated);
        storage.setGuestScans(updated);
        if (updated.length >= GUEST_LIMIT) {
            // No auto upgrade modal, just let them see the result first
        }
      } else if (user) {
        const updatedUser = { ...user, scans: [...user.scans, ...results] };
        storage.setUsers(storage.getUsers().map(u => u.email === user.email ? updatedUser : u));
        setUser(updatedUser);
      }

      if (role === 'candidate') {
        setActiveScan(results[0]);
        setPage('results');
      } else {
        setRecruiterResults(results);
        setPage('results');
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || 'An error occurred during analysis.' });
      setTimeout(() => setToast(null), 4500);
      setPage('dashboard');
    }
  };

  const exportCSV = () => {
    if (user?.plan !== 'pro') {
      setIsUpgradeOpen(true);
      return;
    }
    const data = role === 'candidate' ? [activeScan] : recruiterResults;
    const csvRows = [["Resume Name", "Role", "Match Score", "Matched Skills"]];
    data.forEach((s: any) => {
      csvRows.push([s.fileName, s.role, s.insights.matchScore, s.insights.skills.map((sk: any) => sk.name).join('; ')]);
    });
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `resuscan_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentScans = isGuest ? guestScans : (user?.scans || []);

  const triggerUpgrade = () => setIsUpgradeOpen(true);

  const upgradeToPro = async () => {
    if (!user) {
      setPage('auth');
      setIsUpgradeOpen(false);
      return;
    }

    // Get latest auth status (email verified, oauth, guest)
    try {
      const status = await getAuthStatus();
      if (status.isGuest) {
        // Guests must authenticate before upgrading
        setPage('auth');
        setIsUpgradeOpen(false);
        return;
      }

      if (status.isEmailUser && !status.isEmailVerified) {
        // Block upgrade and offer a resend action via toast CTA
        setToast({
          type: 'info',
          message: 'Please verify your email to upgrade to Pro.',
          actionLabel: 'Resend',
          action: async () => {
            setToast({ type: 'info', message: 'Sending verification email...' });
            const r = await resendVerification(user.email);
            if (r.error) setToast({ type: 'error', message: r.error?.message || r.error || 'Failed to resend verification email' });
            else setToast({ type: 'success', message: 'Verification email sent — check your inbox.' });
            setTimeout(() => setToast(null), 3500);
          }
        });
        return;
      }

      // Otherwise allow upgrade
      const updatedUser = { ...user, plan: 'pro' as Plan };
      storage.setUsers(storage.getUsers().map(u => u.email === user.email ? updatedUser : u));
      setUser(updatedUser);
      setIsUpgradeOpen(false);
    } catch (err: any) {
      console.error('Upgrade flow error:', err);
      await logAppError('upgradeToPro:error', err);
      setToast({ type: 'error', message: 'Failed to start upgrade. Please try again.' });
      setTimeout(() => setToast(null), 3500);
    }
  };

  // Handler for updating user password extracted from inline JSX for clarity and to avoid nested JSX braces
  const handleChangePassword = async () => {
    setCpError(null); setCpOldError(null); setCpNewError(null); setCpConfirmError(null);

    // Front-end validation (visual only)
    if (!cpOld) { setCpOldError('Please enter your current password.'); return; }
    if (!cpNew) { setCpNewError('Please enter a new password.'); return; }
    if (!cpConfirm) { setCpConfirmError('Please confirm your new password.'); return; }
    if (cpNew !== cpConfirm) { setCpConfirmError('Passwords do not match.'); return; }

    setCpProcessing(true);

    // First try local storage change for local accounts
    try {
      const users = storage.getUsers();
      const idx = users.findIndex(u => u.email === user?.email);
      if (idx !== -1 && users[idx].password === cpOld) {
        users[idx].password = cpNew;
        storage.setUsers(users);
        setChangePwOpen(false);
        setToast({ type: 'success', message: 'Password changed successfully' });
        setTimeout(() => setToast(null), 3500);
        setCpProcessing(false);
        return;
      }
    } catch (err) {
      console.error('Local password update error:', err);
      try { await logAppError('changePassword:local', err); } catch (e) { /* ignore */ }
      // continue to try Supabase if available
    }

    // Otherwise, attempt Supabase update for authenticated users
    try {
      if (supabase && supabase.auth) {
        // Attempt modern API first
        if (typeof (supabase.auth as any).updateUser === 'function') {
          const { data, error } = await (supabase.auth as any).updateUser({ password: cpNew });
          if (error) { setCpError('Failed to update password.'); await logAppError('changePassword:updateUser', error); setCpProcessing(false); return; }
          setChangePwOpen(false);
          setToast({ type: 'success', message: 'Password changed successfully' });
          setTimeout(() => setToast(null), 3500);
          setCpProcessing(false);
          return;
        } else if (typeof (supabase.auth as any).update === 'function') {
          const { data, error } = await (supabase.auth as any).update({ password: cpNew });
          if (error) { setCpError('Failed to update password.'); await logAppError('changePassword:update', error); setCpProcessing(false); return; }
          setChangePwOpen(false);
          setToast({ type: 'success', message: 'Password changed successfully' });
          setTimeout(() => setToast(null), 3500);
          setCpProcessing(false);
          return;
        }
      }
      setCpError('Password update is not available in this environment.');
      await logAppError('changePassword:notAvailable', new Error('Password update not available'));
    } catch (err) {
      console.error('Supabase password update error:', err);
      await logAppError('changePassword:exception', err);
      setCpError('Failed to update password. Please try again.');
    }
    setCpProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 transition-colors selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden">
      {(user || isGuest) && (
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b dark:border-gray-800 px-6 py-4 flex justify-between items-center animate-fade-in shadow-sm">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setPage('dashboard')}>
            <div className="w-9 h-9 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-105 transition-transform"><ShieldCheck className="text-white w-6 h-6" /></div>
            <h1 className="text-xl font-black tracking-tight">{APP_NAME}</h1>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => {
              const next = theme === 'light' ? 'dark' : 'light';
              setTheme(next);
              setManualTheme(next);
              try { localStorage.setItem('resuscan_theme', next); } catch {};
            }} className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              {theme === 'light' ? <Moon className="w-5 h-5 text-gray-600" /> : <Sun className="w-5 h-5 text-yellow-400" />}
            </button>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                 <div ref={profileRef} className="relative">
                  <button
                    onClick={() => setProfileOpen(v => !v)}
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                    className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center border border-blue-100 dark:border-blue-900/50 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    title={user?.name || 'Guest Account'}
                  >
                    <User className="w-5 h-5 text-blue-600" />
                  </button>

                  {profileOpen && (
                    <div role="menu" aria-label="User menu" className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-md py-2 z-50">
                      <div className="px-4 py-2">
                        <div className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{user?.name || 'Guest Account'}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email || 'guest'}</div>

                        {/* Email verification banner (subtle) */}
                        {(isEmailUser && isEmailVerified === false) && (
                          <div className="px-4 py-2">
                            <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-200 flex items-center justify-between gap-2">
                              <div>Verify your email to unlock upgrades.</div>
                              <button className="text-xs text-yellow-800 dark:text-yellow-200 underline" onClick={async () => {
                                setToast({ type: 'info', message: 'Sending verification email...' });
                                const r = await resendVerification(user?.email || '');
                                if (r.error) setToast({ type: 'error', message: r.error?.message || r.error || 'Failed to resend verification email' });
                                else setToast({ type: 'success', message: 'Verification email sent — check your inbox.' });
                                setTimeout(() => setToast(null), 3500);
                              }}>Resend</button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                      {!isGuest && (canChangePw ? (
                        <button
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => {
                            setProfileOpen(false);
                            setCpOld(''); setCpNew(''); setCpConfirm(''); setCpError(null);
                            setChangePwOpen(true);
                          }}
                        >
                          Change Password
                        </button>
                      ) : (
                        // If provider is OAuth, show an informational card
                        (authProvider === 'google' || authProvider === 'github') ? (
                          <div className="w-full px-4 py-2">
                            <div className="rounded-md bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-200">
                              {authProvider === 'google' ? 'Managed by Google' : 'Managed by GitHub'}
                            </div>
                          </div>
                        ) : null
                      ))}
                      <button
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => { setProfileOpen(false); handleLogout(); }}
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>

                <div className="hidden md:block">
                  <span className="text-sm font-black truncate max-w-[120px] block">{user?.name || "Guest Account"}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-black tracking-widest text-blue-600">{user?.plan || "Trial Mode"}</span>
                    {(isEmailUser && isEmailVerified === false) && (
                      <span className="text-[10px] text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 rounded-full">Unverified</span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Logout"><LogOut className="w-5 h-5" /></button>
            </div>
          </div>
        </header>
      )}

      {/* Reset Password Modal */}
{changePwOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div id="change-pw-modal" className="w-full max-w-lg p-6 animate-fade-up transform transition-all">
            <div className="rounded-2xl p-[1px] bg-gradient-to-tr from-blue-600/50 via-indigo-600/30 to-transparent shadow-2xl">
              <Card className="rounded-2xl ring-1 ring-white/5 shadow-none backdrop-blur-sm overflow-hidden">
<div className="rounded-t-2xl bg-white/3 dark:bg-white/4 border-b border-gray-100/5 dark:border-white/6 p-4 mb-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <Lock className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-extrabold">Change Password</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Enter your current password and set a new one.</p>
                  </div>
                  </div>
                </div>

                <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); /* submission handled by handler */ }}>
                  <div>
                    <label htmlFor="old-pw" className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Current Password</label>
                    <PasswordInput id="old-pw" inputRefProp={cpOldRef} value={cpOld} onChange={(e: any) => setCpOld(e.target.value)} placeholder="Enter current password" disabled={cpProcessing} />
                    <div className={`mt-2 text-sm text-red-500 transition-all duration-200 ${cpOldError ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`} aria-live="polite">{cpOldError}</div>
                  </div>

                  <div>
                    <label htmlFor="new-pw" className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">New Password</label>
                    <PasswordInput id="new-pw" value={cpNew} onChange={(e: any) => setCpNew(e.target.value)} placeholder="Create a new password" disabled={cpProcessing} />
                    <StrengthMeter password={cpNew} />
                    <div className={`mt-2 text-sm text-red-500 transition-all duration-200 ${cpNewError ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`} aria-live="polite">{cpNewError}</div>
                  </div>

                  <div>
                    <label htmlFor="confirm-pw" className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Confirm New Password</label>
                    <PasswordInput id="confirm-pw" value={cpConfirm} onChange={(e: any) => setCpConfirm(e.target.value)} placeholder="Confirm new password" disabled={cpProcessing} />
                    <div className={`mt-2 text-sm text-red-500 transition-all duration-200 ${cpConfirmError ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`} aria-live="polite">{cpConfirmError}</div>
                  </div>

                  <div className="pt-2">
                    <div className={`text-sm text-red-500 transition-all duration-200 ${cpError ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`} aria-live="polite">{cpError}</div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3 justify-end pt-2 w-full">
                    <Button variant="ghost" onClick={() => { if (!cpProcessing) setChangePwOpen(false); }} type="button" className="w-full sm:w-auto" disabled={cpProcessing}>Cancel</Button>
                    <Button onClick={handleChangePassword} type="button" className="w-full sm:w-auto" disabled={cpProcessing}>{cpProcessing ? 'Updating…' : 'Save'}</Button>
                  </div>
                </form>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed right-6 bottom-6 z-60">
          <div className={`px-4 py-3 rounded-2xl shadow-lg animate-fade-in-up flex items-center gap-4 ${toast.type === 'success' ? 'bg-blue-600 text-white' : toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}>
            <div className="font-semibold">{toast.message}</div>
            {toast.actionLabel && toast.action && (
              <button onClick={() => { try { toast.action && toast.action(); } catch (e) { console.error(e); } }} className={`ml-2 px-3 py-1 rounded-md font-semibold ${toast.type === 'success' ? 'bg-white text-blue-600' : toast.type === 'error' ? 'bg-white text-red-600' : 'bg-blue-600 text-white'}`}>
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}

      <main className="pb-24 pt-4">
        {page === 'auth' && <AuthPage onAuthSuccess={handleAuthSuccess} onGuestMode={() => { setIsGuest(true); setPage('dashboard'); }} showToast={(t: any) => setToast(t)} /> }

        {page === 'reset' && (
          <div className="min-h-screen flex items-center justify-center p-6">
            <Card className="w-full max-w-md p-8">
              <div className="mb-4">
                <h2 className="text-2xl font-bold">Reset Password</h2>
                <p className="text-sm text-gray-500">Complete your password reset by setting a new password.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                  <PasswordInput id="reset-new" value={resetPageNew} onChange={(e: any) => setResetPageNew(e.target.value)} placeholder="New password" />
                  <StrengthMeter password={resetPageNew} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New Password</label>
                  <PasswordInput id="reset-confirm" value={resetPageConfirm} onChange={(e: any) => setResetPageConfirm(e.target.value)} placeholder="Confirm new password" />
                </div>
                {resetPageError && <div className="text-red-500 text-sm">{resetPageError}</div>}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setPage('auth')}>Cancel</Button>
                  <Button onClick={async () => {
                    setResetPageError(null);
                    if (!resetPageNew || !resetPageConfirm) { setResetPageError('All fields are required.'); return; }
                    if (resetPageNew !== resetPageConfirm) { setResetPageError('Passwords do not match.'); return; }
                    setResetPageProcessing(true);
                    try {
                      if (supabase && supabase.auth) {
                        if (typeof (supabase.auth as any).updateUser === 'function') {
                          const { data, error } = await (supabase.auth as any).updateUser({ password: resetPageNew });
                          if (error) { setResetPageError('Failed to update password.'); console.error('Supabase updateUser error:', error); setResetPageProcessing(false); return; }
                        } else if (typeof (supabase.auth as any).update === 'function') {
                          const { data, error } = await (supabase.auth as any).update({ password: resetPageNew });
                          if (error) { setResetPageError('Failed to update password.'); console.error('Supabase update error:', error); setResetPageProcessing(false); return; }
                        } else {
                          setResetPageError('Password update is not available in this environment.'); setResetPageProcessing(false); return;
                        }

                        setToast({ type: 'success', message: 'Password reset successfully' });
                        setTimeout(() => setToast(null), 3500);
                        setPage('auth');
                      } else {
                        setResetPageError('Password reset is not available in this environment.');
                      }
                    } catch (err) {
                      console.error('Password reset failed:', err);
                      setResetPageError('Failed to reset password.');
                    }
                    setResetPageProcessing(false);
                  }} disabled={resetPageProcessing}>{resetPageProcessing ? 'Saving...' : 'Save New Password'}</Button>
                </div>
              </div>
            </Card>
          </div>
        )}
        
        {page === 'dashboard' && (
          <Dashboard 
            user={user} scans={currentScans} isGuest={isGuest} role={role} setRole={setRole} setUser={setUser}
            onNewScan={() => setPage('upload')} onViewScan={(s: any) => { setActiveScan(s); setPage('results'); }} 
            onAuthRequired={() => setPage('auth')} onTriggerUpgrade={triggerUpgrade}
            showToast={(t: any) => setToast(t)}
          />
        )}

        {page === 'upload' && (
          <UploadSection 
            role={role} user={user} isGuest={isGuest} onTriggerUpgrade={triggerUpgrade}
            onAnalyze={async (jd: File | null, resumes: File[], jdText?: string) => {
              // Block upgrade limit check first as before
              if ((isGuest && guestScans.length >= GUEST_LIMIT) || (!isGuest && user?.plan !== 'pro' && user!.scans.length >= GUEST_LIMIT)) { 
                  setIsUpgradeOpen(true); 
                  return; 
              }

              // For logged-in users, check email verification status via Supabase Auth BEFORE allowing analysis
              if (!isGuest && user) {
                try {
                  let confirmed = true; // default to allow
                  if (supabase && supabase.auth) {
                    if (typeof supabase.auth.getUser === 'function') {
                      const { data, error } = await supabase.auth.getUser();
                      if (error) console.error('Supabase getUser error:', error);
                      const current = data?.user || (data as any);
                      if (current && ('email_confirmed_at' in current)) {
                        confirmed = !!current.email_confirmed_at;
                      }
                    } else if (typeof supabase.auth.getSession === 'function') {
                      const { data, error } = await supabase.auth.getSession();
                      if (error) console.error('Supabase getSession error:', error);
                      const current = data?.session?.user;
                      if (current && ('email_confirmed_at' in current)) {
                        confirmed = !!current.email_confirmed_at;
                      }
                    } else if (typeof (supabase.auth.user) === 'function') {
                      const current = (supabase.auth.user as any)();
                      if (current && ('email_confirmed_at' in current)) {
                        confirmed = !!current.email_confirmed_at;
                      }
                    }
                  }

                  if (!confirmed) {
                    setToast({ type: 'info', message: 'Please verify your email to continue.' });
                    setTimeout(() => setToast(null), 3500);
                    return;
                  }
                } catch (err) {
                  console.error('Error verifying user email status:', err);
                  // Fail open: allow the action if verification check fails for unexpected reasons
                }
              }

              // If checks pass, proceed to set pending analysis and open privacy modal
              setPendingAnalysis({ jd, resumes, jdText }); setIsPrivacyOpen(true);
            }} 
          />
        )}

        {page === 'processing' && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center animate-fade-in">
            <div className="relative mb-8">
              <div className="w-24 h-24 border-4 border-blue-100 dark:border-blue-900/20 rounded-full animate-spin border-t-blue-600" />
              <div className="absolute inset-0 flex items-center justify-center"><Zap className="w-10 h-10 text-blue-600 animate-pulse" /></div>
            </div>
            <h2 className="text-3xl font-extrabold mb-3">Analyzing with Premium AI...</h2>
            <p className="text-gray-500 font-medium max-w-sm">Comparing deep resume semantics with job description relevance using GPT-4o-mini.</p>
            <div className="mt-8 flex gap-2">
                {[1,2,3].map(i => <div key={i} className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />)}
            </div>
          </div>
        )}

        {page === 'results' && (role === 'candidate' ? (
          <div className="max-w-5xl mx-auto p-6 space-y-10 animate-fade-up">
            <button onClick={() => setPage('dashboard')} className="flex items-center gap-2 text-gray-500 hover:text-blue-600 font-bold transition-colors">
                <ArrowRight className="w-5 h-5 rotate-180" /> Back to Dashboard
            </button>
            <Card className="p-10 space-y-8 relative overflow-hidden border-none shadow-2xl">
              <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none"><Sparkles className="w-64 h-64" /></div>
              
              <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b dark:border-gray-800 pb-8">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-black uppercase tracking-widest">Analysis Verified</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 font-black uppercase tracking-widest">PRO-AI MODEL</span>
                  </div>
                  <h1 className="text-4xl font-extrabold tracking-tight">{activeScan?.fileName}</h1>
                  <p className="text-gray-500 font-medium mt-1">Deep Resume Capability Analysis</p>
                </div>
                <div className="text-center md:text-right bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl min-w-[160px] border border-blue-100 dark:border-blue-900/40">
                  <div className="text-5xl font-black text-blue-600"><CountUp end={activeScan?.insights.matchScore || 0} />%</div>
                  <div className="text-[11px] font-black text-blue-800 dark:text-blue-300 uppercase tracking-widest mt-1">Match Score</div>
                </div>
              </div>

              <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                <h3 className="text-xs font-black uppercase tracking-widest text-blue-600 mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Executive Summary</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium">{activeScan?.insights.summary}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <h3 className="font-extrabold text-2xl flex items-center gap-3"><Award className="w-7 h-7 text-blue-600" /> Skills & Alignment</h3>
                  <div className="space-y-5">
                    {activeScan?.insights.skills.map((s, i) => (
                      <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-black text-gray-800 dark:text-gray-200">{s.name}</span>
                          <span className="text-[10px] px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 font-black rounded-lg">{s.level}</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 h-2.5 rounded-full overflow-hidden">
                          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${s.alignment}%` }} />
                        </div>
                        <div className="flex justify-end mt-1.5"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{s.alignment}% ALIGNED</span></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-6">
                  <h3 className="font-extrabold text-2xl flex items-center gap-3"><TrendingUp className="w-7 h-7 text-blue-600" /> Suggested Enhancements</h3>
                  <div className="space-y-4">
                    {activeScan?.insights.improvements.map((imp, i) => (
                        <div key={i} className="flex gap-4 p-4 bg-red-50/30 dark:bg-red-900/10 rounded-2xl border border-red-50 dark:border-red-900/20">
                            <div className="w-2 h-2 rounded-full bg-red-400 mt-1.5 shrink-0 animate-pulse" />
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 leading-relaxed">{imp}</p>
                        </div>
                    ))}
                  </div>

                  <h3 className="font-extrabold text-2xl flex items-center gap-3 mt-10"><Zap className="w-7 h-7 text-amber-500" /> Missing High-Impact Keywords</h3>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {activeScan?.insights.missingKeywords?.map((k, i) => (
                        <span key={i} className="px-4 py-2 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 text-xs font-black rounded-2xl border border-amber-100 dark:border-amber-900/30 shadow-sm">
                            {k}
                        </span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
            <div className="flex justify-center pt-4">
                <Button variant={user?.plan === 'pro' ? 'primary' : 'pro'} className="h-16 px-10 text-xl font-black" onClick={exportCSV} icon={user?.plan === 'pro' ? Download : Zap}>
                    {user?.plan === 'pro' ? 'Download Full CSV Report' : 'Upgrade to Export Report'}
                </Button>
            </div>
          </div>
        ) : (
          <RecruiterResults results={recruiterResults} isPro={user?.plan === 'pro'} onBack={() => setPage('dashboard')} onExport={exportCSV} onTriggerUpgrade={triggerUpgrade} />
        ))}
      </main>

      <footer className="max-w-7xl mx-auto py-16 px-6 border-t dark:border-gray-800 text-center text-gray-400 text-[11px] font-black tracking-widest uppercase animate-fade-in">
        <p className="mb-4">© {new Date().getFullYear()} Nagarjuna Reddy. All rights reserved.</p>
        <div className="flex justify-center gap-8 mb-6">
          <a href="#" className="hover:text-blue-600 transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-blue-600 transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-blue-600 transition-colors">Trust Center</a>
        </div>
        <div className="space-y-2 max-w-lg mx-auto normal-case font-medium text-gray-500 dark:text-gray-600">
            <p>• User data is NOT used to train AI models</p>
            <p>• User data is NOT shared with third parties</p>
            <p>• AI insights are generated only after user consent</p>
            <p>• Powered by OpenAI GPT-4.0-mini</p>
        </div>
      </footer>

      <PrivacyModal isOpen={isPrivacyOpen} onConfirm={executeAnalysis} onCancel={() => setIsPrivacyOpen(false)} />
      <UpgradeModal isOpen={isUpgradeOpen} onUpgradePro={upgradeToPro} onCancel={() => setIsUpgradeOpen(false)} />
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
