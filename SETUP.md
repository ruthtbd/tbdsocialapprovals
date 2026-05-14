# Post Approval App — Setup

## 1. Supabase (free database + storage)

1. Go to [supabase.com](https://supabase.com) → New project (free tier)
2. Once created, go to **SQL Editor** and paste the contents of `supabase-schema.sql` — click Run
3. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

## 2. Add environment variables

Open `.env.local` and replace the placeholders:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

## 3. Deploy to Vercel (free)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → import the repo
3. Add the two env vars in Vercel's **Environment Variables** panel
4. Deploy — done!

## 4. How to use

- **Admin:** `/admin` — create campaigns, upload posts (images + videos), copy the client review link
- **Client:** share the `/review/[token]` link — they see all posts, can play videos, approve or request changes post by post

## Notes

- Vercel free tier: unlimited deployments, 100GB bandwidth/month
- Supabase free tier: 500MB storage, 50K API requests/day — plenty for this use case
- Delete campaigns after posts are live to keep storage tidy
