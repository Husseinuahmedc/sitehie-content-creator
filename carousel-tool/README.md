# sitehie carousel-tool

CLI that renders Instagram carousel slides (PNG, 1080×1350 @ 3×) for the **sitehie** Arabic tech education brand.

Visual design is **100% theme-driven**. Content creators redesign slides by editing JSON — never the render engine or HTML structure.

## Quick start

```bash
cd carousel-tool
npm install
npx playwright install chromium

# Render an episode
node render.js --episode content/jwt.json --theme themes/default.theme.json --output output/jwt/

# Preview in browser
node render.js --episode content/jwt.json --preview

# List / validate themes
node render.js --list-themes
node render.js --validate-theme themes/default.theme.json
```

## Architecture

| Layer | Owns | Edit when… |
|-------|------|------------|
| `content/*.json` | Text, code, semantic markers | New episode / copy changes |
| `themes/*.theme.json` | Colors, fonts, sizes, positions | New look / redesign |
| `templates/*.html` | DOM structure only | New slide *type* |
| `render.js` | Engine | Bugfixes / new capabilities |

Templates never hardcode colors, font sizes, or coordinates. At render time the engine injects CSS custom properties from the active theme.

---

## (a) Add a new episode (content JSON only)

1. Copy an existing file:

```bash
cp content/jwt.json content/my-episode.json
```

2. Edit fields — **no styling allowed**:

```json
{
  "episode": "my-episode",
  "series": "Backend Basics Season 2",
  "readingTime": 3,
  "slides": [
    {
      "type": "cover",
      "iconAsset": "assets/icons/my-icon.png",
      "title": "عنوان الحلقة"
    },
    {
      "type": "quote",
      "text": "نص عربي كبير…",
      "highlights": ["كلمة مميزة"],
      "cyanWords": ["API"]
    },
    {
      "type": "code",
      "titleEn": "Title",
      "subtitleEn": "section",
      "code": "const x = 1;",
      "explanation": "شرح عربي مع token إنجليزي",
      "annotations": [{ "text": "ملاحظة", "target": "x" }]
    }
  ]
}
```

3. Render:

```bash
node render.js --episode content/my-episode.json -o output/my-episode/
```

PNGs land in `output/my-episode/slide_01.png` …

### Slide types

| `type` | Purpose | Key fields |
|--------|---------|------------|
| `cover` | Episode opener | `title`, `iconAsset` (optional), `series` override |
| `quote` | Big Arabic marketing line | `text`, `highlights[]`, `cyanWords[]` |
| `code` | Code + RTL explanation | `titleEn`, `subtitleEn`, `code`, `explanation`, `annotations[]` |

Progress bar and slide numbers are computed automatically from slide index / total.

---

## (b) Create a new visual theme (theme JSON only)

1. Copy the default theme:

```bash
cp themes/default.theme.json themes/my-brand.theme.json
```

2. Edit anything under:

- **`colors`** — background, primary, text, code surfaces, markers…
- **`fonts`** — drop a file into `templates/shared/fonts/`, then point `path` + `family`
- **`typography`** — per-role size/weight/line-height (`fontFamily` must reference a key in `fonts`)
- **`layout`** — every element position as `%` / `px` boxes (`top`, `left`, `width`, `center`…)
- **`effects`** — shadows, radii
- **`brand`** — handle, reading-time suffix

3. Validate, then render:

```bash
node render.js --validate-theme themes/my-brand.theme.json
node render.js -e content/jwt.json -t themes/my-brand.theme.json -o output/jwt-alt/
```

### Swap fonts without code changes

```text
templates/shared/fonts/MyFont.woff2   ← drop file
```

```json
"fonts": {
  "arabicPrimary": {
    "family": "My Font",
    "path": "shared/fonts/MyFont.woff2",
    "weight": 700,
    "format": "woff2"
  }
}
```

Then set `"fontFamily": "arabicPrimary"` on any typography role.

### Example alternate theme

`themes/alt-claymorphism.theme.json` — soft clay surfaces, Qahwa Arabic, different positions. Same content, different look:

```bash
node render.js -e content/jwt.json -t themes/alt-claymorphism.theme.json -o output/jwt-clay/
```

---

## Config (`config.json`)

| Key | Default | Meaning |
|-----|---------|---------|
| `width` / `height` | 1080 / 1350 | Canvas (Instagram 4:5) |
| `scale` | 3 | Device scale → retina PNG |
| `readabilityFloor` | 28 | Warn if auto-fit shrinks below this px |
| `defaultTheme` | `themes/default.theme.json` | Used when `--theme` omitted |

## Output summary

After each run the CLI prints slide count, output path, active theme, and any auto-fit warnings when text had to shrink under the readability floor.

## Project layout

```text
carousel-tool/
├── templates/          # structure only
│   ├── code-slide.html
│   ├── quote-slide.html
│   ├── cover-slide.html
│   └── shared/
│       ├── base.css
│       ├── slide-runtime.js
│       └── fonts/
├── themes/
│   ├── default.theme.json
│   ├── alt-claymorphism.theme.json
│   └── theme.schema.json
├── content/
├── output/
├── assets/icons/
├── config.json
└── render.js
```
