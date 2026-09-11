# My Cal
Personal food journal on the existing owner-only Site. The previous gallery remains at /gallery.

## Activate AI later
Set OPENAI_API_KEY as a secret using Sites environment variables, then deploy the saved Site version to apply it. Never paste secrets in frontend code, git, localStorage, or the hosting manifest. No key is needed for manual meals, totals, photos, goals, or history.

Models verified against official OpenAI documentation on 2026-09-10:
- Photos: gpt-4.1-mini ($0.40 / 1M input tokens, $1.60 / 1M output).
- Text: gpt-4o-mini ($0.15 / 1M input tokens, $0.60 / 1M output).
- Voice: gpt-4o-mini-transcribe (estimated $0.003 / minute).

This is a low-cost starting configuration, not a validated nutrition benchmark. Photo portions, oils and sauces are uncertain. Review estimates, include measured amounts where possible, and correct labels/servings before saving. No automatic expensive fallback, search, or full-journal context is sent. Responses store=false. Provider data policies still apply.

API use is capped at 50 attempts per user per UTC day, including transcription and failed provider requests. No automatic retries. Photo upload is 4 MiB max after browser resizing to 1280px. Voice notes are 10 MiB max; in-app recording is limited to two minutes.

Official sources:
https://developers.openai.com/api/docs/models/gpt-4.1-mini
https://developers.openai.com/api/docs/models/gpt-4o-mini
https://developers.openai.com/api/docs/pricing
https://developers.openai.com/api/docs/guides/images-vision
https://developers.openai.com/api/docs/guides/structured-outputs
https://developers.openai.com/api/docs/guides/speech-to-text

## Storage and security
D1 stores meals, goals, photo ownership, and the daily AI request counter. R2 stores photos. New journal routes enforce server-side ChatGPT identity, user-scoped queries, bounded request bodies, and same-origin writes. Owner-only platform access is retained. Audio is sent for transcription, not saved to R2. No meal data is seeded in production.
