## HAUNTOLOSCOPE

HAUNTOLOSCOPE is a counterfactual newsroom: give it an event and it divines a coherent alternate timeline, complete with diegetic broadsheet coverage. The app leans on Groq's `moonshotai/kimi-k2-instruct-0905` model and enforces a realism-first brief—no invented ministries, no out-of-world narration.

The scope handles two kinds of seeds:

- **Actual history**: Supply an event that really happened and HAUNTOLOSCOPE generates a world where it did **not** occur.
- **Speculative history**: Supply an event that never happened (or a negated description) and it traces the world where it **does** occur.

### Getting Started

1. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

2. Open the app (default http://localhost:5173) and paste your Groq API key into the **Groq API Key** field. The key persists in `localStorage` so you only need to enter it once per browser session.

3. Describe the seed event and press **Bend the Axis**. Use **Summon Chronicle** on any timeline entry to commission a newspaper article, or **Generate More Events** to interpolate additional anchors.

### Import / Export

- **Export Relic**: downloads a bundle containing the original seed, the generated timeline, and any completed articles so far—perfect for archiving or collaboration.
- **Import Relic**: restores a previously exported bundle, letting you continue enriching the same counterfactual universe.

### Safety & Deployment Notes

- The app talks directly to Groq from the browser. Store your API key only in the provided password field or proxy the requests if deploying publicly.
- All responses are parsed as JSON. When the model returns invalid JSON, the UI surfaces the failure so you can retry.
- Build output lives in `dist/`. Deploy anywhere that serves static assets (Vercel, Cloudflare Pages, Netlify, etc.).

Enjoy the bureau.
