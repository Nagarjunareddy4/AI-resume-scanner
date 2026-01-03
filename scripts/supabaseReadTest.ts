import { fetchScansByUser, fetchJobDescriptionsByUser } from '../src/services/supabaseClient.ts';

// Safe read-only test for Supabase helpers. Does NOT modify DB.
// Usage: set VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY (or SUPABASE_URL & SUPABASE_ANON_KEY) in env,
// then run: npm run supabase:read-test

async function runReadTest() {
  try {
    // Use TEST_USER_EMAIL env var if provided; otherwise default to 'guest' as before.
    const identifier = process.env.TEST_USER_EMAIL || 'guest';
    console.log(`Supabase READ test starting (identifier: "${identifier}")`);

    const scans = await fetchScansByUser(identifier);
    if (!scans) {
      console.log('fetchScansByUser returned no data (null).');
    } else {
      console.log(`Total scans retrieved: ${scans.length}`);
      if (scans.length > 0) console.log('First scan:', JSON.stringify(scans[0], null, 2));
    }

    const jds = await fetchJobDescriptionsByUser(identifier);
    if (!jds) {
      console.log('fetchJobDescriptionsByUser returned no data (null).');
    } else {
      console.log(`Total job descriptions retrieved: ${jds.length}`);
      if (jds.length > 0) console.log('First job description:', JSON.stringify(jds[0], null, 2));
    }

    console.log('Supabase READ test finished.');
    process.exit(0);
  } catch (err) {
    console.error('Supabase READ test error:', err);
    process.exit(1);
  }
}

runReadTest();
