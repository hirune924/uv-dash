import os
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/')
def home():
    # Read environment variables to test they're being passed correctly
    test_env = os.environ.get('TEST_ENV', 'not_set')
    api_key = os.environ.get('API_KEY', 'not_set')

    return jsonify({
        'message': 'Flask Test App is running!',
        'port': os.environ.get('PORT', '5000'),
        'TEST_ENV': test_env,
        'API_KEY': api_key if api_key == 'not_set' else '***hidden***'
    })

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

@app.route('/verify-secret')
def verify_secret():
    """
    Test endpoint that returns the actual API_KEY value for verification.
    This is ONLY for testing - never expose secrets in production!
    """
    api_key = os.environ.get('API_KEY', 'not_set')
    return jsonify({
        'api_key_received': api_key,
        'api_key_length': len(api_key) if api_key != 'not_set' else 0
    })

if __name__ == '__main__':
    import sys
    import socket

    port = int(os.environ.get('PORT', 0))  # Use 0 for auto port assignment

    # If port is 0, get an available port first so we can print it immediately
    if port == 0:
        # Let OS assign a port
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('', 0))
        port = s.getsockname()[1]
        s.close()

    # Print port info immediately (for port detection in tests)
    print(f' * Running on http://127.0.0.1:{port}', flush=True)
    sys.stdout.flush()

    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)
