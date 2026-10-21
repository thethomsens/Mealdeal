# Local restaurant pilot: Tooele area (checked 2026-10-21, NOT live)
- 28 independent/local spots (OSM returned 30 unbranded, minus chains; plus web search). 9 have no website in OSM.
- 17 have some online menu or order page; only 3 had prices we could read without JavaScript: Virg's, Rome Italian, and New Canton City (family dinners only).
- The rest are JS ordering apps (Square, menustic, custom React/Vercel sites with bot checks), sites that list no prices (Spiro's), or have no site.
- Terms: Vercel/Cloudflare bot checks (Canton City, Thai House, Nigh-Time, Vista Linda) are a clear "no automated access" signal. Do not get around them.
- Recommendation: owner-submitted or claimed listings plus the existing /admin review. Use a polite monthly fetch only for static HTML or PDF menus where robots.txt allows it, and flag price changes for review instead of auto-publishing. Treat Google Places/Yelp APIs as discovery only (their terms bar storing menus).
