"""
Universal Scraper Module

Scrapes attendance data from any configured ERP system.
"""

from playwright.sync_api import sync_playwright, Page, Response, Browser
from typing import Optional, List, Dict
import json

from .config import Config, get_data_path


class UniversalScraper:
    """
    Universal attendance scraper that works with any configured ERP.

    Usage:
        config = load_config()
        scraper = UniversalScraper(config)
        data = scraper.fetch_attendance()
    """

    def __init__(self, config: Config):
        """Initialize scraper with configuration."""
        self.config = config
        self._browser: Optional[Browser] = None
        self._page: Optional[Page] = None
        self._playwright = None
        self._is_logged_in = False
        self._captured_data: List[Dict] = []

    def __enter__(self):
        """Context manager entry."""
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(
            headless=self.config.headless
        )
        self._page = self._browser.new_page()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()

    @property
    def page(self) -> Page:
        """Get the current page."""
        if self._page is None:
            raise RuntimeError("Scraper not initialized. Use 'with' statement.")
        return self._page

    def login(self) -> bool:
        """
        Log into the ERP system.

        Returns:
            True if login successful, False otherwise
        """
        config = self.config
        selectors = config.erp.selectors

        if not config.credentials.username or not config.credentials.password:
            print("Error: Credentials not configured!")
            return False

        print(f"Logging in to {config.institution.name}...")

        try:
            # Navigate to login page
            login_url = config.erp.login_url or config.erp.base_url
            self.page.goto(login_url)
            self.page.wait_for_load_state("networkidle")

            # Fill credentials
            self.page.fill(selectors.username_input, config.credentials.username)
            self.page.fill(selectors.password_input, config.credentials.password)

            # Click login
            self.page.click(selectors.login_button)
            self.page.wait_for_load_state("networkidle")
            self.page.wait_for_timeout(2000)

            # Check if still on login page
            if "login" in self.page.url.lower():
                print("Login failed - still on login page")
                return False

            print("Login successful!")
            self._is_logged_in = True
            return True

        except Exception as e:
            print(f"Login error: {e}")
            return False

    def fetch_attendance(self) -> List[Dict]:
        """
        Fetch attendance data from the ERP.

        Returns:
            List of attendance records
        """
        if not self._is_logged_in:
            if not self.login():
                return []

        print("Fetching attendance data...")

        config = self.config
        captured_data = []

        def capture_response(response: Response):
            """Capture attendance API response."""
            # Check if this is the attendance API
            if config.erp.attendance_api:
                if config.erp.attendance_api in response.url:
                    try:
                        if response.status == 200:
                            body = response.text()
                            data = json.loads(body)
                            if isinstance(data, list):
                                captured_data.extend(data)
                            print(f"  Captured {len(data)} records from API")
                    except Exception as e:
                        print(f"  Error capturing response: {e}")
            else:
                # Try to capture any JSON that looks like attendance
                try:
                    if response.status == 200 and '.json' in response.url.lower():
                        body = response.text()
                        data = json.loads(body)
                        if self._looks_like_attendance(data):
                            if isinstance(data, list):
                                captured_data.extend(data)
                            print(f"  Captured {len(data)} records")
                except:
                    pass

        self.page.on("response", capture_response)

        try:
            # Click attendance trigger if configured
            if config.erp.selectors.attendance_trigger:
                trigger = self.page.locator(config.erp.selectors.attendance_trigger)
                if trigger.count() > 0:
                    trigger.first.click()
                    self.page.wait_for_timeout(5000)
            else:
                # Try common triggers
                triggers = ["#stud2", "text=Attendance", "[href*='attendance']"]
                for t in triggers:
                    try:
                        elem = self.page.locator(t)
                        if elem.count() > 0 and elem.first.is_visible():
                            elem.first.click()
                            self.page.wait_for_timeout(3000)
                            if captured_data:
                                break
                    except:
                        continue

        finally:
            self.page.remove_listener("response", capture_response)

        # Process captured data
        if captured_data:
            processed = self._process_attendance(captured_data)
            self._save_attendance(processed)
            return processed

        print("No attendance data captured")
        return []

    def _looks_like_attendance(self, data) -> bool:
        """Check if data looks like attendance."""
        if isinstance(data, list) and len(data) > 0:
            first = data[0]
            if isinstance(first, dict):
                keys = [k.lower() for k in first.keys()]
                attendance_keywords = ['present', 'absent', 'subject', 'attendance', 'faculty']
                return sum(1 for k in attendance_keywords if any(k in key for key in keys)) >= 2
        return False

    def _process_attendance(self, raw_data: List[Dict]) -> List[Dict]:
        """
        Process raw API data using configured field mappings.

        Args:
            raw_data: Raw data from API

        Returns:
            Processed attendance records
        """
        mappings = self.config.erp.field_mappings
        processed = []

        for item in raw_data:
            try:
                # Get values using mappings
                present = int(item.get(mappings.get('present', 'presentCount'), 0))
                absent = int(item.get(mappings.get('absent', 'absentCount'), 0))

                # Calculate total (present + absent is more accurate than 'total' field)
                total = present + absent

                # Calculate percentage
                percentage = (present / total * 100) if total > 0 else 0

                processed.append({
                    'subject': item.get(mappings.get('subject', 'subject'), 'Unknown'),
                    'subject_code': item.get(mappings.get('subject_code', 'subjectCode'), ''),
                    'present': present,
                    'absent': absent,
                    'total': total,
                    'percentage': round(percentage, 2),
                    'faculty': item.get(mappings.get('faculty', 'facultName'), '').strip(),
                    'term': item.get(mappings.get('term', 'termName'), ''),
                })
            except Exception as e:
                print(f"  Warning: Error processing record: {e}")
                continue

        return processed

    def _save_attendance(self, data: List[Dict]):
        """Save attendance data to file."""
        from datetime import datetime

        save_data = {
            'timestamp': datetime.now().isoformat(),
            'institution': self.config.institution.name,
            'subjects': data,
        }

        filepath = get_data_path('attendance.json')
        with open(filepath, 'w') as f:
            json.dump(save_data, f, indent=2)

        print(f"  Saved to {filepath}")


def fetch_attendance(config: Config) -> List[Dict]:
    """
    Convenience function to fetch attendance.

    Args:
        config: UniTrack configuration

    Returns:
        List of attendance records
    """
    with UniversalScraper(config) as scraper:
        return scraper.fetch_attendance()
