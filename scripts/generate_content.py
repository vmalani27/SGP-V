"""
LabOps Content Generation Workflow
====================================
Generates, audits, and improves course content using Google Gemini.

Philosophy:
  - LLM fills structure you define, not structure it invents.
  - Learning intents (the "why") are specified in scripts/roadmap.yaml — not generated.
  - Technical facts are locked in prompts — LLM writes prose around them.
  - All output goes to content-drafts/ first. Nothing touches content-v2/ until you approve.
  - validator.py runs automatically on every generated file.
  - Extending to a new course = add an entry to roadmap.yaml, then run the generator.

Usage:
  # See the full DevOps roadmap
  python scripts/generate_content.py --roadmap

  # Audit existing content quality
  python scripts/generate_content.py --course docker-mastery --mode audit

  # Generate improved drafts for one module
  python scripts/generate_content.py --course docker-mastery --module docker-fundamentals --mode generate

  # Full pipeline: audit + generate
  python scripts/generate_content.py --course docker-mastery --mode full

  # After reviewing drafts, approve and copy to content-v2/
  python scripts/generate_content.py --course docker-mastery --module docker-fundamentals --approve

  # Generate a brand new course from roadmap.yaml intents
  python scripts/generate_content.py --course linux-fundamentals --mode full

Requires:
  pip install google-generativeai pyyaml rich
  set GOOGLE_API_KEY=your_key_here  (Windows)
  export GOOGLE_API_KEY=your_key_here  (Linux/Mac)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import textwrap
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

# ─── optional rich for pretty output ───────────────────────────────────────
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich import print as rprint
    console = Console()
    RICH = True
except ImportError:
    console = None
    RICH = False

    class _FallbackConsole:
        def print(self, *a, **kw): print(*a)
        def rule(self, *a, **kw): print("─" * 60)
    console = _FallbackConsole()

# ─── paths ──────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).parent.parent
CONTENT_DIR = REPO_ROOT / "content-v2"
DRAFTS_DIR = REPO_ROOT / "content-drafts"
SCRIPTS_DIR = REPO_ROOT / "scripts"
ROADMAP_FILE = SCRIPTS_DIR / "roadmap.yaml"

# ─── quality rubric ─────────────────────────────────────────────────────────
RUBRIC = {
    "real_world_hook": {
        "description": "Opens with a concrete job/infra scenario, not a definition",
        "scores": {
            1: "No scenario — starts with a definition or command syntax",
            2: "Generic scenario ('you are deploying an app')",
            3: "Specific job scenario (CI runner, prod incident, team debugging session)",
        },
    },
    "concept_depth": {
        "description": "Explains the mechanism, not just the command",
        "scores": {
            1: "Command + syntax only",
            2: "Command + why it exists",
            3: "Command + mechanism + what breaks if you misuse it",
        },
    },
    "prereq_honesty": {
        "description": "Explicitly surfaces assumed knowledge",
        "scores": {
            1: "Silently assumes knowledge (ports, processes, file permissions)",
            2: "Names the prereq in passing",
            3: "Has a callout box or section pointing learner to prereq",
        },
    },
    "lab_realism": {
        "description": "Lab tasks require judgment, not command recall",
        "scores": {
            1: "Run this command, verify this output",
            2: "Diagnose a pre-existing situation",
            3: "Fix a broken state / build something with real constraints",
        },
    },
    "beyond_commands": {
        "description": "Connects to real infra concepts beyond the tool",
        "scores": {
            1: "Stays entirely within the tool's own CLI",
            2: "One connection to real infra (CI, prod, team workflow)",
            3: "Multiple connections — Docker → CI → prod → monitoring",
        },
    },
}

PASSING_SCORE = 2  # each dimension must score >= this to pass


# ─── roadmap loader ──────────────────────────────────────────────────────────
def load_roadmap() -> dict:
    """Load the course roadmap from scripts/roadmap.yaml."""
    if not ROADMAP_FILE.exists():
        print(f"[ERROR] Roadmap file not found: {ROADMAP_FILE}")
        print("Expected: scripts/roadmap.yaml")
        sys.exit(1)
    with open(ROADMAP_FILE, encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_learning_intents(roadmap: dict, course_id: str, module_id: Optional[str] = None) -> dict:
    """
    Extract learning intents from roadmap for a course (and optionally one module).

    Returns dict shaped like:
      { module_id: { chapter_id: { title, intent, prereqs, connects_to, locked_facts } } }
    """
    course = roadmap.get("courses", {}).get(course_id)
    if not course:
        console.print(f"[red]Course '{course_id}' not found in roadmap.yaml[/red]" if RICH
                      else f"Course '{course_id}' not found in roadmap.yaml")
        console.print("Available courses: " + ", ".join(roadmap.get("courses", {}).keys()))
        sys.exit(1)

    modules_data = course.get("modules", {})
    result = {}

    for mid, mod in modules_data.items():
        if module_id and mid != module_id:
            continue
        chapters = mod.get("chapters", {})
        if chapters:
            result[mid] = {}
            for ch_id, ch in chapters.items():
                # normalize prereqs/connects_to/locked_facts — can be string or list in YAML
                def to_list(v):
                    if v is None:
                        return []
                    if isinstance(v, str):
                        return [v.strip()]
                    return [str(x).strip() for x in v]

                result[mid][ch_id] = {
                    "title": ch.get("title", ch_id),
                    "intent": ch.get("intent", "").strip(),
                    "prereqs": to_list(ch.get("prereqs")),
                    "connects_to": to_list(ch.get("connects_to")),
                    "locked_facts": to_list(ch.get("locked_facts")),
                }

    if module_id and module_id not in result:
        console.print(f"[red]Module '{module_id}' not found in course '{course_id}'[/red]" if RICH
                      else f"Module '{module_id}' not found in course '{course_id}'")
        available = list(modules_data.keys())
        console.print(f"Available modules: {available}")
        sys.exit(1)

    return result


def print_roadmap(roadmap: dict):
    """Print the full DevOps learning roadmap."""
    courses = roadmap.get("courses", {})
    paths = roadmap.get("paths", {})

    console.print("\n╔══════════════════════════════════════════════════════╗")
    console.print("║         LabOps DevOps Learning Roadmap              ║")
    console.print("╚══════════════════════════════════════════════════════╝\n")

    # Print learning paths
    console.print("── LEARNING PATHS ──────────────────────────────────────")
    for path_id, path in paths.items():
        console.print(f"\n  {path['label']}")
        console.print(f"  {path['description']}")
        sequence = path.get("sequence", [])
        for i, cid in enumerate(sequence):
            c = courses.get(cid, {})
            status = c.get("status", "planned")
            status_icon = {"published": "✓", "in-progress": "◑", "planned": "○"}.get(status, "○")
            arrow = "  └─" if i == len(sequence) - 1 else "  ├─"
            console.print(f"  {arrow} {status_icon} {cid}: {c.get('title', cid)}")

    # Print all courses with module breakdown
    console.print(f"\n\n── ALL COURSES ─────────────────────────────────────────")
    for cid, course in courses.items():
        status = course.get("status", "planned")
        status_icon = {"published": "✓ published", "in-progress": "◑ in-progress", "planned": "○ planned"}.get(status, "○")
        requires = course.get("requires", [])
        req_str = f"  [requires: {', '.join(r['course'] for r in requires)}]" if requires else "  [entry point]"

        console.print(f"\n  {cid}  ({status_icon})")
        console.print(f"  {course.get('title', cid)} — {course.get('description', '')}")
        console.print(f"  {req_str}")

        modules = course.get("modules", {})
        for mid, mod in modules.items():
            chapters = mod.get("chapters", {})
            ch_count = len(chapters)
            console.print(f"    ├─ {mid}: {mod.get('title', mid)} ({ch_count} chapters defined)")

    console.print(f"\n\nTo generate content for a course:")
    console.print(f"  python scripts/generate_content.py --course <course-id> --mode full")
    console.print(f"\nTo add a new course: edit scripts/roadmap.yaml\n")


# ─── legacy intents (kept for backward compat, roadmap is now authoritative) ─
# Remove this once all courses are in roadmap.yaml
LEARNING_INTENTS: dict = {}  # now loaded from roadmap at runtime


# ─── gemini client ───────────────────────────────────────────────────────────
def get_gemini_client():
    """Initialize Gemini client. Fails fast with a clear message if key is missing."""
    try:
        import google.generativeai as genai
    except ImportError:
        print("\n[ERROR] google-generativeai not installed.")
        print("Run: pip install google-generativeai pyyaml rich")
        sys.exit(1)

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("\n[ERROR] GOOGLE_API_KEY environment variable not set.")
        print("Get your key at: https://aistudio.google.com/app/apikey")
        print("Then: set GOOGLE_API_KEY=your_key_here  (Windows)")
        print("  or: export GOOGLE_API_KEY=your_key_here  (Linux/Mac)")
        sys.exit(1)

    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-2.0-flash")


def call_gemini(model, prompt: str, temperature: float = 0.3) -> str:
    """Call Gemini with retry on transient errors."""
    import time
    for attempt in range(3):
        try:
            response = model.generate_content(
                prompt,
                generation_config={"temperature": temperature, "max_output_tokens": 8192},
            )
            return response.text
        except Exception as e:
            if attempt < 2:
                console.print(f"  [yellow]Gemini error (attempt {attempt+1}/3): {e}. Retrying...[/yellow]" if RICH else f"  Retry {attempt+1}: {e}")
                time.sleep(2 ** attempt)
            else:
                raise


# ─── stage 1: audit ──────────────────────────────────────────────────────────
@dataclass
class ChapterScore:
    chapter_id: str
    scores: dict[str, int] = field(default_factory=dict)
    notes: dict[str, str] = field(default_factory=dict)
    total: int = 0
    passing: bool = False

    def summary(self) -> str:
        lines = [f"  Chapter {self.chapter_id}: {'✓ PASS' if self.passing else '✗ NEEDS WORK'} (total {self.total}/{len(RUBRIC)*3})"]
        for dim, score in self.scores.items():
            marker = "✓" if score >= PASSING_SCORE else "✗"
            lines.append(f"    {marker} {dim}: {score}/3 — {self.notes.get(dim, '')}")
        return "\n".join(lines)


def audit_chapter(model, chapter_id: str, content: str, intent: dict) -> ChapterScore:
    """Score one chapter against the rubric using Gemini."""
    prompt = f"""You are auditing a DevOps learning chapter against a quality rubric.
