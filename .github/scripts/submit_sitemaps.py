"""Resubmit hamzaaziz.dev's sitemaps through the Search Console API.

There is no API for the "Request indexing" button. Resubmitting a sitemap
is the supported equivalent: Google re-reads it, sees the new <lastmod>
values, and re-crawls what changed. Do NOT swap this for the Indexing API;
Google restricts that to JobPosting and BroadcastEvent pages.

Credentials come from the GSC_SERVICE_ACCOUNT_JSON secret. The service
account has no Google Cloud role; its only permission is "Full" on the
Search Console property, which is all sitemaps.submit needs.
"""
import json
import os
import sys
import urllib.parse

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

# Domain property, so the site id is sc-domain:, not a URL.
SITE = "sc-domain:hamzaaziz.dev"
SITEMAPS = [
    "https://hamzaaziz.dev/sitemap.xml",
    # Served from the hamza-aziz-cv repo but under the same property, so
    # this account can resubmit it too. Pushes to that repo do not run this.
    "https://hamzaaziz.dev/hamza-aziz-cv/sitemap.xml",
]
API = "https://www.googleapis.com/webmasters/v3/sites/{site}/sitemaps/{feed}"


def main() -> int:
    raw = os.environ.get("GSC_SERVICE_ACCOUNT_JSON")
    if not raw:
        print("::error::GSC_SERVICE_ACCOUNT_JSON is not set", file=sys.stderr)
        return 1
    creds = service_account.Credentials.from_service_account_info(
        json.loads(raw), scopes=["https://www.googleapis.com/auth/webmasters"]
    )
    session = AuthorizedSession(creds)
    failed = False

    for feed in SITEMAPS:
        url = API.format(site=urllib.parse.quote(SITE, safe=""), feed=urllib.parse.quote(feed, safe=""))
        r = session.put(url)
        if r.status_code not in (200, 204):
            failed = True
            hint = ""
            if r.status_code == 403:
                hint = " (is the service account a Full user on the Search Console property?)"
            print(f"::error::submit {feed} -> HTTP {r.status_code}{hint}: {r.text[:300]}")
            continue

        # Read back what Search Console now holds, so the log proves the
        # submission landed instead of just that the PUT returned 2xx.
        s = session.get(url).json()
        print(
            f"OK  {feed}\n"
            f"    lastSubmitted={s.get('lastSubmitted')}  lastDownloaded={s.get('lastDownloaded')}\n"
            f"    isPending={s.get('isPending')}  errors={s.get('errors')}  warnings={s.get('warnings')}"
        )

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
