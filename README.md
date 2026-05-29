# Zachary Lee Personal Website

Static personal website.

## Run locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy

This is a no-build site. It can be deployed directly with GitHub Pages, Netlify,
Cloudflare Pages, or any static file host.

This repository includes a root `CNAME` file for:

```txt
zachary-lee.com
```

## Visitor Counter

The visible counter calls `/api/visit`. For GitHub Pages hosting, deploy the
Cloudflare Worker in `visitor-counter-worker/` and route only `/api/visit*` to
that Worker from the Cloudflare dashboard.