Score each dimension 1, 2, or 3 ONLY. Be strict — a score of 3 requires the specific criteria below.

## Chapter ID: {chapter_id}
## Learning Intent:
{intent['intent']}

## Chapter Content:
{content[:6000]}

## Rubric — score each dimension:

{json.dumps(RUBRIC, indent=2)}

## Response format — return ONLY valid JSON, no markdown, no explanation:
{{
  "real_world_hook": {{"score": <1-3>, "note": "<one line reason>"}},
  "concept_depth": {{"score": <1-3>, "note": "<one line reason>"}},
  "prereq_honesty": {{"score": <1-3>, "note": "<one line reason>"}},
  "lab_realism": {{"score": <1-3>, "note": "<not applicable for chapter>"}},
  "beyond_commands": {{"score": <1-3>, "note": "<one line reason>"}}
}}"""

    raw = call_gemini(model, prompt, temperature=0.1)
    # strip markdown code fences if present
    raw = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("```").strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # fallback: assume all 1s if parse fails
        console.print(f"  [red]Warning: could not parse audit JSON for {chapter_id}[/red]" if RICH else f"  Warning: parse fail for {chapter_id}")
        data = {dim: {"score": 1, "note": "parse error"} for dim in RUBRIC}

    score = ChapterScore(chapter_id=chapter_id)
    for dim in RUBRIC:
        s = int(data.get(dim, {}).get("score", 1))
        score.scores[dim] = s
        score.notes[dim] = data.get(dim, {}).get("note", "")
    score.total = sum(score.scores.values())
    score.passing = all(s >= PASSING_SCORE for s in score.scores.values())
    return score


def run_audit(course_id: str, module_id: Optional[str] = None):
    """Stage 1: audit existing content quality."""
    console.print(f"\n{'='*60}" if not RICH else "")
    console.print(f"[bold cyan]STAGE 1: AUDIT — {course_id}[/bold cyan]" if RICH else f"AUDIT: {course_id}")

    model = get_gemini_client()
    roadmap = load_roadmap()
    all_module_intents = get_learning_intents(roadmap, course_id, module_id)

    course_dir = CONTENT_DIR / "courses" / course_id
    all_scores = {}

    for mod, chapter_intents in all_module_intents.items():
        chapters_dir = course_dir / "modules" / mod / "chapters"
        if not chapters_dir.exists():
            console.print(f"  No chapters found for {mod}" if not RICH else f"  [yellow]No chapters dir: {mod}[/yellow]")
            continue

        console.print(f"\n  Module: {mod}")
        mod_scores = []

        for ch_file in sorted(chapters_dir.glob("*.md")):
            ch_id = ch_file.stem
            intent = chapter_intents.get(ch_id, {
                "intent": "General DevOps learning",
                "prereqs": [],
                "connects_to": [],
                "locked_facts": [],
            })
            content = ch_file.read_text(encoding="utf-8")

            console.print(f"    Auditing {ch_id}..." if not RICH else f"    Scoring [cyan]{ch_id}[/cyan]...")
            score = audit_chapter(model, ch_id, content, intent)
            mod_scores.append(score)
            console.print(score.summary())

        all_scores[mod] = mod_scores

    # summary
    console.print(f"\n{'─'*60}")
    console.print("AUDIT SUMMARY:")
    passing = sum(1 for scores in all_scores.values() for s in scores if s.passing)
    total = sum(len(scores) for scores in all_scores.values())
    console.print(f"  {passing}/{total} chapters passing (score >= {PASSING_SCORE} on all dimensions)")

    needs_work = [(mod, s.chapter_id) for mod, scores in all_scores.items() for s in scores if not s.passing]
    if needs_work:
        console.print(f"\n  Chapters needing improvement:")
        for mod, ch in needs_work:
            console.print(f"    • {mod}/{ch}")

    return all_scores


# ─── stage 2: chapter generation ─────────────────────────────────────────────
CHAPTER_SYSTEM_PROMPT = """You are writing a chapter for LabOps — a local-first DevOps learning platform
for early-career engineers (interns, juniors) who are learning to connect tools to real infrastructure work.

