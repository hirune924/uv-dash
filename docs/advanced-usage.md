# Advanced Usage

This guide covers advanced usage patterns for UV Dash.

## Table of Contents

- [Process Lifecycle and Survival](#process-lifecycle-and-survival)
- [Running Multiple Processes](#running-multiple-processes)
- [Pre-hook and Post-hook Patterns](#pre-hook-and-post-hook-patterns)
- [Custom Run Scripts](#custom-run-scripts)
- [Environment Variables](#environment-variables)
- [Port Configuration](#port-configuration)
- [Troubleshooting](#troubleshooting)

---

## Process Lifecycle and Survival

### Background Process Behavior

**Important:** When UV Dash closes or restarts, your running applications **continue to run in the background**. This design choice provides several benefits:

- **Crash Recovery**: If UV Dash crashes, your applications keep running
- **Zero Downtime Updates**: Update UV Dash without stopping your apps
- **Independent Operation**: Applications run independently of the GUI

### Process Recovery on Startup

When UV Dash starts up, it automatically detects and reconnects to any running processes:

1. **PID Check**: Verifies if the process ID is still alive
2. **Port Check**: Confirms the port is still in use
3. **Status Recovery**: If both checks pass, the app is marked as "Running"
4. **UI Update**: The app card shows the correct status, port, and controls

**Example Scenario:**

```
1. Start Flask app in UV Dash → Port 5000, PID 1234
2. Close UV Dash (Flask keeps running on port 5000)
3. Reopen UV Dash → Detects PID 1234 and port 5000
4. App card shows "Running" with working Stop button
```

### Manual Stop Required

Since processes survive UV Dash restart, you must explicitly click the **Stop** button to terminate an application. Simply closing UV Dash will not stop running apps.

### When Process Recovery Fails

If either the PID or port check fails during startup, UV Dash will:

- Clear the saved PID and port
- Mark the app as "Ready" (not running)
- Remove runtime state from `apps.json`

**Common reasons for recovery failure:**

- Process was manually killed (e.g., `kill <PID>`)
- Port was released (application crashed after UV Dash closed)
- System restart (all processes terminated)

### Checking Running Processes Manually

To see if your app is running outside UV Dash:

**macOS/Linux:**
```bash
# Check if process is running
ps aux | grep python

# Check if port is in use
lsof -i :5000
```

**Windows:**
```powershell
# Check if process is running
Get-Process python

# Check if port is in use
netstat -ano | findstr :5000
```

### Best Practices

1. **Always use Stop button**: Don't rely on closing UV Dash to stop apps
2. **Monitor resource usage**: Check the Apps tab for CPU/memory metrics
3. **Check port conflicts**: If recovery fails unexpectedly, verify the port is free
4. **Use health checks**: Implement `/health` endpoints for better monitoring

---

## Running Multiple Processes

Some applications need to run multiple processes simultaneously (e.g., API server + worker, frontend + backend). UV Dash handles each app as a single process, but you can manage multiple processes using shell script wrappers.

### Method 1: Shell Script Wrapper

Create a shell script that starts multiple processes:

**start-all.sh:**
```bash
#!/bin/bash

# Cleanup function (called on Ctrl+C or exit)
cleanup() {
    echo "Shutting down all services..."

    if [ ! -z "$API_PID" ]; then
        kill $API_PID 2>/dev/null || true
    fi

    if [ ! -z "$WORKER_PID" ]; then
        kill $WORKER_PID 2>/dev/null || true
    fi

    exit 0
}

# Trap signals
trap cleanup SIGINT SIGTERM

echo "Starting multi-service app..."

# Start API server
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
API_PID=$!
echo "API Server started (PID: $API_PID)"

sleep 2

# Start Celery worker
celery -A app.tasks worker --loglevel=info &
WORKER_PID=$!
echo "Worker started (PID: $WORKER_PID)"

echo "All services running. Press Ctrl+C to stop."

# Wait for processes
wait $API_PID $WORKER_PID
cleanup
```

**In UV Dash:**
```
Run Command: bash start-all.sh
```

### Method 2: Python Script

For cross-platform compatibility, use Python instead of shell scripts:

**start_all.py:**
```python
#!/usr/bin/env python3
import subprocess
import signal
import sys
import time

processes = []

def cleanup(signum=None, frame=None):
    """Stop all processes"""
    print("\nStopping all services...")
    for proc in processes:
        try:
            proc.terminate()
        except:
            pass

    for proc in processes:
        try:
            proc.wait(timeout=5)
        except:
            proc.kill()

    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

try:
    # Start API server
    print("Starting API server...")
    api_proc = subprocess.Popen(
        ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
    )
    processes.append(api_proc)

    time.sleep(2)

    # Start worker
    print("Starting worker...")
    worker_proc = subprocess.Popen(
        ["celery", "-A", "app.tasks", "worker", "--loglevel=info"]
    )
    processes.append(worker_proc)

    print("All services running. Press Ctrl+C to stop.")

    # Wait for any process to exit
    while True:
        for proc in processes:
            if proc.poll() is not None:
                print(f"Process exited with code {proc.returncode}")
                cleanup()
        time.sleep(1)

except KeyboardInterrupt:
    cleanup()
except Exception as e:
    print(f"Error: {e}")
    cleanup()
```

**In UV Dash:**
```
Run Command: python start_all.py
```

### Method 3: pyproject.toml Scripts

Define scripts in your `pyproject.toml`:

```toml
[project.scripts]
start-all = "app.cli:start_all"
start-api = "app.cli:start_api"
start-worker = "app.cli:start_worker"
```

**app/cli.py:**
```python
import subprocess
import signal
import sys

def start_all():
    """Start all services"""
    processes = []

    def cleanup(signum=None, frame=None):
        for proc in processes:
            proc.terminate()
        for proc in processes:
            proc.wait()
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # Start services
    processes.append(subprocess.Popen(["uvicorn", "app.main:app", "--port", "8000"]))
    processes.append(subprocess.Popen(["celery", "-A", "app.tasks", "worker"]))

    print("All services running. Press Ctrl+C to stop.")

    for proc in processes:
        proc.wait()

def start_api():
    """Start API server only"""
    subprocess.run(["uvicorn", "app.main:app", "--port", "8000"])

def start_worker():
    """Start worker only"""
    subprocess.run(["celery", "-A", "app.tasks", "worker"])
```

**In UV Dash:**
```
Run Command: start-all
```

---

## Pre-hook and Post-hook Patterns

Sometimes you need to run setup commands before starting your main application, or cleanup commands after it stops. Common use cases include:

- **Database migrations** before starting the server
- **Environment validation** to check required files/services
- **Data initialization** or cache warming
- **Cleanup tasks** after the application stops
- **Dependency service checks** (Redis, PostgreSQL, etc.)

The same shell script wrapper approach used for multiple processes also works perfectly for pre-hooks and post-hooks.

### Database Migration Example

Run Alembic migrations before starting FastAPI:

**run-with-migration.sh:**
```bash
#!/bin/bash
set -e  # Exit on any error

echo "Running database migrations..."
alembic upgrade head

if [ $? -ne 0 ]; then
    echo "Migration failed!"
    exit 1
fi

echo "Migrations complete. Starting server..."
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**In UV Dash:**
```
Run Command: bash run-with-migration.sh
```

### Environment Check Example

Validate environment before starting:

**run-with-checks.sh:**
```bash
#!/bin/bash

# Pre-hook: Check required files
echo "Checking environment..."

if [ ! -f "config.yaml" ]; then
    echo "Error: config.yaml not found"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo "Error: .env file not found"
    exit 1
fi

# Pre-hook: Check Redis connection
echo "Checking Redis connection..."
redis-cli ping > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Warning: Redis is not running. Starting anyway..."
fi

echo "Environment checks passed. Starting application..."
streamlit run app.py --server.port 8501
```

### Python Script with Pre-hooks

**start_with_setup.py:**
```python
#!/usr/bin/env python3
import subprocess
import sys
import os

def run_migrations():
    """Pre-hook: Run database migrations"""
    print("Running database migrations...")
    result = subprocess.run(["alembic", "upgrade", "head"])
    if result.returncode != 0:
        print("Migration failed!")
        return False
    print("Migrations complete.")
    return True

def check_environment():
    """Pre-hook: Check environment"""
    print("Checking environment...")

    if not os.path.exists("config.yaml"):
        print("Error: config.yaml not found")
        return False

    if not os.path.exists(".env"):
        print("Error: .env file not found")
        return False

    print("Environment check passed.")
    return True

def check_redis():
    """Pre-hook: Check Redis connection"""
    print("Checking Redis connection...")
    try:
        import redis
        r = redis.Redis(host='localhost', port=6379)
        r.ping()
        print("Redis connection: OK")
        return True
    except Exception as e:
        print(f"Redis connection failed: {e}")
        print("Warning: Continuing without Redis...")
        return True  # Non-critical, continue anyway

def cleanup():
    """Post-hook: Cleanup after app stops"""
    print("Running cleanup tasks...")
    # Add your cleanup logic here
    subprocess.run(["./cleanup.sh"], check=False)
    print("Cleanup complete.")

def main():
    """Main entry point with pre-hooks and post-hooks"""
    try:
        # Pre-hooks
        if not check_environment():
            sys.exit(1)

        if not run_migrations():
            sys.exit(1)

        check_redis()  # Non-critical

        # Main application
        print("Starting application...")
        subprocess.run([
            "uvicorn", "app.main:app",
            "--host", "0.0.0.0",
            "--port", "8000"
        ])

    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        # Post-hook
        cleanup()

if __name__ == "__main__":
    main()
```

**In UV Dash:**
```
Run Command: python start_with_setup.py
```

### Using pyproject.toml

Define pre-hook aware scripts:

```toml
[project.scripts]
start = "app.cli:start_with_setup"
migrate = "app.cli:migrate"
check-env = "app.cli:check_environment"
```

**app/cli.py:**
```python
import subprocess
import sys
import os

def migrate():
    """Run database migrations"""
    result = subprocess.run(["alembic", "upgrade", "head"])
    return result.returncode == 0

def check_environment():
    """Check if environment is ready"""
    if not os.path.exists("config.yaml"):
        print("Error: config.yaml not found")
        return False
    print("Environment check passed")
    return True

def start_with_setup():
    """Start with pre-flight checks"""
    # Pre-hook 1: Check environment
    if not check_environment():
        sys.exit(1)

    # Pre-hook 2: Run migrations
    print("Running migrations...")
    if not migrate():
        print("Migration failed!")
        sys.exit(1)

    # Start main application
    print("Starting application...")
    subprocess.run([
        "uvicorn", "app.main:app",
        "--host", "0.0.0.0",
        "--port", "8000"
    ])

if __name__ == "__main__":
    start_with_setup()
```

**In UV Dash:**
```
Run Command: start
```

### Django Example

**run-django.sh:**
```bash
#!/bin/bash
set -e

echo "Running Django migrations..."
python manage.py migrate

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting Django development server..."
python manage.py runserver 0.0.0.0:8000
```

### Data Initialization Example

**run-with-data-init.sh:**
```bash
#!/bin/bash

# Pre-hook: Initialize data if needed
if [ ! -f "data/initialized.flag" ]; then
    echo "First run detected. Initializing data..."
    python scripts/init_data.py
    mkdir -p data
    touch data/initialized.flag
fi

# Pre-hook: Warm up cache
echo "Warming up cache..."
python scripts/warm_cache.py

# Start application
echo "Starting application..."
streamlit run app.py --server.port 8501
```

### Post-hook Example

Run cleanup after application stops:

**run-with-cleanup.sh:**
```bash
#!/bin/bash

# Cleanup function (post-hook)
cleanup() {
    echo "Running cleanup tasks..."
    python scripts/cleanup.py
    echo "Cleanup complete."
}

# Register cleanup function
trap cleanup EXIT

# Start application
echo "Starting application..."
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Common Pre-hook Patterns

**1. Service Dependency Check:**
```bash
# Check if PostgreSQL is ready
until pg_isready -h localhost -p 5432; do
    echo "Waiting for PostgreSQL..."
    sleep 1
done
```

**2. Wait for Redis:**
```bash
# Wait for Redis to be ready
until redis-cli ping > /dev/null 2>&1; do
    echo "Waiting for Redis..."
    sleep 1
done
```

**3. Download Required Files:**
```bash
# Download model files if not exist
if [ ! -f "models/model.pkl" ]; then
    echo "Downloading model..."
    python scripts/download_model.py
fi
```

**4. Create Required Directories:**
```bash
# Ensure directories exist
mkdir -p logs data/cache tmp
```

---

## Custom Run Scripts

### Using Makefile

If your project uses a Makefile:

**Makefile:**
```makefile
.PHONY: start
start:
	uvicorn app.main:app --reload --port 8000

.PHONY: start-prod
start-prod:
	uvicorn app.main:app --host 0.0.0.0 --port 8000

.PHONY: start-all
start-all:
	@echo "Starting all services..."
	@uvicorn app.main:app --port 8000 & \
	celery -A app.tasks worker & \
	wait
```

**In UV Dash:**
```
Run Command: make start-all
```

### Using Just (Modern Make Alternative)

**justfile:**
```just
# Start all services
start-all:
    uvicorn app.main:app --port 8000 &
    celery -A app.tasks worker &
    wait

# Start API only
start-api:
    uvicorn app.main:app --port 8000

# Start worker only
start-worker:
    celery -A app.tasks worker
```

**In UV Dash:**
```
Run Command: just start-all
```

---

## Environment Variables

### Per-App Environment Variables

Set environment variables for each app in the Edit dialog:

1. Click the Edit button (✏️) on an app card
2. Add environment variables in the "Environment Variables" section
3. For sensitive data, use "Secrets" instead

### Global Secrets

For API keys and other sensitive data shared across multiple apps:

1. Go to **Settings** tab
2. Click **Global Secrets**
3. Add secrets with encryption
4. Reference them in app configurations

---

## Port Configuration

### Auto-Detection

UV Dash automatically detects ports from common frameworks:

- **Streamlit**: Default 8501
- **FastAPI/Uvicorn**: Detects from logs
- **Flask**: Detects from logs
- **Gradio**: Detects from logs

### Manual Port Specification

If auto-detection fails, specify the port explicitly:

**Option 1: In Command**
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Option 2: In Environment Variables**
```bash
PORT=8000
```

**Option 3: In pyproject.toml**
```toml
[tool.uv-dash]
port = 8000
```

---

## Troubleshooting

### Issue: Multiple processes not stopping properly

**Solution:** Use proper signal handling in your wrapper script.

```bash
#!/bin/bash
trap "kill 0" SIGINT SIGTERM
uvicorn app.main:app --port 8000 &
celery -A app.tasks worker &
wait
```

### Issue: Port already in use

**Solution:** Check for orphaned processes:

```bash
# Find process using port 8000
lsof -i :8000

# Kill the process
kill -9 <PID>
```

Or specify a different port in your run command.

### Issue: Logs from multiple processes are mixed

**Solution:** Redirect logs to separate files:

```bash
#!/bin/bash
mkdir -p logs
uvicorn app.main:app --port 8000 > logs/api.log 2>&1 &
celery -A app.tasks worker > logs/worker.log 2>&1 &
wait
```

Then tail the logs separately:
```bash
tail -f logs/api.log
tail -f logs/worker.log
```

---

## Example Projects

### FastAPI + Celery

**Project Structure:**
```
my-app/
├── pyproject.toml
├── app/
│   ├── main.py
│   └── tasks.py
└── start-all.sh
```

**start-all.sh:**
```bash
#!/bin/bash
trap "kill 0" SIGINT SIGTERM

# Start Redis (if needed)
# redis-server &

# Start Celery worker
celery -A app.tasks worker --loglevel=info &

# Start API server (foreground)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Streamlit + Background Processor

**start-app.sh:**
```bash
#!/bin/bash
trap "kill 0" SIGINT SIGTERM

# Start background data processor
python -m app.data_processor &

# Start Streamlit (foreground)
streamlit run app.py --server.port 8501
```

---

## Best Practices

1. **Always use signal handling** to ensure clean shutdown of all processes
2. **Use absolute paths** when referencing files in scripts
3. **Add sleep delays** between starting dependent services
4. **Log to separate files** for easier debugging
5. **Test your scripts** outside UV Dash first
6. **Make scripts executable**: `chmod +x start-all.sh`
7. **Use cross-platform solutions** (Python scripts) when possible

---

## Alternative Approaches

If you frequently need to run multiple processes, consider:

1. **Installing as separate apps**: Install the same project multiple times with different run commands
2. **Using Docker Compose**: For complex multi-service architectures
3. **Process managers**: Use tools like `supervisor` or `pm2`

---

## Questions?

If you have questions or suggestions, please open an issue on [GitHub](https://github.com/hirune924/uv-dash/issues).
