import os
import sys
import zipfile
import shutil
import subprocess
from pathlib import Path

def main():
    print("[Docker] Installing requirements to in-container temporary directory...")
    pkg_dir = Path("/tmp/site-packages")
    layer_dir = Path("/tmp/layer/python/lib/python3.12/site-packages")
    out_dir = Path("/var/task")
    
    if pkg_dir.exists():
        shutil.rmtree(pkg_dir)
    pkg_dir.mkdir(parents=True, exist_ok=True)
    layer_dir.mkdir(parents=True, exist_ok=True)
    
    cmd = [
        sys.executable, "-m", "pip", "install",
        "--no-cache-dir",
        "-r", "/var/task/requirements.txt",
        "-t", str(pkg_dir)
    ]
    subprocess.check_call(cmd)
    
    print("[Docker] Copying dependencies to layer...")
    for item in pkg_dir.iterdir():
        dst = layer_dir / item.name
        if item.is_dir():
            shutil.copytree(item, dst)
        else:
            shutil.copy2(item, dst)
            
    layer_zip = out_dir / "layer.zip"
    print(f"[Docker] Creating {layer_zip}...")
    with zipfile.ZipFile(layer_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for fp in Path("/tmp/layer").rglob("*"):
            if fp.is_file():
                arcname = fp.relative_to("/tmp/layer").as_posix()
                info = zipfile.ZipInfo(arcname)
                info.external_attr = 0o755 << 16
                with open(fp, "rb") as f_in:
                    z.writestr(info, f_in.read())
    print(f"[Docker] Created layer.zip: {layer_zip.stat().st_size} bytes")

    for code_file in ["lambda_function.py", "seeder.py"]:
        src = out_dir / code_file
        if src.exists():
            shutil.copy2(src, pkg_dir / code_file)

    function_zip = out_dir / "function.zip"
    print(f"[Docker] Creating {function_zip}...")
    with zipfile.ZipFile(function_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for fp in pkg_dir.rglob("*"):
            if fp.is_file():
                arcname = fp.relative_to(pkg_dir).as_posix()
                info = zipfile.ZipInfo(arcname)
                info.external_attr = 0o755 << 16
                with open(fp, "rb") as f_in:
                    z.writestr(info, f_in.read())
    print(f"[Docker] Created function.zip: {function_zip.stat().st_size} bytes")
    print("[Docker] Build complete!")

if __name__ == "__main__":
    main()
