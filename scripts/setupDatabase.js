#!/usr/bin/env node
// Database setup script for local/dev. Usage:
// SUPABASE_DB_URL=postgres://user:pass@host:port/dbname node scripts/setupDatabase.js

const { Client } = require('pg');

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('Please set SUPABASE_DB_URL or DATABASE_URL environment variable to run this script.');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    console.log('Creating tables if they do not exist...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE NOT NULL,
        role text CHECK (role IN ('candidate','recruiter')) NOT NULL DEFAULT 'candidate',
        plan text CHECK (plan IN ('free','pro')) NOT NULL DEFAULT 'free',
        name text,
        created_at timestamptz DEFAULT now()
      );
    `);

    // Add constraint to prevent recruiter role for free plans
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'recruiter_requires_pro'
        ) THEN
          ALTER TABLE users ADD CONSTRAINT recruiter_requires_pro CHECK (role <> 'recruiter' OR plan = 'pro');
        END IF;
      END$$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        email text,
        action text CHECK (action IN ('LOGIN','LOGOUT')) NOT NULL,
        timestamp timestamptz DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_errors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source text,
        message text,
        stack text,
        timestamp timestamptz DEFAULT now()
      );
    `);

    console.log('Tables created or already exist.');
  } catch (err) {
    console.error('Failed to create tables:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
