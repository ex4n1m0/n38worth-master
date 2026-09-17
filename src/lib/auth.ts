import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Facebook from "next-auth/providers/facebook";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { recordSignup } from "@/lib/analytics";

// Build providers list dynamically so that missing OAuth env vars
// (e.g. FACEBOOK_CLIENT_ID) do NOT crash the entire auth system with a
// "Configuration" error. This previously caused the Android APK (which
// loads https://n38worth.com/) to show the NextAuth server-error page.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const providers: any[] = [];

if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  providers.push(
    Facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    })
  );
} else {
  console.warn("[auth] Facebook provider disabled — FACEBOOK_CLIENT_ID/SECRET not set");
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
} else {
  console.warn("[auth] Google provider disabled — GOOGLE_CLIENT_ID/SECRET not set");
}

providers.push(
  Credentials({
    credentials: {
      username: { label: "Username", type: "text" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.username || !credentials?.password) return null;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, credentials.username as string));

      if (!user) return null;

      // Demo users have no password — allow login with password "demo"
      if (!user.passwordHash) {
        if (credentials.password === "demo") {
          return {
            id: user.id.toString(),
            name: user.username,
          };
        }
        return null;
      }

      const valid = await bcrypt.compare(
        credentials.password as string,
        user.passwordHash
      );

      if (!valid) return null;

      return {
        id: user.id.toString(),
        name: user.username,
      };
    },
  })
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  trustHost: true,
  providers,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "facebook" && profile) {
        const facebookId = account.providerAccountId;

        // Check if user with this Facebook ID already exists
        const [existingFbUser] = await db
          .select()
          .from(users)
          .where(eq(users.facebookId, facebookId));

        if (existingFbUser) {
          // Existing Facebook user — check if they need a fresh start
          if (existingFbUser.credits <= 1) {
            const avatarUrl = (profile.picture as { data?: { url?: string } })?.data?.url
              || (typeof profile.picture === "string" ? profile.picture : null)
              || existingFbUser.avatarUrl;
            const restartCredits = 100;

            const now = new Date();
            await db
              .update(users)
              .set({
                credits: restartCredits,
                playerValue: 1,
                valueFloor: 1,
                lastDividendAt: now,
                lastOnlineAt: now,
                estimatedDeletionAt: null,
                blockSellUntil: null,
                blockSellBy: null,
                isActive: 1,
                wasReset: 1,
                avatarUrl,
                // Clear onboarding state so player restarts cleanly
                onboardingNpcs: [],
                onboardingOwnedCount: 0,
                onboardingComplete: 0,
                avatarCompleted: 0,
                onboardingStarted: 0,
                updatedAt: now,
              })
              .where(eq(users.id, existingFbUser.id));
          }

          // Update their ID fields for the JWT
          user.id = existingFbUser.id.toString();
          user.name = existingFbUser.username;
          return true;
        }

        // New Facebook user — auto-register them
        const fbName = (profile.name as string) || "Player";
        // Create a unique username from their Facebook name
        let baseUsername = fbName
          .replace(/[^a-zA-Z0-9_]/g, "")
          .slice(0, 20);
        if (!baseUsername) baseUsername = "Player";

        let username = baseUsername;
        let attempt = 0;

        // Ensure uniqueness
        while (true) {
          const [conflict] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, username));

          if (!conflict) break;

          attempt++;
          username = `${baseUsername.slice(0, 20)}${attempt}`;
        }

        const startingCredits = 100;
        const avatarUrl = (profile.picture as { data?: { url?: string } })?.data?.url
          || (typeof profile.picture === "string" ? profile.picture : null)
          || null;

        const [newUser] = await db
          .insert(users)
          .values({
            username,
            passwordHash: null,
            facebookId,
            avatarUrl,
            credits: startingCredits,
          })
          .returning({ id: users.id, username: users.username });

        // Attribute the OAuth signup to its acquisition channel (best-effort).
        await recordSignup(newUser.username);

        user.id = newUser.id.toString();
        user.name = newUser.username;
        return true;
      }

      if (account?.provider === "google" && profile) {
        const googleId = account.providerAccountId;

        // Check if user with this Google ID already exists
        const [existingGoogleUser] = await db
          .select()
          .from(users)
          .where(eq(users.googleId, googleId));

        if (existingGoogleUser) {
          // Existing Google user — check if they need a fresh start
          // (e.g. they were reset after running out of credits)
          // Reset gives same starting credits as any new player (10¢).
          // Avatar bonus can be earned by uploading a new picture.
          if (existingGoogleUser.credits <= 1) {
            const avatarUrl = (profile.picture as string) || existingGoogleUser.avatarUrl;
            const restartCredits = 100;

            const now = new Date();
            await db
              .update(users)
              .set({
                credits: restartCredits,
                playerValue: 1,
                valueFloor: 1,
                lastDividendAt: now,
                lastOnlineAt: now,
                estimatedDeletionAt: null,
                blockSellUntil: null,
                blockSellBy: null,
                isActive: 1,
                wasReset: 1,
                avatarUrl,
                // Clear onboarding state so player restarts cleanly
                onboardingNpcs: [],
                onboardingOwnedCount: 0,
                onboardingComplete: 0,
                avatarCompleted: 0,
                onboardingStarted: 0,
                updatedAt: now,
              })
              .where(eq(users.id, existingGoogleUser.id));
          }

          // Update their ID fields for the JWT
          user.id = existingGoogleUser.id.toString();
          user.name = existingGoogleUser.username;
          return true;
        }

        // New Google user — auto-register them
        const googleName = (profile.name as string) || "Player";
        let baseUsername = googleName
          .replace(/[^a-zA-Z0-9_]/g, "")
          .slice(0, 20);
        if (!baseUsername) baseUsername = "Player";

        let username = baseUsername;
        let attempt = 0;

        // Ensure uniqueness
        while (true) {
          const [conflict] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, username));

          if (!conflict) break;

          attempt++;
          username = `${baseUsername.slice(0, 20)}${attempt}`;
        }

        const avatarUrl = (profile.picture as string) || null;

        // Award avatar bonus credits if Google account has a profile picture
        let startingCredits = 100;
        if (avatarUrl) {
          const [countResult] = await db
            .select({ totalPlayers: sql<number>`COUNT(*)` })
            .from(users);
          const totalPlayers = Number(countResult?.totalPlayers ?? 0);
          startingCredits += totalPlayers;
        }

        // Google sign-up bonus: +100 credits and verified status
        startingCredits += 100;

        const [newUser] = await db
          .insert(users)
          .values({
            username,
            passwordHash: null,
            googleId,
            avatarUrl,
            credits: startingCredits,
            isVerified: 1,
          })
          .returning({ id: users.id, username: users.username });

        // Attribute the OAuth signup to its acquisition channel (best-effort).
        await recordSignup(newUser.username);

        user.id = newUser.id.toString();
        user.name = newUser.username;
        return true;
      }

      // Credentials provider — already handled by authorize()
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      const isInitialSignIn = !!user;
      if (user) {
        token.id = user.id;
        token.name = user.name;
        // NOTE: do NOT set lastVerified here — we want the verify branch below
        // to run on the very first JWT pass so token.avatarCompleted is
        // populated immediately. Otherwise middleware would treat freshly
        // signed-in users as "no avatar" for the first 60s, causing redirect
        // loops between /my-profile and /players/<own>.
      }

      // Allow the client to push a fast hint (e.g. immediately after avatar
      // upload) so middleware sees the new avatarCompleted state without
      // waiting for the DB-verify branch to run.
      if (trigger === "update" && session && typeof session === "object") {
        const sessionData = session as { avatarCompleted?: boolean };
        if (sessionData.avatarCompleted === true) {
          token.avatarCompleted = true;
        }
      }

      // Periodically verify the user still exists in DB (every 60 seconds)
      // This catches stale sessions from users whose accounts were deleted
      if (token.id) {
        const lastVerified = (token.lastVerified as number) || 0;
        const shouldVerify =
          isInitialSignIn ||
          trigger === "update" ||
          Date.now() - lastVerified > 60_000;

        if (shouldVerify) {
          const [dbUser] = await db
            .select({ username: users.username, avatarCompleted: users.avatarCompleted, avatarUrl: users.avatarUrl })
            .from(users)
            .where(eq(users.id, Number(token.id)));
          if (dbUser) {
            token.name = dbUser.username;
            token.avatarCompleted = dbUser.avatarCompleted === 1 && !!dbUser.avatarUrl;
            token.lastVerified = Date.now();
          } else {
            // User was deleted from DB — invalidate token to force re-auth
            token.id = undefined;
            token.name = undefined;
            token.lastVerified = undefined;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (!token.id) {
          // User no longer exists — return an empty session to force sign-out
          session.user.id = "";
          session.user.name = "";
        } else {
          session.user.id = token.id as string;
          session.user.name = token.name as string;
          session.user.avatarCompleted = token.avatarCompleted === true;
        }
      }
      return session;
    },
  },
});
