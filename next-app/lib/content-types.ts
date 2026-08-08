// ─── Chapter ──────────────────────────────────────────────────────────────────

export interface Chapter {
  id: string;
  title: string;
  description: string;
  order: number;
}

// ─── Module ───────────────────────────────────────────────────────────────────

export interface ContentModule {
  id: string;
  title: string;
  description: string;
  order?: number;
  chapters: Chapter[];
  labs?: ContentLab[];
  items?: CourseItem[];
}

// ─── Lab ──────────────────────────────────────────────────────────────────────

export interface ContentLab {
  id: string;
  title: string;
  description: string;
  chapterId?: string;
  order?: number;
}

// ─── Course ───────────────────────────────────────────────────────────────────

export interface ContentCourse {
  id: string;
  title: string;
  description: string;
  level: string;
  modules: ContentModule[];
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export interface CourseCatalogEntry {
  id: string;
  title: string;
  description: string;
  level: string;
}

// ─── Flat item type for sidebar/navigation ────────────────────────────────────

export interface CourseItem {
  type: 'chapter' | 'lab';
  id: string;
  title: string;
  moduleId: string;
  moduleTitle: string;
}

// ─── Deprecated: static quiz types (kept for QuizSection, to be removed in Phase 4) ──

/** @deprecated Will be replaced by lab-based validation */
export type QuizQuestionType = 'multiple_choice' | 'true_false' | 'fill_blank';
/** @deprecated Will be replaced by lab-based validation */
export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  question: string;
  options?: { label: string; value: string }[];
  correct_answer: string;
  explanation?: string;
}
/** @deprecated Will be replaced by lab-based validation */
export interface QuizConfig {
  questions: QuizQuestion[];
  passing_score: number;
}
/** @deprecated Will be replaced by lab-based validation */
export type QuizStatus = 'idle' | 'in_progress' | 'completed';
/** @deprecated Will be replaced by lab-based validation */
export interface QuizAnswerState {
  questionId: string;
  answer: string;
}
/** @deprecated Will be replaced by lab-based validation */
export interface QuizResult {
  score: number;
  total: number;
  passed: boolean;
  answers: QuizAnswerState[];
}
