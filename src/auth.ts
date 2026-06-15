import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isEmailAllowed } from "@/lib/allow-list";
import { env } from "@/lib/env";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google], // reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from env
  session: { strategy: "jwt" }, // stateless; no DB adapter (Model A)
  pages: { signIn: "/login" },
  callbacks: {
    // Allow-list: only these Google accounts may sign in. With no allow-list
    // configured, development allows everyone (local convenience) and
    // production fails closed — see isEmailAllowed.
    signIn({ user }) {
      return isEmailAllowed(
        user.email,
        env.HOUSEHOLD_ALLOWED_EMAILS,
        process.env.NODE_ENV === "production",
      );
    },
  },
});
