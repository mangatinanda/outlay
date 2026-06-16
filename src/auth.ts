import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { applyUserIdToSession } from "@/lib/auth/callbacks";
import { canSignIn, claimInvites, upsertUserByEmail } from "@/lib/auth/users";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google], // reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from env
  session: { strategy: "jwt" }, // stateless; user row persisted by us, no adapter
  pages: { signIn: "/login" },
  callbacks: {
    // Eligibility: allow-listed OR already has a membership/invite.
    signIn({ user }) {
      return canSignIn(user.email);
    },
    // On initial sign-in only (account present): persist the user, claim any
    // pending invites, and stamp the stable id onto the token. Later requests
    // carry the id already — no DB write.
    async jwt({ token, account }) {
      if (account && token.email) {
        const id = await upsertUserByEmail({
          email: token.email,
          name: token.name,
          image: token.picture,
        });
        await claimInvites(token.email, id);
        token.userId = id;
      }
      return token;
    },
    session({ session, token }) {
      return applyUserIdToSession(session, token.userId as string | undefined);
    },
  },
});
