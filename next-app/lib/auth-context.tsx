'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';
import { api, type Enrollment } from './api';

const SESSION_COOKIE = 'session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

function setSessionCookie(value: string) {
  document.cookie = `${SESSION_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  profileComplete: boolean;
  enrolledCourses: string[];
  enrollments: Enrollment[];
  getEnrollment: (courseId: string) => Enrollment | undefined;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshEnrollments: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState(false);
  const [enrolledCourses, setEnrolledCourses] = useState<string[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  const fetchEnrollments = useCallback(async () => {
    try {
      const data = await api.users.enrollments();
      setEnrollments(data);
    } catch {
      // silent
    }
  }, []);

  const getEnrollment = useCallback(
    (courseId: string) => enrollments.find((e) => e.courseId === courseId),
    [enrollments],
  );

  const syncUser = useCallback(async () => {
    try {
      const result = await api.users.sync();
      setEnrolledCourses(result.enrolledCourses);
      setProfileComplete(result.profileComplete);
    } catch {
      // Backend may not be running — fail silently
    }
    fetchEnrollments();
  }, [fetchEnrollments]);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setSessionCookie('true');
        syncUser();
      } else {
        clearSessionCookie();
        setEnrolledCourses([]);
        setProfileComplete(false);
        setEnrollments([]);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [syncUser]);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await api.users.me();
      setProfileComplete(profile.profileComplete);
      setEnrolledCourses(profile.enrolledCourses ?? []);
    } catch {
      // silent
    }
  }, []);

  const refreshEnrollments = useCallback(async () => {
    try {
      const result = await api.users.sync();
      setEnrolledCourses(result.enrolledCourses);
      setProfileComplete(result.profileComplete);
    } catch {
      // silent
    }
    fetchEnrollments();
  }, [fetchEnrollments]);

  const login = useCallback(async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not configured');
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    if (!auth) throw new Error('Firebase not configured');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
  }, []);

  const logout = useCallback(async () => {
    if (!auth) throw new Error('Firebase not configured');
    await firebaseSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        profileComplete,
        enrolledCourses,
        enrollments,
        getEnrollment,
        login,
        register,
        logout,
        refreshProfile,
        refreshEnrollments,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
