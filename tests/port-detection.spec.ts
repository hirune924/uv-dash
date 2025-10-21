import { test, expect } from '@playwright/test';

// Test port detection regex patterns
test.describe('Port Detection Logic', () => {
  function detectPortFromLog(message: string): number | null {
    // Exclude error messages and connection messages (prevent false positives)
    const errorPatterns = [
      /error/i,
      /failed/i,
      /refused/i,
      /timeout/i,
      /cannot/i,
      /unable/i,
      /already in use/i,
      /bind/i,
      /connecting to/i,
      /connect to/i,
      /connection to/i,
    ];

    // Exclude error-related messages
    for (const pattern of errorPatterns) {
      if (pattern.test(message)) {
        return null;
      }
    }

    // Framework-specific patterns (high priority)
    const frameworkPatterns = [
      // Flask: " * Running on http://127.0.0.1:5000"
      { pattern: /\*\s+Running on.*?:(\d+)/i, framework: 'Flask' },
      // Streamlit: "Local URL: http://localhost:8501"
      { pattern: /Local URL:\s*https?:\/\/[^:]+:(\d+)/i, framework: 'Streamlit' },
      // FastAPI/Uvicorn: "Uvicorn running on http://127.0.0.1:8000"
      { pattern: /Uvicorn running on.*?:(\d+)/i, framework: 'FastAPI/Uvicorn' },
      // Django: "Starting development server at http://127.0.0.1:8000/"
      { pattern: /Starting development server at.*?:(\d+)/i, framework: 'Django' },
    ];

    for (const { pattern } of frameworkPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const port = parseInt(match[1], 10);
        if (port > 0 && port < 65536) {
          return port;
        }
      }
    }

    // General server startup messages (containing positive keywords like listening/running/started/starting)
    const positivePatterns = [
      /(?:listening|running|started|starting|serving|available).*?(?:on|at).*?:(\d+)/i,
      /(?:listening|running|started|starting|serving|available).*?(?:port|PORT)[\s:]+(\d+)/i,
      /server.*?(?:listening|running|started|starting).*?:(\d+)/i,
    ];

    for (const pattern of positivePatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const port = parseInt(match[1], 10);
        if (port > 0 && port < 65536) {
          return port;
        }
      }
    }

    // Detect URL format (http://host:port)
    const urlPatterns = [
      /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\*):(\d+)/i,
    ];

    for (const pattern of urlPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const port = parseInt(match[1], 10);
        if (port > 0 && port < 65536) {
          return port;
        }
      }
    }

    return null;
  }

  test('should detect port from "port: 8000"', () => {
    expect(detectPortFromLog('Server running on port: 8000')).toBe(8000);
  });

  test('should detect port from "PORT 8000"', () => {
    expect(detectPortFromLog('Starting server on PORT 8000')).toBe(8000);
  });

  test('should detect port from "localhost:8000"', () => {
    expect(detectPortFromLog('Visit http://localhost:8000')).toBe(8000);
  });

  test('should detect port from "127.0.0.1:8000"', () => {
    expect(detectPortFromLog('Server at http://127.0.0.1:8000')).toBe(8000);
  });

  test('should detect port from "0.0.0.0:8000"', () => {
    expect(detectPortFromLog('Listening on http://0.0.0.0:8000')).toBe(8000);
  });

  test('should detect port from "*:8000"', () => {
    expect(detectPortFromLog('Server listening on *:8000')).toBe(8000);
  });

  test('should detect port from Flask output', () => {
    const flaskLog = ' * Running on http://127.0.0.1:5000';
    expect(detectPortFromLog(flaskLog)).toBe(5000);
  });

  test('should detect port from Streamlit output', () => {
    const streamlitLog = '  You can now view your Streamlit app in your browser.\n\n  Local URL: http://localhost:8501';
    expect(detectPortFromLog(streamlitLog)).toBe(8501);
  });

  test('should detect port from FastAPI/Uvicorn output', () => {
    const uvicornLog = 'INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)';
    expect(detectPortFromLog(uvicornLog)).toBe(8000);
  });

  test('should detect port from Django output', () => {
    const djangoLog = 'Starting development server at http://127.0.0.1:8000/';
    expect(detectPortFromLog(djangoLog)).toBe(8000);
  });

  test('should return null for invalid port (0)', () => {
    expect(detectPortFromLog('port: 0')).toBeNull();
  });

  test('should return null for invalid port (>65535)', () => {
    expect(detectPortFromLog('port: 99999')).toBeNull();
  });

  test('should return null for no port', () => {
    expect(detectPortFromLog('Server started successfully')).toBeNull();
  });

  // Test false positives (should NOT detect these)
  test('should NOT detect port from error message', () => {
    expect(detectPortFromLog('Error: Failed to bind to port 8000')).toBeNull();
  });

  test('should NOT detect port from connection error', () => {
    expect(detectPortFromLog('Connection refused on port 5432')).toBeNull();
  });

  test('should NOT detect port from database connection', () => {
    expect(detectPortFromLog('Connecting to database on localhost:5432')).toBeNull();
  });

  test('should NOT detect port from timeout error', () => {
    expect(detectPortFromLog('Timeout connecting to port 8000')).toBeNull();
  });

  test('should NOT detect port from already in use error', () => {
    expect(detectPortFromLog('Address already in use: port 8000')).toBeNull();
  });

  // Test multiple ports (should detect the server port, not DB or other services)
  test('should detect server port from message with multiple ports', () => {
    const log = 'Connected to DB on port 5432. Server listening on http://0.0.0.0:8000';
    expect(detectPortFromLog(log)).toBe(8000);
  });
});
