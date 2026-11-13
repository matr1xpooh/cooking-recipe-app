# Recipe App — Product & Architecture Prompt

Use this document as the standing brief for any work on this repository.

## 1. Purpose

A personal recipe book for a small group of known users (household, family, friends). Users save recipes they find in videos and on web pages, keep their own notes and photos with them, and read every recipe in their preferred language. The app is used mostly on phones, in the kitchen.

## 2. Users and access

- 1–10 known users. No public sign-up.
- Recipes can be read by anyone with the link: the list, a recipe, its photos and its edited translations (GET only). Everything else needs a signed-in user: pages redirect to sign-in, API routes answer 401.
- Machine translation is for signed-in users only, so translation spend stays with the household.
- Sign-in uses Cognito's hosted sign-in (managed login) with the authorization code flow and PKCE. The session is a signed, httpOnly cookie that lasts 8 hours. Sign-in is by password for now; passkeys and an authenticator code are planned but blocked (see section 7).
- All users share one recipe collection.

## 3. Functionality

### 3.1 Recipes

- A recipe has: title, optional source URL (video or web page), optional video start time in seconds, ingredient list, ordered steps, notes, tags, and zero or more images.
- Create, edit, archive, restore, and delete recipes. Delete asks for confirmation.
- A link with a start time opens the video at that time.
- Duplicate rule: two recipes are duplicates when source URL, start time, and title all match. Saving a duplicate is rejected and the existing recipe is shown. Several dishes from one video are allowed.

### 3.2 Import

- **From a URL:** fetch the public page and pre-fill title, ingredients, steps, and a picture. For video descriptions, drop credit, hashtag, and sign-off lines. Fetching blocks private and loopback addresses.
- **From an image:** the user takes a photo or picks a screenshot; OCR (AWS Textract) turns it into ingredient lines.
- Every imported field stays editable. The recipe records where its ingredient list came from: typed, web, or image.
- Target: a recipe imported and saved in under 30 seconds.

### 3.3 Notes

- Free-form notes per recipe, plus notes attached to an individual ingredient or step.
- Basic rich text (bold, italic, lists, links).

### 3.4 Photos

- Several images per recipe, shown as a gallery on the recipe page and in the form.
- On a phone, "Add photo" opens the camera or the photo library.
- Images up to 5 MB, PNG or JPEG; originals are kept.

### 3.5 Tags and search

- Built-in tags: meat, poultry, fish, vegetarian, soup, dessert, baking. Users can type new tags; a typed tag becomes available on every recipe.
- Up to 10 tags per recipe, each up to 30 characters, stored lowercase.
- Tag suggestions come from the ingredient list.
- Tag manager page: merge tags, and remove a tag from all recipes after confirmation.
- Search recipes by title, ignoring case and accents. Filter by tag and by archived state.

### 3.6 Languages

- Interface languages: Catalan, Spanish, English, Russian. Switching language takes under 100 ms and is remembered per user.
- Recipe content is machine-translated (AWS Translate) into the selected language on demand and cached; the cache entry is keyed by a hash of the original text.
- A user can edit a translation by hand. When the original recipe later changes, the edited translation is flagged as out of date. A user can reset it to the machine translation.
- Tags display in the selected language.

### 3.7 Phone experience

- Mobile-first layout; usable one-handed with wet hands: large tap targets, high contrast.
- Installable to the home screen from a link (Progressive Web App): app icon, full-screen launch, splash screen.
- The screen stays awake while a recipe is open (Screen Wake Lock API).
- Recipes already viewed open without a network connection (read-only offline).

## 4. Architecture (decided)

### 4.1 Shape

- One SvelteKit codebase holds the UI and the server API (`src/routes/api/**`). There is no separate native app and no separate backend service.
- The app ships to phones as a PWA: users open a URL and choose "Add to Home Screen".
- Camera access uses `<input type="file" accept="image/*" capture="environment">`.

### 4.2 AWS deployment

- Infrastructure as code with SST v3: `sst.aws.SvelteKit` → server on AWS Lambda, static assets on S3, served through CloudFront.
- Custom domain and TLS certificate through Route 53 and ACM. **Deferred:** no domain has been chosen. The first deployment uses the default CloudFront address; the domain block stays commented in `sst.config.ts` until then.
- Storage:
  - Recipes, tags, and translation cache: DynamoDB (one table, on-demand billing).
  - Images: private S3 bucket; served through the app or short-lived signed URLs.
- The Lambda's IAM role grants Textract `DetectDocumentText`, Translate `TranslateText`, Comprehend `DetectDominantLanguage` (Translate's automatic language detection uses it), and access to the table and bucket — nothing else. No AWS keys in code or environment files.
- Authentication: Amazon Cognito user pool with admin-created users, enforced in `hooks.server.ts`.
- AWS Budgets at $10/month: an email at 80% of actual spend and at a forecast of 100%. A budget action at 80% of actual spend attaches a deny-all policy (`StopAppPolicy`) to the server's role, so the app can no longer reach its table, photos, Translate or Textract. Budgets updates spend only a few times a day, so the stop can come hours late.

