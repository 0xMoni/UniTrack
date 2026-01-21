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
    student_info = {}

    def capture_response(response):
        """Capture JSON responses that look like attendance data."""
        nonlocal student_info
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

            # Try to extract student info from the page
            try:
                # Use JavaScript to search the entire page for student info
                info = page.evaluate('''() => {
                    let result = { name: null, usn: null };

                    // Words to exclude (menu items, common UI text)
                    let excludeWords = [
                        'schedule', 'academic', 'function', 'facility', 'facilities',
                        'communication', 'welcome', 'logout', 'login', 'home', 'dashboard',
                        'menu', 'student', 'attendance', 'report', 'profile', 'setting',
                        'notification', 'message', 'calendar', 'exam', 'result', 'fee',
                        'library', 'hostel', 'transport', 'placement', 'admin', 'help',
                        'contact', 'about', 'feedback', 'support', 'service'
                    ];

                    function isValidName(text) {
                        if (!text || text.length < 3 || text.length > 50) return false;
                        let lower = text.toLowerCase();
                        // Check if it contains any exclude words
                        for (let word of excludeWords) {
                            if (lower.includes(word)) return false;
                        }
                        // Name should only contain letters and spaces
                        if (!/^[A-Za-z\\s]+$/.test(text)) return false;
                        // Should have at least 2 parts or be a single reasonable name
                        let parts = text.trim().split(/\\s+/);
                        if (parts.length === 1 && parts[0].length < 4) return false;
                        return true;
                    }

                    // Get all text content
                    let bodyText = document.body.innerText || document.body.textContent;

                    // Look for USN pattern (e.g., 1CR21CS001, 4CB22AI001)
                    let usnMatch = bodyText.match(/[0-9][A-Z]{2}[0-9]{2}[A-Z]{2,3}[0-9]{3}/i);
                    if (usnMatch) {
                        result.usn = usnMatch[0].toUpperCase();
                    }

                    // Look for "Welcome, Name" or "Hi, Name" pattern first
                    let welcomeMatch = bodyText.match(/(?:welcome|hi|hello)[,:\\s]+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)/i);
                    if (welcomeMatch && isValidName(welcomeMatch[1])) {
                        result.name = welcomeMatch[1];
                    }

                    // Look for name near USN if found
                    if (!result.name && result.usn) {
                        let usnIndex = bodyText.indexOf(result.usn);
                        if (usnIndex > 0) {
                            // Check text around USN (before and after)
                            let before = bodyText.substring(Math.max(0, usnIndex - 80), usnIndex);
                            let after = bodyText.substring(usnIndex + result.usn.length, usnIndex + 80);

                            // Look for name pattern - multiple capitalized words
                            let patterns = [before, after];
                            for (let text of patterns) {
                                let nameMatch = text.match(/([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)/);
                                if (nameMatch && isValidName(nameMatch[1])) {
                                    result.name = nameMatch[1];
                                    break;
                                }
                            }
                        }
                    }

                    return result;
                }''')

                if info.get('name'):
                    student_info['name'] = info['name']
                if info.get('usn'):
                    student_info['usn'] = info['usn']

                print(f"Student info from page: {student_info}")
            except Exception as e:
                print(f"Error getting student info: {e}")

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

                # Try to get student info from the data if not found on page
                if not student_info.get('name') and not student_info.get('usn'):
                    data_student = extract_student_from_data(captured_data)
                    if data_student:
                        student_info.update({k: v for k, v in data_student.items() if v})

                return {
                    "success": True,
                    "subjects": processed,
                    "count": len(processed),
                    "student": student_info if student_info else None
                }
            else:
                return {"success": False, "error": "No attendance data found. Make sure you're enrolled and have attendance records."}

        except Exception as e:
            browser.close()
            return {"success": False, "error": str(e)}


def extract_student_from_data(raw_data):
    """Try to extract student info from attendance records."""
    for item in raw_data:
        if isinstance(item, dict):
            # Check for student name fields
            name = item.get('studentName') or item.get('studName') or item.get('name') or item.get('student')
            usn = item.get('usn') or item.get('studentUsn') or item.get('studUsn') or item.get('regNo') or item.get('rollNo')

            if name or usn:
                return {'name': name, 'usn': usn}
    return None


def process_attendance(raw_data):
    """Process raw attendance data into standard format."""
    processed = []
    seen_subjects = set()  # Track duplicates

    for item in raw_data:
        try:
            # Try different field names
            subject_name = item.get('subject', item.get('subjectName', ''))
            subject_code = item.get('subjectCode', item.get('code', ''))

            # Skip if no valid subject name or code
            if not subject_name or subject_name.lower() in ['unknown', 'null', 'none', '']:
                if not subject_code:
                    continue
                subject_name = subject_code  # Use code as name if no name

            # Skip duplicates
            key = f"{subject_name}_{subject_code}"
            if key in seen_subjects:
                continue
            seen_subjects.add(key)

            present = int(item.get('presentCount', item.get('present', 0)))
            absent = int(item.get('absentCount', item.get('absent', 0)))
            total = present + absent
            percentage = (present / total * 100) if total > 0 else 0

            processed.append({
                'subject': subject_name,
                'subject_code': subject_code,
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
