const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const directories = [".content", ".next", ".user_data", "node_modules"];

for (const directory of directories) {
  const target = path.join(projectRoot, directory);
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${directory}`);
}

if (process.argv.includes("--docker")) {
  const composeRoot = path.resolve(projectRoot, "..");
  const composeOptions = {
    cwd: composeRoot,
    stdio: "inherit",
  };
  const stop = spawnSync("docker", ["compose", "rm", "--stop", "--force", "frontend"], composeOptions);

  if (stop.error || stop.status !== 0) {
    console.error(`Unable to remove the frontend container: ${stop.error?.message ?? "Docker Compose failed"}`);
    process.exit(stop.status ?? 1);
  }

  for (const volume of ["frontend_node_modules_v2", "frontend_node_modules", "frontend_next"]) {
    const result = spawnSync("docker", ["volume", "ls", "-q", "--filter", `label=com.docker.compose.volume=${volume}`], {
      ...composeOptions,
      stdio: ["ignore", "pipe", "inherit"],
    });
    const volumeNames = result.stdout.toString().trim().split(/\r?\n/).filter(Boolean);

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }

    if (volumeNames.length > 0) {
      const remove = spawnSync("docker", ["volume", "rm", ...volumeNames], composeOptions);
      if (remove.error || remove.status !== 0) {
        console.error(`Unable to remove Docker volume ${volume}: ${remove.error?.message ?? "Docker failed"}`);
        process.exit(remove.status ?? 1);
      }
    }
  }
}