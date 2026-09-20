import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface UserProfileData {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserStateDocument {
  version: 1;
  profile: UserProfileData;
  enrolledCourses: string[];
  courseProgress: Record<string, Record<string, Record<string, string>>>; // courseId -> moduleId -> chapterId -> status
  labProgress: Record<string, Record<string, Record<string, string>>>;    // courseId -> moduleId -> labId -> status
}

function getUserDataDir(): string {
  if (process.env.USER_DATA_DIR) {
    return path.resolve(process.env.USER_DATA_DIR);
  }
  // Local fallback
  return path.resolve(process.cwd(), '.user_data');
}

function getUserStatePath(): string {
  return path.join(getUserDataDir(), 'user_state.json');
}

function defaultState(): UserStateDocument {
  const now = new Date().toISOString();
  return {
    version: 1,
    profile: {
      userId: 'local-developer',
      displayName: 'Local Developer',
      createdAt: now,
      updatedAt: now,
    },
    enrolledCourses: [],
    courseProgress: {},
    labProgress: {},
  };
}

let inMemoryState: UserStateDocument | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export async function readUserState(): Promise<UserStateDocument> {
  const filePath = getUserStatePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as UserStateDocument;
    if (parsed && parsed.version === 1) {
      inMemoryState = parsed;
      return parsed;
    }
  } catch (err: unknown) {
    const error = err as { code?: string };
    if (error.code !== 'ENOENT') {
      console.warn(`[UserStore] Error reading ${filePath}, re-initializing:`, err);
    }
  }

  // File does not exist yet or was corrupted — create default
  const fresh = inMemoryState || defaultState();
  await writeUserState(fresh);
  return fresh;
}

export async function writeUserState(state: UserStateDocument): Promise<void> {
  inMemoryState = state;
  const filePath = getUserStatePath();
  const dir = path.dirname(filePath);

  // Queue writes sequentially to prevent race conditions
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    try {
      await fs.mkdir(dir, { recursive: true });
      const data = JSON.stringify(state, null, 2);
      await fs.writeFile(filePath, data, 'utf8');
    } catch (err) {
      console.error(`[UserStore] Failed to write user state to ${filePath}:`, err);
    }
  });

  return writeQueue;
}

export async function enrollCourse(courseId: string): Promise<UserStateDocument> {
  const state = await readUserState();
  if (!state.enrolledCourses.includes(courseId)) {
    state.enrolledCourses.push(courseId);
    state.profile.updatedAt = new Date().toISOString();
    await writeUserState(state);
  }
  return state;
}

export async function setChapterProgress(
  courseId: string,
  moduleId: string,
  chapterId: string,
  status = 'completed'
): Promise<UserStateDocument> {
  const state = await readUserState();
  if (!state.courseProgress[courseId]) {
    state.courseProgress[courseId] = {};
  }
  if (!state.courseProgress[courseId][moduleId]) {
    state.courseProgress[courseId][moduleId] = {};
  }
  state.courseProgress[courseId][moduleId][chapterId] = status;
  if (!state.enrolledCourses.includes(courseId)) {
    state.enrolledCourses.push(courseId);
  }
  state.profile.updatedAt = new Date().toISOString();
  await writeUserState(state);
  return state;
}

export async function setLabProgress(
  courseId: string,
  moduleId: string,
  labId: string,
  status = 'completed'
): Promise<UserStateDocument> {
  const state = await readUserState();
  if (!state.labProgress[courseId]) {
    state.labProgress[courseId] = {};
  }
  if (!state.labProgress[courseId][moduleId]) {
    state.labProgress[courseId][moduleId] = {};
  }
  state.labProgress[courseId][moduleId][labId] = status;
  if (!state.enrolledCourses.includes(courseId)) {
    state.enrolledCourses.push(courseId);
  }
  state.profile.updatedAt = new Date().toISOString();
  await writeUserState(state);
  return state;
}

export async function updateProfile(displayName: string): Promise<UserStateDocument> {
  const state = await readUserState();
  state.profile.displayName = displayName;
  state.profile.updatedAt = new Date().toISOString();
  await writeUserState(state);
  return state;
}
