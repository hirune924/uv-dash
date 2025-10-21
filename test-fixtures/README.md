# Test Fixtures

This directory contains sample applications used for E2E testing of UV Dash.

## Applications

### 1. flask-test-app
A simple Flask application that:
- Displays environment variables (TEST_ENV, API_KEY)
- Runs on port 5000 by default
- Provides `/health` endpoint
- Tests that environment variables are passed correctly

**Run command:** `python app.py`

### 2. streamlit-test-app
A simple Streamlit application that:
- Displays environment variables in the UI
- Shows interactive elements
- Tests Streamlit port detection (default: 8501)
- Verifies environment variable passing

**Run command:** `streamlit run app.py`

## Usage in Tests

These fixtures are used in `tests/fixtures-workflow.spec.ts` to provide reproducible, version-controlled test applications.

### Benefits
- ✅ No external dependencies
- ✅ Reproducible test environment
- ✅ Version controlled
- ✅ Tests real UV workflow
- ✅ Environment variable validation
- ✅ Port detection testing

## Environment Variables Tested

Both apps test the following environment variables:
- `TEST_ENV`: A test environment variable
- `API_KEY`: A secret/API key (displayed as hidden)

These are set during the E2E tests to verify that UV Dash correctly passes environment variables to spawned processes.
