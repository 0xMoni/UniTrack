"""
UniTrack Cloud Backend

Simple API that accepts ERP credentials and returns attendance data.
No credentials stored - everything passed per request.
"""

import json
import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from playwright.sync_api import sync_playwright

app = Flask(__name__)
CORS(app)


def fetch_attendance_from_erp(erp_url, username, password):
    """
    Fetch attendance data from ERP using Playwright.

    Args:
        erp_url: Base URL of the ERP (e.g., https://erp.cmrit.ac.in)
        username: ERP username
        password: ERP password

    Returns:
        dict with success status and data/error
    """
    captured_data = []

    def capture_response(response):
        """Capture JSON responses that look like attendance data."""
        try:
            if response.status == 200:
                url = response.url.lower()
                # Look for attendance-related JSON endpoints
                if '.json' in url or 'attendance' in url or 'subject' in url:
                    try:
                        body = response.text()
                        data = json.loads(body)
                        if isinstance(data, list) and len(data) > 0:
                            # Check if it looks like attendance data
                            first = data[0]
                            if isinstance(first, dict):
                                keys = str(first.keys()).lower()
                                if 'present' in keys or 'absent' in keys or 'subject' in keys:
                                    captured_data.extend(data)
                                    print(f"Captured {len(data)} records from {response.url}")
                    except:
                        pass
        except:
            pass

    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Listen for responses
        page.on("response", capture_response)

        try:
            # Go to login page
            login_url = f"{erp_url}/login.htm"
            print(f"Going to {login_url}")
            page.goto(login_url, wait_until="networkidle")

            # Fill login form - try common selectors
            username_selectors = [
                'input[name="j_username"]',
                'input[name="username"]',
                '#username',
                'input[type="text"]'
            ]
            password_selectors = [
                'input[name="j_password"]',
                'input[name="password"]',
                '#password',
                'input[type="password"]'
            ]

            # Find and fill username
            for selector in username_selectors:
                try:
                    if page.locator(selector).count() > 0:
                        page.fill(selector, username)
                        print(f"Filled username with {selector}")
                        break
                except:
                    continue

            # Find and fill password
            for selector in password_selectors:
                try:
                    if page.locator(selector).count() > 0:
                        page.fill(selector, password)
                        print(f"Filled password with {selector}")
                        break
                except:
                    continue

            # Submit form
            submit_selectors = [
                'input[type="submit"]',
                'button[type="submit"]',
                '#loginbtn',
                'button:has-text("Login")',
                'input[value="Login"]'
            ]

            for selector in submit_selectors:
                try:
                    if page.locator(selector).count() > 0:
                        page.click(selector)
                        print(f"Clicked submit with {selector}")
                        break
                except:
                    continue

            # Wait for navigation
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(3000)

            # Check if login failed
            if "login" in page.url.lower() and "error" in page.url.lower():
                browser.close()
                return {"success": False, "error": "Invalid credentials"}

            if "authfailed" in page.url.lower():
                browser.close()
                return {"success": False, "error": "Authentication failed"}

            print(f"After login, URL: {page.url}")

            # Try to trigger attendance data
            # Click on attendance menu items
            attendance_triggers = [
                '#stud2',  # CMRIT specific
                'text=Attendance',
                'a:has-text("Attendance")',
                '[href*="attendance"]',
                'text=Subject Attendance',
            ]

            for trigger in attendance_triggers:
                try:
                    elem = page.locator(trigger)
                    if elem.count() > 0 and elem.first.is_visible():
                        elem.first.click()
                        page.wait_for_timeout(3000)
                        print(f"Clicked {trigger}")
                        if captured_data:
                            break
                except Exception as e:
                    print(f"Trigger {trigger} failed: {e}")
                    continue

            # If still no data, try direct API call
            if not captured_data:
                try:
                    api_url = f"{erp_url}/stu_getSubjectOnChangeWithSemId1.json"
                    page.goto(api_url)
                    page.wait_for_timeout(2000)
                except:
                    pass

            browser.close()

            if captured_data:
                # Process data
                processed = process_attendance(captured_data)
                return {
                    "success": True,
                    "subjects": processed,
                    "count": len(processed)
                }
            else:
                return {"success": False, "error": "No attendance data found. Make sure you're enrolled and have attendance records."}

        except Exception as e:
            browser.close()
            return {"success": False, "error": str(e)}


def process_attendance(raw_data):
    """Process raw attendance data into standard format."""
    processed = []

    for item in raw_data:
        try:
            # Try different field names
            present = int(item.get('presentCount', item.get('present', 0)))
            absent = int(item.get('absentCount', item.get('absent', 0)))
            total = present + absent
            percentage = (present / total * 100) if total > 0 else 0

            processed.append({
                'subject': item.get('subject', item.get('subjectName', 'Unknown')),
                'subject_code': item.get('subjectCode', item.get('code', '')),
                'present': present,
                'absent': absent,
                'total': total,
                'percentage': round(percentage, 2),
                'faculty': item.get('facultName', item.get('facultyName', '')).strip() if item.get('facultName') or item.get('facultyName') else '',
            })
        except Exception as e:
            print(f"Error processing record: {e}")
            continue

    return processed


@app.route('/')
def home():
    """Home page."""
    return jsonify({
        "name": "UniTrack API",
        "version": "1.0.0",
        "endpoints": {
            "POST /api/fetch": "Fetch attendance data",
            "GET /api/health": "Health check"
        }
    })


@app.route('/api/health')
def health():
    """Health check."""
    return jsonify({"status": "ok"})


@app.route('/api/fetch', methods=['POST'])
def fetch_attendance():
    """
    Fetch attendance from ERP.

    Request body:
    {
        "erp_url": "https://erp.university.edu",
        "username": "student@email.com",
        "password": "password123"
    }
    """
    data = request.get_json()

    if not data:
        return jsonify({"success": False, "error": "No data provided"}), 400

    erp_url = data.get('erp_url', '').strip()
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not erp_url or not username or not password:
        return jsonify({"success": False, "error": "Missing required fields: erp_url, username, password"}), 400

    # Remove trailing slash from URL
    erp_url = erp_url.rstrip('/')

    # Add https if missing
    if not erp_url.startswith('http'):
        erp_url = 'https://' + erp_url

    print(f"Fetching attendance for {username} from {erp_url}")

    result = fetch_attendance_from_erp(erp_url, username, password)

    if result.get('success'):
        return jsonify(result)
    else:
        return jsonify(result), 401 if 'credential' in result.get('error', '').lower() else 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
