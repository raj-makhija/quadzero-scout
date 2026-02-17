import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';

// Debug: log env var availability at module load time
console.log('[NextAuth] Module loaded. Environment check:', {
  hasSecret: !!process.env.NEXTAUTH_SECRET,
  secretLength: process.env.NEXTAUTH_SECRET?.length ?? 0,
  hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
  nextAuthUrl: process.env.NEXTAUTH_URL ?? '(not set)',
  hasApiUrl: !!process.env.NEXT_PUBLIC_API_URL,
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? '(not set)',
  nodeEnv: process.env.NODE_ENV,
});

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        console.log('[NextAuth] authorize() called');

        if (!credentials?.email || !credentials?.password) {
          console.log('[NextAuth] authorize() - missing credentials');
          return null;
        }

        const API_URL = process.env.NEXT_PUBLIC_API_URL;
        console.log('[NextAuth] authorize() - calling backend:', `${API_URL}/auth/login`);

        try {
          const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          console.log('[NextAuth] authorize() - backend response status:', response.status);

          if (!response.ok) {
            const errorBody = await response.text();
            console.log('[NextAuth] authorize() - backend error body:', errorBody);
            return null;
          }

          const user = await response.json();
          console.log('[NextAuth] authorize() - backend returned user:', JSON.stringify(user.data));
          return user.data;
        } catch (err) {
          console.error('[NextAuth] authorize() - fetch error:', err);
          // If backend is not available, return mock user for development
          if (process.env.NODE_ENV === 'development') {
            return {
              id: 'dev-user-1',
              email: credentials.email,
              name: 'Development User',
              role: 'candidate',
            };
          }
          return null;
        }
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, user }) {
      console.log('[NextAuth] jwt() callback - has user:', !!user);
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.isInternal = (user as { isInternal?: boolean }).isInternal ?? false;
        console.log('[NextAuth] jwt() - set token.id:', user.id, 'token.role:', (user as { role?: string }).role, 'token.isInternal:', token.isInternal);
      }
      return token;
    },
    async session({ session, token }) {
      console.log('[NextAuth] session() callback - token.id:', token.id);
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { isInternal?: boolean }).isInternal = token.isInternal as boolean;
      }
      return session;
    },
  },
  logger: {
    error(code, metadata) {
      console.error('[NextAuth] ERROR:', code, JSON.stringify(metadata, null, 2));
    },
    warn(code) {
      console.warn('[NextAuth] WARN:', code);
    },
    debug(code, metadata) {
      console.log('[NextAuth] DEBUG:', code, JSON.stringify(metadata));
    },
  },
  debug: true,
};
