# Module 3 — Theory, Quizzes & Content Expansion (Future Scope)

## Goal
Expand course content beyond standalone labs into a structured learning path with:
- **Theory chapters** — conceptual explanations before hands-on work
- **Quizzes** — multiple-choice or short-answer after each chapter
- **Labs** — still present, but after quizzes as practical application

## Proposed Content Structure

```
content/courses/git-fundamentals/
├── course.json               # Updated to include chapters + quizzes alongside labs
├── module-1/
│   ├── index.json            # Module metadata
│   ├── chapter-1-setup.md    # Theory chapter (new)
│   ├── chapter-1-quiz.json   # Quiz questions (new)
│   ├── lab-1-setup.md        # Existing lab
│   ├── chapter-2-init.md     # Theory chapter (new)
│   ├── chapter-2-quiz.json   # Quiz questions (new)
│   └── lab-2-init.md         # Existing lab
```

## Type Changes (future `content-types.ts`)
```typescript
interface ContentChapter {
  id: string;
  title: string;
  contentPath: string;
}

interface ContentQuiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
}

interface QuizQuestion {
  id: string;
  type: "multiple-choice" | "short-answer";
  question: string;
  options?: string[];
  correctAnswer: string;
}

interface ContentModule {
  id: string;
  title: string;
  description: string;
  items: (ContentChapter | ContentQuiz | ContentLab)[];  // ordered sequence
}
```

## Progress Model Extension
The progress object in Firestore would track each item type independently:
```json
{
  "module-1": {
    "chapter-1-setup": "completed",
    "chapter-1-quiz": "completed",
    "lab-1-setup": "completed",
    "chapter-2-init": "in-progress"
  }
}
```

## New Routes
| Route | Component | Purpose |
|---|---|---|
| `/courses/[courseId]/chapters/[chapterId]` | Chapter viewer | Renders theory content |
| `/courses/[courseId]/quizzes/[quizId]` | Quiz component | Interactive quiz with auto-grading |

## Not Implemented — Pinned for Future
This module is a design reference only. Implementation deferred.
