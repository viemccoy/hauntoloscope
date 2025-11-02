## HAUNTOLOSCOPE

An esoteric counterfactual chronicle generator that communes with Groq's `moonshotai/kimi-k2-instruct-0905` model. Give it a historical hinge-point, receive a haunted alternate timeline and richly formatted broadsheet articles for each event.

### Getting Started

1. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

2. Open the app (default http://localhost:5173) and paste your Groq API key into the **Groq API Key** field. The key persists in `localStorage` so you only need to enter it once per browser.

3. Describe the seed event you wish to disturb and press **Bend the Axis**. Use the **Summon Chronicle** button on any timeline entry to conjure its broadsheet, or tap the ASCII eye glyph beside an entry to weave fresh events between anchors.

### Export & Import

- **Export Chronicle**: downloads a bundle with the seed event, the generated timeline, and every article you have already conjured.
- **Import Relic**: loads a previously exported bundle to continue expanding the same counterfactual world.

### Safety

- The app communicates directly with Groq from the browser. Never hard-code your API key into the project; keep it in the secure field in the UI or use an environment-backed proxy if deploying publicly.
- Responses are parsed as JSON—if the model deviates from the expected schema, the UI will surface the error so you can retry.
