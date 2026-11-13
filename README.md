# Recipes

A personal recipe book for a small group of known users (household, family, friends). Save recipes from videos and web pages, keep your own notes and photos with them, and read every recipe in your language. Built for use on a phone in the kitchen.

The product brief is in [APP_PROMPT.md](APP_PROMPT.md). It is the standing spec for this repository.

## What it does

- **Recipes:** create, edit, archive, restore and delete. Delete asks for confirmation. A video link can carry a start time and opens at that point.
- **Duplicates:** a recipe with the same source link, start time and title as an existing one is rejected, and the existing recipe is shown.
- **Import from a web page or video description:** title, ingredients, steps and a picture are filled in. Credit, hashtag and sign-off lines are dropped. Private and loopback addresses are refused.
- **Import from a photo:** AWS Textract reads ingredient lines from a screenshot or photo.
- **Notes:** each ingredient or step can have notes. A line starting with `> ` is a note on the line above it; `> - ` makes it a bullet. Notes take **bold**, _italic_, colours and `[link text](https://...)` links (http and https only). Ingredient lines starting with `# ` are headings.
- **Photos:** several per recipe, shown as a gallery and as the first picture on each list card. "Take photo" opens the camera on a phone; "Choose photo" opens the library. PNG or JPEG, up to 5 MB, originals kept.
- **Tags and search:** built-in tags plus typed ones (up to 10 per recipe, 30 characters each, stored lowercase). Search ignores case and accents. Tag manager merges and removes tags.
- **Languages:** Catalan, Spanish, English and Russian for the interface. Switching language updates the page in place, without a reload. Recipe content is machine-translated with AWS Translate, cached by a hash of the original text, and can be edited by hand. Edited translations are flagged when the original changes, and can be reset.
- **Phone use:** installable to the home screen (PWA), the screen stays awake while a recipe is open, and recipes already viewed open without a connection.
- **Sign-in:** every page and API route needs a signed-in user. Accounts are created by an administrator in Amazon Cognito; there is no public sign-up.

Not yet done, see [Status](#status): the AWS deployment, the DynamoDB and S3 storage backend, the per-user language setting, and the browser tests.

## Stack

- SvelteKit 3 with Svelte 5 (runes), one codebase for the UI and the server API under `src/routes/api/**`.
- Paraglide JS for the four interface languages (`messages/*.json`).
- Server-side AWS SDK clients for Textract and Translate.
- Vitest for unit tests, Playwright (Chromium) for the browser test project.
- Node.js 22.17 or newer. `.npmrc` sets `engine-strict`, so older Node versions refuse to install.

## Getting started

```sh
npm install
cp .env.example .env   # then fill in, see below
```

### Run locally without sign-in

For development on your own machine only:

```sh
AUTH=off npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173/recipes. Every request is treated as the local user. Sign-in is not checked, so never set `AUTH=off` on a server that anyone else can reach.

Service workers only register on `localhost` or HTTPS. Use `localhost` to test the offline behaviour.

### Run with sign-in

Set these in `.env` (git-ignored):

| Variable            | Purpose                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `STORE`             | `file` (default) stores data in `./data`. The AWS backend is not written yet. |
| `RECIPE_DATA_DIR`   | Optional. Moves the file store, for example in tests.                         |
| `COGNITO_ISSUER`    | The user pool's issuer URL.                                                   |
| `COGNITO_DOMAIN`    | The hosted sign-in domain, with `https://`.                                   |
| `COGNITO_CLIENT_ID` | The app client's id. The client needs the authorization code flow with PKCE.  |
| `SESSION_SECRET`    | At least 32 random characters. Signs the session cookies.                     |
| `AWS_REGION`        | Region for Textract and Translate.                                            |
| `AUTH`              | Leave unset. `off` disables sign-in (local development only).                 |

AWS credentials for Textract and Translate come from the standard AWS credential chain on your machine. Do not put keys in `.env`.

## Scripts

| Command           | What it does                             |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Development server.                      |
| `npm run build`   | Production build.                        |
| `npm run preview` | Serves the production build locally.     |
| `npm run check`   | Type check (svelte-check).               |
| `npm run lint`    | Prettier and ESLint.                     |
| `npm test`        | Unit tests (server and client projects). |

Before each commit: `npm run check`, `npm run lint` and `npm test` should pass.

## Layout

```
src/
  hooks.server.ts        sign-in check for every request, language cookie
  routes/
    recipes/             list, detail, new and edit pages
    tags/                tag manager
    api/                 JSON API: recipes, images, import, OCR, translation
    auth/                Cognito sign-in (login, callback, logout)
    signin/, install/    sign-in page and home-screen install page
  service-worker.ts      offline reading: caches the app shell and viewed recipes
  lib/
    recipes/             model, validation, notes markup, translation, client store
    server/              storage, sessions, Cognito, rate limits, import, OCR, Translate
messages/                interface strings in four languages
static/                  manifest, icons
data/                    local recipe data (git-ignored)
```

### Storage

All persistence goes through the `RecipeStore` interface in `src/lib/server/store.ts`. Routes never touch the files directly. The only backend today is the local file store in `./data`: `recipes.json`, `translations.json` and `images/`. Back this folder up; it is not in git.

### Security notes

- Every page and `/api/**` route needs a session. Unauthenticated API calls get `401`; pages redirect to `/signin`.
- Sessions are HMAC-signed httpOnly cookies. The Cognito ID token is checked against the pool's published keys (RS256, issuer, client id, expiry).
- Sign-in uses the authorization code flow with PKCE, with a state check.
- The metered endpoints (translate, OCR, import) have a per-user rate limit. This is a safety net per server instance; the AWS budget alarm is the real cost cap.
- Image uploads are checked for size and for PNG or JPEG content.
- Recipe text is shown as text, never as HTML. Notes use a small markup subset (`src/lib/recipes/notes.ts`).

## Status

| Phase | Scope                                                                                                                                        | State                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1     | Storage interface                                                                                                                            | Done                                                                                                        |
| 2     | Cognito sign-in, rate limits                                                                                                                 | Done; the real Cognito round trip is untested until a user pool exists                                      |
| 3     | PWA: manifest, icons, install page, wake lock, offline reading, sign-out                                                                     | Done; icons are placeholders                                                                                |
| 4     | Photo capture, list thumbnails, per-item notes, rich text, side-by-side translation edit, in-place language switch, tap targets and contrast | Done. The translated recipe body still waits for the translation service the first time a language is shown |
| 5     | AWS (SST v3), DynamoDB and S3 storage, migration, budget alarm, per-user language setting                                                    | Not started                                                                                                 |
| 6     | Browser tests for the main flows                                                                                                             | Not started                                                                                                 |

The domain is not chosen yet. The first deployment will use the default CloudFront address.
