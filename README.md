# hamzaaziz.dev

Source of [hamzaaziz.dev](https://hamzaaziz.dev/), the portfolio of Hamza Aziz, an AI Engineer working on production voice AI and computer vision.

It is a hand-written static site (HTML, CSS and vanilla JavaScript, no build step) served by GitHub Pages behind Cloudflare, plus one Cloudflare Worker that powers the site's AI chat assistant.

## Pages

| URL | Source | What it is |
|---|---|---|
| [`/`](https://hamzaaziz.dev/) | `index.html` | Portfolio: about, skills, experience timeline, projects, contact form |
| [`/projects/…`](https://hamzaaziz.dev/projects/voice-ai.html) | `projects/*.html` | Four case studies: voice AI ordering, conversational ERP, computer-vision attendance, CCTV face recognition |
| [`/chat.html`](https://hamzaaziz.dev/chat.html) | `chat.html` | Full-page view of the "Ask my AI assistant" chat (not indexed) |
| [`/hamza-aziz-cv/`](https://hamzaaziz.dev/hamza-aziz-cv/) | separate repo, [`hamza-aziz-ai/hamza-aziz-cv`](https://github.com/hamza-aziz-ai/hamza-aziz-cv) | Online CV, served by GitHub Pages as a project site |
| [`/matrimony`](https://hamzaaziz.dev/matrimony) | `matrimony.html` | Personal matrimony profile; links to the portfolio, deliberately not linked from it |
| any missing path | `404.html` + `404-assets/` | Custom not-found page |

## How it is built

- **Hosting:** GitHub Pages (branch `main`, root), custom domain in `CNAME`, DNS and proxy on Cloudflare.
- **Front end:** plain HTML/CSS/JS in `assets/`. Third-party pieces: [ScrollReveal](https://scrollrevealjs.org/) (vendored in `assets/js/`), the EmailJS browser SDK, and icon fonts ([Remix Icon](https://remixicon.com/); Font Awesome on the matrimony page; Boxicons on the 404 page).
- **Chat assistant:** `assets/js/chat.js` calls a Cloudflare Worker (`worker/`) that answers from the site's own text using Gemini, falling back to Workers AI. See [`worker/README.md`](worker/README.md).
- **Contact form:** [EmailJS](https://www.emailjs.com/) sends the message to Hamza and a confirmation to the visitor; the form checks for mistyped email domains and domains that cannot receive mail before sending.
- **Analytics:** Google Analytics 4 (loaded first-party through Cloudflare's Google tag gateway, with a fallback) and Cloudflare Web Analytics.
- **SEO:** `sitemap.xml`, `robots.txt`, canonical URLs, Open Graph tags and JSON-LD (`Person`, `WebSite`, `ProfilePage`) on the portfolio.

## Repository layout

| Path | Contents |
|---|---|
| `index.html`, `chat.html`, `matrimony.html`, `404.html` | Top-level pages |
| `projects/` | Case-study pages |
| `assets/css/`, `assets/js/`, `assets/img/`, `assets/pdf/` | Styles, scripts, images, CV PDF |
| `worker/` | Chat assistant Worker: source, knowledge builder, self-check |
| `.github/workflows/sitemap.yml` | Sets each sitemap `<lastmod>` from git history and resubmits the sitemaps to Search Console on push |
| `.github/workflows/worker.yml` | Rebuilds the chat knowledge, runs the self-check and deploys the Worker |
| `hamza-aziz-resume/`, `matrimony/` | Redirect stubs for old URLs |
| `_redirects` | Redirects for the old Netlify mirror |

## Running it locally

```bash
python -m http.server 8000
# then open http://localhost:8000/
```

Two things behave differently off the live domain: the chat assistant only accepts requests from `https://hamzaaziz.dev`, and the contact form sends real email, so do not submit it while testing.

## Contributing

This is a personal site, so outside pull requests are not expected. If you spot a broken link or a mistake, an issue or an email to hamza.aziz.dev@gmail.com is welcome.

## License

© Hamza Aziz. All rights reserved. The text, photos, CV and other documents in this repository are personal and are not licensed for reuse.
