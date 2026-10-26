#!/bin/sh
# Copy only the files the public site serves into _site/, which deploy.yml
# uploads to Pages and CI checks. An allowlist: a new repo file stays
# unpublished until it is added here. Deliberately left out: worker/ (the
# chat assistant's source and wrangler.toml), README.md, .gitignore,
# _redirects, .github/, and the 404 page's scss sources.
# Run from the repo root.
set -eu
rm -rf _site
mkdir _site
cp -R index.html 404.html chat.html matrimony.html robots.txt sitemap.xml CNAME \
      assets 404-assets projects hamza-aziz-resume matrimony _site/
rm -rf _site/404-assets/scss

# Browsers and Cloudflare keep scripts and stylesheets for 4 hours, so give
# every local CSS/JS link a version (this commit) in the published pages:
# a new deploy is a new URL and nobody waits for a cache to expire.
VER=$(printf '%s' "${GITHUB_SHA:-$(git rev-parse HEAD)}" | cut -c1-12)
find _site -name '*.html' -exec sed -E -i \
  "s#((src|href)=\"(\.\./|/)?(404-)?assets/(css|js)/[^\"?]+\.(css|js))\"#\1?v=$VER\"#g" {} +
echo "staged $(find _site -type f | wc -l) files"
