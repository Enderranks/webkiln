import { betterAuth } from 'better-auth';
import type { Env } from './env';

export function getAuth(env: Env) {
  if (!env.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is not configured');
  const isLocal =
    env.APP_ORIGIN.startsWith('http://localhost') || env.APP_ORIGIN.startsWith('http://127.0.0.1');
  return betterAuth({
    database: env.DB,
    baseURL: env.AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    emailAndPassword: { enabled: true },
    advanced: {
      useSecureCookies: !isLocal,
      database: { validateSchema: false },
    },
  });
}
