"""
ERP Discovery Module

Automatically discovers login selectors and attendance API endpoints
for any university ERP system.
"""

from playwright.sync_api import Page, Response
from typing import Optional, Dict, List, Tuple
import json
import re


class ERPDiscovery:
    """
    Discovers ERP structure automatically.

    Usage:
        discovery = ERPDiscovery(page)
        selectors = discovery.discover_login_selectors()
        api_endpoint = discovery.discover_attendance_api(username, password)
    """

    # Common selector patterns for login forms
    USERNAME_PATTERNS = [
        "input[name*='user']",
        "input[name*='email']",
        "input[name*='login']",
        "input[name*='username']",
        "input[name='j_username']",  # Java/Spring
        "input[id*='user']",
        "input[id*='email']",
        "input[id*='login']",
        "input[type='email']",
        "input[type='text'][autocomplete*='user']",
        "#username", "#email", "#login", "#userId",
    ]

    PASSWORD_PATTERNS = [
        "input[type='password']",
        "input[name*='pass']",
        "input[name*='pwd']",
        "input[name='j_password']",  # Java/Spring
        "input[id*='pass']",
        "input[id*='pwd']",
        "#password", "#pass", "#pwd",
    ]

    LOGIN_BUTTON_PATTERNS = [
        "button[type='submit']",
        "input[type='submit']",
        "button[name*='login']",
        "button[id*='login']",
        "button[class*='login']",
        "input[value*='Login']",
        "input[value*='Sign']",
        "button:has-text('Login')",
        "button:has-text('Sign In')",
        "button:has-text('Submit')",
        "#loginBtn", "#submitBtn", ".login-btn",
    ]

    # Common attendance API patterns
    ATTENDANCE_API_PATTERNS = [
        r'attendance.*\.json',
        r'getAttendance',
        r'student.*attendance',
        r'subject.*attendance',
        r'stu_get.*\.json',
        r'api.*attendance',
        r'marks.*attendance',
    ]

    def __init__(self, page: Page):
        """Initialize discovery with a Playwright page."""
        self.page = page
        self._discovered_apis: List[Dict] = []

    def discover_login_selectors(self, url: str) -> Dict[str, str]:
        """
        Discover login form selectors on the given URL.

        Args:
            url: Login page URL

        Returns:
            Dictionary with discovered selectors:
            {
                "username_input": "...",
                "password_input": "...",
                "login_button": "...",
            }
        """
        print(f"Discovering login selectors on {url}...")
        self.page.goto(url)
        self.page.wait_for_load_state("networkidle")

        selectors = {
            "username_input": "",
            "password_input": "",
            "login_button": "",
        }

        # Find username field
        for pattern in self.USERNAME_PATTERNS:
            try:
                if self.page.locator(pattern).count() > 0:
                    # Verify it's visible and enabled
                    elem = self.page.locator(pattern).first
                    if elem.is_visible():
                        selectors["username_input"] = pattern
                        print(f"  Found username: {pattern}")
                        break
            except:
                continue

        # Find password field
        for pattern in self.PASSWORD_PATTERNS:
            try:
                if self.page.locator(pattern).count() > 0:
                    elem = self.page.locator(pattern).first
                    if elem.is_visible():
                        selectors["password_input"] = pattern
                        print(f"  Found password: {pattern}")
                        break
            except:
                continue

        # Find login button
        for pattern in self.LOGIN_BUTTON_PATTERNS:
            try:
                if self.page.locator(pattern).count() > 0:
                    elem = self.page.locator(pattern).first
                    if elem.is_visible():
                        selectors["login_button"] = pattern
                        print(f"  Found login button: {pattern}")
                        break
            except:
                continue

        return selectors

    def discover_attendance_api(
        self,
        username: str,
        password: str,
        selectors: Dict[str, str]
    ) -> Tuple[Optional[str], List[Dict]]:
        """
        Login and discover attendance API endpoint.

        Args:
            username: ERP username
            password: ERP password
            selectors: Login form selectors

        Returns:
            Tuple of (api_endpoint, captured_data)
        """
        print("Discovering attendance API...")

        # Set up response listener
        captured_responses: List[Dict] = []

        def capture_response(response: Response):
            """Capture potential attendance API responses."""
            url = response.url.lower()

            # Check if URL matches attendance patterns
            for pattern in self.ATTENDANCE_API_PATTERNS:
                if re.search(pattern, url, re.IGNORECASE):
                    try:
                        if response.status == 200:
                            content_type = response.headers.get('content-type', '')
                            if 'json' in content_type or url.endswith('.json'):
                                body = response.text()
                                data = json.loads(body)

                                # Check if it looks like attendance data
                                if self._looks_like_attendance(data):
                                    captured_responses.append({
                                        "url": response.url,
                                        "data": data,
                                    })
                                    print(f"  Captured potential attendance API: {response.url}")
                    except:
                        pass

        self.page.on("response", capture_response)

        try:
            # Login
            print("  Logging in...")
            self.page.fill(selectors["username_input"], username)
            self.page.fill(selectors["password_input"], password)
            self.page.click(selectors["login_button"])
            self.page.wait_for_load_state("networkidle")
            self.page.wait_for_timeout(3000)

            # Check if login successful
            if "login" in self.page.url.lower():
                print("  Login may have failed - still on login page")
                return None, []

            print("  Login successful, exploring dashboard...")

            # Try clicking on common attendance-related elements
            attendance_triggers = [
                "#stud2",  # CMRIT specific
                "text=Attendance",
                "text=attendance",
                "[href*='attendance']",
                "[onclick*='attendance']",
                ".attendance",
                "#attendance",
                "text=Course",
                "text=Subjects",
            ]

            for trigger in attendance_triggers:
                try:
                    elem = self.page.locator(trigger)
                    if elem.count() > 0 and elem.first.is_visible():
                        print(f"  Clicking: {trigger}")
                        elem.first.click()
                        self.page.wait_for_timeout(3000)

                        if captured_responses:
                            break
                except:
                    continue

            # Return the best match
            if captured_responses:
                best_match = max(captured_responses, key=lambda x: len(x['data']))
                return best_match['url'], best_match['data']

            return None, []

        finally:
            self.page.remove_listener("response", capture_response)

    def _looks_like_attendance(self, data) -> bool:
        """Check if data looks like attendance information."""
        if isinstance(data, list) and len(data) > 0:
            first_item = data[0]
            if isinstance(first_item, dict):
                # Check for attendance-related keys
                attendance_keys = [
                    'present', 'absent', 'attendance', 'attended',
                    'presentCount', 'absentCount', 'totalClasses',
                    'subject', 'subjectCode', 'course', 'faculty',
                    'percentage', 'percent',
                ]
                item_keys = [k.lower() for k in first_item.keys()]

                matches = sum(1 for key in attendance_keys
                             if any(key.lower() in k for k in item_keys))

                return matches >= 2

        return False

    def discover_field_mappings(self, sample_data: List[Dict]) -> Dict[str, str]:
        """
        Discover field mappings from sample attendance data.

        Args:
            sample_data: Sample attendance data from API

        Returns:
            Dictionary mapping our fields to API fields
        """
        if not sample_data:
            return {}

        sample = sample_data[0]
        mappings = {}

        # Field patterns to look for
        field_patterns = {
            'subject': ['subject', 'subjectname', 'coursename', 'course'],
            'subject_code': ['subjectcode', 'coursecode', 'code', 'subcode'],
            'present': ['present', 'presentcount', 'attended', 'attendedclasses'],
            'absent': ['absent', 'absentcount', 'missed', 'missedclasses'],
            'total': ['total', 'totalclasses', 'conducted', 'session', 'classes'],
            'percentage': ['percentage', 'percent', 'attendanceper', 'attendancepercent'],
            'faculty': ['faculty', 'facultname', 'teacher', 'instructor', 'facultyname'],
            'term': ['term', 'termname', 'semester', 'sem'],
        }

        sample_keys = {k.lower(): k for k in sample.keys()}

        for our_field, patterns in field_patterns.items():
            for pattern in patterns:
                for key_lower, key_original in sample_keys.items():
                    if pattern in key_lower:
                        mappings[our_field] = key_original
                        break
                if our_field in mappings:
                    break

        return mappings

    def discover_student_info(self) -> Dict[str, str]:
        """
        Try to discover student info from the dashboard.

        Returns:
            Dictionary with student info (name, roll, branch, etc.)
        """
        info = {}

        # Common selectors for student info
        info_selectors = {
            'name': ['#studentName', '.student-name', '.user-name', '#userName'],
            'roll': ['#rollNo', '.roll-number', '#enrollmentNo', '.enrollment'],
            'branch': ['#branch', '.branch', '#department', '.dept'],
            'section': ['#section', '.section', '#class', '.class'],
        }

        for field, selectors in info_selectors.items():
            for selector in selectors:
                try:
                    elem = self.page.locator(selector)
                    if elem.count() > 0:
                        text = elem.first.text_content().strip()
                        if text and len(text) > 1:
                            info[field] = text
                            break
                except:
                    continue

        return info
