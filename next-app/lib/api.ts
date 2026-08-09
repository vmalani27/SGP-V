import { auth } from './firebase';
import type { TaskListResponse, TaskProgressData, ValidateResponse } from './task-types';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

async function getIdToken(): Promise<string | null> {
  if (!auth) return null;
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getIdToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// Local content is served by this Next.js app from the extracted content dir —
// same origin, no auth (it is the learner's own downloaded course content).
async function localFetch<T = unknown>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Content ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// --- Typed API helpers ---

export interface CourseMeta {
  id: string;
  title: string;
  description: string;
  slug: string;
  modules: { id: string; title: string; chapters: unknown[]; labs: unknown[] }[];
  level: string;
  totalChapters: number;
  totalLabs: number;
  createdAt?: string;
}

export interface UserSyncResult {
  uid: string;
  email: string;
  displayName: string;
  enrolledCourses: string[];
  profileComplete: boolean;
  isNew: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  enrolledCourses: string[];
  profileComplete: boolean;
  createdAt?: string;
  lastLogin?: string;
}

export interface Enrollment {
  userId: string;
  courseId: string;
  enrolledAt: string;
  progress: Record<string, unknown>;
  labsProgress?: Record<string, Record<string, string>>;
  lastAccessed: string;
  status: string;
  percentage?: number;
}

export const api = {
  users: {
    sync: () => apiFetch<UserSyncResult>('/api/v1/users/sync', { method: 'POST' }),
    me: () => apiFetch<UserProfile>('/api/v1/users/me'),
    updateProfile: (data: { displayName?: string; profileComplete?: boolean }) =>
      apiFetch<UserProfile>('/api/v1/users/me', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    enrollments: () => apiFetch<Enrollment[]>('/api/v1/users/me/enrollments'),
  },
  courses: {
    list: () => apiFetch<CourseMeta[]>('/api/v1/courses'),
    get: (id: string) => apiFetch<CourseMeta>(`/api/v1/courses/${id}`),
    enroll: (id: string) =>
      apiFetch<{ status: string; courseId: string }>(`/api/v1/courses/${id}/enroll`, {
        method: 'POST',
      }),
    progress: (id: string) =>
      apiFetch<Enrollment>(`/api/v1/courses/${id}/progress`),
    updateProgress: (id: string, moduleId: string, chapterId: string, status = 'completed') =>
      apiFetch<{ status: string; progress: Record<string, unknown> }>(
        `/api/v1/courses/${id}/progress`,
        { method: 'PUT', body: JSON.stringify({ moduleId, chapterId, status }) },
      ),
    updateLabProgress: (id: string, labId: string, moduleId: string, status = 'completed') =>
      apiFetch<{ status: string; labsProgress: Record<string, Record<string, string>> }>(
        `/api/v1/courses/${id}/labs/${labId}/progress`,
        { method: 'PUT', body: JSON.stringify({ moduleId, status }) },
      ),
  },
  content: {
    getChapterContent: (courseId: string, chapterId: string) =>
      localFetch<{ chapter: object; content: string | null }>(
        `/api/local-content/chapters/${courseId}/${chapterId}`
      ),
    getLabInstructions: (courseId: string, labId: string) =>
      localFetch<{
        lab_id: string;
        title: string;
        module_id: string;
        chapter_id: string;
        instructions: string | null;
      }>(`/api/local-content/labs/${courseId}/${labId}/instructions`),
    getLabTasks: (courseId: string, labId: string) =>
      localFetch<TaskListResponse>(
        `/api/local-content/labs/${courseId}/${labId}/tasks`
      ),
    getLabConfig: (courseId: string, labId: string) =>
      localFetch<Record<string, unknown>>(
        `/api/local-content/labs/${courseId}/${labId}/config`
      ),
  },
  labs: {
    active: (courseId: string, labId: string) =>
      apiFetch<{
        session_id: string;
        lab_id: string;
        container_name: string;
        status: string;
        ws_token: string;
        ws_url: string;
      } | null>(`/api/v1/labs/courses/${courseId}/labs/${labId}/active`),
    start: (courseId: string, labId: string) =>
      apiFetch<{
        session_id: string;
        lab_id: string;
        container_name: string;
        status: string;
        ws_token: string;
        ws_url: string;
      }>(`/api/v1/labs/courses/${courseId}/labs/${labId}/start`, {
        method: 'POST',
      }),
    status: (courseId: string, labId: string, sessionId: string) =>
      apiFetch<{ session_id: string; status: string; container_name: string }>(
        `/api/v1/labs/courses/${courseId}/labs/${labId}/status/${sessionId}`
      ),
    stop: (courseId: string, labId: string, sessionId: string) =>
      apiFetch<{ detail: string }>(
        `/api/v1/labs/courses/${courseId}/labs/${labId}/stop/${sessionId}`,
        { method: 'POST' }
      ),
    resume: (courseId: string, labId: string, sessionId: string) =>
      apiFetch<{ detail: string }>(
        `/api/v1/labs/courses/${courseId}/labs/${labId}/resume/${sessionId}`,
        { method: 'POST' }
      ),
    destroy: (courseId: string, labId: string, sessionId: string) =>
      apiFetch<{ detail: string }>(
        `/api/v1/labs/courses/${courseId}/labs/${labId}/${sessionId}`,
        { method: 'DELETE' }
      ),
    token: (courseId: string, labId: string, sessionId: string) =>
      apiFetch<{ ws_token: string; ws_url: string }>(
        `/api/v1/labs/courses/${courseId}/labs/${labId}/token/${sessionId}`,
        { method: 'POST' }
      ),
    tasks: (courseId: string, labId: string) =>
      apiFetch<TaskListResponse>(
        `/api/v1/labs/courses/${courseId}/labs/${labId}/tasks`
      ),
    validate: (courseId: string, labId: string, taskId: string, answer?: string) =>
      apiFetch<ValidateResponse>(
        `/api/v1/labs/courses/${courseId}/labs/${labId}/validate`,
        { method: 'POST', body: JSON.stringify({ task_id: taskId, answer }) }
      ),
  },
};
