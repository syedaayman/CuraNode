import { createClient } from '@supabase/supabase-js'

// Get values from your .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  const errMsg = `Supabase initialization error: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables. Please check your .env file.`
  console.error(errMsg)
  throw new Error(errMsg)
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey)