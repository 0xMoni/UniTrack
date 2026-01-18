"""
UniTrack Web Server

Flask API server for the web dashboard.
"""

import json
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from pathlib import Path

from ..core.config import Config, load_config, get_data_path
from ..core.calculator import AttendanceCalculator


def create_app(config: Config = None) -> Flask:
    """
    Create Flask application.

    Args:
        config: UniTrack configuration (loads default if None)

    Returns:
        Flask app instance
    """
    if config is None:
        config = load_config()

    app = Flask(__name__, static_folder='static')
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Store config in app context
    app.config['UNITRACK_CONFIG'] = config

    @app.route('/api/health')
    def health():
        """Health check endpoint."""
        return jsonify({
            'status': 'ok',
            'timestamp': datetime.now().isoformat(),
            'institution': config.institution.name,
        })

    @app.route('/api/attendance')
    def get_attendance():
        """Get attendance data with analysis."""
        refresh = request.args.get('refresh', 'false').lower() == 'true'

        if refresh:
            # Fetch fresh data
            try:
                from ..core.scraper import fetch_attendance
                subjects = fetch_attendance(config)
                if not subjects:
                    return jsonify({
                        'success': False,
                        'error': 'Failed to fetch data'
                    }), 500
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': str(e)
                }), 500
        else:
            # Load cached data
            data_path = get_data_path('attendance.json')
            if not data_path.exists():
                return jsonify({
                    'success': False,
                    'error': 'No data available. Use ?refresh=true to fetch.'
                }), 404

            with open(data_path) as f:
                cached = json.load(f)

            subjects = cached.get('subjects', [])

        # Analyze
        calc = AttendanceCalculator(config.thresholds)
        analysis = calc.analyze_all(subjects)
        priority = calc.get_priority_subjects(analysis)

        # Get semester from first subject
        semester = subjects[0].get('term', '') if subjects else ''

        # Load timestamp
        data_path = get_data_path('attendance.json')
        last_fetched = None
        if data_path.exists():
            with open(data_path) as f:
                cached = json.load(f)
                last_fetched = cached.get('timestamp')

        return jsonify({
            'success': True,
            'institution': config.institution.name,
            'studentName': config.student_name,
            'rollNumber': config.roll_number,
            'branch': config.branch,
            'section': config.section,
            'semester': semester,
            'threshold': config.thresholds.default,
            'lastFetched': last_fetched,
            'summary': analysis['summary'],
            'subjects': analysis['subjects'],
            'priority': priority[:5],
        })

    @app.route('/api/config')
    def get_config():
        """Get public configuration."""
        return jsonify({
            'institution': {
                'name': config.institution.name,
                'shortName': config.institution.short_name,
                'color': config.institution.color,
            },
            'thresholds': {
                'default': config.thresholds.default,
                'safeBuffer': config.thresholds.safe_buffer,
                'custom': config.thresholds.custom,
            },
            'student': {
                'name': config.student_name,
                'rollNumber': config.roll_number,
                'branch': config.branch,
                'section': config.section,
            }
        })

    @app.route('/api/refresh', methods=['POST'])
    def refresh_data():
        """Fetch fresh data from ERP."""
        try:
            from ..core.scraper import fetch_attendance
            subjects = fetch_attendance(config)

            if subjects:
                calc = AttendanceCalculator(config.thresholds)
                analysis = calc.analyze_all(subjects)

                return jsonify({
                    'success': True,
                    'message': f'Fetched {len(subjects)} subjects',
                    'summary': analysis['summary']
                })
            else:
                return jsonify({
                    'success': False,
                    'error': 'No data fetched'
                }), 500

        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    # Serve static files (React build)
    @app.route('/')
    def index():
        """Serve main page."""
        static_folder = Path(__file__).parent / 'static'
        if (static_folder / 'index.html').exists():
            return send_from_directory(static_folder, 'index.html')
        else:
            # Return simple HTML if no React build
            return f'''
            <!DOCTYPE html>
            <html>
            <head>
                <title>UniTrack - {config.institution.name}</title>
                <style>
                    body {{ font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }}
                    h1 {{ color: #3B82F6; }}
                    .card {{ background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }}
                    pre {{ background: #1e1e1e; color: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; }}
                </style>
            </head>
            <body>
                <h1>UniTrack</h1>
                <p>Universal Attendance Tracker for <strong>{config.institution.name}</strong></p>

                <div class="card">
                    <h3>API Endpoints</h3>
                    <ul>
                        <li><code>GET /api/health</code> - Health check</li>
                        <li><code>GET /api/attendance</code> - Get attendance data</li>
                        <li><code>GET /api/config</code> - Get configuration</li>
                        <li><code>POST /api/refresh</code> - Fetch fresh data</li>
                    </ul>
                </div>

                <div class="card">
                    <h3>Quick Start</h3>
                    <pre>curl http://localhost:5000/api/attendance</pre>
                </div>

                <p>Build the React frontend for a full dashboard experience.</p>
            </body>
            </html>
            '''

    return app


def run_server(config: Config = None, host: str = '127.0.0.1', port: int = 5000):
    """Run the web server."""
    app = create_app(config)
    app.run(host=host, port=port, debug=True)
