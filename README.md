# UniTrack

**University Attendance Tracker** - Track your college attendance from any ERP system.

## Features

- **No Backend Required** - Connects directly to your ERP
- **One-Time Login** - Login once, refresh anytime
- **Universal Compatibility** - Works with most college ERP systems
- **Offline Access** - View saved attendance without internet
- **Configurable Thresholds** - Set different requirements for different subjects
- **Smart Analysis** - Shows classes you can miss or need to attend

## How It Works

1. Enter your ERP URL
2. Login once through the ERP website (in-app browser)
3. Tap "Fetch Data" to get your attendance
4. Done! Pull to refresh anytime - no re-login needed

Session is saved until it expires. When it does, just login again.

## Quick Start

### Mobile App

```bash
# Clone the repo
git clone https://github.com/0xMoni/UniTrack.git
cd unitrack/mobile

# Install dependencies
npm install

# Start development server
npm start
```

Scan QR code with **Expo Go** app on your phone.

### Building APK

```bash
cd mobile
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

## Custom Thresholds

Set different attendance requirements in the app settings:

- **Default Minimum**: 65%, 70%, 75%, or 80%
- **Safe Buffer**: +5%, +10%, or +15%
- **Custom Rules**: Set specific thresholds for subjects containing keywords (e.g., "Lab" → 85%)

## Tech Stack

| Component | Technology |
|-----------|------------|
| Mobile | React Native, Expo |
| Storage | AsyncStorage |
| Auth | WebView + CookieManager |

## Requirements

- Node.js 18+
- Expo Go app (for testing)
- Android/iOS device

## Supported ERPs

Works with any ERP system that has:
- Web-based login form
- JSON API endpoint for attendance data

## Project Structure

```
unitrack/
├── mobile/              # React Native (Expo) mobile app
│   ├── App.js          # Main app code
│   ├── app.json        # Expo configuration
│   └── assets/         # Icons and images
└── README.md
```

## License

MIT License

## Contributing

Pull requests welcome! Please open an issue first to discuss changes.
