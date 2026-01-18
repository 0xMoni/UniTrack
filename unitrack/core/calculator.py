"""
Attendance Calculator Module

Calculates attendance status, classes needed, and classes that can be missed.
"""

import math
from typing import Dict, List
from dataclasses import dataclass

from .config import Config, Thresholds


class Status:
    """Attendance status constants."""
    SAFE = "SAFE"          # Well above threshold
    CRITICAL = "CRITICAL"  # Near threshold
    LOW = "LOW"            # Below threshold


@dataclass
class SubjectAnalysis:
    """Analysis result for a single subject."""
    subject: str
    subject_code: str
    present: int
    total: int
    percentage: float
    status: str
    threshold: float
    classes_needed: int
    classes_can_miss: int
    message: str
    faculty: str = ""
    term: str = ""

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            'subject': self.subject,
            'subject_code': self.subject_code,
            'present': self.present,
            'total': self.total,
            'percentage': self.percentage,
            'status': self.status,
            'threshold': self.threshold,
            'classes_needed': self.classes_needed,
            'classes_can_miss': self.classes_can_miss,
            'message': self.message,
            'faculty': self.faculty,
            'term': self.term,
        }


class AttendanceCalculator:
    """
    Calculator for attendance analysis.

    Usage:
        calc = AttendanceCalculator(config.thresholds)
        analysis = calc.analyze_all(subjects)
    """

    def __init__(self, thresholds: Thresholds = None):
        """Initialize calculator with thresholds."""
        self.thresholds = thresholds or Thresholds()

    def get_threshold(self, subject_code: str = None, subject_name: str = None) -> float:
        """Get threshold for a subject."""
        return self.thresholds.get_threshold(subject_code, subject_name)

    def calculate_status(self, percentage: float, threshold: float) -> str:
        """
        Determine attendance status.

        Args:
            percentage: Current attendance percentage (0-100)
            threshold: Minimum required percentage (0-100)

        Returns:
            Status string: SAFE, CRITICAL, or LOW
        """
        safe_threshold = threshold + self.thresholds.safe_buffer

        if percentage >= safe_threshold:
            return Status.SAFE
        elif percentage >= threshold:
            return Status.CRITICAL
        else:
            return Status.LOW

    def calculate_classes_needed(self, attended: int, conducted: int, threshold: float) -> int:
        """
        Calculate classes needed to reach threshold.

        Formula: x = ceil((threshold × conducted - attended) / (1 - threshold/100))

        Args:
            attended: Classes attended
            conducted: Total classes conducted
            threshold: Required percentage (0-100)

        Returns:
            Number of consecutive classes needed (0 if already at threshold)
        """
        if conducted == 0:
            return 0

        threshold_decimal = threshold / 100
        current = attended / conducted

        if current >= threshold_decimal:
            return 0

        numerator = threshold_decimal * conducted - attended
        denominator = 1 - threshold_decimal

        if denominator == 0:
            return 0

        return math.ceil(numerator / denominator)

    def calculate_classes_can_miss(self, attended: int, conducted: int, threshold: float) -> int:
        """
        Calculate classes that can be missed while staying at threshold.

        Formula: y = floor((attended - threshold × conducted) / threshold)

        Args:
            attended: Classes attended
            conducted: Total classes conducted
            threshold: Required percentage (0-100)

        Returns:
            Number of classes that can be missed (0 if below threshold)
        """
        if conducted == 0:
            return 0

        threshold_decimal = threshold / 100
        current = attended / conducted

        if current < threshold_decimal:
            return 0

        numerator = attended - threshold_decimal * conducted
        denominator = threshold_decimal

        if denominator == 0:
            return 0

        return math.floor(numerator / denominator)

    def analyze_subject(self, subject_data: Dict) -> SubjectAnalysis:
        """
        Analyze a single subject.

        Args:
            subject_data: Dictionary with subject attendance data

        Returns:
            SubjectAnalysis object
        """
        subject = subject_data.get('subject', 'Unknown')
        subject_code = subject_data.get('subject_code', '')
        present = subject_data.get('present', 0)
        total = subject_data.get('total', 0)
        percentage = subject_data.get('percentage', 0)

        # Get threshold for this subject
        threshold = self.get_threshold(subject_code, subject)

        # Calculate if percentage not provided
        if percentage == 0 and total > 0:
            percentage = (present / total) * 100

        # Analyze
        status = self.calculate_status(percentage, threshold)
        classes_needed = self.calculate_classes_needed(present, total, threshold)
        classes_can_miss = self.calculate_classes_can_miss(present, total, threshold)

        # Generate message
        if status == Status.SAFE:
            message = f"Safe! Can miss {classes_can_miss} more class(es)"
        elif status == Status.CRITICAL:
            message = f"Critical! Can only miss {classes_can_miss} class(es)"
        else:
            message = f"Low! Need to attend {classes_needed} consecutive class(es)"

        return SubjectAnalysis(
            subject=subject,
            subject_code=subject_code,
            present=present,
            total=total,
            percentage=round(percentage, 2),
            status=status,
            threshold=threshold,
            classes_needed=classes_needed,
            classes_can_miss=classes_can_miss,
            message=message,
            faculty=subject_data.get('faculty', ''),
            term=subject_data.get('term', ''),
        )

    def analyze_all(self, subjects: List[Dict]) -> Dict:
        """
        Analyze all subjects and provide summary.

        Args:
            subjects: List of subject attendance data

        Returns:
            Dictionary with analysis results and summary
        """
        analyzed = []
        safe_count = 0
        critical_count = 0
        low_count = 0
        total_present = 0
        total_conducted = 0

        for subject in subjects:
            analysis = self.analyze_subject(subject)
            analyzed.append(analysis.to_dict())

            total_present += analysis.present
            total_conducted += analysis.total

            if analysis.status == Status.SAFE:
                safe_count += 1
            elif analysis.status == Status.CRITICAL:
                critical_count += 1
            else:
                low_count += 1

        # Overall stats
        overall_percentage = (total_present / total_conducted * 100) if total_conducted > 0 else 0
        overall_status = self.calculate_status(overall_percentage, self.thresholds.default)

        return {
            'subjects': analyzed,
            'summary': {
                'total_subjects': len(subjects),
                'safe_count': safe_count,
                'critical_count': critical_count,
                'low_count': low_count,
                'overall_present': total_present,
                'overall_total': total_conducted,
                'overall_percentage': round(overall_percentage, 2),
                'overall_status': overall_status,
            }
        }

    def get_priority_subjects(self, analysis: Dict, top_n: int = 5) -> List[Dict]:
        """
        Get subjects needing most attention.

        Args:
            analysis: Result from analyze_all()
            top_n: Number of subjects to return

        Returns:
            List of priority subjects (lowest attendance first)
        """
        subjects = analysis.get('subjects', [])

        # Sort by status (LOW first) then by percentage
        status_priority = {Status.LOW: 0, Status.CRITICAL: 1, Status.SAFE: 2}

        sorted_subjects = sorted(
            subjects,
            key=lambda x: (status_priority.get(x['status'], 2), x['percentage'])
        )

        return sorted_subjects[:top_n]
