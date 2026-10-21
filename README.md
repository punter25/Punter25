# Punter25

A personal race-card analysis and selection tool for the Hollywoodbets Punters Challenge — South African, Hong Kong and UK racing.

**Open the app:** https://punter25.github.io/Punter25/

## Features
- Region profiles for **SA, HK and UK**, each with its own rating factors and weights.
- **Computaform PDF import** (SA & UK): upload the PDF and it's read on your device. The two-column *Fields, Ratings* page is read by position (No-Draw, horse, weight, stars, comment, Computaform odds, Computaform & Speed ratings) and jockeys/trainers are matched from the Jockey and Trainer index pages. Stars, Computaform-rating rank and Speed-rating rank pre-fill Form, Class and Last 600m. UK Computaform OnLine cards (e.g. Newcastle) are read race by race: draw, weight (kg), handicap rating, speed rating, recent form figures, jockey, trainer, betting forecast, Top 3 Computer Ratings and last-run comments; recent form and Top 3 rank pre-fill Form and Class. Other layouts fall back to a plain-text reader.
- **HKJC paste import** for Hong Kong: copy a race from the [HKJC Race Card](https://racing.hkjc.com/en-us/local/information/racecard) (heading + runner table) and paste it on the Import tab. Reads horse no., last 6 runs, horse, weight, jockey (with claim), draw, trainer, rating and rating +/-, gear, days since last run, plus race time, distance, course, going and class. Pre-fills Form, Class move and Draw. Paste the HKJC betting-page table (Win column) to add odds. Manual / Quick add entry still works too.
- Rate each runner 1–10 per factor → rating, win chance and **expected Punters Challenge points** (finishing-position points plus the winner's SP bonus).
- Auto-select per race or the whole card, with TOP / BANKER / VALUE flags.
- **Model A vs Model B**: every race shows both models' picks and expected points (A xPts / B xPts). Model B has its own factor weights, trust slider and a cap on the winner bonus for estimated prices (default: Class weight +0.08, estimated prices count as at most 8/1). Type the first three horse numbers under each race and both models are scored; Stats compares points, winners, top-3 rate and head-to-head by region. Model A is your selection slip.
- Selection slip you can copy, share (e.g. WhatsApp) or print.
- Results entry with automatic points, plus stats by region and meeting history.
- Data is stored in your browser only. Use **Stats → Export backup** to keep a copy.

## Install on your phone
Open the link in Chrome on Android → menu (⋮) → **Add to Home screen**.

## Scoring used
Points = field size − finishing position + 1. A winner also earns its SP as decimal odds (e.g. 12/1 → +13). Use "Points override" for dead-heats.

This tool does not place bets or connect to Hollywoodbets.
