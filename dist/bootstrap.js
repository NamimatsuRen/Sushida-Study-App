import { authController } from './auth.js';

try {
  if (authController.configured) {
    const { createClient } = await import('./vendor/supabase.mjs');
    await authController.start(createClient);
  }
} catch { authController.error = true; }
await import('./app.js');
