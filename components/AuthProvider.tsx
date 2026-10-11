"use client";

import {
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
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

function profileFromSnapshot(
  uid: string,
  snapshot: DocumentSnapshot<DocumentData>,
): UserProfile | null {
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  const role =
    data.role === "admin"
      ? "admin"
      : data.role === "editor"
        ? "editor"
        : null;

  if (!role) return null;

  return {
    uid,
    displayName: typeof data.displayName === "string" ? data.displayName : "STC User",
    email: typeof data.email === "string" ? data.email : "",
    role,
    active: data.active === true,
  };
}

async function loadProfile(uid: string) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return profileFromSnapshot(uid, snapshot);
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
    let unsubscribeProfile = () => undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (nextUser) => {
      unsubscribeProfile();
      unsubscribeProfile = () => undefined;
      setUser(nextUser);

      if (!nextUser) {
        await clearAttachmentCaches();
        setProfile(null);
        setLoading(false);
        return;
      }

      const uid = nextUser.uid;
      setProfile(null);
      setLoading(true);

      // Keep private cache cleanup off the critical render path.
      void retainAttachmentUser(uid).catch(() => undefined);

      unsubscribeProfile = onSnapshot(
        doc(db, "users", uid),
        (snapshot) => {
          if (auth.currentUser?.uid !== uid) return;
          const nextProfile = profileFromSnapshot(uid, snapshot);
          setProfile(nextProfile);
          setLoading(false);

          // A disabled/deleted profile must not leave private attachment bytes
          // available in the browser cache while the Firebase Auth session lives.
          if (!nextProfile?.active) {
            void clearAttachmentCaches().catch(() => undefined);
          }
        },
        () => {
          if (auth.currentUser?.uid !== uid) return;
          setProfile(null);
          setLoading(false);
          void clearAttachmentCaches().catch(() => undefined);
        },
      );
    });

    return () => {
      unsubscribeProfile();
      unsubscribeAuth();
    };
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
