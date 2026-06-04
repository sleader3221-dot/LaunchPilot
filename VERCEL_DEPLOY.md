# Deploy LaunchPilot To Vercel

Use these exact settings in Vercel.

## Project Settings

- Framework Preset: `Vite`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`
- Node.js Version: Vercel default is fine

The repository includes `vercel.json`, so Vercel should detect these automatically.

## Environment Variable

Add this in Vercel under Project Settings > Environment Variables:

```bash
VITE_NOVUS_PUBLIC_APP_ID=your-real-novus-install-key
```

Set it for Production, Preview, and Development if Vercel asks.

## Deploy Steps

1. Push this repository to GitHub.
2. Go to `https://vercel.com/new`.
3. Import the GitHub repository.
4. Confirm the settings above.
5. Add `VITE_NOVUS_PUBLIC_APP_ID`.
6. Click Deploy.
7. Open the deployed URL and use the app.
8. Go to Analytics in the app and fire a few events.
9. Confirm the events appear in Novus.
10. Capture the Novus dashboard screenshot for Devpost.

## If Novus Account Signup Is Still Failing

Deploy anyway without the env var first, but do not submit the hackathon entry until Novus access is fixed and the screenshot is captured.
