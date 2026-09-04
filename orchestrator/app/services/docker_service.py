import logging
import time

import docker
from docker.errors import APIError, ImageNotFound, NotFound

from app.config import CONTAINER_RUNTIME_MODE, DOCKER_HOST, LAB_PREFIX

logger = logging.getLogger(__name__)


IMAGE_ALIASES = {
    "sgp-lab-ubuntu:latest": "labops-ubuntu:latest",
    "sgp-lab-docker:latest": "labops-docker:latest",
    "sgp-lab-docker-fundamentals:latest": "labops-docker-fundamentals:latest",
    "sgp-lab-ubuntu": "labops-ubuntu:latest",
    "sgp-lab-docker": "labops-docker:latest",
    "sgp-lab-docker-fundamentals": "labops-docker-fundamentals:latest",
}

REMOTE_IMAGE_MAP = {
    "labops-ubuntu:latest": "ghcr.io/vmalani27/sgp-v/lab-ubuntu:dev",
    "labops-docker:latest": "ghcr.io/vmalani27/sgp-v/lab-docker:dev",
    "labops-docker-fundamentals:latest": "ghcr.io/vmalani27/sgp-v/lab-docker-fundamentals:dev",
    "sgp-lab-ubuntu:latest": "ghcr.io/vmalani27/sgp-v/lab-ubuntu:dev",
    "sgp-lab-docker:latest": "ghcr.io/vmalani27/sgp-v/lab-docker:dev",
    "sgp-lab-docker-fundamentals:latest": "ghcr.io/vmalani27/sgp-v/lab-docker-fundamentals:dev",
}


def get_runtime_options() -> dict:
    """Dynamically applies security and runtime settings based on CONTAINER_RUNTIME_MODE.

    Modes:
    - 'standard' / 'privileged' / 'dev': Standard runc with full privileges for Docker Desktop on Windows/macOS.
    - 'sysbox' (default): Secure student/production mode using sysbox-runc.
    """
    if CONTAINER_RUNTIME_MODE in ("standard", "privileged", "dev"):
        logger.warning(
            "CONTAINER_RUNTIME_MODE is set to '%s'. Launching container with standard runc (privileged=True). "
            "This mode is intended only for local development on Docker Desktop.",
            CONTAINER_RUNTIME_MODE,
        )
        return {
            "privileged": True,
        }

    # Production / Secure Student Mode (default)
    return {
        "runtime": "sysbox-runc",
        "privileged": False,
    }


def lab_id_to_number(lab_id: str) -> int:
    """Extract the lab number from a lab_id like 'lab-1' -> 1."""
    if not lab_id.startswith("lab-"):
        raise ValueError(f"Invalid lab_id format: '{lab_id}'. Expected 'lab-N'.")
    try:
        return int(lab_id.split("-", 1)[1])
    except (IndexError, ValueError):
        raise ValueError(f"Invalid lab_id format: '{lab_id}'. Expected 'lab-N' where N is a number.")


