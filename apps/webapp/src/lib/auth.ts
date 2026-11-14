import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (user.email) {
        const id = account?.providerAccountId ?? user.id;
        await fetch(`${API_URL}/api/onboarding/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            email: user.email,
            name: user.name ?? null,
            image: user.image ?? null,
          }),
        }).catch(() => undefined);
      }
      return true;
    },
    async jwt({ token, account, user }) {
      if (account?.providerAccountId) {
        token.sub = account.providerAccountId;
      } else if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
      }
      return session;
    },
  },
};
