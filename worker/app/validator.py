"""
Content v2 validator — checks index.json, course.json TOC, markdown files, and lab YAMLs.
"""

from __future__ import annotations

import json
import os
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

    @property
    def ok(self) -> bool:
        return len(self.errors) == 0

    def add(self, file: str, path: str, message: str):
        self.errors.append(ValidationError(file=file, path=path, message=message))

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


def _read_course_data(course_dir: Path) -> tuple[dict | None, str]:
    """Read course from course.yaml (new) or course.json (old). Returns (data, source_label)."""
    yaml_path = course_dir / "course.yaml"
    if yaml_path.exists():
        data = _read_yaml(yaml_path)
        if data:
            # Resolve modules from module.yaml files
            modules = []
            for mod_ref in data.get("modules", []):
                if isinstance(mod_ref, str):
                    mod_path = course_dir / "modules" / mod_ref / "module.yaml"
                    mod_data = _read_yaml(mod_path)
                    if mod_data:
                        mod_data["id"] = mod_ref
                        # Resolve lab references
                        labs = []
                        for lab_ref in mod_data.get("labs", []):
                            if isinstance(lab_ref, str):
                                labs.append({"id": lab_ref, "title": lab_ref})
                            elif isinstance(lab_ref, dict):
                                labs.append(lab_ref)
                        mod_data["labs"] = labs
                        # Chapters are strings in module.yaml, convert to dicts for consistent validation
                        chapters = []
                        for ch_ref in mod_data.get("chapters", []):
                            if isinstance(ch_ref, str):
                                chapters.append({"id": ch_ref, "title": ch_ref})
                            elif isinstance(ch_ref, dict):
                                chapters.append(ch_ref)
                        mod_data["chapters"] = chapters
                        modules.append(mod_data)
                    else:
                        modules.append({"id": mod_ref, "title": mod_ref, "labs": [], "chapters": []})
                elif isinstance(mod_ref, dict):
                    modules.append(mod_ref)
            if modules:
                data["modules"] = modules
            return data, f"courses/{course_dir.name}/course.yaml"
    json_path = course_dir / "course.json"
    if json_path.exists():
        data = _read_json(json_path)
        if data:
            return data, f"courses/{course_dir.name}/course.json"
    return None, f"courses/{course_dir.name}/course.yaml"


def _check_lab_md(labs_dir: Path, lab_id: str) -> tuple[bool, str]:
    """Check if lab instructions file exists (.md or instructions.md in subdir)."""
    if (labs_dir / f"{lab_id}.md").exists():
        return True, f"{lab_id}.md"
    if (labs_dir / lab_id / "instructions.md").exists():
        return True, f"{lab_id}/instructions.md"
    return False, ""


def _check_lab_yaml(labs_dir: Path, lab_id: str) -> tuple[bool, str]:
    """Check if lab config file exists (.yaml or lab.yaml in subdir)."""
    if (labs_dir / f"{lab_id}.yaml").exists():
        return True, f"{lab_id}.yaml"
    if (labs_dir / lab_id / "lab.yaml").exists():
        return True, f"{lab_id}/lab.yaml"
    return False, ""


def validate_course_toc(content_dir: Path, course_id: str) -> ValidationResult:
    """Validate course TOC (course.yaml or course.json) structure."""
    result = ValidationResult()
    course_dir = content_dir / "courses" / course_id

    if not course_dir.exists():
        result.add(f"courses/{course_id}", "$", f"Course directory not found")
        return result

    data, label = _read_course_data(course_dir)
    if data is None:
        result.add(label, "$", "Neither course.yaml nor course.json found or valid")
        return result

    for field_name in ("id", "title", "description", "level", "modules"):
        if field_name not in data:
            result.add(label, "$", f"Missing required field '{field_name}'")

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

        for required in ("id", "chapters"):
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

            if "id" not in ch:
                result.add(label, cprefix, "Missing required field 'id'")

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

            for required in ("id",):
                if required not in lab:
                    result.add(label, lprefix, f"Missing required field '{required}'")

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
                    result.add(label, lprefix, f"Instructions not found: modules/{mod_id}/labs/{labid}.md or {labid}/instructions.md")

    return result


