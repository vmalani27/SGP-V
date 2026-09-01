Write-Host "Building AWS Lambda deployment packages..."

# Clean up previous builds
Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
Remove-Item -Force layer.zip -ErrorAction SilentlyContinue
Remove-Item -Force function.zip -ErrorAction SilentlyContinue

New-Item -ItemType Directory build/python/lib/python3.12/site-packages | Out-Null

# Build Linux wheels using Docker
Write-Host "Fetching Linux dependencies via Docker..."
docker run --rm -v "${PWD}:/var/task" public.ecr.aws/sam/build-python3.12 pip install -r /var/task/requirements.txt -t /var/task/build/python/lib/python3.12/site-packages

# Zip the layer
Write-Host "Zipping layer.zip..."
python -c "
import zipfile, os
with zipfile.ZipFile('layer.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk('build/python'):
        for file in files:
            fp = os.path.join(root, file)
            arcname = os.path.relpath(fp, 'build')
            info = zipfile.ZipInfo(arcname)
            info.external_attr = 0o755 << 16
            with open(fp, 'rb') as f:
                z.writestr(info, f.read())
"

# Zip the function
Write-Host "Zipping function.zip..."
python -c "
import zipfile
with zipfile.ZipFile('function.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for file in ['lambda_function.py', 'seeder.py']:
        info = zipfile.ZipInfo(file)
        info.external_attr = 0o755 << 16
        with open(file, 'rb') as f:
            z.writestr(info, f.read())
"

Write-Host "Cleaning up build directory..."
Remove-Item -Recurse -Force build

Write-Host "Done! You can now upload layer.zip and function.zip to AWS Lambda."