## Your voice:
- Collegial and direct — like a senior engineer explaining something to their intern over coffee
- Never condescending, never padded with filler phrases
- You explain the mechanism, not just the syntax
- You connect every concept to a real job situation

## Non-negotiables:
- Open with a real job scenario (something that actually happens at work)
- Explain WHY before HOW
- Explicitly surface prerequisite knowledge with a callout box
- End with a "This connects to" section pointing forward
- Use the :::terminal-demo block format for interactive examples (reuse one demo id per chapter)
- Never write documentation-style prose ("The docker ps command lists containers")
- Write the way you'd explain it to someone debugging a real incident

## Content schema rules:
- Headings use ##, ###
- Code blocks use triple backticks with language tag
- Terminal demos use :::terminal-demo ... ::: with an id, image, and steps
- Callout boxes use > [!NOTE], > [!IMPORTANT], > [!TIP]
- Tables for comparisons
- Keep chapters 1200–2500 words
"""


def generate_chapter(model, chapter_id: str, intent: dict, existing_content: Optional[str] = None) -> str:
    """Generate or rewrite a chapter to meet the quality standard."""
    existing_section = ""
    if existing_content:
        existing_section = f"""
## Existing chapter to improve (keep what works, fix what doesn't):
{existing_content[:4000]}

