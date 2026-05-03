# StayWise ML Platform — Build System Documentation

## Overview

StayWise uses a **custom base image pattern** for build efficiency.
All Python services extend from a single base image (`staywise/base:3.11`) that
contains shared system dependencies, eliminating redundant installations across services.

```
staywise/base:3.11
    ├── staywise/api:latest
    ├── staywise/sentiment:latest   (used by producer & consumer)
    ├── staywise/mlflow:latest
    └── staywise/simulator:latest

apache/airflow:2.8.1
    └── staywise/airflow:latest
```

---

## Docker Structure

```
backend/
├── docker/
│   ├── requirements/
│   │   ├── airflow.txt
│   │   ├── api.txt
│   │   ├── mlflow.txt
│   │   ├── sentiment.txt
│   │   └── simulator.txt
│   ├── Dockerfile.base
│   ├── Dockerfile.airflow
│   ├── Dockerfile.api
│   ├── Dockerfile.sentiment
│   ├── Dockerfile.mlflow
│   └── Dockerfile.simulator
├── build.sh         # Linux/Mac
├── build.bat        # Windows
└── docker-compose.yml
```

---

## Prerequisites

Make sure the following are installed:
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v24+)
- Docker Compose (included in Docker Desktop)

Verify installation:
```bash
docker --version
docker compose version
```

---

## First-Time Setup

### 1. Clone & configure environment

```bash
git clone <repo-url>
cd backend

# Copy the env template and fill in the values
cp .env.example .env
```

Edit `.env` and fill in all required values:
```
AIRFLOW__CORE__FERNET_KEY=   # generate using the command below
AIRFLOW_POSTGRES_PASSWORD=   # e.g. airflow
MLFLOW_POSTGRES_PASSWORD=    # e.g. mlflow
DW_POSTGRES_PASSWORD=        # e.g. staywise
PGADMIN_DEFAULT_EMAIL=       # pgadmin login email
PGADMIN_DEFAULT_PASSWORD=    # pgadmin login password
```

Generate a Fernet key for Airflow:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 2. Build all images

**Windows (CMD/Powershell):**
```cmd
build.bat
```

**Linux/Mac:**
```bash
chmod +x build.sh
./build.sh
```

**Manual (all platforms):**
```bash
docker build -f docker/Dockerfile.base -t staywise/base:3.11 .
docker build -f docker/Dockerfile.airflow -t staywise/airflow:latest .
docker build -f docker/Dockerfile.api -t staywise/api:latest .
docker build -f docker/Dockerfile.sentiment -t staywise/sentiment:latest .
docker build -f docker/Dockerfile.mlflow -t staywise/mlflow:latest .
docker build -f docker/Dockerfile.simulator -t staywise/simulator:latest .
```

> ⚠️ **IMPORTANT:** The base image (`staywise/base:3.11`) **must be built first**
> since all other services extend from it.
> Do not use `docker compose build` directly — it cannot guarantee build order.
> Always use `build.bat` or `build.sh` instead.

### 3. Start the stack

```bash
docker compose up -d
```

### 4. Verify

```bash
docker compose ps
```

All services should be `Up` or `healthy` within ~2 minutes.

---

## Service URLs

| Service | URL | Credentials |
|---|---|---|
| Airflow UI | http://localhost:8080 | airflow / airflow |
| API | http://localhost:8000/docs | — |
| MLflow | http://localhost:5000 | — |
| pgAdmin | http://localhost:5050 | from `.env` |
| MongoDB | localhost:27017 | — |
| PostgreSQL DW | localhost:5434 | from `.env` |
| Redis | localhost:6379 | — |
| Kafka | localhost:9092 | — |

---

## Daily Operations

### Start the stack
```bash
docker compose up -d
```

### Stop the stack
```bash
docker compose down
```

### Stop and remove all volumes (full data reset)
```bash
docker compose down -v
```

### Check container status
```bash
docker compose ps
```

### View service logs
```bash
docker compose logs <service>            # all logs
docker compose logs -f <service>         # follow / live
docker compose logs --tail 50 <service>  # last 50 lines
```

Examples:
```bash
docker compose logs -f api
docker compose logs --tail 20 consumer
```

### Restart a specific service
```bash
docker compose restart <service>
```

---

## Rebuilding

### Rebuild a single service (after code changes)
```bash
docker compose build <service> && docker compose up -d <service>
```

Example:
```bash
docker compose build api && docker compose up -d api
```

### Rebuild everything from scratch (no cache)
**Windows:**
```cmd
build.bat --no-cache
```

**Linux/Mac:**
```bash
./build.sh --no-cache
```

### Rebuild the base image (after updating system deps)
```bash
docker build --no-cache -f docker/Dockerfile.base -t staywise/base:3.11 .
```

> ⚠️ After rebuilding the base image, all services that extend from it
> must be rebuilt as well. Re-run `build.bat` or `build.sh` to rebuild everything.

---

## Simulator (Manual Run)

The simulator runs in standby mode (`tail -f /dev/null`).
To trigger a simulation run manually:

```bash
docker exec -it simulator /bin/bash /app/src/simulator/entrypoint.sh
```

---

## Troubleshooting

### `pull access denied for staywise/base:3.11`
The base image has not been built yet. Run `build.bat` or `build.sh` first.

### Service shows `unhealthy` on first startup
Some services take longer to initialize (especially Airflow and MLflow).
Wait ~2 minutes and re-check with `docker compose ps`.

### Port already in use
One of the required ports (8080, 8000, 5000, etc.) is occupied by another process.

Find the process using that port:
```bash
# Windows
netstat -ano | findstr :<port>

# Linux/Mac
lsof -i :<port>
```

### Full reset (remove all data & images)
```bash
docker compose down -v
docker rmi staywise/base:3.11 staywise/airflow:latest staywise/api:latest \
           staywise/sentiment:latest staywise/mlflow:latest staywise/simulator:latest
```
Then re-run from the **Build all images** step.

### Inspect container logs
```bash
docker logs <container-name> --tail 50
```

---

## Image Reference

| Image | Base | Description |
|---|---|---|
| `staywise/base:3.11` | `python:3.11-slim` | Shared system deps (gcc, libpq-dev, build-essential) |
| `staywise/airflow:latest` | `apache/airflow:2.8.1` | Airflow + custom requirements |
| `staywise/api:latest` | `staywise/base:3.11` | FastAPI service |
| `staywise/sentiment:latest` | `staywise/base:3.11` | Kafka producer & consumer |
| `staywise/mlflow:latest` | `staywise/base:3.11` | MLflow tracking server |
| `staywise/simulator:latest` | `staywise/base:3.11` | Data simulator (standby mode) |

---

## Adding New Dependencies

### New Python package
Add it to the relevant requirements file under `docker/requirements/`:
```
docker/requirements/
├── api.txt         → staywise-api
├── sentiment.txt   → producer & consumer
├── mlflow.txt      → mlflow
├── simulator.txt   → simulator
└── airflow.txt     → airflow
```

After updating requirements, rebuild the affected service:
```bash
docker compose build <service> && docker compose up -d <service>
```

### New system package (apt)
- **Shared across all services** → add to `docker/Dockerfile.base`, then rebuild base + all services using `build.bat` / `build.sh`
- **Specific to one service** → add `RUN apt-get install` to that service's Dockerfile only
