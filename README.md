# UniTrack

**University Attendance Tracker** - Track your college attendance from any ERP system.

## Features

- **Universal Compatibility** - Works with most college ERP systems
- **Mobile App** - React Native app for iOS and Android
- **Web Dashboard** - Modern web interface with charts
- **Configurable Thresholds** - Set different requirements for different subjects
- **Smart Analysis** - Shows classes you can miss or need to attend
- **Auto-Detection** - Automatically extracts institution details from ERP

## Project Structure

```
unitrack/
├── mobile/              # React Native (Expo) mobile app
├── frontend/            # React web dashboard
├── unitrack/            # Python backend
│   ├── core/
│   │   ├── config.py    # Configuration management
│   │   ├── scraper.py   # ERP scraper (Playwright)
│   │   └── calculator.py # Attendance calculations
│   ├── cli/
│   │   └── main.py      # CLI commands
│   └── web/
│       └── server.py    # Flask API server
├── requirements.txt
└── pyproject.toml
```

## Quick Start

### 1. Backend Setup

```bash
# Clone the repo
git clone https://github.com/username/unitrack.git
cd unitrack

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
playwright install chromium

# Run setup wizard
python -m unitrack.cli.main setup
```

### 2. Mobile App Setup

```bash
cd mobile
npm install

# Start development server
npm start
```

Scan QR code with **Expo Go** app on your phone.

### 3. Web Dashboard (Optional)

```bash
cd frontend
npm install
npm run dev
```

## Usage

### CLI Commands

```bash
# Fetch attendance from ERP
python -m unitrack.cli.main fetch

# View attendance status
python -m unitrack.cli.main status

# Start API server (for mobile app)
python -m unitrack.cli.main serve --host 0.0.0.0 --port 5050

# View configuration
python -m unitrack.cli.main config
```

### Mobile App

1. Start backend server
2. Open mobile app
3. Enter server URL
4. View attendance, pull to refresh

## Custom Thresholds

Set different attendance requirements for specific subjects:

```yaml
thresholds:
  default: 75.0      # Default minimum
  safe_buffer: 10.0  # Buffer for "safe" status
  custom:
    TYL: 80.0        # Subjects containing "TYL" need 80%
    Lab: 85.0        # Subjects containing "Lab" need 85%
```

## Building Mobile App

### For Testing (APK)

```bash
cd mobile
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

### For Play Store (AAB)

```bash
eas build -p android --profile production
eas submit -p android
```

### For App Store (iOS)

```bash
eas build -p ios --profile production
eas submit -p ios
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Python, Flask, Playwright |
| Mobile | React Native, Expo |
| Web | React, Vite, Tailwind CSS |
| Scraping | Playwright (headless browser) |

## Requirements

- Python 3.8+
- Node.js 18+
- Expo Go app (for mobile testing)

## Supported ERPs

Works with any ERP system that has:
- Web-based login form
- JSON API for attendance data

## License

MIT License

## Contributing

Pull requests welcome! Please open an issue first to discuss changes.
