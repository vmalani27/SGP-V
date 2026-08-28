"""
Content v2 validator — checks index.json, course.yaml TOC, markdown files, and lab YAMLs.

Canonical content layout (v2):
  courses/{id}/course.yaml                 course TOC (module refs)
  courses/{id}/modules/{mod}/module.yaml   module TOC (ordered `items`)
  courses/{id}/modules/{mod}/chapters/{ch}.md
  courses/{id}/modules/{mod}/labs/{lab}/lab.yaml
  courses/{id}/modules/{mod}/labs/{lab}/instructions.md
  environments/{ref}.yaml                  shared env definitions
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class ValidationError:
    file: str
    path: str
    message: str

    def __str__(self) -> str:
        return f"[{self.file}] {self.path}: {self.message}"


@dataclass
class ValidationResult:
    errors: list[ValidationError] = field(default_factory=list)
    warnings: list[ValidationError] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return len(self.errors) == 0

    def add(self, file: str, path: str, message: str):
        self.errors.append(ValidationError(file=file, path=path, message=message))

    def add_warning(self, file: str, path: str, message: str):
        self.warnings.append(ValidationError(file=file, path=path, message=message))

    def __str__(self) -> str:
        if self.ok:
            return "Validation passed"
        return "\n".join(str(e) for e in self.errors)


def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _read_yaml(path: Path) -> dict | None:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except (yaml.YAMLError, OSError):
        return None


def _scan_demo_ids(markdown: str) -> list[str]:
    """Collect `:::terminal-demo` ids from a chapter's markdown.

    Each distinct demo id maps to exactly one persistent demo container per
    learner (label-addressed and reused across slides), so inline demos should
    share an id rather than minting one per slide.
    """
    ids: list[str] = []
    in_demo = False
    for line in markdown.splitlines():
        if not in_demo and re.match(r"^\s*:::\s*terminal-demo\s*$", line):
            in_demo = True
            continue
        if in_demo:
            if re.match(r"^\s*:::\s*$", line):
                in_demo = False
                continue
            m = re.match(r"^\s*id:\s*(\S+)\s*$", line)
            if m:
                ids.append(m.group(1))
    return ids


def validate_index(content_dir: Path) -> ValidationResult:
    result = ValidationResult()
    index_path = content_dir / "index.json"

    if not index_path.exists():
        result.add("index.json", "$", "File not found")
        return result

    data = _read_json(index_path)
    if data is None:
        result.add("index.json", "$", "Invalid JSON")
        return result

    if "courses" not in data:
        result.add("index.json", "$", "Missing required field 'courses'")
        return result

    courses = data["courses"]
    if not isinstance(courses, list):
        result.add("index.json", "courses", "Expected array")
        return result

    seen_ids: set[str] = set()
    required_fields = {"id", "title", "description", "level"}

    for i, entry in enumerate(courses):
        prefix = f"courses[{i}]"

        if not isinstance(entry, dict):
            result.add("index.json", prefix, "Expected object")
            continue

        missing = required_fields - entry.keys()
        if missing:
            result.add("index.json", prefix, f"Missing required fields: {', '.join(sorted(missing))}")
            continue

        cid = entry["id"]
        if not isinstance(cid, str) or not cid:
            result.add("index.json", f"{prefix}.id", "Must be a non-empty string")
        elif not cid.islower() or not all(c.isalnum() or c == "-" for c in cid):
            result.add("index.json", f"{prefix}.id", f"Invalid course ID '{cid}': must be lowercase alphanumeric with hyphens")
        elif cid in seen_ids:
            result.add("index.json", f"{prefix}.id", f"Duplicate course ID '{cid}'")
        else:
            seen_ids.add(cid)

        if entry.get("level") not in ("beginner", "intermediate", "advanced"):
            result.add("index.json", f"{prefix}.level", f"Invalid level '{entry.get('level')}': must be beginner, intermediate, or advanced")

    return result


def _derive_module_items(mod_data: dict) -> dict:
    """Derive `chapters`/`labs` arrays from the explicit `items` list (canonical)."""
    items = []
    for ref in mod_data.get("items", []):
        if isinstance(ref, dict):
            item = dict(ref)
            item.setdefault("type", "chapter")
            item.setdefault("id", "")
            items.append(item)
    mod_data["items"] = items
    mod_data["chapters"] = [it for it in items if it["type"] == "chapter"]
    mod_data["labs"] = [it for it in items if it["type"] == "lab"]
    return mod_data


def _read_course_data(course_dir: Path) -> tuple[dict | None, str]:
    """Read course from course.yaml, resolving module.yaml references. Returns (data, source_label)."""
    label = f"courses/{course_dir.name}/course.yaml"
    data = _read_yaml(course_dir / "course.yaml")
    if data is None:
        return None, label

    modules = []
    for mod_ref in data.get("modules", []):
        if isinstance(mod_ref, str):
            mod_data = _read_yaml(course_dir / "modules" / mod_ref / "module.yaml")
            if mod_data:
                mod_data["id"] = mod_ref
                _derive_module_items(mod_data)
                modules.append(mod_data)
            else:
                modules.append({"id": mod_ref, "title": mod_ref, "chapters": [], "labs": [], "items": []})
        elif isinstance(mod_ref, dict):
            modules.append(mod_ref)
    if modules:
        data["modules"] = modules
    return data, label


def _check_lab_md(labs_dir: Path, lab_id: str) -> tuple[bool, str]:
    """Check if the lab instructions file exists (instructions.md in the lab dir)."""
    if (labs_dir / lab_id / "instructions.md").exists():
        return True, f"{lab_id}/instructions.md"
    return False, ""


def _check_lab_yaml(labs_dir: Path, lab_id: str) -> tuple[bool, str]:
    """Check if the lab config file exists (lab.yaml in the lab dir)."""
    if (labs_dir / lab_id / "lab.yaml").exists():
        return True, f"{lab_id}/lab.yaml"
    return False, ""


def _check_course_meta(result: ValidationResult, label: str, data: dict) -> None:
    """Validate optional course.yaml enrichment fields (sidebar data).

    All four fields are optional, but when present they must be well-typed:
    string arrays for prerequisites/environment/keyTakeaways, and
    [{label, href}] pairs with a concrete link for quickLinks. A grossly
    malformed enrichment (e.g. non-list content) is an error, not a warning,
    so the UI never receives garbage to render.
    """
    string_list_fields = ("prerequisites", "environment", "keyTakeaways")
    for field in string_list_fields:
        value = data.get(field)
        if value is None:
            continue
        if not isinstance(value, list) or not all(isinstance(v, str) and v.strip() for v in value):
            result.add(label, field, f"Expected an array of non-empty strings")

    value = data.get("quickLinks")
    if value is None:
        return
    if not isinstance(value, list):
        result.add(label, "quickLinks", "Expected an array of objects")
        return
    for i, link in enumerate(value):
        qprefix = f"quickLinks[{i}]"
        if not isinstance(link, dict):
            result.add(label, qprefix, "Expected object with 'label' and 'href'")
            continue
        if not isinstance(link.get("label"), str) or not link["label"].strip():
            result.add(label, f"{qprefix}.label", "Must be a non-empty string")
        href = link.get("href")
        if not isinstance(href, str) or not href.strip():
            result.add(label, f"{qprefix}.href", "Must be a non-empty string")
        elif href.startswith("/"):
            result.add_warning(label, f"{qprefix}.href", "Relative href will not resolve from the course page")
        elif not href.startswith(("http://", "https://")):
            result.add(label, f"{qprefix}.href", "Must be an absolute http(s) URL")


def validate_course_toc(content_dir: Path, course_id: str) -> ValidationResult:
    """Validate course TOC (course.yaml) structure."""
    result = ValidationResult()
    course_dir = content_dir / "courses" / course_id

    if not course_dir.exists():
        result.add(f"courses/{course_id}", "$", f"Course directory not found")
        return result

    data, label = _read_course_data(course_dir)
    if data is None:
        result.add(label, "$", "course.yaml not found or invalid")
        return result

    for field_name in ("id", "title", "description", "level", "modules"):
        if field_name not in data:
            result.add(label, "$", f"Missing required field '{field_name}'")

    _check_course_meta(result, label, data)

    # Modules are declared as string refs that must resolve to module.yaml
    raw_course = _read_yaml(course_dir / "course.yaml")
    if isinstance(raw_course, dict):
        for mod_ref in raw_course.get("modules", []):
            if isinstance(mod_ref, str):
                mod_yaml = course_dir / "modules" / mod_ref / "module.yaml"
                if not mod_yaml.exists():
                    result.add_warning(label, f"modules.{mod_ref}", f"module.yaml not found: modules/{mod_ref}/module.yaml")

    if data.get("id") != course_id:
        result.add(label, "id", f"Course ID '{data.get('id')}' does not match directory name '{course_id}'")

    if not isinstance(data.get("modules"), list):
        result.add(label, "modules", "Expected array of modules")
        return result

    modules = data["modules"]
    seen_module_ids: set[str] = set()
    seen_chapter_ids: set[str] = set()
    seen_lab_ids: set[str] = set()

    for mi, mod in enumerate(modules):
        mprefix = f"modules[{mi}]"

        if not isinstance(mod, dict):
            result.add(label, mprefix, "Expected object")
            continue

        for required in ("id", "items"):
            if required not in mod:
                result.add(label, mprefix, f"Missing required field '{required}'")

        mid = mod.get("id", "")
        if mid:
            if not isinstance(mid, str):
                result.add(label, f"{mprefix}.id", "Must be a string")
            elif mid in seen_module_ids:
                result.add(label, f"{mprefix}.id", f"Duplicate module ID '{mid}'")
            else:
                seen_module_ids.add(mid)

        # Validate the raw `items` ordering declared in module.yaml
        raw_mod_yaml = _read_yaml(course_dir / "modules" / mid / "module.yaml") if mid else None
        raw_items = raw_mod_yaml.get("items", []) if isinstance(raw_mod_yaml, dict) else None
        if isinstance(raw_items, list):
            for ii, item in enumerate(raw_items):
                iprefix = f"{mprefix}.items[{ii}]"
                if not isinstance(item, dict):
                    result.add(label, iprefix, "Expected object with 'type' and 'id'")
                    continue
                if item.get("type") not in ("chapter", "lab"):
                    result.add(label, f"{iprefix}.type", "Must be 'chapter' or 'lab'")
                if not item.get("id"):
                    result.add(label, f"{iprefix}.id", "Missing required field 'id'")
        elif raw_items is not None:
            result.add(label, f"{mprefix}.items", "Expected array of items")

        # Validate chapters
        chapters = mod.get("chapters", [])
        if not isinstance(chapters, list):
            result.add(label, f"{mprefix}.chapters", "Expected array of chapters")
            continue

        for ci, ch in enumerate(chapters):
            cprefix = f"{mprefix}.chapters[{ci}]"

            if not isinstance(ch, dict):
                result.add(label, cprefix, "Expected object")
                continue

            chid = ch.get("id", "")
            if chid:
                if chid in seen_chapter_ids:
                    result.add(label, f"{cprefix}.id", f"Duplicate chapter ID '{chid}'")
                else:
                    seen_chapter_ids.add(chid)

            if "content" in ch:
                result.add(label, f"{cprefix}", "Chapter should not have 'content' field in v2 (use markdown file)")
            if "quiz" in ch:
                result.add(label, f"{cprefix}", "Chapter should not have 'quiz' field in v2 (use lab YAML)")

            if chid:
                mod_id = mod.get("id", "")
                md_path = course_dir / "modules" / mod_id / "chapters" / f"{chid}.md"
                if not md_path.exists():
                    result.add(label, f"{cprefix}", f"Markdown file not found: modules/{mod_id}/chapters/{chid}.md")
                else:
                    # Inline demos share one persistent container per demo id.
                    # Warn when a chapter mints many distinct environments, since
                    # each one spawns its own container per learner.
                    demo_ids = _scan_demo_ids(md_path.read_text(encoding="utf-8"))
                    distinct = sorted(set(demo_ids))
                    if len(distinct) > 2:
                        result.add_warning(
                            label,
                            f"{cprefix}.demos",
                            f"Chapter defines {len(distinct)} distinct demo environments "
                            f"(ids: {', '.join(distinct)}). Inline demos should reuse one "
                            "demo id so a single container is shared across slides; a distinct "
                            "id spawns its own persistent container per learner.",
                        )

        # Validate labs
        labs = mod.get("labs", [])
        if not isinstance(labs, list):
            result.add(label, f"{mprefix}.labs", "Expected array of labs")
            continue

        for li, lab in enumerate(labs):
            lprefix = f"{mprefix}.labs[{li}]"

            if not isinstance(lab, dict):
                result.add(label, lprefix, "Expected object")
                continue

            labid = lab.get("id", "")
            if labid:
                if labid in seen_lab_ids:
                    result.add(label, f"{lprefix}.id", f"Duplicate lab ID '{labid}'")
                else:
                    seen_lab_ids.add(labid)

            if "content" in lab:
                result.add(label, lprefix, "Lab should not have 'content' field in v2 (use markdown + YAML files)")

            if labid:
                mod_id = mod.get("id", "")
                labs_dir = course_dir / "modules" / mod_id / "labs"
                found, p = _check_lab_md(labs_dir, labid)
                if not found:
                    result.add(label, lprefix, f"Instructions not found: modules/{mod_id}/labs/{labid}/instructions.md")
                if not _check_lab_yaml(labs_dir, labid)[0]:
                    result.add_warning(label, lprefix, f"Lab YAML not found: modules/{mod_id}/labs/{labid}/lab.yaml")

    return result


def _find_lab_yaml(labs_dir: Path, lab_id: str) -> tuple[Path | None, str]:
    """Find the canonical lab YAML at {lab_id}/lab.yaml."""
    hier = labs_dir / lab_id / "lab.yaml"
    if hier.exists():
        return hier, f"{lab_id}/lab.yaml"
    return None, ""


def validate_lab_yaml(content_dir: Path, course_id: str, module_id: str, lab_id: str) -> ValidationResult:
    """Validate a single canonical lab.yaml file structure."""
    result = ValidationResult()
    labs_dir = content_dir / "courses" / course_id / "modules" / module_id / "labs"
    yaml_path, suffix = _find_lab_yaml(labs_dir, lab_id)
    label = f"courses/{course_id}/modules/{module_id}/labs/{suffix}"

    if yaml_path is None:
        return result  # YAML file is optional

    data = _read_yaml(yaml_path)
    if data is None:
        result.add(label, "$", "Invalid YAML")
        return result

    if not isinstance(data, dict):
        result.add(label, "$", "Expected mapping")
        return result

    env = data.get("environment")
    if not isinstance(env, str) or not env:
        result.add(label, "environment", "Missing or invalid 'environment': expected a string reference to environments/{name}.yaml")
    else:
        env_path = content_dir / "environments" / f"{env}.yaml"
        if not env_path.exists():
            result.add_warning(label, "environment", f"Environment reference '{env}' does not resolve to environments/{env}.yaml")

    tasks = data.get("tasks")
    if tasks is None:
        result.add_warning(label, "tasks", "No tasks defined (skeleton lab)")
        return result
    if not isinstance(tasks, list):
        result.add(label, "tasks", "Expected array of tasks")
        return result

    for ti, task in enumerate(tasks):
        tprefix = f"tasks[{ti}]"
        if not isinstance(task, dict):
            result.add(label, tprefix, "Expected object")
            continue
        if "id" not in task:
            result.add(label, tprefix, "Missing required field 'id'")
        if "prompt" not in task:
            result.add(label, tprefix, "Missing required field 'prompt'")
        validation = task.get("validation")
        if not isinstance(validation, dict):
            result.add(label, f"{tprefix}.validation", "Missing or invalid 'validation'")
            continue
        task_type = task.get("type", "")
        if task_type == "file_check":
            if "path" not in validation:
                result.add(label, f"{tprefix}.validation.path", "Missing required field 'path' for file_check")
            if "contains" not in validation:
                result.add(label, f"{tprefix}.validation.contains", "Missing required field 'contains' for file_check")
        elif task_type == "port_check":
            if "port" not in validation and "path" not in validation:
                result.add(label, f"{tprefix}.validation.port", "Missing required field 'port' or 'path' for port_check")
        elif task_type not in ("multiple_choice",):
            if "command" not in validation:
                result.add(label, f"{tprefix}.validation.command", "Missing required field 'command'")
        hints = task.get("hints")
        if hints is not None and (
            not isinstance(hints, list) or not all(isinstance(h, str) for h in hints)
        ):
            result.add(label, f"{tprefix}.hints", "Expected an array of strings")
        solution = task.get("solution")
        if solution is not None and (
            not isinstance(solution, dict) or not isinstance(solution.get("command"), str)
        ):
            result.add(label, f"{tprefix}.solution", "Expected a mapping with a 'command' string")
    return result


def validate_all(content_dir: Path) -> ValidationResult:
    """Validate entire content-v2 directory."""
    result = validate_index(content_dir)

    index_path = content_dir / "index.json"
    data = _read_json(index_path)
    if data is None:
        return result

    for entry in data.get("courses", []):
        if not isinstance(entry, dict) or "id" not in entry:
            continue

        cid = entry["id"]
        course_result = validate_course_toc(content_dir, cid)
        result.errors.extend(course_result.errors)
        result.warnings.extend(course_result.warnings)

        # Validate lab YAMLs for this course
        course_dir = content_dir / "courses" / cid
        modules_dir = course_dir / "modules"
        if modules_dir.exists():
            for mod_dir in modules_dir.iterdir():
                if not mod_dir.is_dir():
                    continue
                labs_dir = mod_dir / "labs"
                if not labs_dir.exists():
                    continue
                for sub_dir in sorted(labs_dir.iterdir()):
                    if not sub_dir.is_dir():
                        continue
                    if (sub_dir / "lab.yaml").exists():
                        yaml_result = validate_lab_yaml(content_dir, cid, mod_dir.name, sub_dir.name)
                        result.errors.extend(yaml_result.errors)
                        result.warnings.extend(yaml_result.warnings)

    return result
