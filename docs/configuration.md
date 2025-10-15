# Configuration Guide

Learn how to configure your Python applications to work optimally with UV Dash.

## Table of Contents

- [Project Requirements](#project-requirements)
- [Run Commands](#run-commands)
- [Supported Frameworks](#supported-frameworks)
- [Environment Variables](#environment-variables)
- [Port Configuration](#port-configuration)
- [Advanced Configuration](#advanced-configuration)

## Project Requirements

### Minimum Requirements

Your Python project must have:

1. **pyproject.toml**: A valid `pyproject.toml` file in the root directory
2. **UV Compatibility**: Dependencies manageable by `uv`

### Example pyproject.toml

```toml
[project]
name = "my-awesome-app"
version = "0.1.0"
description = "My Python application"
requires-python = ">=3.10"
dependencies = [
    "fastapi>=0.104.0",
    "uvicorn>=0.24.0",
]

[project.scripts]
start = "uvicorn app.main:app --host 0.0.0.0 --port 8000"
```

## Run Commands

### Defining Run Commands

There are two ways to specify how UV Dash should run your application:

#### Method 1: pyproject.toml (Recommended)

Define a script in your `pyproject.toml`:

```toml
[project.scripts]
start = "streamlit run app.py"
dev = "uvicorn app.main:app --reload"
prod = "gunicorn app.main:app -k uvicorn.workers.UvicornWorker"
```

When you install the app, UV Dash will automatically detect these scripts. You can specify which one to use in the "Run Command" field by entering just the script name:

```
start
```

UV Dash will automatically run it as `uv run start`.

#### Method 2: Direct Command

Specify the full command when adding/editing the app in UV Dash:

```bash
streamlit run app.py --server.port 8501
```

This is useful for:
- Testing different commands without modifying `pyproject.toml`
- Apps without predefined scripts
- Ad-hoc command-line arguments

### Command Examples by Framework

#### Streamlit
```toml
[project.scripts]
start = "streamlit run app.py --server.port 8501"
```

#### FastAPI / Uvicorn
```toml
[project.scripts]
start = "uvicorn app.main:app --host 0.0.0.0 --port 8000"
dev = "uvicorn app.main:app --reload"
```

#### Flask
```toml
[project.scripts]
start = "flask run --host=0.0.0.0 --port=5000"
```

#### Gradio
```toml
[project.scripts]
start = "python app.py"
```

#### Django
```toml
[project.scripts]
start = "python manage.py runserver 0.0.0.0:8000"
migrate = "python manage.py migrate"
```

#### Generic Python Script
```toml
[project.scripts]
start = "python -m my_package.main"
```

## Supported Frameworks

UV Dash automatically detects and supports the following Python frameworks:

### Web Frameworks

#### Streamlit

**Auto-Detection**: Looks for `Running on http://` in logs

**Example Configuration**:
```toml
[project]
dependencies = ["streamlit>=1.28.0"]

[project.scripts]
start = "streamlit run app.py"
```

**Port Detection**: Automatic from log output

---

#### FastAPI / Uvicorn

**Auto-Detection**: Looks for `Uvicorn running on` or `Application startup complete` in logs

**Example Configuration**:
```toml
[project]
dependencies = [
    "fastapi>=0.104.0",
    "uvicorn>=0.24.0",
]

[project.scripts]
start = "uvicorn app.main:app --host 0.0.0.0 --port 8000"
```

**Port Detection**: Automatic from log output

**Tips**:
- Use `--host 0.0.0.0` to make the app accessible
- For development, add `--reload` flag
- For production, consider `gunicorn` with uvicorn workers

---

#### Flask

**Auto-Detection**: Looks for `Running on http://` in logs

**Example Configuration**:
```toml
[project]
dependencies = ["flask>=3.0.0"]

[project.scripts]
start = "flask run --host=0.0.0.0 --port=5000"
```

**Port Detection**: Automatic from log output

**Environment Variables**:
```bash
FLASK_APP=app.py
FLASK_ENV=development
```

---

#### Gradio

**Auto-Detection**: Looks for `Running on local URL:` in logs

**Example Configuration**:
```toml
[project]
dependencies = ["gradio>=4.0.0"]

[project.scripts]
start = "python app.py"
```

**In your Python code**:
```python
import gradio as gr

def greet(name):
    return f"Hello {name}!"

demo = gr.Interface(fn=greet, inputs="text", outputs="text")
demo.launch(server_name="0.0.0.0", server_port=7860)
```

**Port Detection**: Automatic from log output

---

#### Django

**Auto-Detection**: Looks for `Starting development server at` in logs

**Example Configuration**:
```toml
[project]
dependencies = ["django>=4.2.0"]

[project.scripts]
start = "python manage.py runserver 0.0.0.0:8000"
migrate = "python manage.py migrate"
```

**Port Detection**: Automatic from log output

**Note**: For database migrations, see [Advanced Usage - Pre-hooks](advanced-usage.md#pre-hook-and-post-hook-patterns)

---

### Non-Web Applications

#### CLI Applications

Any Python application can be run through UV Dash:

```toml
[project.scripts]
start = "python -m my_package.cli"
process = "python worker.py"
```

**Note**: For CLI apps, no port is detected. Use the Logs tab to view output.

#### Background Workers

```toml
[project.scripts]
worker = "celery -A tasks worker --loglevel=info"
scheduler = "python scheduler.py"
```

## Environment Variables

### Types of Environment Variables

#### 1. Global Secrets (Encrypted)

For sensitive data like API keys:

- Stored encrypted in UV Dash
- Available to **all applications**
- Set in **Settings → Global Secrets**

**Examples**:
```bash
OPENAI_API_KEY=sk-...
DATABASE_PASSWORD=secret123
AWS_SECRET_ACCESS_KEY=...
```

#### 2. App-Specific Variables

For non-sensitive configuration:

- Stored per-application
- Set in **Edit App → Environment Variables**

**Examples**:
```bash
DEBUG=true
LOG_LEVEL=info
MAX_WORKERS=4
```

#### 3. Project .env Files

UV Dash respects `.env` files in your project:

```bash
# .env
DATABASE_URL=sqlite:///./db.sqlite3
REDIS_URL=redis://localhost:6379
```

**Loading .env**: Use a library like `python-dotenv`:

```toml
[project]
dependencies = ["python-dotenv"]
```

```python
from dotenv import load_dotenv
load_dotenv()
```

### Accessing Environment Variables

In your Python code:

```python
import os

# Get environment variable
api_key = os.getenv("OPENAI_API_KEY")
debug = os.getenv("DEBUG", "false")  # with default

# Or use os.environ
database_url = os.environ["DATABASE_URL"]  # raises KeyError if not set
```

### Priority Order

When the same variable is defined in multiple places:

1. **App-Specific Environment Variables** (highest priority)
2. **Global Secrets**
3. **Project .env file**
4. **System environment variables** (lowest priority)

## Port Configuration

### Auto-Detection

UV Dash automatically detects ports from application logs by looking for patterns like:

```
Running on http://0.0.0.0:8000
Uvicorn running on http://127.0.0.1:8501
Starting development server at http://0.0.0.0:5000
```

Supported patterns:
- `http://` or `https://` followed by host and port
- Port numbers between 1 and 65535
- IPv4 addresses, hostnames, or `0.0.0.0`

### Specifying Ports

#### Fixed Port

Specify a fixed port in your run command:

```toml
[project.scripts]
start = "uvicorn app.main:app --port 8000"
```

#### Dynamic Port (Port 0)

Some frameworks support port 0 for auto-assignment:

```python
# Gradio
demo.launch(server_port=0)  # OS assigns available port
```

UV Dash will detect the actual assigned port from logs.

### Port Conflicts

If you get "Address already in use" errors:

1. **Stop conflicting apps**: Check if another app in UV Dash is using the port
2. **Change the port**: Edit the run command to use a different port
3. **Kill system process**: Use terminal to find and kill the process:
   ```bash
   # macOS/Linux
   lsof -ti:8000 | xargs kill -9

   # Windows
   netstat -ano | findstr :8000
   taskkill /PID <PID> /F
   ```

## Advanced Configuration

### Custom Python Version

UV Dash uses the Python version specified in your `pyproject.toml`:

```toml
[project]
requires-python = ">=3.11"
```

UV will automatically install and use the appropriate Python version.

### Dependency Groups

Use dependency groups for optional features:

```toml
[project]
dependencies = [
    "fastapi>=0.104.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "black>=23.0.0",
]
ml = [
    "torch>=2.0.0",
    "transformers>=4.30.0",
]
```

**Install with extras**:
```bash
# In your run command or during development
uv sync --extra dev
uv sync --extra ml
```

### Build Systems

UV Dash supports various build systems:

#### Hatchling (Recommended)
```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

#### PDM
```toml
[build-system]
requires = ["pdm-backend"]
build-backend = "pdm.backend"
```

#### Poetry
```toml
[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

### Platform-Specific Dependencies

```toml
[project]
dependencies = [
    "fastapi>=0.104.0",
    "uvicorn>=0.24.0",
]

[project.optional-dependencies]
windows = [
    "pywin32>=305; platform_system=='Windows'",
]
linux = [
    "systemd-python>=234; platform_system=='Linux'",
]
```

### Multiple Entry Points

Define multiple commands for different use cases:

```toml
[project.scripts]
# Development
dev = "uvicorn app.main:app --reload --port 8000"

# Production
start = "gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 4"

# Utilities
migrate = "alembic upgrade head"
seed = "python scripts/seed_db.py"
test = "pytest tests/"
```

Switch between them by changing the run command in UV Dash.

### For More Complex Scenarios

For advanced patterns like:
- Running multiple processes simultaneously
- Pre-migration hooks
- Custom startup scripts
- Process orchestration

See the [Advanced Usage Guide](advanced-usage.md).

---

[← User Guide](user-guide.md) | [Back to README](../README.md) | [Advanced Usage →](advanced-usage.md)
