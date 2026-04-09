# Deployment Guide

## Prerequisites

1. **GitHub Account**: Create one at [github.com](https://github.com)
2. **Firebase Account**: Create one at [firebase.google.com](https://firebase.google.com)
3. **Firebase CLI**: Install globally
   ```bash
   npm install -g firebase-tools
   ```

## GitHub Setup

### 1. Create a new repository on GitHub
- Go to [github.com/new](https://github.com/new)
- Name your repository (e.g., `hire-purchase-system`)
- Choose public or private
- Don't initialize with README (we already have one)
- Click "Create repository"

### 2. Push your code to GitHub
```bash
# Add all files
git add .

# Commit your changes
git commit -m "Initial commit"

# Add your GitHub repository as remote (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Firebase Hosting Setup

### 1. Login to Firebase
```bash
firebase login
```

### 2. Create a new Firebase project
- Go to [console.firebase.google.com](https://console.firebase.google.com)
- Click "Add project"
- Enter project name
- Follow the setup wizard

### 3. Initialize Firebase in your project
```bash
# Link to your Firebase project
firebase use --add

# Select your project from the list
# Give it an alias (e.g., "default")
```

### 4. Update .firebaserc
After running `firebase use --add`, your `.firebaserc` will be updated automatically with your project ID.

### 5. Build and Deploy
```bash
# Build the React app
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

Or use the combined script:
```bash
npm run deploy
```

## Environment Variables

Before deploying, make sure to:

1. Update your Supabase configuration in production
2. Set up environment variables if needed:
   - Create `.env.production` file
   - Add your production Supabase URL and keys
   - These will be bundled during build

Example `.env.production`:
```
REACT_APP_SUPABASE_URL=your_production_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_production_anon_key
```

## Continuous Deployment (Optional)

### GitHub Actions for automatic deployment

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Firebase Hosting

on:
  push:
    branches:
      - main

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: your-project-id
```

## Post-Deployment

After deployment, your app will be available at:
```
https://YOUR_PROJECT_ID.web.app
```
or
```
https://YOUR_PROJECT_ID.firebaseapp.com
```

## Custom Domain (Optional)

1. Go to Firebase Console > Hosting
2. Click "Add custom domain"
3. Follow the instructions to verify and connect your domain

## Troubleshooting

### Build fails
- Check for any TypeScript/ESLint errors
- Run `npm run build` locally first
- Check console for specific error messages

### Deployment fails
- Verify Firebase CLI is logged in: `firebase login`
- Check project is selected: `firebase projects:list`
- Verify `.firebaserc` has correct project ID

### App doesn't load after deployment
- Check browser console for errors
- Verify Supabase URLs are correct for production
- Check Firebase Hosting logs in console

## Useful Commands

```bash
# Check Firebase login status
firebase login:list

# List Firebase projects
firebase projects:list

# View hosting URL
firebase hosting:channel:list

# Deploy preview channel
firebase hosting:channel:deploy preview

# View deployment history
firebase hosting:clone

# Rollback to previous version (from Firebase Console)
```
