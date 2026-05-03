#!/bin/bash
# =============================================================
#  StayWise ML Platform — Docker Build Script
#  Builds all custom images in the correct order.
#
#  Usage:
#    ./build.sh           # build all images
#    ./build.sh --no-cache  # build all images without cache
# =============================================================

set -e  # exit immediately if any command fails

NO_CACHE=""
if [[ "$1" == "--no-cache" ]]; then
  NO_CACHE="--no-cache"
  echo "🔄 Building without cache..."
fi

echo ""
echo "================================================="
echo "  StayWise — Building Docker Images"
echo "================================================="
echo ""

echo "📦 [1/6] Building base image..."
docker build $NO_CACHE -f docker/Dockerfile.base -t staywise/base:3.11 .
echo "✅ Base image built."
echo ""

echo "📦 [2/6] Building Airflow image..."
docker build $NO_CACHE -f docker/Dockerfile.airflow -t staywise/airflow:latest .
echo "✅ Airflow image built."
echo ""

echo "📦 [3/6] Building API image..."
docker build $NO_CACHE -f docker/Dockerfile.api -t staywise/api:latest .
echo "✅ API image built."
echo ""

echo "📦 [4/6] Building Sentiment image..."
docker build $NO_CACHE -f docker/Dockerfile.sentiment -t staywise/sentiment:latest .
echo "✅ Sentiment image built."
echo ""

echo "📦 [5/6] Building MLflow image..."
docker build $NO_CACHE -f docker/Dockerfile.mlflow -t staywise/mlflow:latest .
echo "✅ MLflow image built."
echo ""

echo "📦 [6/6] Building Simulator image..."
docker build $NO_CACHE -f docker/Dockerfile.simulator -t staywise/simulator:latest .
echo "✅ Simulator image built."
echo ""

echo "================================================="
echo "  ✅ All images built successfully!"
echo "================================================="
echo ""
echo "Run 'docker compose up -d' to start the stack."
echo ""
