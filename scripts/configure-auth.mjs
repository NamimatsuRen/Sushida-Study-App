import { writeFileSync } from 'node:fs';
import { validAuthConfig } from '../dist/auth.js';
const supabaseUrl = process.env.SUSHI_SUPABASE_URL || '';
const supabasePublishableKey = process.env.SUSHI_SUPABASE_PUBLISHABLE_KEY || '';
if (!validAuthConfig({ supabaseUrl, supabasePublishableKey })) throw new Error('Set SUSHI_SUPABASE_URL and SUSHI_SUPABASE_PUBLISHABLE_KEY to the Project URL and public key. Secret keys are rejected.');
writeFileSync(new URL('../dist/config.js', import.meta.url), '// Public connection settings only.\nexport const AUTH_CONFIG = Object.freeze(' + JSON.stringify({ supabaseUrl, supabasePublishableKey }) + ');\n');
console.log('Public authentication settings saved.');
