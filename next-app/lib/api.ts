// Local developer API client
import type { LabTask, TaskListResponse, TaskProgressData, ValidateResponse } from './task-types';

export const getOrchestratorUrl = () => {
  if (typeof window !== 'undefined') {
    // In browser through Nginx reverse proxy, route directly through same origin
    return process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || '';
  }
  // Server-side internal network route
  return process.env.INTERNAL_ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://orchestrator:8000';
};
export const getOrchestratorSecret = () => process.env.NEXT_PUBLIC_ORCHESTRATOR_SECRET || 'local-dev-super-secret';

export const getTerminalWsUrl = () => {
  const orch = getOrchestratorUrl();
  if (orch.startsWith('http')) {
    return `${orch.replace('http', 'ws')}/ws/terminal`;
  }
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws/terminal`;
  }
  return 'ws://localhost:3000/ws/terminal';
};

interface UserStatePayload {
  version: number;
  profile: {
    userId: string;
    displayName: string;
    createdAt: string;
    updatedAt: string;
  };
  enrolledCourses: string[];
  courseProgress: Record<string, Record<string, Record<string, string>>>;
  labProgress: Record<string, Record<string, Record<string, string>>>;
}

let cachedUserState: UserStatePayload | null = null;

async function syncUserState(force = false): Promise<UserStatePayload> {
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/user/state', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as UserStatePayload;
        cachedUserState = data;
        try {
          localStorage.setItem('labops_user_state', JSON.stringify(data));
        } catch {}
        return data;
      }
    } catch {
      // offline / container not ready fallback
    }

    if (!cachedUserState || force) {
      try {
        const stored = localStorage.getItem('labops_user_state');
        if (stored) cachedUserState = JSON.parse(stored);
      } catch {}
    }
  }

  if (cachedUserState) return cachedUserState;

  return {
    version: 1,
    profile: {
      userId: 'local-developer',
      displayName: 'Local Developer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    enrolledCourses: [],
    courseProgress: {},
    labProgress: {},
  };
}

async function getUserId(): Promise<string> {
  return "local-developer";
}

export async function orchestratorFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getOrchestratorSecret()}`,
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${getOrchestratorUrl()}${path}`, {
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
    sync: async (): Promise<UserSyncResult> => {
      const state = await syncUserState();
      return {
        uid: state.profile.userId,
        email: 'developer@localhost',
        displayName: state.profile.displayName,
        enrolledCourses: state.enrolledCourses,
        profileComplete: true,
        isNew: false,
      };
    },
    me: async (): Promise<UserProfile> => {
      const state = await syncUserState();
      return {
        uid: state.profile.userId,
        email: 'developer@localhost',
        displayName: state.profile.displayName,
        enrolledCourses: state.enrolledCourses,
        profileComplete: true,
      };
    },
    updateProfile: async (data: { displayName?: string; profileComplete?: boolean }): Promise<UserProfile> => {
      if (data.displayName) {
        if (cachedUserState) {
          cachedUserState.profile.displayName = data.displayName;
        }
        try {
          await fetch('/api/user/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: data.displayName }),
          });
        } catch {}
      }
      return api.users.me();
    },
    enrollments: async (): Promise<Enrollment[]> => {
      const state = await syncUserState(true);
      return state.enrolledCourses.map((courseId) => ({
        userId: state.profile.userId,
        courseId,
        enrolledAt: state.profile.createdAt,
        progress: state.courseProgress[courseId] || {},
        labsProgress: state.labProgress[courseId] || {},
        lastAccessed: state.profile.updatedAt,
        status: 'in-progress',
      }));
    },
  },
  courses: {
    list: async (): Promise<CourseMeta[]> => {
      const courses = await localFetch<CourseMeta[]>('/api/local-content/catalog');
      return courses;
    },
    get: async (id: string): Promise<CourseMeta> => {
      return localFetch<CourseMeta>(`/api/local-content/courses/${id}`);
    },
    enroll: async (id: string): Promise<{ status: string; courseId: string }> => {
      try {
        const res = await fetch('/api/user/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courseId: id }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.state) {
            cachedUserState = data.state;
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem('labops_user_state', JSON.stringify(data.state));
              } catch {}
            }
          }
        }
      } catch {}
      await syncUserState(true);
      return { status: 'enrolled', courseId: id };
    },
    progress: async (id: string): Promise<Enrollment> => {
      const state = await syncUserState(true);
      const progress = state.courseProgress[id] || {};
      const labsProgress = state.labProgress[id] || {};
      return {
        userId: state.profile.userId,
        courseId: id,
        enrolledAt: state.profile.createdAt,
        progress,
        labsProgress,
        lastAccessed: state.profile.updatedAt,
        status: 'in-progress',
      };
    },
    updateProgress: async (id: string, moduleId: string, chapterId: string, status = 'completed') => {
      try {
        const res = await fetch('/api/user/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courseId: id, moduleId, chapterId, status }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.progress && cachedUserState) {
            if (!cachedUserState.courseProgress[id]) cachedUserState.courseProgress[id] = {};
            cachedUserState.courseProgress[id] = data.progress;
          }
        }
      } catch {}
      const state = await syncUserState(true);
      return { status: 'ok', progress: state.courseProgress[id] || {} };
    },
    updateLabProgress: async (id: string, labId: string, moduleId: string, status = 'completed') => {
      try {
        const res = await fetch('/api/user/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courseId: id, moduleId, labId, status }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.labsProgress && cachedUserState) {
            if (!cachedUserState.labProgress[id]) cachedUserState.labProgress[id] = {};
            cachedUserState.labProgress[id] = data.labsProgress;
          }
        }
      } catch {}
      const state = await syncUserState(true);
      return { status: 'ok', labsProgress: state.labProgress[id] || {} };
    },
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
    getVersion: () => localFetch<{ version: string }>('/api/local-content/version'),
  },
  labs: {
    list: async () => {
      try {
        return await orchestratorFetch<{
          session_id: string;
          lab_id: string;
          container_name: string;
          status: string;
        }[]>('/labs');
      } catch (e) {
        return [];
      }
    },
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
          ws_token: JSON.stringify({ token: getOrchestratorSecret(), session_id: session.session_id, kind: "lab" }),
          ws_url: getTerminalWsUrl(),
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
          course_id: courseId,
          lab_id: labId,
          image: envConfig.image || "labops-docker:latest",
          apt_packages: envConfig.apt_packages,
          pre_pull: envConfig.pre_pull,
          setup: envConfig.setup
        }),
      });
      return {
        ...session,
        ws_token: JSON.stringify({ token: getOrchestratorSecret(), session_id: session.session_id, kind: "lab" }),
        ws_url: getTerminalWsUrl(),
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
        ws_token: JSON.stringify({ token: getOrchestratorSecret(), session_id: sessionId, kind: "lab" }),
        ws_url: getTerminalWsUrl()
      }),
    checkPort: async (sessionId: string, port: number) => {
      return orchestratorFetch<{ open: boolean; port: number }>(
        `/labs/${sessionId}/ports/${port}`
      );
    },
    getOpenPorts: async (sessionId: string) => {
      return orchestratorFetch<{ open_ports: number[]; session_id: string }>(
        `/labs/${sessionId}/open-ports`
      );
    },
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

        let dynamicError: string | undefined = undefined;
        if (!correct) {
          const trimmedOutput = outputStr.trim();
          if (trimmedOutput && trimmedOutput !== String(validation.expected_output || '').trim()) {
            dynamicError = trimmedOutput;
          } else if (task.error_message) {
            dynamicError = task.error_message;
          } else {
            dynamicError = 'Task verification failed. Check your configuration and try again.';
          }
          if (process.env.NODE_ENV === 'development') {
            console.debug('[Lab Validation]', { command: validation.command, output: outputStr, expected: validation.expected_output });
          }
        }

        return {
          correct: correct,
          output: outputStr,
          error: dynamicError,
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
        ws_token: JSON.stringify({ token: getOrchestratorSecret(), demo_id: demoId, user_id: userId, kind: "demo" }),
        ws_url: getTerminalWsUrl(),
      };
    },
    exec: async (demoId: string, command: string) => {
      const userId = await getUserId();
      return orchestratorFetch<{ exit_code: number; output: string }>(
        `/demos/${demoId}/exec`,
        { method: 'POST', body: JSON.stringify({ user_id: userId, command }) }
      );
    },
    checkPort: async (demoId: string, port: number) => {
      const userId = await getUserId();
      return orchestratorFetch<{ open: boolean; port: number }>(
        `/demos/${demoId}/ports/${port}?user_id=${userId}`
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
