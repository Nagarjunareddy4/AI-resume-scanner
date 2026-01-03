
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
import { insertScanRecord, insertJobDescriptionRecord } from './src/services/supabaseClient';

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

const storage = {
  getUsers: (): UserAccount[] => JSON.parse(localStorage.getItem('resuscan_users') || '[]'),
  setUsers: (users: UserAccount[]) => localStorage.setItem('resuscan_users', JSON.stringify(users)),
  getCurrentUser: (): UserAccount | null => {
    const email = localStorage.getItem('resuscan_session');
    if (!email) return null;
    return storage.getUsers().find(u => u.email === email) || null;
  },
  setCurrentUser: (email: string | null) => {
    if (email) localStorage.setItem('resuscan_session', email);
    else localStorage.removeItem('resuscan_session');
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
    className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm ${className}`}
    {...props}
  >
    {children}
  </div>
);

// --- Pages ---

const AuthPage = ({ onAuthSuccess, onGuestMode }: any) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const users = storage.getUsers();

    if (isLogin) {
      const user = users.find(u => u.email === formData.email && u.password === formData.password);
      if (user) {
        storage.setCurrentUser(user.email);
        onAuthSuccess(user);
      } else {
        setError('Invalid email or password');
      }
    } else {
      if (users.find(u => u.email === formData.email)) {
        setError('Email already registered');
        return;
      }
      const newUser: UserAccount = { ...formData, scans: [], plan: 'free' };
      storage.setUsers([...users, newUser]);
      storage.setCurrentUser(newUser.email);
      onAuthSuccess(newUser);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-black animate-fade-up">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
            <ShieldCheck className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{isLogin ? 'Sign In' : 'Create Account'}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-center text-sm">
            AI-powered resume analysis with industry-standard privacy.
          </p>
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
            <input 
              required
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              onChange={e => setFormData({ ...formData, password: e.target.value })}
            />
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
          <div className="w-full flex items-center gap-2">
            <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
            <span className="text-xs text-gray-400 font-medium">OR</span>
            <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
          </div>
          <button onClick={onGuestMode} className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            Try for free as Guest <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </Card>
    </div>
  );
};

const Dashboard = ({ user, scans, isGuest, role, setRole, onNewScan, onViewScan, onAuthRequired, onTriggerUpgrade }: any) => {
  const displayName = user ? user.name : "Guest";
  const isPro = user?.plan === 'pro';
  
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 animate-fade-up">
      {isGuest && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl shadow-blue-500/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm"><Sparkles className="w-6 h-6" /></div>
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
        
        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl flex gap-1 self-start shadow-inner">
          <button 
            onClick={() => setRole('candidate')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${role === 'candidate' ? 'bg-white dark:bg-gray-900 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <UserCheck className="w-4 h-4" /> Candidate
          </button>
          <button 
            onClick={() => setRole('recruiter')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${role === 'recruiter' ? 'bg-white dark:bg-gray-900 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Briefcase className="w-4 h-4" /> Recruiter
          </button>
        </div>
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
                  <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-colors"><FileText className="w-6 h-6 text-blue-600" /></div>
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
          <h3 className="font-bold text-lg flex items-center gap-2"><Briefcase className="w-5 h-5 text-blue-600" /> Job Description</h3>
          <div className={`p-10 border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 transition-all duration-300 ${jdFile ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-800 hover:border-blue-400'}`}>
            {/* Text input for JD - users can type/paste a job description. If both text and file are present, typed text takes precedence. */}
            <textarea
              placeholder="Paste or type the job description here (optional). If provided, this text will be used for analysis instead of uploaded JD file."
              className="w-full px-4 py-3 rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={4}
            />

            {jdFile ? (
              <div className="flex items-center gap-4 w-full p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-green-100">
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
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100">
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
            className="w-full px-5 py-3 rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
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
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600"><Briefcase className="w-6 h-6" /></div>
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

// --- Main App ---

const App = () => {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [page, setPage] = useState<'dashboard' | 'upload' | 'processing' | 'results' | 'auth'>('auth');
  const [role, setRole] = useState<Role>('candidate');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('resuscan_theme');
    return saved ? (saved as any) : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });

  const [guestScans, setGuestScans] = useState<ResumeScan[]>([]);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<{jd: File | null, resumes: File[], jdText?: string} | null>(null);
  const [activeScan, setActiveScan] = useState<ResumeScan | null>(null);
  const [recruiterResults, setRecruiterResults] = useState<ResumeScan[]>([]);

  useEffect(() => {
    const session = storage.getCurrentUser();
    const guests = storage.getGuestScans();
    setGuestScans(guests);
    if (session) { setUser(session); setIsGuest(false); setPage('dashboard'); }
  }, []);

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem('resuscan_theme', theme);
  }, [theme]);

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
        await insertJobDescriptionRecord(pendingAnalysis.jd, jdText, user?.email || (isGuest ? 'guest' : null));
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
      alert(err.message || "An error occurred during analysis.");
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

  const upgradeToPro = () => {
    if (!user) {
      setPage('auth');
      setIsUpgradeOpen(false);
      return;
    }
    const updatedUser = { ...user, plan: 'pro' as Plan };
    storage.setUsers(storage.getUsers().map(u => u.email === user.email ? updatedUser : u));
    setUser(updatedUser);
    setIsUpgradeOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 transition-colors selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden">
      {(user || isGuest) && (
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b dark:border-gray-800 px-6 py-4 flex justify-between items-center animate-fade-in shadow-sm">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setPage('dashboard')}>
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-105 transition-transform"><ShieldCheck className="text-white w-6 h-6" /></div>
            <h1 className="text-xl font-black tracking-tight">{APP_NAME}</h1>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              {theme === 'light' ? <Moon className="w-5 h-5 text-gray-600" /> : <Sun className="w-5 h-5 text-yellow-400" />}
            </button>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center border border-blue-100 dark:border-blue-900/50">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div className="hidden md:block">
                  <span className="text-sm font-black truncate max-w-[120px] block">{user?.name || "Guest Account"}</span>
                  <span className="text-[10px] uppercase font-black tracking-widest text-blue-600">{user?.plan || "Trial Mode"}</span>
                </div>
              </div>
              <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Logout"><LogOut className="w-5 h-5" /></button>
            </div>
          </div>
        </header>
      )}

      <main className="pb-24 pt-4">
        {page === 'auth' && <AuthPage onAuthSuccess={handleAuthSuccess} onGuestMode={() => { setIsGuest(true); setPage('dashboard'); }} />}
        
        {page === 'dashboard' && (
          <Dashboard 
            user={user} scans={currentScans} isGuest={isGuest} role={role} setRole={setRole} 
            onNewScan={() => setPage('upload')} onViewScan={(s: any) => { setActiveScan(s); setPage('results'); }} 
            onAuthRequired={() => setPage('auth')} onTriggerUpgrade={triggerUpgrade}
          />
        )}

        {page === 'upload' && (
          <UploadSection 
            role={role} user={user} isGuest={isGuest} onTriggerUpgrade={triggerUpgrade}
            onAnalyze={(jd: File | null, resumes: File[], jdText?: string) => {
              if ((isGuest && guestScans.length >= GUEST_LIMIT) || (!isGuest && user?.plan !== 'pro' && user!.scans.length >= GUEST_LIMIT)) { 
                  setIsUpgradeOpen(true); 
                  return; 
              }
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
                        <span key={i} className="px-4 py-2 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 text-xs font-black rounded-xl border border-amber-100 dark:border-amber-900/30 shadow-sm">
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
