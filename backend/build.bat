@echo off
REM =============================================================
REM  StayWise ML Platform — Docker Build Script (Windows)
REM  Builds all custom images in the correct order.
REM
REM  Usage:
REM    build.bat           (build with cache)
REM    build.bat --no-cache
REM =============================================================

SET NO_CACHE=
IF "%1"=="--no-cache" SET NO_CACHE=--no-cache

echo.
echo =================================================
echo   StayWise -- Building Docker Images
echo =================================================
echo.

echo [1/6] Building base image...
docker build %NO_CACHE% -f docker/Dockerfile.base -t staywise/base:3.11 .
IF %ERRORLEVEL% NEQ 0 (echo ERROR: base build failed & exit /b 1)
echo Done: base
echo.

echo [2/6] Building Airflow image...
docker build %NO_CACHE% -f docker/Dockerfile.airflow -t staywise/airflow:latest .
IF %ERRORLEVEL% NEQ 0 (echo ERROR: airflow build failed & exit /b 1)
echo Done: airflow
echo.

echo [3/6] Building API image...
docker build %NO_CACHE% -f docker/Dockerfile.api -t staywise/api:latest .
IF %ERRORLEVEL% NEQ 0 (echo ERROR: api build failed & exit /b 1)
echo Done: api
echo.

echo [4/6] Building Sentiment image...
docker build %NO_CACHE% -f docker/Dockerfile.sentiment -t staywise/sentiment:latest .
IF %ERRORLEVEL% NEQ 0 (echo ERROR: sentiment build failed & exit /b 1)
echo Done: sentiment
echo.

echo [5/6] Building MLflow image...
docker build %NO_CACHE% -f docker/Dockerfile.mlflow -t staywise/mlflow:latest .
IF %ERRORLEVEL% NEQ 0 (echo ERROR: mlflow build failed & exit /b 1)
echo Done: mlflow
echo.

echo [6/6] Building Simulator image...
docker build %NO_CACHE% -f docker/Dockerfile.simulator -t staywise/simulator:latest .
IF %ERRORLEVEL% NEQ 0 (echo ERROR: simulator build failed & exit /b 1)
echo Done: simulator
echo.

echo =================================================
echo   All images built successfully!
echo =================================================
echo.
echo Run: docker compose up -d
echo.
