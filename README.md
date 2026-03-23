# mon vocab

A French vocabulary learning app. Import lesson notes (.docx or text), extract vocabulary/verbs/grammar/exercises via Claude, then drill with flashcards, written exercises, conjugation practice, pronunciation guides, and AI-generated exercises.

## Setup (two parts)

### Part 1 — Cloudflare Worker (API proxy)

The Anthropic API doesn't allow direct browser requests (CORS). A free Cloudflare Worker acts as a proxy. Takes ~5 minutes.

1. **Get an Anthropic API key** at [console.anthropic.com](https://console.anthropic.com/) → API Keys → Create Key.

2. **Create the Worker:**
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com/) → sign up if needed (free).
   - In the sidebar click **Workers & Pages** → **Create** → **Create Worker**.
   - Name it `mon-vocab-proxy`, click **Deploy**.
   - Click **Edit Code**, replace the contents with the code in `worker/worker.js`, click **Deploy**.

3. **Add your API key as a secret:**
   - On the Worker page, go to **Settings** → **Variables and Secrets**.
   - Click **Add** → type `ANTHROPIC_API_KEY` as the name, paste your key as the value, select **Secret** (encrypted), click **Save**.

4. **Note your Worker URL** — it'll be something like:
   ```
   https://mon-vocab-proxy.YOUR-SUBDOMAIN.workers.dev
   ```

### Part 2 — GitHub Pages (the app)

1. **Create the repo:**
   ```bash
   cd mon-vocab
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Push to GitHub:**
   - Go to [github.com/new](https://github.com/new), create a repo called `mon-vocab` (public or private).
   - Then:
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/mon-vocab.git
   git branch -M main
   git push -u origin main
   ```

3. **Enable GitHub Pages:**
   - Go to your repo → **Settings** → **Pages**.
   - Under **Source**, select **GitHub Actions**.
   - The workflow will run automatically on push and deploy to `https://YOUR-USERNAME.github.io/mon-vocab/`.

4. **Configure the app:**
   - Open `https://YOUR-USERNAME.github.io/mon-vocab/` in your browser.
   - It'll land on the Settings tab — paste your Cloudflare Worker URL and save.
   - Done. Go to Import and drop in a lesson.

## If your repo name isn't `mon-vocab`

Edit `vite.config.js` and change the `base` path to match:

```js
base: "/your-repo-name/",
```

## Local development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173/mon-vocab/`.

## Project structure

```
mon-vocab/
├── src/
│   ├── App.jsx          # The entire app
│   └── main.jsx         # React entry point
├── worker/
│   └── worker.js        # Cloudflare Worker (deploy separately)
├── index.html
├── package.json
├── vite.config.js
└── .github/workflows/
    └── deploy.yml       # Auto-deploys on push to main
```
