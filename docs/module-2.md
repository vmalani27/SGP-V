# Module 2 — Content Delivery & Progress Tracking

## Scope
Deliver course content from static files and track user progress through labs via the backend.

## What Was Built

### Content Architecture
- **Static JSON + Markdown files** in `next-app/content/` as the source of truth for course content
- `course.json` — course metadata with nested module/lab tree (single source; `module-*/index.json` files exist on disk but are not read by any code)
- `lab-*.md` — individual lab instructions normalized from raw text (6 sections: What/Why, Background, Command Reference, Scenario, Objective, Reflection)

### Types (`next-app/lib/content-types.ts`)
- `ContentCourse`, `ContentModule`, `ContentLab`, `CourseCatalogEntry`

### Server-Side Loader (`next-app/lib/content-server.ts`)
- `getCourseCatalog()` — reads catalog from `content/index.json`
- `getCourse(courseId)` — reads `content/courses/{courseId}/course.json`
- `getLabContent(contentPath)` — reads Markdown file via `fs`

### Pages
- `/courses/[courseId]` — SSG course detail page with breadcrumb, metadata badges (level, lab count, hours), and `CourseLabsWithProgress` component showing progress-aware lab list per module
- `/courses/[courseId]/labs/[labId]` — SSG lab viewer with:
  - Top navigation bar (breadcrumb, lab counter `"N of M"`, progress bar)
  - 12-column grid layout: main content (9 cols) + sticky sidebar table of contents (3 cols)
  - Module context label above the lab title
  - Rendered Markdown via `react-markdown` + `remark-gfm`
  - `MarkCompleteButton` at the bottom
  - Pagination-style prev/next cards with lab titles; "Complete Course" button on the last lab

### Progress API
- `POST /api/v1/courses/{course_id}/labs/{lab_id}/complete` — marks a lab as completed, recalculates overall percentage
- `GET /api/v1/courses/{course_id}/progress` — returns enrollment doc with full progress map and derived `percentage`
- `next-app/lib/api.ts` — `api.courses.completeLab()` helper

### Frontend Progress Display
- `next-app/components/MarkCompleteButton.tsx` — client component with "Mark Complete" / "Completed ✓" toggle
- `next-app/components/CourseLabsWithProgress.tsx` — client component that fetches progress and renders lab list with status icons (completed/in-progress/locked), progress bar per module

### Seed Script Update
- `app/scripts/seed_courses.py` now reads `course.json` from the content directory instead of hardcoded data
- Automatically derives `modules` count and `labs` count per module
- Firestore remains in sync with the static content source of truth

### Renames
- `api.ts` `Course` → `CourseMeta` (Firestore flat type) to distinguish from `ContentCourse` (nested content type)
- `tailwind.config.ts` → `tailwind.config.js` for CommonJS compatibility

### Packages Added
- `react-markdown`, `remark-gfm`, `@tailwindcss/typography`
