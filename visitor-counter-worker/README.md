# Visitor Counter Worker

Cloudflare Worker + Durable Object backing the visible visitor counter on the
static homepage.

## Deploy

```bash
npm install
npm run deploy
```

After deployment, add a Cloudflare Worker route for the custom domain:

```txt
zachary-lee.com/api/visit*
www.zachary-lee.com/api/visit*
```

These routes are also declared in `wrangler.toml`, so `npm run deploy` can add
them if your Cloudflare account has access to the `zachary-lee.com` zone.

Keep GitHub Pages as the origin for the rest of the site. Cloudflare should only
route `/api/visit` to this Worker.

## API

```txt
POST /api/visit
```

Increments the page-view counter and returns:

```json
{ "count": 1 }
```

```txt
GET /api/visit
```

Returns the current count without incrementing it.
