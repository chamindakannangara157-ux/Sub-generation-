# Gemini Transcribe Sinhala — Vercel Web App

Mobile-friendly audio transcription web app using Google's `gemini-3.5-transcribe` model. It provides:
- Original-language transcript (TXT)
- Sinhala translation (TXT)
- SRT subtitles with timestamps (original-language and Sinhala versions)
- API key stored only as a Vercel environment variable, never in browser code

## Important Vercel upload limit
Vercel Functions have a 4.5 MB request-body limit. This starter app deliberately limits uploads to **3 MB** to leave room for multipart overhead. That means it is for short audio clips, not full anime episodes or long recordings. For large files, the architecture needs direct-to-cloud upload or a different backend.

## Deploy to Vercel (Android-friendly steps)

1. Download and extract this ZIP.
2. Upload the extracted project to a GitHub repository.
3. Open https://vercel.com/ and sign in using GitHub.
4. Choose **Add New → Project**, then import the repository.
5. Framework preset: **Other**. Keep the root directory as `./`.
6. Before or after deploying, open **Project → Settings → Environment Variables**.
7. Add:
   - Name: `GEMINI_API_KEY`
   - Value: your Gemini API key from Google AI Studio
   - Environment: Production (and Preview if you want preview deployments)
8. Optional environment variables:
   - `TRANSCRIBE_MODEL` = `gemini-3.5-transcribe`
   - `TRANSLATE_MODEL` = `gemini-3.5-flash-lite`
9. Save the variables and redeploy from **Deployments → Redeploy** (environment variable changes require a new deployment).
10. Open the Vercel URL on your Android phone.

Get a Gemini API key from https://aistudio.google.com/apikey . Do not paste your key into source files, GitHub, or chat. Use Vercel Environment Variables only.

## Local development

Requires Node.js 20+ and the Vercel CLI:
```bash
npm install
npx vercel dev
```
Create a local `.env.local` file:
```env
GEMINI_API_KEY=your_key_here
TRANSCRIBE_MODEL=gemini-3.5-transcribe
TRANSLATE_MODEL=gemini-3.5-flash-lite
```
Do not commit `.env.local`.

## Free tier / privacy notes
Gemini API availability, free-tier quotas, and model access can vary by account/region and may change. Check current Google AI Studio pricing and limits. Audio is sent to Google for processing. Do not upload private or sensitive recordings unless you are comfortable with the provider's applicable terms. This starter has no database and does not save uploads on the server.
