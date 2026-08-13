// Session state driven by the Django JWT auth endpoints
// (/api/auth/login/, /api/auth/register/, /api/auth/me/, /api/auth/logout/)
// via src/lib/api-client.js.

import { createContext, useContext, useEffect, useState } from "react";
import { authApi, getTokens } from "@/lib/api-client";

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { access } = getTokens();
    if (!access) {
      setLoading(false);
      return;
    }

    authApi
      .me()
      .then((profile) => setUser(profile))
      .finally(() => setLoading(false));
  }, []);

  async function signIn(role, email, password) {
    const profile = await authApi.login(role, email, password);
    setUser(profile);
    return profile;
  }

  async function signUp(fullName, email, password) {
    // Registration intentionally does not authenticate the user.
    // Do not put the returned profile into auth state, otherwise the app
    // treats the newly-created account as logged in and protected API calls
    // such as /api/search-leads/ are sent without a JWT.
    const profile = await authApi.register(fullName, email, password);
    return profile;
  }

  async function signUpLead(fullName, email, password) {
    return authApi.registerLead(fullName, email, password);
  }

  async function signOut() {
    await authApi.logout();
    setUser(null);
  }

  const value = { user, loading, signIn, signUp, signUpLead, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
