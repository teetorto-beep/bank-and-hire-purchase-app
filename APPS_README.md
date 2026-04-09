# Majupat Mobile Apps

This project includes two React Native mobile applications built with Expo:

## 📱 Apps

### 1. Customer App (`customer-app/`)
Mobile app for customers to:
- View their accounts and balances
- Check loan status and payments
- View transaction history
- Receive notifications
- Make loan applications

**Package**: `com.majupat.customer`

### 2. Collector App (`collector-app/`)
Mobile app for field collectors to:
- View assigned accounts
- Record collections offline
- Generate collection reports
- Track daily collections
- Sync data when online

**Package**: `com.majupat.collector`

## 🚀 Quick Start - Build APKs

### Option 1: Automated Build (Easiest)

**Windows:**
```bash
build-apps.bat
```

**Mac/Linux:**
```bash
chmod +x build-apps.sh
./build-apps.sh
```

### Option 2: Manual Build

1. Install EAS CLI:
```bash
npm install -g eas-cli
```

2. Login to Expo:
```bash
eas login
```

3. Build Customer App:
```bash
cd customer-app
eas build --platform android --profile preview
```

4. Build Collector App:
```bash
cd collector-app
eas build --platform android --profile preview
```

## 📖 Detailed Documentation

See `BUILD_APK_GUIDE.md` for comprehensive build instructions, troubleshooting, and advanced options.

## 🔧 Development

### Run Customer App:
```bash
cd customer-app
npm install
npm start
```

### Run Collector App:
```bash
cd collector-app
npm install
npm start
```

Then:
- Press `a` for Android emulator
- Scan QR code with Expo Go app on your phone

## 📦 Project Structure

```
├── customer-app/
│   ├── src/
│   │   ├── screens/      # App screens
│   │   ├── supabase.js   # Database config
│   │   ├── notifications.js
│   │   └── offline.js
│   ├── assets/           # Images and icons
│   ├── app.json          # App configuration
│   ├── eas.json          # Build configuration
│   └── package.json
│
├── collector-app/
│   ├── src/
│   │   ├── screens/      # App screens
│   │   ├── supabase.js   # Database config
│   │   ├── notifications.js
│   │   └── offline.js
│   ├── assets/           # Images and icons
│   ├── app.json          # App configuration
│   ├── eas.json          # Build configuration
│   └── package.json
│
└── BUILD_APK_GUIDE.md    # Detailed build guide
```

## 🔑 Environment Setup

Before building, ensure your Supabase configuration is correct in:
- `customer-app/src/supabase.js`
- `collector-app/src/supabase.js`

## 📱 Installing APKs

After building:

1. Download APK from Expo dashboard or provided link
2. Transfer to Android device
3. Enable "Install from Unknown Sources" in device settings
4. Tap APK file to install

## 🔄 Update Apps

To release updates:

1. Update version in `app.json`:
```json
{
  "expo": {
    "version": "1.0.1",
    "android": {
      "versionCode": 2
    }
  }
}
```

2. Rebuild:
```bash
eas build --platform android --profile preview
```

## 🏪 Publishing to Play Store

1. Build production AAB:
```bash
eas build --platform android --profile production
```

2. Submit to Play Store:
```bash
eas submit --platform android
```

## 🐛 Troubleshooting

### Build fails
```bash
cd customer-app  # or collector-app
npm install
eas build --platform android --profile preview --clear-cache
```

### Can't install APK
- Enable "Install from Unknown Sources" in Android settings
- Check if you have enough storage space
- Try uninstalling previous version first

### App crashes on startup
- Check Supabase URL and keys are correct
- Verify database tables exist
- Check device logs with `adb logcat`

## 📞 Support

For issues or questions:
1. Check `BUILD_APK_GUIDE.md`
2. Visit Expo documentation: https://docs.expo.dev
3. Check Expo forums: https://forums.expo.dev

## 🎯 Next Steps

1. ✅ Build APKs for both apps
2. ✅ Test on Android devices
3. ✅ Gather user feedback
4. ✅ Fix any issues
5. ✅ Build production versions
6. ✅ Submit to Google Play Store

## 📝 Notes

- Both apps use Expo SDK 55
- React Native 0.83.2
- Supabase for backend
- Offline support included
- Push notifications configured
