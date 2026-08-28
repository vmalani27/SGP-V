export type TaskType = 'multiple_choice' | 'terminal_action' | 'port_check';
export type MatchType = 'exact' | 'contains' | 'regex';
export type TaskStatus = 'pending' | 'correct' | 'incorrect';

export interface TaskValidation {
  command?: string;
  match_type?: MatchType;
  expected_output?: string;
  expected_answer?: string;
  expected_exit_code?: number;
  port?: number;
  path?: string;
  expected_status?: number;
  expected_content_contains?: string;
}

export interface LabTask {
  id: string;
  title?: string;
  description?: string;
  prompt: string;
  type: TaskType;
  options_source?: 'dynamic' | 'static';
  options?: string[];
  validation: TaskValidation;
  error_message?: string;
  hint?: string;
  hints?: string[];
  solution?: { command?: string };
}

export interface LabMeta {
  id: string;
  title: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimated_time: number;
  xp: number;
  tags: string[];
  objectives: string[];
  environment: string;
  summary?: string;
  setup?: { command: string }[];
  completion: { required_tasks: 'all' | string[] };
}

export interface LabData {
  meta: LabMeta;
  tasks: LabTask[];
}

export interface TaskProgressData {
  tasks: LabTask[];
  currentIndex: number;
  completed: boolean;
}

export interface ValidateResponse {
  correct: boolean;
  output?: string;
  error?: string;
  hint?: string;
}

export interface TaskListResponse {
  lab_id: string;
  tasks: LabTask[];
}