## What to keep: factual content, terminal-demo blocks, accurate examples
## What to fix: documentation-style prose, missing real-world hook, missing prereq callout, missing connections
"""

    locked_facts = "\n".join(f"- {f}" for f in intent.get("locked_facts", []))
    prereqs = "\n".join(f"- {p}" for p in intent.get("prereqs", []))
    connects_to = "\n".join(f"- {c}" for c in intent.get("connects_to", []))

    prompt = f"""{CHAPTER_SYSTEM_PROMPT}

## Chapter to write: {chapter_id} — {intent.get('title', chapter_id)}

## Learning intent (what the learner must be able to reason about after reading):
{intent['intent']}

## Locked technical facts (include all of these, do not contradict them):
{locked_facts}

## Prerequisites to surface (add a callout box pointing learner to these):
{prereqs}

## Connects to (add a "This connects to" section at the end):
{connects_to}

{existing_section}

## Output:
Write the complete chapter in Markdown. Start with # Chapter title.
Use :::terminal-demo with id: {chapter_id}-demo for interactive examples.
The demo image should be labops-docker:latest for docker content.
Include pre_pull for any images the demo uses (e.g. alpine:latest, nginx:alpine).
"""

    return call_gemini(model, prompt, temperature=0.4)


# ─── stage 3: lab generation ─────────────────────────────────────────────────
LAB_SYSTEM_PROMPT = """You are writing a hands-on lab for LabOps — a DevOps learning platform.

