"""
Configuration management for UniTrack.

Handles loading, saving, and validating configuration from YAML files.
"""

import os
import yaml
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, List


# Default config directory
CONFIG_DIR = Path.home() / ".unitrack"
CONFIG_FILE = CONFIG_DIR / "config.yaml"
DATA_DIR = CONFIG_DIR / "data"


@dataclass
class Selectors:
    """CSS selectors for ERP page elements."""
    username_input: str = ""
    password_input: str = ""
    login_button: str = ""
    attendance_trigger: str = ""  # Element to click to load attendance

    def is_complete(self) -> bool:
        """Check if all required selectors are configured."""
        return all([
            self.username_input,
            self.password_input,
            self.login_button,
        ])


@dataclass
class Thresholds:
    """Attendance threshold configuration."""
    default: float = 75.0  # Default minimum attendance percentage
    safe_buffer: float = 10.0  # Buffer above threshold for "safe" status
    custom: Dict[str, float] = field(default_factory=dict)  # Subject-specific thresholds

    def get_threshold(self, subject_code: str = None, subject_name: str = None) -> float:
        """Get threshold for a subject, checking custom rules first."""
        if subject_code and subject_code in self.custom:
            return self.custom[subject_code]

        # Check if subject name contains any custom threshold keywords
        if subject_name:
            for keyword, threshold in self.custom.items():
                if keyword.upper() in subject_name.upper():
                    return threshold

        return self.default


@dataclass
class Institution:
    """Institution details."""
    name: str = "My Institution"
    short_name: str = ""
    logo_url: str = ""
    color: str = "#3B82F6"  # Blue


@dataclass
class ERPConfig:
    """ERP system configuration."""
    base_url: str = ""
    login_url: str = ""
    attendance_api: str = ""  # API endpoint if discovered
    selectors: Selectors = field(default_factory=Selectors)

    # Field mappings for API response
    field_mappings: Dict[str, str] = field(default_factory=lambda: {
        "subject": "subject",
        "subject_code": "subjectCode",
        "present": "presentCount",
        "absent": "absentCount",
        "total": "session",  # Note: might need present+absent instead
        "faculty": "facultName",
        "term": "termName",
    })


@dataclass
class Credentials:
    """User credentials (stored separately for security)."""
    username: str = ""
    password: str = ""


@dataclass
class Config:
    """Main configuration class."""
    institution: Institution = field(default_factory=Institution)
    erp: ERPConfig = field(default_factory=ERPConfig)
    thresholds: Thresholds = field(default_factory=Thresholds)
    credentials: Credentials = field(default_factory=Credentials)

    # User info
    student_name: str = ""
    roll_number: str = ""
    branch: str = ""
    section: str = ""

    # Settings
    headless: bool = False  # Run browser invisibly
    auto_refresh: bool = False  # Auto-refresh on dashboard load

    def is_configured(self) -> bool:
        """Check if basic configuration is complete."""
        return (
            self.erp.base_url and
            self.erp.selectors.is_complete() and
            self.credentials.username and
            self.credentials.password
        )

    def to_dict(self) -> dict:
        """Convert config to dictionary (excluding sensitive data)."""
        data = asdict(self)
        # Don't save password in plain config
        data['credentials']['password'] = ""
        return data

    @classmethod
    def from_dict(cls, data: dict) -> 'Config':
        """Create config from dictionary."""
        config = cls()

        if 'institution' in data:
            config.institution = Institution(**data['institution'])

        if 'erp' in data:
            erp_data = data['erp']
            if 'selectors' in erp_data:
                erp_data['selectors'] = Selectors(**erp_data['selectors'])
            config.erp = ERPConfig(**erp_data)

        if 'thresholds' in data:
            config.thresholds = Thresholds(**data['thresholds'])

        if 'credentials' in data:
            config.credentials = Credentials(**data['credentials'])

        # Simple fields
        for field_name in ['student_name', 'roll_number', 'branch', 'section', 'headless', 'auto_refresh']:
            if field_name in data:
                setattr(config, field_name, data[field_name])

        return config


def ensure_config_dir():
    """Ensure configuration directory exists."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_config(config_path: Path = None) -> Config:
    """
    Load configuration from YAML file.

    Args:
        config_path: Path to config file (uses default if None)

    Returns:
        Config object
    """
    if config_path is None:
        config_path = CONFIG_FILE

    ensure_config_dir()

    if not config_path.exists():
        return Config()

    try:
        with open(config_path, 'r') as f:
            data = yaml.safe_load(f) or {}
        return Config.from_dict(data)
    except Exception as e:
        print(f"Warning: Error loading config: {e}")
        return Config()


def save_config(config: Config, config_path: Path = None):
    """
    Save configuration to YAML file.

    Args:
        config: Config object to save
        config_path: Path to save to (uses default if None)
    """
    if config_path is None:
        config_path = CONFIG_FILE

    ensure_config_dir()

    with open(config_path, 'w') as f:
        yaml.dump(config.to_dict(), f, default_flow_style=False, sort_keys=False)


def load_credentials() -> Credentials:
    """Load credentials from environment or secure storage."""
    return Credentials(
        username=os.getenv("UNITRACK_USERNAME", ""),
        password=os.getenv("UNITRACK_PASSWORD", ""),
    )


def get_data_path(filename: str) -> Path:
    """Get path to a data file."""
    ensure_config_dir()
    return DATA_DIR / filename
