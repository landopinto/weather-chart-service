# Weather Chart Service

Generates a Munich weather PNG chart for Telegram morning briefings.

## Deploy to Railway

1. Create a new GitHub repo and push this folder to it
2. In Railway → New Project → Deploy from GitHub repo
3. Add environment variable: `OWM_API_KEY` = your OpenWeatherMap key
4. Railway auto-detects the Dockerfile and deploys

## Endpoints

### GET /chart?apikey=YOUR_OWM_KEY
Fetches live OWM data and returns a PNG.

### POST /chart
Accepts pre-fetched OWM data (more efficient — avoids double API call from n8n):
```json
{
  "list": [...],   // OWM forecast list array
  "city": { "timezone": 3600 }
}
```
Returns PNG image.

### GET /health
Returns `{ "status": "ok" }`

## n8n integration

In your morning briefing workflow, after the Weather Munich HTTP node:

1. Add an **HTTP Request** node:
   - Method: POST
   - URL: https://YOUR-RAILWAY-URL/chart
   - Body: JSON
   - Body content: `={{ { "list": $('Weather Munich').item.json.list, "city": $('Weather Munich').item.json.city } }}`
   - Response format: **File**

2. Add a **Telegram** node:
   - Operation: **Send Photo**
   - Chat ID: `={{ $('Telegram Trigger').item.json.message.chat.id }}`
   - Photo: `={{ $json.data }}`
