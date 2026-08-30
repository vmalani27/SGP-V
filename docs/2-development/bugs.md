## Validation: Group-membership / transient shell state causes false negatives

Summary
- When a lab asks the student to add `student` to the `docker` group (e.g. `sudo usermod -aG docker student`) and the student refreshes their shell with `newgrp docker`, their interactive shell gains the new supplementary group. However, the orchestrator runs validation commands by creating new exec processes inside the container. Linux group membership is a per-process property — newly created execs will only see group changes if they are run in a fresh login/session or are run as `root`.

Reproduction
1. In `docker-fundamentals` lab-1, add `sudo usermod -aG docker student` and run `newgrp docker` in the student's terminal.
2. The student's terminal can now run `docker` without sudo.
3. When the frontend triggers validation, the orchestrator runs the validation `exec` as `student` (a different process). The validation fails (permission denied) even though the student's interactive shell works.

Impact
- Validation can report false negatives for exercises that change group membership or rely on transient shell state (environment variables, current working directory, exported variables, etc.). This affects Docker labs (DinD) and any lab where the student is instructed to change user/group state.

Status
- **Plumbing resolved via decoupling:** the orchestrator accepts the exec `user` from
  the client, and the frontend now forwards `validation.execution_user` directly
  (the old backend proxy that hardcoded `user: student` is removed —
  see `docs/TESTING.md`). The remaining sensitivity is an **authoring** concern:
  commands that depend on a *fresh login* must include `su - student -c '...'`
  or use a persistent-state probe (`getent group docker`, image/container checks).

Short-term workaround
- Run validation as `root` when the intent is to check persistent system state (images present, container logs, services active). For example: use `getent group docker | grep -qw student` and/or run `su - student -c 'docker ps'` inside the validation command to simulate a fresh login.
- Authors can make validation commands explicitly create a fresh student session via `su - student -c '...'` so the exec is not dependent on the interactive shell's state.

Long-term solution
1. Schema & contract: add an explicit `validation.execution_user` (enum: `student` | `root`) and `validation.expected_exit_code` to the lab YAML schema (done). Authors can express whether validation should run with administrative privileges or with a fresh student login.
2. ✅ Resolved via decoupling: the backend proxy is gone — the **frontend** sends
   `validation.execution_user` straight to the orchestrator's exec `user` field,
   which honors it; the old hardcoded `user: student` no longer exists. The
   remaining nuance is content-authoring: to verify a *fresh login's*
   capabilities, the validation command itself should use `su - student -c '<cmd>'`
   so supplementary group membership is re-evaluated (see Short-term workaround).
3. Orchestrator: document and enforce a clear distinction between interactive terminal processes (student WebSocket shell) and validation execs. Provide helper execution modes: `as_root`, `as_student_fresh_login`, and `as_student_reuse_shell` (the latter being the current behavior). Prefer `as_student_fresh_login` for capability checks.
4. Test harness: add automated tests that cover group-membership changes, env var persistence, and service activation validations to catch regressions.

Notes
- This is not a bug in Docker or Linux — it's an expected property of Unix process credentials. Validations must target persistent state or create the process context they intend to test.

References
- Discussion and suggested validation patterns are recorded in the issue that inspired this entry.

---

## Resolved root causes

These were root-caused and fixed; kept as records so the reasoning (and the
rebuild steps) survive.

### `artifact_sha256` convention mismatch (gzip stream vs raw tar) — worker checksum hard-fail

Symptom
- On `2026-08-28`, after a normal `publish-content` CI run, the worker cycle
  failed repeatedly with:
  `RuntimeError: Content tarball checksum mismatch for version d139fdc9a662520e`.
  CI reported success — publishing never self-verifies; the worker is the
  integrity gate.

Root cause
- The **committed** `scripts/generate_manifest.py` wrote
  `artifact_sha256 = sha256(gzip.compress(tar_bytes))` — the hash of the
  **gzipped stream** — while `worker/app/seeder.py`
  (`download_content()`) verifies `sha256(gzip.decompress(tarball))` — the hash
  of the **raw (uncompressed) tar bytes**. Those two cannot be equal; the gzip
  stream is not byte-stable, the deterministic tar is.
- The working tree already carried the fix (hash the raw tar bytes) but it had
  not been committed, so CI kept running the old code. (The `7a0bb0f2e5b2e267`
  sitting in a local `out/latest.json` was a stale local build of pre-push
  content — the pushed content's real version was `d139fdc9a662520e`.)

Fix / verification
- `scripts/generate_manifest.py` now hashes the raw tar bytes — the one
  convention shared by the generator, `worker/app/seeder.py`, and the frontend
  bootstrap.
- `latest.json` re-uploaded with the correct `artifact_sha256`; the worker
  verified and seeded (`d139fdc9a662520e`, 2 synced / 0 errors).
- `docs/CONTENT-PIPELINE.md` §5 now documents the raw-tar convention explicitly.

Rebuild steps for a future occurrence
1. `aws s3 cp published/{v}/content.tar.gz -` → `sha256(gunzip(...))` and
   compare to `latest.json.artifact_sha256`.
2. If they differ, the publisher hashed something else (usually the gzip
   stream); regenerate `latest.json` with `generate_manifest.py`'s own value.

References
- The pipeline publish steps and trigger design: `docs/CONTENT-PIPELINE.md` §5
  and §6 ("Triggered sync (webhook)").

---

### Task gates were validating the wrong tmux session (session name ≠ `session_id`)

Symptom
- A "run the container" task (building-images lab-5 task 4) never passed even
  when the student ran the container themselves in the lab terminal.

Root cause
- `orchestrator/app/websocket/terminal.py` returns
  `session.container_name, "lab"` — lab tmux sessions are literally named
  `"lab"`, never `session_id`. The validation gate ran
  `tmux capture-pane -pt {{session_id}}`, which could never match a real tmux
  session, so the gate was untestable by design.

Fix / verification
- Validation redesigned to the **named-container** pattern: the student runs
  `docker run --name <name> <image>` themselves; the validator checks a
  container with that name exists, its `.Config.Image` is the expected image,
  and `docker logs` contains the expected output (exact-match `RUN_OK`).
  Applied to building-images lab-5 and lab-6; verified end-to-end in a sandbox
  (happy path passes; missing container and wrong image both rejected).
- `{{session_id}}` is no longer used by any content; backend `_substitute_session`
  remains as harmless defense-in-depth.

References
- Lab YAML constraints this pattern encourages: a named container is persistent
  (`--name`, no `--rm`) so `docker inspect`/`docker logs` can act on it.
  See `docs/CONTENT-PIPELINE.md` §2 task types.