## Lab philosophy:
- Labs are NOT tutorials. The learner is given a scenario and must figure out the commands.
- Every task must require a decision or diagnosis, not just command recall.
- At least one task should start with a broken/incomplete state the learner must fix.
- Multiple-choice questions should test understanding of mechanisms, not syntax.

## Lab task types:
1. terminal_action — learner runs commands in a real Linux terminal; validated by a Python script
2. multiple_choice — tests conceptual understanding; 4 options, 1 correct

## Validation rules (critical — validator.py checks these):
- terminal_action MUST have a validation.command (python3 -c script)
- validation python3 scripts must use exact match: print('RESULT_TOKEN') on success
- multiple_choice MUST have validation.expected_answer matching one option exactly
- All python3 embedded in validation.command must be syntactically valid
- environment field must reference a real environment file name (docker-basic, docker-fundamentals, docker-build, git-fundamentals)
- Git labs use environment: git-fundamentals and work as the student user in /home/student
- The local Git server is reachable at http://git-server:3000 inside the lab container
- The Git image has credentials preconfigured for the student account; do not ask learners for tokens
- For a first push, Gitea allows creating the repository by pushing to the target URL
- Validate a Git push by comparing local HEAD with `git ls-remote <remote> refs/heads/<branch>`

## Lab YAML structure:
```yaml
id: lab-N
title: Short descriptive title
difficulty: beginner
environment: <course-environment>
setup:
  - command: "usermod -aG docker student"
  - command: "optional setup commands that create the starting state"
objectives:
  - What the learner will demonstrate
tasks:
  - id: task-slug
    summary: One line
    prompt: >-
      Full task description with scenario context. Include the specific
      acceptance criteria (what state must exist when done).
    type: terminal_action
    hints:
      - A hint if the learner is stuck (optional)
    solution:
      command: "the exact command that solves it"
    validation:
      command: |-
        python3 -c "
        import subprocess, json, sys
        # validation logic
        print('RESULT_OK')
        "
      match_type: exact
      expected_output: RESULT_OK
    error_message: >-
      What to show when validation fails.
```
"""


def generate_lab(model, lab_id: str, chapter_id: str, intent: dict) -> tuple[str, str]:
    """Generate lab.yaml and instructions.md for a lab."""
    locked_facts = "\n".join(f"- {f}" for f in intent.get("locked_facts", []))

    yaml_prompt = f"""{LAB_SYSTEM_PROMPT}

