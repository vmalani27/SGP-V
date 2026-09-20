#!/usr/bin/env python3
# ──────────────────────────────────────────────────────────────
# run_matrix.py — Host-side orchestrator for sequential VM matrix testing
# ──────────────────────────────────────────────────────────────
import os
import sys
import subprocess
import time
import json

# Define the testing matrix configurations
MATRIX = [
    {
        "name": "B1 - Baseline Control (Ubuntu 22.04 + Docker 27.5.1)",
        "box": "generic/ubuntu2204",
        "docker_ver": "27.5.1",
        "containerd_ver": "1.7.29",
        "sysbox_ver": "0.7.0"
    },
    {
        "name": "D2 - Target Docker 28.x on Ubuntu 22.04",
        "box": "generic/ubuntu2204",
        "docker_ver": "28.",
        "containerd_ver": "1.7.29",
        "sysbox_ver": "0.7.0"
    },
    {
        "name": "U2 - Noble Candidate (Ubuntu 24.04 + Docker 28.x)",
        "box": "generic/ubuntu2404",
        "docker_ver": "28.",
        "containerd_ver": "1.7.29",
        "sysbox_ver": "0.7.0"
    }
]

def run_command(args, env=None, capture=False):
    """Utility to run shell commands and display/return output."""
    print(f"Running command: {' '.join(args)}")
    current_env = os.environ.copy()
    if env:
        current_env.update(env)
    
    if capture:
        result = subprocess.run(args, env=current_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        return result.returncode, result.stdout
    else:
        result = subprocess.run(args, env=current_env)
        return result.returncode, ""

def main():
    # Ensure we run from the script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    results = []
    print("=" * 80)
    print("STARTING COMPATIBILITY MATRIX TESTING (Tasks 1, 2, 3)")
    print(f"Total configurations to test: {len(MATRIX)}")
    print("=" * 80)
    
    for i, config in enumerate(MATRIX, 1):
        name = config["name"]
        print(f"\n[{i}/{len(MATRIX)}] Testing Configuration: {name}")
        print("-" * 60)
        print(f"  OS Box:          {config['box']}")
        print(f"  Docker CE:       {config['docker_ver']}")
        print(f"  containerd.io:   {config['containerd_ver']}")
        print(f"  Sysbox CE:       {config['sysbox_ver']}")
        print("-" * 60)
        
        # Inject config variables into the Vagrant execution environment
        test_env = {
            "TEST_BOX": config["box"],
            "TEST_DOCKER_VERSION": config["docker_ver"],
            "TEST_CONTAINERD_VERSION": config["containerd_ver"],
            "TEST_SYSBOX_VERSION": config["sysbox_ver"]
        }
        
        # Clean up any leftover VMs before starting
        run_command(["vagrant", "destroy", "-f"], env=test_env)
        
        # 1. Spin up the VM (Tasks 1 and 2: Provisioning)
        print("Provisioning VM (vagrant up)...")
        rc, _ = run_command(["vagrant", "up"], env=test_env)
        
        status = "FAIL"
        details = ""
        
        if rc == 0:
            # 2. Run the test script inside the VM (Task 3: Verification)
            print("Running compatibility tests inside VM...")
            # We copy the script to the VM home directory, strip any Windows CRLF endings, and execute
            run_command(["vagrant", "ssh", "-c", "cp /opt/sgp/compatibility-testing/test_compatibility.sh ~/test_compatibility.sh && sed -i 's/\\r$//' ~/test_compatibility.sh && chmod +x ~/test_compatibility.sh"])
            
            test_rc, test_out = run_command(["vagrant", "ssh", "-c", "~/test_compatibility.sh"], capture=True)
            print(test_out)
            
            if test_rc == 0:
                status = "PASS"
                print(f"SUCCESS: {name} passed compatibility checks!")
            else:
                status = "FAIL"
                print(f"FAILURE: {name} failed compatibility checks.")
                
                # Fetch diagnostics if the compatibility checks failed
                print("Collecting diagnostics from VM...")
                _, docker_logs = run_command(["vagrant", "ssh", "-c", "journalctl -u docker -n 100"], capture=True)
                _, sysbox_logs = run_command(["vagrant", "ssh", "-c", "journalctl -u sysbox -n 100"], capture=True)
                _, dmesg_logs = run_command(["vagrant", "ssh", "-c", "dmesg -T | tail -n 100"], capture=True)
                
                diag_dir = os.path.join(script_dir, "diagnostics", name.replace(" ", "_").lower())
                os.makedirs(diag_dir, exist_ok=True)
                
                with open(os.path.join(diag_dir, "docker.log"), "w") as f:
                    f.write(docker_logs)
                with open(os.path.join(diag_dir, "sysbox.log"), "w") as f:
                    f.write(sysbox_logs)
                with open(os.path.join(diag_dir, "dmesg.log"), "w") as f:
                    f.write(dmesg_logs)
                
                details = f"Diagnostics saved in diagnostics/{name.replace(' ', '_').lower()}/"
        else:
            status = "FAIL"
            print("Vagrant provisioning failed.")
            details = "Vagrant provisioning/boot failure."
            
        # Record results
        results.append({
            "name": name,
            "box": config["box"],
            "docker": config["docker_ver"],
            "containerd": config["containerd_ver"],
            "sysbox": config["sysbox_ver"],
            "result": status,
            "details": details
        })
        
        # 3. Tear down the VM
        print("Tearing down VM (vagrant destroy)...")
        run_command(["vagrant", "destroy", "-f"], env=test_env)
    
    # Print summary report
    print("\n" + "=" * 80)
    print("COMPATIBILITY TESTING MATRIX SUMMARY")
    print("=" * 80)
    print(f"{'Configuration':<45} | {'Result':<6} | {'Notes'}")
    print("-" * 80)
    for res in results:
        print(f"{res['name']:<45} | {res['result']:<6} | {res['details']}")
    print("=" * 80)

if __name__ == "__main__":
    main()
