// Mock auth for Phase 1 - will be replaced with NextAuth Google provider
export function getSession() {
  return {
    user: {
      name: "Home User",
      email: "user@home.local",
      image: null,
    },
  };
}
