#!/bin/bash
set -e

echo "Building AWS Lambda deployment packages..."

# Clean up previous builds
rm -rf build layer.zip function.zip
mkdir -p build/python

# Build Linux wheels using Docker
echo "Fetching Linux dependencies via Docker..."
docker run --rm -v "${PWD}:/var/task" public.ecr.aws/sam/build-python3.12 pip install -r /var/task/requirements.txt -t /var/task/build/python

# Zip the layer
echo "Zipping layer.zip..."
cd build
zip -r ../layer.zip python > /dev/null
cd ..

# Zip the function
echo "Zipping function.zip..."
zip function.zip lambda_function.py seeder.py > /dev/null

echo "Cleaning up build directory..."
rm -rf build

echo "Done! You can now upload layer.zip and function.zip to AWS Lambda."
