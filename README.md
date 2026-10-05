# Icarus Fall · Disc Golf League

Scorecards and standings for a weekly disc golf league, a bit like UDisc or Disc Golf Metrix, but just for your league.

- **Players don't log in.** They pick their name from a list, or add themselves the first time.
- **One phone can keep score for the whole flight.** Each player picks their own round type: first round, repeat round, or round in advance.
- **Standings update by themselves** as soon as a card is submitted, with separate **Men** and **Women** tables.
- **Admin tab:** create leagues, set the number of weeks, close holes for a week, add/edit/delete players, and fix or add rounds.
- **Works on the course without signal:** the card is saved on the phone, and scores upload when the signal comes back.

Built with Angular 21 + Angular Material, Firebase (Firestore + Auth) for data, and hosted for free on GitHub Pages.

---

## League rules (how the app counts)

| Rule | How it works |
|---|---|
| Weeks | Week 1 starts on the league's start date; every week is 7 days. The admin can force a different current week (for example, after a rained-out week). |
| Ranking | **More weeks played first, then lowest total to par.** Every week that has started counts, so someone who played 3 weeks at −23 can't beat someone who played all 8 weeks at −20. |
| Drop worst weeks (optional) | The admin can drop each player's N worst weeks. A missed week counts as the worst possible week, so it is dropped first. |
| First round | One per week, for the current week. Someone who joins in week 4 just starts in week 4. |
| Repeat round | One per week. **The repeat always counts instead of the first round, even if it's worse.** Only for the current week, or for next week's round played in advance. Past weeks can't be repeated. |
| Round in advance | Play next week's round early. It shows on the table straight away and counts once its week starts. It can be repeated once, now or when its week arrives. |
| Closed holes | The admin can close holes for a single week (e.g. 9 and 10 when they're slippery). They are left off that week's scorecard. Totals compare scores to par, so a shorter round is still fair. |

---

## Try it locally

```bash
npm install
npm start
```

Open http://localhost:4200. The app uses Firebase when `public/firebase-config.json` exists (see below). Without that file it runs in **demo mode**: it fills in a sample league and keeps everything in your browser, the Admin button signs you in as a demo admin, and **Admin → Reset demo** restores the sample data. To try something without touching the real league, rename the file and reload.

```bash
npm test          # unit tests for the league rules (src/app/core/league-math.spec.ts)
```

---

## Go live: Firebase (free, about 10 minutes)

GitHub Pages can only host files. The scores need a shared database, which is Firebase. The free Spark plan needs no credit card and is far more than a league needs: a whole league loads in about 10 document reads.

1. **Create a project** at https://console.firebase.google.com. Google Analytics is not needed.
2. **Firestore:** *Databases & Storage → Firestore → Create database*, **Standard edition**, pick a region near you.
3. **Rules:** open the *Rules* tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
4. **Authentication:** *Authentication → Get started*, then under *Sign-in method* enable:
   - **Anonymous** (players get an invisible account, so there's still no login screen)
   - **Google** (admins sign in with their Gmail; pick your Gmail as the support email)
5. **Web app config:** *Project settings (gear) → General → Your apps → Web (`</>`)*, register an app (no hosting), and save its values as **`public/firebase-config.json`**:
   ```json
   {
     "apiKey": "AIza…",
     "authDomain": "<project-id>.firebaseapp.com",
     "projectId": "<project-id>",
     "storageBucket": "<project-id>.firebasestorage.app",
     "messagingSenderId": "…",
     "appId": "1:…:web:…"
   }
   ```
   This file is **git-ignored**, so it never goes to GitHub. The deploy workflow gets it from a repository secret instead (see below).
6. **Make yourself admin:** run the app, open **Admin → Sign in with Google**. The page shows your **UID** with a copy button.
   In Firestore, *Start collection* `admins` → Document ID = **that UID** → add any field (e.g. `name: "Antonio"`) → Save. The admin page unlocks by itself.
7. **Authorized domain:** *Authentication → Settings → Authorized domains → Add domain* `<your-github-user>.github.io` (`localhost` is already allowed).

Then, in **Admin**, **create the league**: name, first day of week 1, number of weeks, holes and pars. The first league automatically becomes the active league.

> To add another admin: they sign in with Google on the Admin tab, send you the UID it shows, and you add `admins/<their UID>`.

---

## Publish on GitHub Pages

The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) tests, builds and deploys on every push to `main`.

1. In the GitHub repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `FIREBASE_CONFIG`
   - Secret: the **whole contents** of your `public/firebase-config.json`

   The workflow writes it back into `public/firebase-config.json` while building, so the keys stay out of the repo. If the secret is missing, the build stops with a clear error.
3. Push to `main`:
   ```bash
   git add .
   git commit -m "Disc golf league app"
   git push -u origin main
   ```
4. Watch it under the **Actions** tab. The site will be at `https://<your-github-user>.github.io/<repo-name>/` (for this repo: https://antgrigic.github.io/icarus-fall/).

The build uses the repo name as the base path automatically. GitHub Pages has no fallback for app routes like `/standings`, so the workflow copies `index.html` to `404.html`, and deep links still open the app.

On phones, use **Add to Home Screen**: the app installs like a normal app and opens without signal.

### About the Firebase keys

Keeping `firebase-config.json` out of git means the keys aren't in the repo, and GitHub won't send "secret found" alerts. In any browser app, though, they are still readable by anyone who opens the published site: the browser needs them to reach Firebase. That's normal for Firebase, and what really protects the league is:

1. **`firestore.rules`**: players can only add rounds to empty slots; only admins can change or delete anything.
2. **Locking the key to your sites** (recommended, 2 minutes): open the [Google Cloud credentials page](https://console.cloud.google.com/apis/credentials) for your project → the **Browser key (auto created by Firebase)** → **Application restrictions: Websites** → add
   `https://<your-github-user>.github.io/*`, `http://localhost:4200/*` and `https://<project-id>.firebaseapp.com/*` (Google sign-in needs that last one) → **Save**. Other websites can then no longer use your key.

---

## How data is stored (Firestore)

```
config/app                       { activeLeagueId }
leagues/{leagueId}               name, startDate, totalWeeks, holes[{number, par}], dropWorst,
                                 currentWeekOverride, weeks: { "4": { disabledHoles: [9, 10] } }
leagues/{leagueId}/weeks/{week}  { rounds: { "<playerId>_<attempt>": Round } }
directory/players                { players: { "<playerId>": { firstName, lastName, division } } }
admins/{uid}                     exists = that signed-in user is an admin
```

Every player has two slots per week: attempt `1` (first round or advance round) and attempt `2` (the repeat). The rules let players **add** a round to an empty slot but never overwrite one, so the database itself guarantees "only one repeat" and that nobody can change someone else's score. Only admins can edit or delete. Each round stores its holes and pars, so changing the course later doesn't change old results.

## Project structure

```
src/app/
  core/league-math.ts      all league rules: current week, round options, standings (unit-tested)
  core/models.ts           League, Player, Round types
  data/data-store.ts       app-wide signals + write methods used by the pages
  data/firebase-backend.ts Firestore + Auth (lazy-loaded)
  data/local-backend.ts    demo mode (localStorage)
  data/firebase.config.ts  loads public/firebase-config.json (git-ignored) at startup
  play/card.service.ts     the card in progress, saved on the phone
  pages/standings          league table, Men / Women
  pages/play               set up a card: players + round type per player
  pages/scorecard          hole-by-hole scoring, review, submit
  pages/player             one player's rounds, hole by hole
  pages/admin              league, weeks & closed holes, players, rounds
public/firebase-config.json  your Firebase keys (git-ignored, not in the repo)
firestore.rules            security rules (paste into Firebase)
```