## Lab to write: {lab_id}
## Paired with chapter: {chapter_id} — {intent.get('title', chapter_id)}

## What this lab tests (the learning intent):
{intent['intent']}

## Concepts the learner should have encountered in the chapter:
{locked_facts}

## Requirements:
- 3–5 tasks
- At least 1 task that starts with a broken state or a mystery container the learner must inspect
- At least 1 multiple_choice that tests a mechanism (not a command name)
- At least 1 terminal_action that requires constructing something (not just running a given command)
- Validation python3 scripts must be syntactically correct Python 3
- Use the environment matching the course: docker-basic for Docker fundamentals labs; git-fundamentals for Git labs
- Setup commands should create the lab starting state (pre-configure the environment)
- For Git labs that introduce remotes, use the internal Git server URL and validate both the configured remote and the remote ref
- Include hints and solution for each terminal_action task

## Output:
Write ONLY the YAML content. No markdown fences, no explanation. Start with: id: {lab_id}
"""

    lab_yaml = call_gemini(model, yaml_prompt, temperature=0.3)
    # strip any accidental markdown fences
    lab_yaml = re.sub(r"^```ya?ml\s*\n?", "", lab_yaml, flags=re.MULTILINE)
    lab_yaml = re.sub(r"\n?```\s*$", "", lab_yaml, flags=re.MULTILINE).strip()

    instructions_prompt = f"""Write the instructions.md file for lab {lab_id} (paired with chapter: {intent.get('title', chapter_id)}).

## Format:
# Lab N: Short Title

## Scenario
2–3 sentences describing the real-world situation. Make it feel like an actual work task.

## What You'll Do
- Bullet list of what the learner will accomplish (outcomes, not steps)

## Operational Specifications
### 1. Task Group Name
- Specific acceptance criteria (what state must exist when the task is done)

### 2. Next Task Group
- ...

## Acceptance Criteria Table
| Contract Requirement | Verification Check |
| :--- | :--- |
| Requirement | How it's verified |

## Lab intent:
{intent['intent']}

Write ONLY the markdown. Start with # Lab
"""

    instructions_md = call_gemini(model, instructions_prompt, temperature=0.3)
    return lab_yaml, instructions_md


# ─── stage 4: validator integration ─────────────────────────────────────────
def run_validator(content_dir: Path) -> bool:
    """Run validator.py and return True if passing."""
    sys.path.insert(0, str(SCRIPTS_DIR))
    try:
        from validator import validate_all
        result = validate_all(content_dir)
        if result.ok:
            console.print("  [green]✓ Validator passed[/green]" if RICH else "  ✓ Validator passed")
        else:
            console.print("  [red]✗ Validator errors:[/red]" if RICH else "  ✗ Validator errors:")
            for err in result.errors:
                console.print(f"    {err}")
        if result.warnings:
            for w in result.warnings:
                console.print(f"  [yellow]  ⚠ {w}[/yellow]" if RICH else f"  ⚠ {w}")
        return result.ok
    except Exception as e:
        console.print(f"  [red]Validator error: {e}[/red]" if RICH else f"  Validator error: {e}")
        return False
    finally:
        sys.path.pop(0)


def check_lab_judgment(model, lab_yaml_content: str) -> list[str]:
    """Check if lab tasks require judgment vs recall. Returns list of flagged task ids."""
    prompt = f"""Review these lab tasks. For each task, classify it:
