'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, type Enrollment } from './api';

const SESSION_COOKIE = 'session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

function setSessionCookie(value: string) {
  if (typeof document !== 'undefined') {
    document.cookie = `${SESSION_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  }
}

export interface LocalUser {
  displayName: string | null;
  email: string | null;
}

interface AuthContextType {
  user: LocalUser | null;
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
  const [user, setUser] = useState<LocalUser | null>({ displayName: 'Developer', email: 'developer@local.labops' });
  const [loading, setLoading] = useState(false);
  const [profileComplete, setProfileComplete] = useState(true);
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
      const profile = await api.users.me();
      if (profile?.displayName) {
        setUser({ displayName: profile.displayName, email: 'developer@local.labops' });
      }
    } catch {
      // Local server state may not be ready — fail silently
    }
    await fetchEnrollments();
  }, [fetchEnrollments]);

  useEffect(() => {
    setSessionCookie('true');
    syncUser();
  }, [syncUser]);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await api.users.me();
      setProfileComplete(profile.profileComplete);
      setEnrolledCourses(profile.enrolledCourses ?? []);
      if (profile?.displayName) {
        setUser({ displayName: profile.displayName, email: 'developer@local.labops' });
      }
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
    await fetchEnrollments();
  }, [fetchEnrollments]);

  const login = useCallback(async (email: string, _password: string) => {
    const namePart = email.split('@')[0] || 'Developer';
    setUser({ displayName: namePart, email });
    await api.users.updateProfile({ displayName: namePart }).catch(() => {});
    await refreshProfile();
  }, [refreshProfile]);

  const register = useCallback(async (email: string, _password: string, name: string) => {
    setUser({ displayName: name || 'Developer', email });
    await api.users.updateProfile({ displayName: name || 'Developer' }).catch(() => {});
    await refreshProfile();
  }, [refreshProfile]);

  const logout = useCallback(async () => {
    setUser({ displayName: 'Developer', email: 'developer@local.labops' });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: true,
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
