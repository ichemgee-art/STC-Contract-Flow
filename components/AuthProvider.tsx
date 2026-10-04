"use client";

import {
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { auth, db } from "@/lib/firebase";
import { clearAttachmentCaches, retainAttachmentUser } from "@/lib/attachmentCache";
import type { UserProfile } from "@/types/user";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<UserProfile | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadProfile(uid: string) {
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    uid,
    displayName: data.displayName ?? "STC User",
    email: data.email ?? "",
    role: data.role === "admin" ? "admin" : "editor",
    active: data.active === true,
  } satisfies UserProfile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!auth.currentUser) {
      setProfile(null);
      return null;
    }
    const nextProfile = await loadProfile(auth.currentUser.uid);
    setProfile(nextProfile);
    return nextProfile;
  };

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        await clearAttachmentCaches();
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        await retainAttachmentUser(nextUser.uid);
        setProfile(await loadProfile(nextUser.uid));
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      refreshProfile,
      logout: async () => {
        await clearAttachmentCaches();
        await signOut(auth);
      },
    }),
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
