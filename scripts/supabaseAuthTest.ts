import { signUpWithEmail, signInWithEmail, insertAuthLog, logAppError, supabase } from '../src/services/supabaseClient.ts';

// Usage: VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY set in env

(async function main(){
  const testEmail = process.env.TEST_USER_EMAIL || `test_${Date.now()}@example.com`;
  const password = 'Password123!';

  console.log('Testing signup flow for', testEmail);
  const res1 = await signUpWithEmail({ name: 'Dev Test', email: testEmail, password, role: 'candidate' });
  console.log('Signup result:', res1);

  console.log('Testing duplicate signup (should error)');
  const res2 = await signUpWithEmail({ name: 'Dev Test', email: testEmail, password, role: 'candidate' });
  console.log('Duplicate signup result:', res2);

  console.log('Testing sign-in flow');
  const res3 = await signInWithEmail({ email: testEmail, password });
  console.log('Sign-in result:', res3);

  console.log('Testing sign-in with wrong password');
  const res4 = await signInWithEmail({ email: testEmail, password: 'wrongpass' });
  console.log('Failed sign-in result:', res4);

  console.log('Fetching last 10 auth_logs');
  try {
    const { data: logs } = await supabase.from('auth_logs').select('*').order('timestamp',{ascending:false}).limit(10);
    console.log('Auth logs:', logs);
  } catch (err) {
    console.error('Failed reading auth_logs:', err);
  }

  console.log('Fetching last 10 app_errors');
  try {
    const { data: errRows } = await supabase.from('app_errors').select('*').order('timestamp',{ascending:false}).limit(10);
    console.log('App errors:', errRows);
  } catch (err) {
    console.error('Failed reading app_errors:', err);
  }

  process.exit(0);
})();
