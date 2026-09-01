import { auth } from './firebase';
import type { LabTask, TaskListResponse, TaskProgressData, ValidateResponse } from './task-types';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:8001';
const ORCHESTRATOR_SECRET = process.env.NEXT_PUBLIC_ORCHESTRATOR_SECRET || 'local-dev-super-secret';

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

async function getUserId(): Promise<string> {
  if (auth && auth.currentUser) {
    return auth.currentUser.uid;
  }
  return "guest";
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

export async function orchestratorFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ORCHESTRATOR_SECRET}`,
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${ORCHESTRATOR_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Orchestrator API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

async function localFetch<T = unknown>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Content ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

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
    active: async (courseId: string, labId: string) => {
      const userId = await getUserId();
      try {
        const session = await orchestratorFetch<{
          session_id: string;
          lab_id: string;
          container_name: string;
          status: string;
        }>(`/labs/by_key?user_id=${userId}&lab_id=${labId}`);
        
        return {
          ...session,
          ws_token: JSON.stringify({ token: ORCHESTRATOR_SECRET, session_id: session.session_id, kind: "lab" }),
          ws_url: `${ORCHESTRATOR_URL.replace('http', 'ws')}/ws/terminal`,
        };
      } catch (e) {
        return null;
      }
    },
    start: async (
      courseId: string,
      labId: string,
      envConfig: {
        image: string;
        apt_packages?: string[];
        pre_pull?: string[];
        setup?: unknown[];
      },
    ) => {
      const userId = await getUserId();
      const session = await orchestratorFetch<{
        session_id: string;
        lab_id: string;
        container_name: string;
        status: string;
      }>(`/labs`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          lab_id: labId,
          image: envConfig.image || "labops-docker:latest",
          apt_packages: envConfig.apt_packages,
          pre_pull: envConfig.pre_pull,
          setup: envConfig.setup
        }),
      });
      return {
        ...session,
        ws_token: JSON.stringify({ token: ORCHESTRATOR_SECRET, session_id: session.session_id, kind: "lab" }),
        ws_url: `${ORCHESTRATOR_URL.replace('http', 'ws')}/ws/terminal`,
      };
    },
    status: (courseId: string, labId: string, sessionId: string) =>
      orchestratorFetch<{ session_id: string; status: string; container_name: string }>(
        `/labs/${sessionId}`
      ),
    stop: (courseId: string, labId: string, sessionId: string) =>
      orchestratorFetch<{ detail: string }>(
        `/labs/${sessionId}/stop`,
        { method: 'POST' }
      ),
    resume: (courseId: string, labId: string, sessionId: string) =>
      orchestratorFetch<{ detail: string }>(
        `/labs/${sessionId}/resume`,
        { method: 'POST' }
      ),
    destroy: (courseId: string, labId: string, sessionId: string) =>
      orchestratorFetch<{ detail: string }>(
        `/labs/${sessionId}`,
        { method: 'DELETE' }
      ),
    token: (courseId: string, labId: string, sessionId: string) =>
      Promise.resolve({
        ws_token: JSON.stringify({ token: ORCHESTRATOR_SECRET, session_id: sessionId, kind: "lab" }),
        ws_url: `${ORCHESTRATOR_URL.replace('http', 'ws')}/ws/terminal`
      }),
    tasks: async (courseId: string, labId: string, tasks: unknown[]) => {
      return localFetch<TaskListResponse>(`/api/local-content/labs/${courseId}/${labId}/tasks`);
    },
    validate: async (
      courseId: string,
      labId: string,
      taskId: string,
      answer: string | undefined,
      task: LabTask,
    ): Promise<ValidateResponse> => {
      const active = await api.labs.active(courseId, labId);
      if (!active) throw new Error("Lab is not running");
      const sessionId = active.session_id;

      const validation = (task.validation as Record<string, any>) || {};
      const memKey = `task_memory_${courseId}_${labId}`;
      let memory: Record<string, string> = {};
      try {
        if (typeof window !== "undefined") {
          memory = JSON.parse(localStorage.getItem(memKey) || "{}");
        }
      } catch (e) {}

      const substituteSession = (cmd: string) => cmd.replace(/{{session_id}}/g, sessionId);
      const substituteRecorded = (cmd: string) => {
        return cmd.replace(/{{recorded:([A-Za-z0-9_]+)}}/g, (_, key) => {
          if (!(key in memory)) {
            throw new Error(`Recorded value '${key}' is not set yet. Complete the task that records it first.`);
          }
          return memory[key];
        });
      };

      const runCommand = async (cmd: string, user: string = "student") => {
        let finalCmd = substituteSession(cmd);
        finalCmd = substituteRecorded(finalCmd);
        const res = await orchestratorFetch<{ exit_code: number; output: string }>(`/labs/${sessionId}/exec`, {
          method: 'POST',
          body: JSON.stringify({ command: finalCmd, user })
        });
        return res;
      };

      const recordAfterSuccess = async (user: string = "student") => {
        const rec = validation.record;
        if (!rec || !rec.key || !rec.command || typeof rec.command !== 'string') return;
        try {
          let recCmd = substituteSession(rec.command);
          recCmd = substituteRecorded(recCmd);
          const res = await orchestratorFetch<{ exit_code: number; output: string }>(`/labs/${sessionId}/exec`, {
            method: 'POST',
            body: JSON.stringify({ command: recCmd, user })
          });
          memory[rec.key] = res.output.trim();
          if (typeof window !== "undefined") {
            localStorage.setItem(memKey, JSON.stringify(memory));
          }
        } catch (e) {
          // ignore recording failure if missing keys
        }
      };

      const matchOutput = (output: string) => {
        const matchType = validation.match_type || "contains";
        const expected = String(validation.expected_output || "");
        const out = output.trim();
        
        if (matchType === "exact") return out === expected.trim();
        if (matchType === "regex") {
          try {
            return new RegExp(expected).test(out);
          } catch (e) { return false; }
        }
        if (matchType === "line_count") {
          return out.split('\n').length === parseInt(expected, 10);
        }
        return out.includes(expected);
      };

      const firstLine = (text: string) => {
        const lines = text.trim().split('\n');
        return lines.length > 0 ? lines[0].trim() : "";
      };

      const execUser = validation.user || "student";
      let correct = false;
      let outputStr = "";
      
      try {
        if (task.type === 'multiple_choice') {
          const expected = validation.expected_answer !== undefined ? validation.expected_answer : validation.expected_output;
          if (expected !== undefined) {
            correct = (answer || "").trim() === String(expected).trim();
          } else {
            const cmd = validation.command;
            if (!cmd) throw new Error("Dynamic multiple_choice without a validation command is not supported");
            const res = await runCommand(cmd, execUser);
            outputStr = res.output;
            correct = (answer || "").trim() === firstLine(outputStr);
          }
        } 
        else if (task.type === 'file_check') {
          const path = validation.path;
          const contains = validation.contains;
          if (!path || contains === undefined) throw new Error("file_check requires validation.path and validation.contains");
          const res = await runCommand(`cat ${path} 2>/dev/null`, execUser);
          outputStr = res.output;
          correct = outputStr.includes(contains);
        }
        else if (task.type === 'port_check') {
          const cmd = validation.command;
          if (!cmd) throw new Error("port_check validation is not supported yet (missing command)");
          const res = await runCommand(cmd, execUser);
          outputStr = res.output;
          correct = matchOutput(outputStr);
        }
        else if (validation.command) {
          const cmd = validation.command;
          const res = await runCommand(cmd, execUser);
          outputStr = res.output;
          if (validation.expected_exit_code !== undefined) {
            correct = res.exit_code === parseInt(validation.expected_exit_code, 10);
          } else {
            correct = matchOutput(outputStr);
          }
        }
        else if (task.type === 'script') {
          const res = await runCommand('/bin/bash /usr/local/checks/validator.sh', 'root');
          try {
            const jsonRes = JSON.parse(res.output);
            const taskResult = jsonRes.results?.find((r: any) => r.id === taskId);
            correct = taskResult ? taskResult.status === 'pass' : false;
            outputStr = taskResult?.output || 'No output';
          } catch {
            correct = false;
            outputStr = 'Validation failed';
          }
        }
        else if (task.type === 'match') {
          correct = (answer === task.validation);
          outputStr = correct ? 'Match' : 'Incorrect answer';
        }
        else {
          throw new Error(`Unknown task type and no validation.command provided: ${task.type}`);
        }

        if (correct) {
          await recordAfterSuccess(execUser);
        }

        const debugInfo = `(Debug - cmd: ${validation.command} | out: '${outputStr}' | exp: '${validation.expected_output}' | type: '${validation.match_type}')`;

        return {
          correct: correct,
          output: outputStr,
          error: correct ? undefined : ((task.error_message ? task.error_message + " " : "") + debugInfo),
          hint: task.hint || undefined,
        };
      } catch (err: any) {
        return {
          correct: false,
          output: err.message,
          error: err.message,
          hint: task.hint,
        };
      }
    },
},
  demos: {
    ensure: async (demoId: string, spec: { image?: string; pre_pull?: string[] }, opts: { signal?: AbortSignal } = {}) => {
      const userId = await getUserId();
      const res = await orchestratorFetch<{
        name: string;
        status: string;
        reused?: boolean;
      }>(
        `/demos`,
        {
          method: 'POST',
          signal: opts.signal,
          body: JSON.stringify({
            user_id: userId,
            demo_id: demoId,
            image: spec.image || 'labops-docker:latest',
          }),
        }
      );
      return {
        ...res,
        reused: res.reused || false,
        ws_token: JSON.stringify({ token: ORCHESTRATOR_SECRET, demo_id: demoId, user_id: userId, kind: "demo" }),
        ws_url: `${ORCHESTRATOR_URL.replace('http', 'ws')}/ws/terminal`,
      };
    },
    exec: async (demoId: string, command: string) => {
      const userId = await getUserId();
      return orchestratorFetch<{ exit_code: number; output: string }>(
        `/demos/${demoId}/exec`,
        { method: 'POST', body: JSON.stringify({ user_id: userId, command }) }
      );
    },
    reset: async (demoId: string) => {
      const userId = await getUserId();
      return orchestratorFetch<{ status: string }>(`/demos/${demoId}/reset?user_id=${userId}`, {
        method: 'POST',
      });
    },
    destroy: async (demoId: string) => {
      const userId = await getUserId();
      return orchestratorFetch<{ status: string }>(`/demos/${demoId}?user_id=${userId}`, {
        method: 'DELETE',
      });
    },
  },
};
