#!/usr/bin/env python3
"""Standalone content validation gate.

Runs the exact validator the worker uses (worker/app/validator.py) as a
plain script so CI can fail the build before content reaches the store.

Usage:
    python scripts/validate_content.py <content-dir>

Exit codes: 0 = valid, 1 = validation errors found, 2 = usage error.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "worker"))

from app.validator import validate_all  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <content-dir>", file=sys.stderr)
        return 2

    result = validate_all(Path(sys.argv[1]))

    for warning in result.warnings:
        print(f"WARN  {warning}")
    for error in result.errors:
        print(f"ERROR {error}")

    if not result.ok:
        print(f"Validation failed with {len(result.errors)} error(s)")
        return 1

    print(f"Validation passed ({len(result.warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
