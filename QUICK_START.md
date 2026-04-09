# Quick Start - Deploy to GitHub & Firebase

## Step 1: Configure Git (First Time Only)

Run these commands with your information:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

## Step 2: Commit Your Code

```bash
git commit -m "Initial commit: Hire Purchase System with Firebase deployment setup"
```

## Step 3: ✅ GitHub Setup Complete!

Your code is now on GitHub at:
https://github.com/teetorto-beep/bank-and-hire-purchase-app

## Step 5: Install Firebase CLI

```bash
npm install -g firebase-tools
```

## Step 6: Login to Firebase

```bash
firebase login
```

## Step 7: Create Firebase Project

1. Go to https://console.firebase.google.com
2. Click "Add project"
3. Enter project name (e.g., `hire-purchase-system`)
4. Follow the wizard (you can disable Google Analytics if you want)
5. Click "Create project"

## Step 8: Link Firebase Project

```bash
firebase use --add
```

Select your project from the list and give it an alias (use "default").

## Step 9: Deploy to Firebase

```bash
npm run deploy
```

This will:
- Build your React app
- Deploy to Firebase Hosting
- Give you a live URL like: `https://your-project-id.web.app`

## Step 10: Set Up Auto-Deploy (Optional)

To enable automatic deployment when you push to GitHub:

1. Generate Firebase service account:
   ```bash
   firebase init hosting:github
   ```

2. Follow the prompts to:
   - Connect your GitHub repository
   - Set up GitHub Actions
   - Configure deployment workflow

OR manually:

1. Go to Firebase Console > Project Settings > Service Accounts
2. Click "Generate new private key"
3. Save the JSON file
4. Go to your GitHub repo > Settings > Secrets and variables > Actions
5. Add these secrets:
   - `FIREBASE_SERVICE_ACCOUNT`: Paste the entire JSON content
   - `FIREBASE_PROJECT_ID`: Your Firebase project ID

Now every push to `main` branch will automatically deploy!

## Environment Variables for Production

Before deploying, create `.env.production`:

```env
REACT_APP_SUPABASE_URL=your_production_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_production_anon_key
```

## Useful Commands

```bash
# Build locally
npm run build

# Deploy to Firebase
npm run deploy

# Deploy only hosting
npm run deploy:hosting

# View Firebase projects
firebase projects:list

# Check deployment status
firebase hosting:channel:list
```

## Your App URLs

After deployment, your app will be available at:
- `https://YOUR_PROJECT_ID.web.app`
- `https://YOUR_PROJECT_ID.firebaseapp.com`

## Troubleshooting

### "git: command not found"
Install Git from https://git-scm.com/downloads

### "firebase: command not found"
Run: `npm install -g firebase-tools`

### Build errors
Run `npm run build` locally first to check for errors

### Deployment fails
- Check you're logged in: `firebase login`
- Verify project: `firebase projects:list`
- Check `.firebaserc` has correct project ID

## Next Steps

1. Set up custom domain (optional)
2. Configure Firebase Analytics
3. Set up monitoring and alerts
4. Configure CORS for Supabase if needed

For detailed instructions, see `DEPLOYMENT.md`
