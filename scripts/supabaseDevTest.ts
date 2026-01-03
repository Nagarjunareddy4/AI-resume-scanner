import { insertScanRecord, insertJobDescriptionRecord, fetchScansByUser, fetchJobDescriptionsByUser, supabase } from '../src/services/supabaseClient.ts';

// Simple dev script to exercise Supabase helper functions.
// Usage: set VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY (or SUPABASE_URL & SUPABASE_ANON_KEY) in env, then run:
// npm run supabase:dev-test

async function runTest() {
  console.log('Supabase Dev Test starting...');

  const testEmail = process.env.TEST_USER_EMAIL || 'devtest@example.com';
  const testJdText = `Sample Job Description for ${testEmail} - created at ${new Date().toISOString()}`;

  try {
    console.log('Inserting test job description...');
    await insertJobDescriptionRecord(null, testJdText, testEmail);
    console.log('Inserted job description (best-effort).');
  } catch (err) {
    console.error('Error inserting job description:', err);
  }

  try {
    console.log('Inserting test scan record...');
    const dummyScan = {
      id: `dev_${Date.now()}`,
      timestamp: Date.now(),
      fileName: `sample_resume_${Date.now()}.pdf`,
      role: 'candidate',
      status: 'completed',
      insights: { summary: 'Dev test', matchScore: 42, skills: [], experienceHighlights: [], strengths: [], improvements: [], suggestedSkills: [], explanation: 'Dev run' }
    };
    await insertScanRecord(dummyScan, testEmail);
    console.log('Inserted test scan (best-effort).');
  } catch (err) {
    console.error('Error inserting scan record:', err);
  }

  try {
    console.log('Fetching recent job descriptions for user:', testEmail);
    const jds = await fetchJobDescriptionsByUser(testEmail);
    console.log('Fetched JDs:', jds ? jds.slice(0,5) : jds);
  } catch (err) {
    console.error('Error fetching job descriptions:', err);
  }

  try {
    console.log('Fetching recent scans for user:', testEmail);
    const scans = await fetchScansByUser(testEmail);
    console.log('Fetched scans:', scans ? scans.slice(0,5) : scans);
  } catch (err) {
    console.error('Error fetching scans:', err);
  }

  // Optional: test anonymous/guest fetch
  try {
    console.log('Fetching recent scans for guests (user_email IS NULL):');
    const guestScans = await fetchScansByUser(null);
    console.log('Fetched guest scans (count):', guestScans ? guestScans.length : guestScans);
  } catch (err) {
    console.error('Error fetching guest scans:', err);
  }

  console.log('Supabase Dev Test finished.');
  process.exit(0);
}

runTest().catch(err => { console.error('Unexpected error in dev test:', err); process.exit(1); });