def _find_lab_yaml(labs_dir: Path, lab_id: str) -> tuple[Path | None, str]:
    """Find lab YAML — supports old flat ({lab_id}.yaml) and new hierarchical ({lab_id}/lab.yaml)."""
    flat = labs_dir / f"{lab_id}.yaml"
    if flat.exists():
        return flat, f"{lab_id}.yaml"
    hier = labs_dir / lab_id / "lab.yaml"
    if hier.exists():
        return hier, f"{lab_id}/lab.yaml"
    return None, ""


def validate_lab_yaml(content_dir: Path, course_id: str, module_id: str, lab_id: str) -> ValidationResult:
    """Validate a single lab YAML file structure."""
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
    tasks = data.get("tasks")

    # New format: tasks at top level (optional) + environment reference (string or dict)
    if isinstance(env, str) or tasks is not None:
        if env is None:
            result.add(label, "environment", "Missing required field 'environment'")
        if tasks is not None:
            if not isinstance(tasks, list):
                result.add(label, "tasks", "Expected array of tasks")
            else:
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
        return result

    # Old monolithic format: environment dict + phases
    env = data.get("environment")
    if not isinstance(env, dict):
        result.add(label, "environment", "Missing or invalid 'environment' section")
    else:
        if "base_image" not in env:
            result.add(label, "environment.base_image", "Missing required field 'base_image'")

    phases = data.get("phases")
    if not isinstance(phases, list):
        result.add(label, "phases", "Missing or invalid 'phases' section")
        return result

    for pi, phase in enumerate(phases):
        pprefix = f"phases[{pi}]"
        if not isinstance(phase, dict):
            result.add(label, pprefix, "Expected object")
            continue
        if "id" not in phase:
            result.add(label, pprefix, "Missing required field 'id'")
        phase_type = phase.get("type", "lab")
        if phase_type == "setup":
            steps = phase.get("steps", [])
            if not isinstance(steps, list):
                result.add(label, f"{pprefix}.steps", "Expected array of steps")
                continue
            for si, step in enumerate(steps):
                if not isinstance(step, dict):
                    result.add(label, f"{pprefix}.steps[{si}]", "Expected object")
                    continue
                if "command" not in step:
                    result.add(label, f"{pprefix}.steps[{si}]", "Missing required field 'command'")
        else:
            phase_labs = phase.get("labs", [])
            if not isinstance(phase_labs, list):
                result.add(label, f"{pprefix}.labs", "Expected array of labs")
                continue
            for li, plab in enumerate(phase_labs):
                lprefix = f"{pprefix}.labs[{li}]"
                if not isinstance(plab, dict):
                    result.add(label, lprefix, "Expected object")
                    continue
                if "id" not in plab:
                    result.add(label, lprefix, "Missing required field 'id'")
                tasks = plab.get("tasks", [])
                if not isinstance(tasks, list):
                    result.add(label, f"{lprefix}.tasks", "Expected array of tasks")
                    continue
                for ti, task in enumerate(tasks):
                    tprefix = f"{lprefix}.tasks[{ti}]"
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
                    else:
                        task_type = task.get("type", "")
                        if task_type == "file_check":
                            if "path" not in validation:
                                result.add(label, f"{tprefix}.validation.path", "Missing required field 'path' for file_check")
                            if "contains" not in validation:
                                result.add(label, f"{tprefix}.validation.contains", "Missing required field 'contains' for file_check")
                        else:
                            if task_type != "multiple_choice" and "command" not in validation:
                                result.add(label, f"{tprefix}.validation.command", "Missing required field 'command'")
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
                # Check flat yaml files
                for yaml_file in labs_dir.glob("*.yaml"):
                    lab_id = yaml_file.stem
                    yaml_result = validate_lab_yaml(content_dir, cid, mod_dir.name, lab_id)
                    result.errors.extend(yaml_result.errors)
                # Check hierarchical lab.yaml files in subdirectories
                for sub_dir in sorted(labs_dir.iterdir()):
                    if not sub_dir.is_dir():
                        continue
                    hier_yaml = sub_dir / "lab.yaml"
                    if hier_yaml.exists():
                        yaml_result = validate_lab_yaml(content_dir, cid, mod_dir.name, sub_dir.name)
                        result.errors.extend(yaml_result.errors)

    return result
