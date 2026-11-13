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
- **Languages:** Catalan, Spanish, English and Russian for the interface. Switching language updates the page in place, without a reload. Recipe content is machine-translated with AWS Translate for signed-in users, cached by a hash of the original text, and can be edited by hand. Edited translations are flagged when the original changes, and can be reset.
- **Recipe list:** the title, the sign-out icon (or sign-in icon) at the top right, languages and text size (A− / A+), links to add a recipe and manage tags, Active and Archived tabs, search, and tag filters folded behind a Filters button with Select beside it.
- **Phone use:** installable to the home screen (PWA), the screen stays awake while a recipe is open, and recipes already viewed open without a connection.
- **Sign-in:** recipes can be read by anyone with the link (the list, a recipe, its photos and edited translations). Everything else needs a signed-in user: editing, import, photo reading and machine translation. Accounts are created by an administrator in Amazon Cognito; there is no public sign-up. Sign-in is by password for now.

Not yet done, see [Status](#status): passkey and authenticator sign-in (blocked until the app has a custom domain), the per-user language setting, the browser tests, and the Safari list problem (see [Known issues](#known-issues)).

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

| Variable            | Purpose                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| `STORE`             | `file` (default) stores data in `./data`. `aws` uses DynamoDB and S3 (deployed). |
| `RECIPE_DATA_DIR`   | Optional. Moves the file store, for example in tests.                            |
| `COGNITO_ISSUER`    | The user pool's issuer URL.                                                      |
| `COGNITO_DOMAIN`    | The hosted sign-in domain, with `https://`.                                      |
| `COGNITO_CLIENT_ID` | The app client's id. The client needs the authorization code flow with PKCE.     |
| `SESSION_SECRET`    | At least 32 random characters. Signs the session cookies.                        |
| `AWS_REGION`        | Region for Textract and Translate.                                               |
| `AUTH`              | Leave unset. `off` disables sign-in (local development only).                    |

AWS credentials for Textract and Translate come from the standard AWS credential chain on your machine. Do not put keys in `.env`.

## Scripts

| Command                            | What it does                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`                      | Development server.                                                                  |
| `npm run build`                    | Production build.                                                                    |
| `npm run preview`                  | Serves the production build locally.                                                 |
| `npm run check`                    | Type check (svelte-check).                                                           |
| `npm run lint`                     | Prettier and ESLint.                                                                 |
| `npm test`                         | Unit tests (server and client projects).                                             |
| `npm run migrate:aws -- --dry-run` | Reads the local data folder and reports what would be copied to AWS. Writes nothing. |
| `npm run migrate:aws`              | Copies the local data folder into the AWS store. Safe to run again.                  |

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

All persistence goes through the `RecipeStore` interface in `src/lib/server/store.ts`. Routes never touch the files directly. Two backends:

- **File store** (`STORE=file`, the default, local development): `recipes.json`, `translations.json`, `state.json` and `images/` under `./data`. Back this folder up; it is not in git.
- **AWS store** (`STORE=aws`, deployed): one DynamoDB table for recipes, edited translations, cached machine translations and each user's language, and a private S3 bucket for the original photos. Key layout is in `src/lib/server/aws-store.ts`.

A guard test (`src/lib/server/guard.spec.ts`) checks that every API route needs a signed-in user and that the AWS store never reads the local folder.

## Deploying

The deployment uses SST v3 in `eu-west-1` (Ireland). It creates the table, the photo bucket, a Cognito user pool with no self sign-up, a sign-in domain, the SvelteKit site on CloudFront and a monthly cost alarm. Nothing deploys unless you run it.

1. Sign in to AWS on your machine (`aws login` or your usual profile). Set `BUDGET_EMAIL` to the address the cost alarm should email.
2. Set the session secret once per stage: `npx sst secret set SessionSecret <at least 32 random characters>`.
3. First deploy: `npx sst deploy --stage production`. It prints the site URL.
4. Second deploy, so the sign-in client accepts the site's address: `APP_ORIGIN=<that URL> npx sst deploy --stage production`. (The first deploy cannot know the address, so the sign-in callback is a placeholder until this step.) Production has been deployed with `APP_ORIGIN=https://dox9mfbva3xj.cloudfront.net` and `BUDGET_EMAIL` set. Repeat both variables on every production deploy, or the sign-in callback and the cost alarm email change.
5. Create each user in the Cognito console (User pools → Users → Create user), or with `aws cognito-idp admin-create-user --user-pool-id <pool id> --username <email> --user-attributes Name=email,Value=<email> Name=email_verified,Value=true`. Users cannot sign themselves up. Users are asked to choose their own password at the first sign-in.
6. Copy the local data into AWS (done for production on 2026-11-13), first as a dry run: `TABLE_NAME=<table> BUCKET_NAME=<bucket> npm run migrate:aws -- --dry-run`, then without `--dry-run`. The table and bucket names are printed by the deploy as outputs. Once it reports success, run it again to confirm nothing changes.

The Cognito hosted sign-in domain defaults to `recipes-<stage>`. Set `COGNITO_DOMAIN_PREFIX` before the first deploy if that name is taken.

Not yet set up: a custom domain (add the commented `domain` block in `sst.config.ts` and set `APP_ORIGIN` to match).

### Security notes

- Recipes can be read without a session (GET only, for the list, a recipe, its photos and edited translations). Every other page and `/api/**` route needs a session. Unauthenticated API calls get `401`; pages redirect to `/signin`.
- Machine translation needs a session, so translation spend stays with the household.
- The AWS budget alarm emails at 80% of $10 of actual spend and at a forecast of 100%. At 80% of actual spend, a budget action attaches a deny-all policy to the server's role, which stops the app's AWS calls. To undo it, detach `StopAppPolicy` from the server role in IAM.
- Sessions are HMAC-signed httpOnly cookies. The Cognito ID token is checked against the pool's published keys (RS256, issuer, client id, expiry).
- Sign-in uses the authorization code flow with PKCE, with a state check.
- The metered endpoints (translate, OCR, import) have a per-user rate limit. This is a safety net per server instance; the AWS budget alarm is the real cost cap.
- Image uploads are checked for size and for PNG or JPEG content.
- Recipe text is shown as text, never as HTML. Notes use a small markup subset (`src/lib/recipes/notes.ts`).

## Status

| Phase | Scope                                                                                                                                        | State                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1     | Storage interface                                                                                                                            | Done                                                                                                          |
| 2     | Cognito sign-in, rate limits                                                                                                                 | Done; sign-in works on the deployed site                                                                      |
| 3     | PWA: manifest, icons, install page, wake lock, offline reading, sign-out                                                                     | Done; icons are placeholders                                                                                  |
| 4     | Photo capture, list thumbnails, per-item notes, rich text, side-by-side translation edit, in-place language switch, tap targets and contrast | Done. The translated recipe body still waits for the translation service the first time a language is shown   |
| 5     | AWS (SST v3), DynamoDB and S3 storage, migration, budget alarm and stop, per-user language setting                                           | Deployed to production (eu-west-1) and migrated on 2026-11-13. The per-user language setting is not built yet |
| 6     | Browser tests for the main flows                                                                                                             | Not started                                                                                                   |

The domain is not chosen yet. The site runs on the default CloudFront address.

## Known issues

- **Safari:** the recipe list does not load in Safari ("Service Worker context closed" on reload). Firefox and Chrome work. Not fixed yet; offline reading must keep working.
- **Passkeys and authenticator codes:** not set up. Cognito will not require an authenticator code while the passkey setting is "single factor", and a passkey on the app's `*.cloudfront.net` address cannot be used on the Cognito sign-in domain. A custom domain shared by the app and the sign-in page is needed first.
- **Service worker updates:** an installed app keeps the old version until its browser swaps it. On iPhone, close the app fully and reopen it, or remove and re-add it; on Android, clear the app's storage.
- **Lambda runtime:** the server runs on Node 20. The AWS SDK warns that it will need Node 22 from January 2027.