class DockerService:
    _instance: "DockerService | None" = None

    def __new__(cls) -> "DockerService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_client()
        return cls._instance

    def _init_client(self):
        # Use a generous per-request timeout: provisioning a Sysbox lab/demo
        # container boots systemd + a nested dockerd, and the Docker API
        # `start` call itself can block for well over the 60s SDK default on a
        # small VM. A short timeout turns slow-but-correct provisioning into a
        # spurious read-timeout, and since the mutex holds during provisioning,
        # the created container still finishes later — leaving callers behind.
        self.client = docker.DockerClient(base_url=DOCKER_HOST, timeout=300)
        self.client.api.timeout = 300

    def start_lab(self, image: str, name: str, labels: dict[str, str] | None = None) -> dict:
        normalized_image = IMAGE_ALIASES.get(image, image)
        target_image = normalized_image

        try:
            self.client.images.get(normalized_image)
        except ImageNotFound:
            try:
                self.client.images.get(image)
                target_image = image
            except ImageNotFound:
                remote_image = REMOTE_IMAGE_MAP.get(normalized_image) or REMOTE_IMAGE_MAP.get(image)
                if remote_image:
                    logger.info(
                        f"Image '{normalized_image}' not found locally on Docker host. "
                        f"Attempting to pull '{remote_image}' from GHCR..."
                    )
                    try:
                        pulled = self.client.images.pull(remote_image)
                        pulled.tag(normalized_image)
                        if image != normalized_image:
                            pulled.tag(image)
                        target_image = normalized_image
                        logger.info(f"Successfully pulled '{remote_image}' and tagged as '{normalized_image}'")
                    except Exception as pull_err:
                        logger.error(f"Failed to auto-pull '{remote_image}': {pull_err}")
                        raise RuntimeError(
                            f"Image '{image}' not found on Docker host and failed to pull from {remote_image}: {pull_err}"
                        )
                else:
                    raise RuntimeError(
                        f"Image '{image}' not found on the Docker host. "
                        "Lab images must be pre-built or pulled before the orchestrator starts."
                    )

        runtime_opts = get_runtime_options()

        try:
            container = self.client.containers.run(
                image=target_image,
                name=name,
                hostname=name,
                detach=True,
                labels=labels or {},
                **runtime_opts,
            )
            logger.info(
                f"Started container '{name}' ({container.short_id}) with image '{target_image}' "
                f"(mode: {CONTAINER_RUNTIME_MODE}, opts: {runtime_opts})"
            )
            return self._container_info(container)
        except APIError as e:
            raise RuntimeError(f"Failed to start container: {e}")

    def wait_for_docker(self, name: str, timeout: int = 300) -> None:
        """Wait until the inner Docker daemon inside the container responds.

        The base image boots dockerd via systemd, so there is a short race
        after the container starts. Polls `docker info` as root.
        """
        deadline = time.monotonic() + timeout
        last_output = ""
        while time.monotonic() < deadline:
            try:
                exit_code, output = self.exec_command(name, ["docker", "info"], user="root")
                if exit_code == 0:
                    logger.info(f"Docker daemon ready in '{name}'")
                    return
                last_output = output
            except RuntimeError:
                pass
            time.sleep(1)
        raise RuntimeError(
            f"Docker daemon not ready in '{name}' within {timeout}s: {last_output}"
        )

    def pre_pull_images(self, name: str, images: list[str]) -> None:
        """Pull images into the container's inner Docker daemon before the
        student sees the terminal (equivalent to `sudo docker pull` during setup).
        """
        for image in images:
            exit_code, output = self.exec_command(name, ["docker", "pull", image], user="root")
            if exit_code != 0:
                raise RuntimeError(f"Failed to pre-pull image '{image}' in '{name}': {output}")
            logger.info(f"Pre-pulled image '{image}' in '{name}'")

    def stop_lab(self, name: str, timeout: int = 10) -> dict:
        container = self._get_container(name)
        try:
            container.stop(timeout=timeout)
            logger.info(f"Stopped container '{name}'")
            return self._container_info(container)
        except APIError as e:
            raise RuntimeError(f"Failed to stop container '{name}': {e}")

    def resume_lab(self, name: str) -> dict:
        container = self._get_container(name)
        try:
            container.start()
            logger.info(f"Resumed container '{name}'")
            return self._container_info(container)
        except APIError as e:
            raise RuntimeError(f"Failed to resume container '{name}': {e}")

    def remove_lab(self, name: str, force: bool = True) -> dict:
        container = self._get_container(name)
        info = self._container_info(container)
        try:
            container.remove(force=force, v=True)
            logger.info(f"Removed container '{name}'")
            return info
        except APIError as e:
            raise RuntimeError(f"Failed to remove container '{name}': {e}")

    def destroy_lab(self, name: str) -> dict:
        container = self._get_container(name)
        info = self._container_info(container)
        try:
            container.remove(force=True, v=True)
            logger.info(f"Destroyed container '{name}'")
            return info
        except APIError as e:
            raise RuntimeError(f"Failed to destroy container '{name}': {e}")

    def list_labs(self, all: bool = True) -> list[dict]:
        containers = self.client.containers.list(
            all=all,
            filters={"name": LAB_PREFIX},
        )
        return [self._container_info(c) for c in containers]

    def get_labs_by_labels(self, labels: dict[str, str]) -> list[dict]:
        """Return lab containers matching ALL given labels (e.g. user_id + lab_id).

        This is the source-of-truth lookup used to recover a session after an
        orchestrator or backend restart, instead of trusting in-memory state.
        """
        filters = {"label": [f"{key}={value}" for key, value in labels.items()]}
        containers = self.client.containers.list(all=True, filters=filters)
        return [self._container_info(c) for c in containers]

    def get_running_lab_by_labels(self, labels: dict[str, str]) -> dict | None:
        """Return the newest RUNNING container matching ALL given labels, or None.

        Containers list with ``all=True`` includes stopped/exited/created ones,
        so a crash-orphaned or half-provisioned container would otherwise be
        handed back as "the live" container. Only a container whose Docker
        status is exactly ``running`` can receive exec / terminal attachment;
        anything else must be treated as absent so the caller creates a fresh
        one (or 404s) instead of re-attaching to a dead container.
        """
        running = [
            c
            for c in self.get_labs_by_labels(labels)
            if c.get("status") == "running"
        ]
        if not running:
            return None
        running.sort(key=lambda c: c.get("created", ""), reverse=True)
        return running[0]

    def get_lab(self, name: str) -> dict:
        container = self._get_container(name)
        return self._container_info(container)

    def inspect_lab(self, name: str) -> dict:
        container = self._get_container(name)
        return container.attrs

    def activate_lab(self, name: str, lab_number: int) -> None:
        """Symlink lab files if they exist in the image.

        Expects lab content at /usr/local/labs/{n}/ inside the container.
        If the directory doesn't exist, activation is a no-op (exec-based
        validation doesn't need these symlinks).
        """
        src = f"/usr/local/labs/{lab_number}"

        # Check if lab directory exists — if not, skip (exec-based validation)
        check_exit, _ = self.exec_command(name, ["/bin/bash", "-c", f"test -d {src}"], user="root")
        if check_exit != 0:
            logger.info(f"Lab {lab_number} has no baked-in content, skipping symlink activation")
            return

        cmds = [
            ["/bin/bash", "-c", f"mkdir -p /usr/local/checks"],
            ["/bin/bash", "-c", f"ln -sf {src}/instructions.md /home/student/instructions.md"],
            ["/bin/bash", "-c", f"ln -sf {src}/validator.sh /usr/local/checks/validator.sh"],
            ["/bin/bash", "-c", f"ln -sf {src}/expected.json /usr/local/checks/expected.json"],
            ["/bin/bash", "-c", f"ln -sf {src}/reset.sh /usr/local/checks/reset.sh"],
        ]
        for cmd in cmds:
            exit_code, output = self.exec_command(name, cmd, user="root")
            if exit_code != 0:
                raise RuntimeError(f"Failed to activate lab {lab_number}: {output}")

        logger.info(f"Activated lab {lab_number} in container '{name}'")

    def exec_command(self, name: str, cmd: list[str], user: str | None = None) -> tuple[int, str]:
        container = self._get_container(name)
        # The container may have exited between the label lookup and this exec
        # (or an aborted create). Docker refuses `exec` on a non-running
        # container with a 409; surface that as a clear error instead of letting
        # the raw APIError escape as an unhandled 500 traceback.
        try:
            container.reload()
            if container.status != "running":
                raise RuntimeError(
                    f"Cannot exec into container '{name}': it is in state "
                    f"'{container.status}', not 'running'"
                )
        except RuntimeError:
            raise
        except Exception as e:
            logger.debug(f"Failed to inspect container '{name}' before exec: {e}")
        if user and user != "root" and cmd[:2] == ["/bin/bash", "-c"]:
            # docker exec -u <user> does NOT recompute supplementary groups for
            # the spawned process (verified on labops-docker: student is in the
            # docker group via /etc/group, yet `docker exec -u student` yields no
            # docker access). Drop privileges via sudo from root instead, which
            # runs initgroups() and picks up the current /etc/group — the same
            # mechanism as the terminal attach. Falls back to a plain `-u user`
            # exec when sudo is missing (e.g. bare minimal images).
            script = cmd[2]
            exit_code, output = container.exec_run(
                ["sudo", "-u", user, "/bin/bash", "-c", script],
                user="root",
                demux=True,
            )
            if exit_code == 127 and b"sudo" in (output[0] or b"") + (output[1] or b""):
                exit_code, output = container.exec_run(cmd, user=user, demux=True)
        else:
            exit_code, output = container.exec_run(cmd, user=user, demux=True)
        stdout = (output[0] or b"").decode()
        stderr = (output[1] or b"").decode()
        combined = stdout if not stderr else f"{stdout}\n{stderr}"
        return exit_code, combined.strip()

    def _get_container(self, name: str):
        try:
            return self.client.containers.get(name)
        except NotFound:
            raise RuntimeError(f"Container '{name}' not found")

    def _container_info(self, container) -> dict:
        return {
            "id": container.short_id,
            "name": container.name,
            "status": container.status,
            "image": container.image.tags[0] if container.image.tags else str(container.image.id)[:12],
            "created": container.attrs.get("Created", ""),
            "labels": dict(container.labels or {}),
        }


def get_docker_service() -> DockerService:
    return DockerService()
