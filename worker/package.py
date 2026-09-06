import os
import sys
import zipfile
import shutil
from pathlib import Path

def main():
    script_dir = Path(__file__).resolve().parent
    os.chdir(script_dir)
    print(f"Building Lambda deployment packages in {script_dir}...")
    
    build_dir = script_dir / "build"
    site_pkg = build_dir / "python" / "lib" / "python3.12" / "site-packages"
    
    # 1. Zip layer.zip
    layer_root = build_dir / "python"
    if layer_root.exists():
        print("Zipping layer.zip...")
        count = 0
        with zipfile.ZipFile("layer.zip", "w", zipfile.ZIP_DEFLATED) as z:
            for fp in layer_root.rglob("*"):
                if fp.is_file():
                    arcname = fp.relative_to(build_dir).as_posix()
                    info = zipfile.ZipInfo(arcname)
                    info.external_attr = 0o755 << 16
                    with open(fp, "rb") as f_in:
                        z.writestr(info, f_in.read())
                    count += 1
        print(f"Created layer.zip ({count} files): {os.path.getsize('layer.zip')} bytes")

    # 2. Zip standalone function.zip
    if site_pkg.exists():
        print(f"Zipping function.zip from {site_pkg}...")
        count = 0
        with zipfile.ZipFile("function.zip", "w", zipfile.ZIP_DEFLATED) as z:
            for fp in site_pkg.rglob("*"):
                if fp.is_file():
                    arcname = fp.relative_to(site_pkg).as_posix()
                    info = zipfile.ZipInfo(arcname)
                    info.external_attr = 0o755 << 16
                    with open(fp, "rb") as f_in:
                        z.writestr(info, f_in.read())
                    count += 1
            for code_file in ["lambda_function.py", "seeder.py"]:
                fp = script_dir / code_file
                if fp.exists():
                    info = zipfile.ZipInfo(code_file)
                    info.external_attr = 0o755 << 16
                    with open(fp, "rb") as f_in:
                        z.writestr(info, f_in.read())
                    count += 1
        print(f"Created function.zip ({count} files): {os.path.getsize('function.zip')} bytes")
    else:
        print(f"ERROR: site_pkg does not exist: {site_pkg}")
        sys.exit(1)

if __name__ == "__main__":
    main()
