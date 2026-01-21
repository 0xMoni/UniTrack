# UniTrack

University Attendance Tracker - A mobile app that helps students track their attendance from any university ERP system.

## Features

- **Universal ERP Support**: Works with any university ERP system
- **Real-time Attendance Tracking**: Fetch your attendance data instantly
- **Smart Categorization**: Subjects are categorized as Safe, Critical, or Low based on attendance percentage
- **Filter by Status**: Tap on Safe/Critical/Low cards to filter subjects
- **Customizable Thresholds**: Set default and subject-specific attendance thresholds
- **Offline Access**: View your attendance data even without internet
- **Clean UI**: Modern, intuitive interface with dark status indicators

## Tech Stack

### Mobile App
- React Native / Expo
- AsyncStorage for local data persistence
- EAS Build for APK generation

### Backend
- Python Flask API
- Playwright for browser automation
- Docker for containerization
- Hosted on Render.com

## Project Structure

```
unitrack/
├── mobile/          # React Native mobile app
│   ├── App.js       # Main application code
│   ├── app.json     # Expo configuration
│   ├── eas.json     # EAS Build configuration
│   └── assets/      # App icons and images
├── backend/         # Cloud backend API
│   ├── app.py       # Flask API with Playwright
│   ├── Dockerfile   # Docker configuration
│   ├── requirements.txt
│   └── render.yaml  # Render deployment config
└── README.md
```

## How It Works

1. User enters their ERP URL and credentials in the app
2. App sends request to cloud backend
3. Backend uses Playwright (headless browser) to:
   - Login to the ERP
   - Navigate to attendance section
   - Capture attendance data from API responses
4. Data is returned to the app and displayed
5. Credentials are never stored on the server

## Setup

### Mobile App

```bash
cd mobile
npm install
npx expo start
```

### Backend (Local Development)

```bash
cd backend
pip install -r requirements.txt
playwright install chromium
python app.py
```

### Building APK

```bash
cd mobile
eas build --platform android --profile preview
```

## API Endpoints

- `GET /` - API info
- `GET /api/health` - Health check
- `POST /api/fetch` - Fetch attendance data
  ```json
  {
    "erp_url": "https://erp.university.edu",
    "username": "student@email.com",
    "password": "password123"
  }
  ```

## Privacy

- No credentials are stored on the server
- All data is passed per-request
- Attendance data is cached locally on device for offline access

## License

MIT