### 4.3 Storage abstraction

- All persistence goes through one interface, `RecipeStore` in `src/lib/server/store.ts`. Routes depend on the interface only. Implementations: local filesystem (development, wraps `src/lib/server/recipe-data.ts` and `translation-overrides.ts`) and DynamoDB + S3 (deployed), selected by the `STORE` environment variable.
- A one-off script (`scripts/migrate-to-aws.ts`) migrates `data/recipes.json`, `data/translations.json`, and `data/images/**` into DynamoDB and S3. Run for production on 2026-11-13: 46 recipes, their photos and 2 edited translations.
- The machine-translation cache is on the server, in DynamoDB, keyed by a hash of the original text and the target language. A translation is only made once for everyone.

### 4.4 Distribution

- The install link is the app URL. An `/install` page shows a QR code and step-by-step "Add to Home Screen" instructions for iPhone (Safari → Share → Add to Home Screen) and Android (Chrome → menu → Install app). Done: the QR code is made in the browser from the page's own address.

## 5. Quality bar

- TypeScript strict; `npm run check`, `npm run lint`, and `npm test` pass before each commit.
- Unit tests for parsing, validation, duplicate detection, tag logic, and translation caching; browser tests for the main flows.
- No secrets in the repository.

## 6. Screens

1. **Recipe list** — title, with sign-out (or the sign-in icon for visitors) at the top right; language switch and text size; text links to add a recipe and manage tags; Active and Archived tabs; search; tag filters folded behind a Filters button, with Select beside it; cards with photo, title, tags.
2. **Recipe page** — gallery, title, source link (with start time), ingredients, steps, inline notes, tags, language switch, edit.
3. **New / edit recipe** — import from URL, import from photo, then the editable form.
4. **Translation edit** — original and translation side by side, out-of-date flag, reset.
5. **Tag manager** — list with counts, merge, remove.
6. **Sign in** and **Install** pages.

## 7. Status and decisions (2026-11-13)

See [README.md](README.md) for how to run the app and the current phase table.

| Phase | Scope                                                                                                                                              | State                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1     | Storage interface (`RecipeStore`)                                                                                                                  | Done                                                                                                 |
| 2     | Cognito sign-in, per-user rate limits                                                                                                              | Done. Sign-in works on the deployed site                                                             |
| 3     | PWA: manifest, icons, install page with QR, wake lock, offline reading, sign-out                                                                   | Done. Icons are placeholders                                                                         |
| 4     | UI gaps: photo capture, list thumbnails, per-item notes, rich text, side-by-side translation edit, language switch speed, tap targets and contrast | Done. Language switch takes about 10 ms; translated text still loads from the service on first view  |
| 5     | AWS: SST v3, DynamoDB and S3 storage, migration, budget alarm and stop, per-user language setting, server-side translation cache                   | Deployed to production (eu-west-1) and migrated on 2026-11-13. Per-user language saved on the server |
| 6     | Browser tests for the main flows                                                                                                                   | Not started                                                                                          |

Decisions made along the way:

- Rate limits are per user, in memory, per server instance. They are a safety net; the AWS Budget alarm is the real cost cap.
- Local development bypasses sign-in only with `AUTH=off`. There is no default bypass, so a deployed server never runs without sign-in by accident.
- The per-user language is saved on the server (DynamoDB, under the user's account) when the user switches language, and applied at sign-in when the browser has no language cookie. The cookie stays the fast path. Signed-out visitors only get the cookie.
- Notes stay in the same list as the items they belong to: a line starting with "> " is a note on the line above it ("> - " for a bullet), and a line starting with "# " is a heading. No schema change was needed.
- Links in notes accept only http and https addresses. Link text is plain (no nested styling).
- Language change re-renders the page in place.
- The archive is two tabs: Active and Archived.
- Machine translation is for signed-in users only (2026-11-13). Signed-out visitors see the original text.
- Passkeys and authenticator codes are blocked for now. Cognito will not require an authenticator code while the passkey setting is "single factor", and a passkey on `*.cloudfront.net` cannot be used on the Cognito sign-in domain. Both need a custom domain shared by the app and the sign-in page. The two settings were tried on 2026-11-13 and reverted.
- Text size: an A− / A+ control on the list header steps the root font size from 50% to 150%, saved per device (issue #20).
- Sign-out is an icon (a door with an arrow) at the top right of the list. Visitors see a sign-in icon there.
- Short Cyrillic text that Translate cannot detect is retried with Russian as the source language.
- Deploys need `APP_ORIGIN` (the site address) and `BUDGET_EMAIL` set; see the README.
- Repository hygiene: the README is kept current with each phase. Untracked folders such as `Claude outputs/` are not committed.
