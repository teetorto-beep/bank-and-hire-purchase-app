# Build APK Guide for Collector & Customer Apps

This guide will help you build APK files for both the Collector App and Customer App.

## Prerequisites

1. **Node.js and npm** installed
2. **Expo account** - Create one at [expo.dev](https://expo.dev)
3. **EAS CLI** - Expo Application Services CLI

## Step 1: Install EAS CLI

```bash
npm install -g eas-cli
```

## Step 2: Login to Expo

```bash
eas login
```

Enter your Expo account credentials.

## Step 3: Configure Projects

Both apps are already configured with `eas.json` files.

## Step 4: Build Customer App APK

```bash
cd customer-app
eas build --platform android --profile preview
```

Follow the prompts:
- If asked to create a project, select **Yes**
- If asked about credentials, select **Let Expo handle it** (recommended)
- Wait for the build to complete (usually 10-20 minutes)

The build will run on Expo's servers. You'll get a link to download the APK when it's done.

## Step 5: Build Collector App APK

```bash
cd ../collector-app
eas build --platform android --profile preview
```

Follow the same prompts as above.

## Alternative: Build Both Apps with Scripts

### Customer App:
```bash
cd customer-app
npm run build:apk
```

### Collector App:
```bash
cd collector-app
npm run build:apk
```

## Build Profiles Explained

We've configured three build profiles:

### 1. Preview (APK) - For Testing
```bash
eas build --platform android --profile preview
```
- Builds an APK file
- Can be installed directly on Android devices
- Perfect for testing and distribution outside Play Store

### 2. Production (AAB) - For Play Store
```bash
eas build --platform android --profile production
```
- Builds an Android App Bundle (AAB)
- Required for Google Play Store submission
- Optimized file size

### 3. Development - For Development
```bash
eas build --platform android --profile development
```
- Includes development tools
- For testing with Expo Go

## Monitoring Builds

After starting a build:

1. You'll get a build URL like: `https://expo.dev/accounts/[username]/projects/[project]/builds/[build-id]`
2. Visit this URL to monitor progress
3. You can also check builds at: `https://expo.dev/accounts/[username]/projects`

## Download APKs

Once builds complete:

1. Go to your Expo dashboard: https://expo.dev
2. Navigate to your project
3. Click on "Builds"
4. Download the APK files

Or use the direct download link provided in the terminal.

## Install APKs on Android Devices

### Method 1: Direct Download
1. Send the APK download link to your phone
2. Open the link on your Android device
3. Download and install (you may need to enable "Install from Unknown Sources")

### Method 2: USB Transfer
1. Download APK to your computer
2. Connect Android device via USB
3. Copy APK to device
4. Open file manager on device and tap the APK to install

### Method 3: QR Code
EAS Build provides a QR code - scan it with your Android device to download directly.

## Troubleshooting

### "eas: command not found"
```bash
npm install -g eas-cli
```

### "Not logged in"
```bash
eas login
```

### Build fails with dependency errors
```bash
cd customer-app  # or collector-app
npm install
eas build --platform android --profile preview --clear-cache
```

### "No bundle identifier"
The apps are already configured with:
- Customer App: `com.majupat.customer`
- Collector App: `com.majupat.collector`

### Build takes too long
Builds typically take 10-20 minutes. You can close the terminal and check progress at expo.dev.

## Local Builds (Advanced)

If you want to build locally instead of using Expo's servers:

### Prerequisites:
- Android Studio installed
- Android SDK configured
- Java JDK installed

### Build locally:
```bash
cd customer-app  # or collector-app
eas build --platform android --profile preview --local
```

Note: Local builds are more complex and require proper Android development environment setup.

## Update App Version

Before building for production, update version in `app.json`:

```json
{
  "expo": {
    "version": "1.0.1",  // Update this
    "android": {
      "versionCode": 2   // Increment this
    }
  }
}
```

## Environment Variables

If your apps need environment variables (like Supabase keys), create `.env` files:

### customer-app/.env
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### collector-app/.env
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Then update your supabase.js files to use these variables.

## Build Status Commands

```bash
# List all builds
eas build:list

# View specific build
eas build:view [build-id]

# Cancel a build
eas build:cancel [build-id]
```

## Next Steps After Building

1. Test APKs on multiple Android devices
2. Gather feedback
3. Fix any issues
4. Build production AAB for Play Store:
   ```bash
   eas build --platform android --profile production
   ```
5. Submit to Google Play Store:
   ```bash
   eas submit --platform android
   ```

## Quick Reference

| Command | Description |
|---------|-------------|
| `eas login` | Login to Expo account |
| `eas build --platform android --profile preview` | Build APK |
| `eas build --platform android --profile production` | Build AAB for Play Store |
| `eas build:list` | List all builds |
| `npm run build:apk` | Build APK (shortcut) |

## Support

- Expo Documentation: https://docs.expo.dev/build/introduction/
- EAS Build: https://docs.expo.dev/build/setup/
- Expo Forums: https://forums.expo.dev/

## Summary

To build both APKs quickly:

```bash
# Install EAS CLI (one time)
npm install -g eas-cli

# Login (one time)
eas login

# Build Customer App
cd customer-app
eas build --platform android --profile preview

# Build Collector App
cd ../collector-app
eas build --platform android --profile preview
```

Wait for builds to complete, then download your APKs from the provided links!
