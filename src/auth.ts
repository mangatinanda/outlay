import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google], // reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from env
  session: { strategy: "jwt" }, // stateless; no DB adapter (Model A)
  pages: { signIn: "/login" },
  callbacks: {
    // Allow-list: only these Google accounts may sign in. If HOUSEHOLD_ALLOWED_EMAILS
    // is unset we allow all (dev convenience) — production MUST set it, otherwise any
    // Google account could enter the shared households.
    signIn({ user }) {
      const allowed = (process.env.HOUSEHOLD_ALLOWED_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      if (allowed.length === 0) return true;
      return allowed.includes((user.email ?? "").toLowerCase());
    },
  },
});
