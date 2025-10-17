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

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 0))  # Use 0 for auto port assignment
    # Don't print port here when port=0, Werkzeug will log the actual bound port
    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)
