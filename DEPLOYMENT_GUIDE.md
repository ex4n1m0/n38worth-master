# Vercel Deployment Guide

## Prerequisites
- [Vercel CLI](https://vercel.com/cli) installed (`npm i -g vercel`)
- Vercel account (connected to GitHub)
- Google Cloud Console OAuth credentials configured for production

## Step 1: Configure Google Cloud Console for Production

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services → Credentials**
3. Edit your OAuth 2.0 Client ID
4. Add your Vercel deployment URL to **Authorized Redirect URIs**:
   ```
   https://your-deployment-url.vercel.app/api/auth/callback/google
   ```
5. Save changes

## Step 2: Set Environment Variables in Vercel

After deployment, set these environment variables in your Vercel project dashboard:

### Required Variables:
```
NEXTAUTH_SECRET=8ZQHxghJyN+6kQ5xsCNVGL3Y9DKl+N6iUGSG7PzDqPo=
NEXTAUTH_URL=https://your-deployment-url.vercel.app
GOOGLE_CLIENT_ID=387424003115-42bpjqpnfsa09mgsearvgph7bpqf82tb.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
DATABASE_URL=postgresql://neondb_owner:npg_DA3LGepUH2RE@ep-fragrant-boat-aij1tffw-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require
```

### Optional Variables:
```
FACEBOOK_CLIENT_ID=883869247863065
FACEBOOK_CLIENT_SECRET=7ab776cc7f2ea9b8e284bc21e0c8dcf0
PUSHER_APP_ID=your-pusher-app-id
PUSHER_SECRET=your-pusher-secret
NEXT_PUBLIC_PUSHER_KEY=your-pusher-key
NEXT_PUBLIC_PUSHER_CLUSTER=us2
BLOB_READ_WRITE_TOKEN=your-vercel-blob-token
```

## Step 3: Deploy to Vercel

### Option A: Using Vercel CLI (Recommended)
```bash
# Login to Vercel (first time only)
vercel login

# Deploy to preview environment
vercel

# Deploy to production
vercel --prod
```

### Option B: Using Git Integration
1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Ready for production deployment"
   git push origin master
   ```
2. Go to [Vercel Dashboard](https://vercel.com)
3. Click "New Project" → Import your GitHub repository
4. Configure environment variables during setup
5. Click "Deploy"

## Step 4: Verify Deployment

1. Visit your deployment URL (e.g., `https://networth.vercel.app`)
2. Test Google login functionality
3. Verify database connections work
4. Check that all game features function properly

## Troubleshooting Google OAuth

If you still get "invalid_client" error in production:

1. **Check Redirect URIs in Google Cloud Console**:
   - Ensure both `http://localhost:3000/api/auth/callback/google` (local)
   - And `https://your-deployment.vercel.app/api/auth/callback/google` (production) are added

2. **Verify Environment Variables in Vercel**:
   - Ensure `NEXTAUTH_URL` matches your actual deployment URL
   - Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct

3. **Check Vercel Deployment Logs** for any environment variable errors

## Database Configuration

Your Neon PostgreSQL database is already configured in `.env.local` and will work with Vercel. The connection uses SSL and should work seamlessly.

## Post-Deployment Tasks

1. **Set up custom domain** (optional) in Vercel project settings
2. **Enable automatic deployments** from your main branch
3. **Configure preview deployments** for pull requests
4. **Set up monitoring** with Vercel Analytics

## Need Help?

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment Guide](https://nextjs.org/docs/app/building-your-application/deploying)
- [NextAuth.js Production Checklist](https://next-auth.js.org/configuration/production-checklist)