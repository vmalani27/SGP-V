## Validation: Group-membership / transient shell state causes false negatives

Summary
- When a lab asks the student to add `student` to the `docker` group (e.g. `sudo usermod -aG docker student`) and the student refreshes their shell with `newgrp docker`, their interactive shell gains the new supplementary group. However, the orchestrator runs validation commands by creating new exec processes inside the container. Linux group membership is a per-process property — newly created execs will only see group changes if they are run in a fresh login/session or are run as `root`.

Reproduction
1. In `docker-fundamentals` lab-1, add `sudo usermod -aG docker student` and run `newgrp docker` in the student's terminal.
2. The student's terminal can now run `docker` without sudo.
3. When the frontend triggers validation, the orchestrator runs the validation `exec` as `student` (a different process). The validation fails (permission denied) even though the student's interactive shell works.

Impact
- Validation can report false negatives for exercises that change group membership or rely on transient shell state (environment variables, current working directory, exported variables, etc.). This affects Docker labs (DinD) and any lab where the student is instructed to change user/group state.

Short-term workaround
- Run validation as `root` when the intent is to check persistent system state (images present, container logs, services active). For example: use `getent group docker | grep -qw student` and/or run `su - student -c 'docker ps'` inside the validation command to simulate a fresh login.
- Authors can make validation commands explicitly create a fresh student session via `su - student -c '...'` so the exec is not dependent on the interactive shell's state.

Long-term solution
1. Schema & contract: add an explicit `validation.execution_user` (enum: `student` | `root`) and `validation.expected_exit_code` to the lab YAML schema (done). Authors can express whether validation should run with administrative privileges or with a fresh student login.
2. Backend/frontend: honor `validation.execution_user` and send the orchestrator an exec request with the appropriate `user` field (e.g. `"user": "root"` for administrative checks). When `execution_user: student` but the check must verify a new login's capabilities, the backend should run `su - student -c '<cmd>'` under root so that supplementary group membership is re-evaluated for a fresh session.
3. Orchestrator: document and enforce a clear distinction between interactive terminal processes (student WebSocket shell) and validation execs. Provide helper execution modes: `as_root`, `as_student_fresh_login`, and `as_student_reuse_shell` (the latter being the current behavior). Prefer `as_student_fresh_login` for capability checks.
4. Test harness: add automated tests that cover group-membership changes, env var persistence, and service activation validations to catch regressions.

Notes
- This is not a bug in Docker or Linux — it's an expected property of Unix process credentials. Validations must target persistent state or create the process context they intend to test.

References
- Discussion and suggested validation patterns are recorded in the issue that inspired this entry.

