# Build Collector App APK - Quick Guide

This guide shows you how to build the APK for the Majupat Collector App.

## What You Need

1. Node.js installed on your computer
2. An Expo account (free) - sign up at [expo.dev](https://expo.dev)
3. Internet connection

## Step-by-Step Instructions

### 1. Install EAS CLI (One-time setup)

Open your terminal and run:

```bash
npm install -g eas-cli
```

This installs the Expo Application Services command-line tool.

### 2. Login to Expo (One-time setup)

```bash
eas login
```

Enter your Expo username and password when prompted.

### 3. Navigate to Collector App

```bash
cd collector-app
```

### 4. Build the APK

```bash
eas build --platform android --profile preview
```

Or use the shortcut:

```bash
npm run build:apk
```

### 5. Follow the Prompts

- If asked "Would you like to create a project?", select **Yes**
- If asked about credentials, select **Let Expo handle the process** (recommended)
- The build will start on Expo's cloud servers

### 6. Wait for Build to Complete

- Build typically takes 10-20 minutes
- You'll see a progress URL like: `https://expo.dev/accounts/[username]/projects/majupat-collector/builds/[id]`
- You can close the terminal and check progress at that URL

### 7. Download Your APK

Once the build completes:

**Option A: Direct Link**
- The terminal will show a download link
- Click it to download the APK

**Option B: Expo Dashboard**
1. Go to [expo.dev](https://expo.dev)
2. Navigate to your projects
3. Click on "Majupat Collector"
4. Go to "Builds" tab
5. Download the APK

**Option C: QR Code**
- Scan the QR code shown in terminal with your Android phone
- Download directly to your device

## Install APK on Android Devices

### Method 1: Direct Download on Phone
1. Send the APK download link to the collector's phone
2. Open the link on the Android device
3. Download the APK
4. Tap to install (may need to enable "Install from Unknown Sources" in Settings)

### Method 2: Transfer via USB
1. Download APK to your computer
2. Connect Android phone via USB cable
3. Copy APK file to phone's Downloads folder
4. On phone, open Files app → Downloads
5. Tap the APK file to install

### Method 3: Share via WhatsApp/Email
1. Download APK to your computer
2. Upload to Google Drive or send via WhatsApp/Email
3. Download on Android device
4. Install

## Quick Commands Reference

```bash
# Install EAS CLI (one time)
npm install -g eas-cli

# Login to Expo (one time)
eas login

# Build APK
cd collector-app
npm run build:apk

# Check build status
eas build:list

# View specific build details
eas build:view [build-id]
```

## Troubleshooting

### "eas: command not found"
Run: `npm install -g eas-cli`

### "Not logged in to EAS"
Run: `eas login`

### Build fails
Try clearing cache:
```bash
cd collector-app
npm install
eas build --platform android --profile preview --clear-cache
```

### Can't install APK on phone
1. Go to Settings → Security
2. Enable "Install from Unknown Sources" or "Install Unknown Apps"
3. Try installing again

## Update App Version

Before building a new version, update in `collector-app/app.json`:

```json
{
  "expo": {
    "version": "1.0.1",     // Change this (e.g., 1.0.0 → 1.0.1)
    "android": {
      "versionCode": 5      // Increment this (e.g., 4 → 5)
    }
  }
}
```

## Environment Setup (If needed)

If you need to configure Supabase connection, create `collector-app/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Then update `collector-app/src/lib/supabase.js` to use these variables.

## Build for Production (Google Play Store)

When ready to publish to Play Store:

```bash
cd collector-app
eas build --platform android --profile production
```

This creates an AAB (Android App Bundle) file required by Google Play Store.

## Summary - Fastest Way

```bash
# One-time setup
npm install -g eas-cli
eas login

# Build APK
cd collector-app
npm run build:apk

# Wait 10-20 minutes, then download from the link provided
```

## Need Help?

- Expo Documentation: https://docs.expo.dev/build/introduction/
- EAS Build Guide: https://docs.expo.dev/build/setup/
- Expo Forums: https://forums.expo.dev/

---

**Current Collector App Configuration:**
- Package: `com.majupat.collector`
- Version: 1.0.0
- Version Code: 4
- Min Android: 6.0 (API 24)
- Target Android: 14 (API 34)