- "judgment": requires diagnosis, construction, or reasoning about a broken state
- "recall": just requires remembering or running a given command

Return JSON only:
{{"tasks": [{{"id": "task-id", "type": "judgment|recall", "reason": "one line"}}]}}

Lab YAML:
{lab_yaml_content[:3000]}
"""
    raw = call_gemini(model, prompt, temperature=0.1)
    raw = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("```").strip()
    try:
        data = json.loads(raw)
        return [t["id"] for t in data.get("tasks", []) if t.get("type") == "recall"]
    except Exception:
        return []


# ─── stage 5: write drafts + approve ─────────────────────────────────────────
def write_draft(draft_path: Path, content: str):
    """Write content to the drafts directory."""
    draft_path.parent.mkdir(parents=True, exist_ok=True)
    draft_path.write_text(content, encoding="utf-8")
    console.print(f"  Draft written: {draft_path.relative_to(REPO_ROOT)}" if not RICH
                  else f"  [dim]Draft → [cyan]{draft_path.relative_to(REPO_ROOT)}[/cyan][/dim]")


def approve_drafts(course_id: str, module_id: Optional[str] = None):
    """Copy approved drafts from content-drafts/ to content-v2/."""
    draft_base = DRAFTS_DIR / "courses" / course_id
    if not draft_base.exists():
        console.print(f"No drafts found for {course_id}")
        return

    modules = [module_id] if module_id else [d.name for d in sorted(draft_base.iterdir()) if d.is_dir()]
    copied = 0

    for mod in modules:
        draft_mod = draft_base / mod
        if not draft_mod.exists():
            continue

        for src in sorted(draft_mod.rglob("*")):
            if src.is_dir():
                continue
            rel = src.relative_to(DRAFTS_DIR)
            dest = CONTENT_DIR / rel
            dest.parent.mkdir(parents=True, exist_ok=True)

            # show diff summary
            if dest.exists():
                old_lines = dest.read_text(encoding="utf-8").splitlines()
                new_lines = src.read_text(encoding="utf-8").splitlines()
                added = sum(1 for l in new_lines if l not in old_lines)
                removed = sum(1 for l in old_lines if l not in new_lines)
                console.print(f"  Updating {rel}  (+{added} -{removed} lines)")
            else:
                console.print(f"  Creating {rel}")

            shutil.copy2(src, dest)
            copied += 1

    console.print(f"\n✓ {copied} files moved to content-v2/")
    console.print("Running validator on content-v2/...")
    run_validator(CONTENT_DIR)


# ─── main generation runner ───────────────────────────────────────────────────
def run_generate(course_id: str, module_id: Optional[str] = None):
    """Stage 2+3+4: generate improved content for a course/module."""
    console.print(f"\n{'='*60}" if not RICH else "")
    console.print(f"[bold cyan]GENERATING CONTENT — {course_id}/{module_id or 'all'}[/bold cyan]" if RICH
                  else f"GENERATING: {course_id}/{module_id or 'all'}")

    model = get_gemini_client()
    roadmap = load_roadmap()
    all_module_intents = get_learning_intents(roadmap, course_id, module_id)

    if not all_module_intents:
        console.print(f"[yellow]No learning intents found for {course_id}/{module_id or 'all modules'}[/yellow]" if RICH
                      else f"No intents found — add chapters to roadmap.yaml first")
        return

    course_dir = CONTENT_DIR / "courses" / course_id

    for mod, chapter_intents in all_module_intents.items():
        console.print(f"\n  Module: {mod}")
        chapters_dir = course_dir / "modules" / mod / "chapters"

        for ch_id, intent in chapter_intents.items():
            console.print(f"    Generating {ch_id}..." if not RICH else f"    [cyan]{ch_id}[/cyan]...")

            # read existing content if present
            existing = None
            ch_file = chapters_dir / f"{ch_id}.md"
            if ch_file.exists():
                existing = ch_file.read_text(encoding="utf-8")

            chapter_content = generate_chapter(model, ch_id, intent, existing)
            draft_path = DRAFTS_DIR / "courses" / course_id / mod / "chapters" / f"{ch_id}.md"
            write_draft(draft_path, chapter_content)

            # derive paired lab id (chapter-1 → lab-1)
            ch_num = re.search(r"\d+", ch_id)
            if ch_num:
                lab_id = f"lab-{ch_num.group()}"
                console.print(f"    Generating {lab_id}...")

                lab_yaml, instructions_md = generate_lab(model, lab_id, ch_id, intent)

                # judgment quality check
                recall_tasks = check_lab_judgment(model, lab_yaml)
                if recall_tasks:
                    console.print(f"    [yellow]⚠ Recall-only tasks flagged: {recall_tasks}[/yellow]" if RICH
                                  else f"    ⚠ Recall-only tasks (review): {recall_tasks}")
                    lab_yaml = f"# REVIEW: these tasks may need more realism: {recall_tasks}\n" + lab_yaml

                write_draft(DRAFTS_DIR / "courses" / course_id / mod / "labs" / lab_id / "lab.yaml", lab_yaml)
                write_draft(DRAFTS_DIR / "courses" / course_id / mod / "labs" / lab_id / "instructions.md", instructions_md)

        # copy module.yaml to drafts for validator
        src_mod_yaml = course_dir / "modules" / mod / "module.yaml"
        if src_mod_yaml.exists():
            dst = DRAFTS_DIR / "courses" / course_id / mod / "module.yaml"
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_mod_yaml, dst)

    console.print(f"\n{'─'*60}")
    console.print(f"✓ Drafts written to: {DRAFTS_DIR.relative_to(REPO_ROOT)}/")
    console.print(f"  Review them, then run:")
    if module_id:
        console.print(f"  python scripts/generate_content.py --course {course_id} --module {module_id} --approve")
    else:
        console.print(f"  python scripts/generate_content.py --course {course_id} --approve")


# ─── CLI ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="LabOps content generation workflow using Google Gemini",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
        Examples:
          # See the full DevOps roadmap and course status
          python scripts/generate_content.py --roadmap

          # Audit existing docker content quality
          python scripts/generate_content.py --course docker-mastery --mode audit

          # Generate improved drafts for one module
          python scripts/generate_content.py --course docker-mastery --module docker-fundamentals --mode generate

          # Full pipeline: audit + generate
          python scripts/generate_content.py --course docker-mastery --mode full

          # Generate a brand new course from roadmap.yaml intents
          python scripts/generate_content.py --course linux-fundamentals --mode full

          # After reviewing drafts, approve and copy to content-v2/
          python scripts/generate_content.py --course docker-mastery --module docker-fundamentals --approve
        """),
    )
    parser.add_argument("--course", default=None, help="Course ID (e.g. docker-mastery, linux-fundamentals)")
    parser.add_argument("--module", default=None, help="Module ID. Omit for all modules in the course.")
    parser.add_argument("--mode", choices=["audit", "generate", "full"], default=None,
                        help="audit = score existing content; generate = write drafts; full = audit + generate")
    parser.add_argument("--approve", action="store_true",
                        help="Move reviewed drafts from content-drafts/ to content-v2/")
    parser.add_argument("--roadmap", action="store_true",
                        help="Print the full DevOps learning roadmap and course status")

    args = parser.parse_args()

    if args.roadmap:
        roadmap = load_roadmap()
        print_roadmap(roadmap)
        return

    if not args.course:
        parser.print_help()
        sys.exit(1)

    if args.approve:
        approve_drafts(args.course, args.module)
        return

    if args.mode is None:
        parser.print_help()
        sys.exit(1)

    if args.mode in ("audit", "full"):
        run_audit(args.course, args.module)

    if args.mode in ("generate", "full"):
        run_generate(args.course, args.module)


if __name__ == "__main__":
    main()
