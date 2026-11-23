# Antigravity Workspace Instructions: LabOps

## Lab Authoring & Content Quality Standard
Whenever authoring, reviewing, refining, or editing learning content in `content-v2/` (including `lab.yaml`, `instructions.md`, and chapter files), you MUST strictly follow:
👉 [`content-v2/LAB_AUTHORING_STANDARDS.md`](content-v2/LAB_AUTHORING_STANDARDS.md)

### Core Operating Principles:
1. **Separation of Responsibilities**:
   - The **prompt** describes the required state / outcome.
   - The **chapter** teaches the concepts.
   - The **validator** checks the result.
   - These responsibilities must never bleed into each other.

2. **Outcome-Based Prompts**:
   - Aim for 1–3 concise sentences.
   - Do not include introductory narratives, step-by-step keystroke recipes, or UI advice.

3. **No Solution Leakage in Hints**:
   - Hints must provide conceptual guidance or areas to investigate, never command syntax or solutions.
   - Omit hints when they merely repeat the prompt.

4. **Failure Reporting in Error Messages**:
   - Error messages identify the condition that failed without teaching the command.

5. **Validation & Technical Integrity**:
   - Preserve YAML schemas, setup scripts, solution commands, and validation semantics.
   - Never weaken validation to make tasks easier to pass.
   - Always run `python scripts/validate_content.py content-v2` after editing content.

6. **Markdown & Prose Standards**:
   - Never use `---`, `***`, or `___` horizontal rule separators in `chapter-*.md` or `instructions.md` files; use headings (`##`, `###`) to separate sections.
   - Never use AI cliché phrasing such as *"this is not X, it is Y"*.
   - All chapter terminal examples must be concrete and runnable against the actual container workspace.
