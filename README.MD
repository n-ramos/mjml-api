# MJML Server API Documentation

## Overview

Production-ready MJML rendering server built with Fastify.

## Endpoints

### 1. Health Check

**GET** `/health`

Check if the server is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-27T10:30:00.000Z"
}
```

**Example:**
```bash
curl http://localhost:3000/health
```

---

### 2. Single Render

**POST** `/render`

Render a single MJML template to HTML.

**Request Body:**
```json
{
  "mjml": "<mjml><mj-body>...</mj-body></mjml>"
}
```

**Success Response (200):**
```json
{
  "html": "<!DOCTYPE html>..."
}
```

**Error Response (400):**
```json
{
  "error": "MJML compilation failed",
  "code": "COMPILATION_ERROR",
  "errors": [
    {
      "line": 5,
      "message": "Unknown tag: <mj-invalid>",
      "tagName": "mj-invalid"
    }
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "mjml": "<mjml><mj-body><mj-section><mj-column><mj-text>Hello World</mj-text></mj-column></mj-section></mj-body></mjml>"
  }'
```

**Constraints:**
- MJML content max size: 1MB
- Required field: `mjml` (string)

---

### 3. Batch Render

**POST** `/render-batch`

Render multiple MJML templates at once.

**Request Body:**
```json
{
  "items": [
    {
      "id": "template-1",
      "mjml": "<mjml>...</mjml>"
    },
    {
      "id": "template-2",
      "mjml": "<mjml>...</mjml>"
    }
  ]
}
```

**Success Response (200):**
```json
{
  "summary": {
    "total": 2,
    "success": 2,
    "failed": 0
  },
  "results": [
    {
      "id": "template-1",
      "success": true,
      "html": "<!DOCTYPE html>..."
    },
    {
      "id": "template-2",
      "success": true,
      "html": "<!DOCTYPE html>..."
    }
  ]
}
```

**Partial Failure Response (200):**
```json
{
  "summary": {
    "total": 2,
    "success": 1,
    "failed": 1
  },
  "results": [
    {
      "id": "template-1",
      "success": true,
      "html": "<!DOCTYPE html>..."
    },
    {
      "id": "template-2",
      "success": false,
      "error": "MJML compilation failed",
      "code": "COMPILATION_ERROR",
      "errors": [...]
    }
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/render-batch \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "id": "email-1",
        "mjml": "<mjml><mj-body><mj-section><mj-column><mj-text>Email 1</mj-text></mj-column></mj-section></mj-body></mjml>"
      },
      {
        "id": "email-2",
        "mjml": "<mjml><mj-body><mj-section><mj-column><mj-text>Email 2</mj-text></mj-column></mj-section></mj-body></mjml>"
      }
    ]
  }'
```

**Constraints:**
- Max items per batch: 100
- Min items: 1
- Each MJML content max size: 1MB
- Items can have optional numeric or string IDs (defaults to index)

---

### 4. Server Info

**GET** `/info`

Get information about the server.

**Response:**
```json
{
  "name": "MJML Rendering Server",
  "version": "1.0.0",
  "mjmlVersion": "4.14.1",
  "nodeVersion": "v20.x.x",
  "uptime": 3600.5,
  "timestamp": "2025-10-27T10:30:00.000Z",
  "endpoints": {
    "health": { "method": "GET", "path": "/health" },
    "render": { "method": "POST", "path": "/render" },
    "renderBatch": { "method": "POST", "path": "/render-batch" },
    "info": { "method": "GET", "path": "/info" }
  }
}
```

**Example:**
```bash
curl http://localhost:3000/info
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_INPUT` | 400 | Missing or invalid MJML content |
| `CONTENT_TOO_LARGE` | 413 | MJML content exceeds 1MB |
| `COMPILATION_ERROR` | 400 | MJML syntax errors |
| `NO_OUTPUT` | 500 | Failed to generate HTML output |
| `TOO_MANY_ITEMS` | 413 | Batch size exceeds 100 items |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `NOT_FOUND` | 404 | Endpoint not found |

---

## Docker Usage

### Build
```bash
docker build -f Dockerfile.mjml -t mjml-server .
```

### Run
```bash
docker run -p 3000:3000 mjml-server
```

### With environment variables
```bash
docker run \
  -p 3000:3000 \
  -e LOG_LEVEL=debug \
  -e NODE_ENV=development \
  mjml-server
```

---

## Docker Compose

```yaml
mjml:
  build:
    context: .
    dockerfile: docker/mjml/Dockerfile
  container_name: app_mjml
  environment:
    LOG_LEVEL: info
    NODE_ENV: production
  ports:
    - "3000:3000"
  networks:
    - app-network
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 10s
```

---

## Performance

- **Single render**: ~50-200ms depending on MJML complexity
- **Batch render (10 items)**: ~500ms-2s
- **Memory usage**: ~80-150MB base + rendering overhead

---

## Logging

Server uses Pino for structured logging.

Log levels:
- `debug`: Detailed rendering information
- `info`: Normal operation events
- `warn`: Non-critical issues
- `error`: Critical errors

Set via `LOG_LEVEL` environment variable.

---

## Example MJML Template

```mjml
<mjml>
  <mj-head>
    <mj-title>Welcome Email</mj-title>
    <mj-preview>Thanks for joining us!</mj-preview>
  </mj-head>
  <mj-body>
    <mj-container>
      <mj-section background-color="#f4eee3">
        <mj-column>
          <mj-text align="center" font-size="48px" font-weight="bold" color="#626262">
            Welcome!
          </mj-text>
        </mj-column>
      </mj-section>
      <mj-section>
        <mj-column>
          <mj-text font-size="16px" align="center" color="#626262">
            Thanks for joining our community
          </mj-text>
          <mj-button href="https://example.com/confirm">
            Confirm Email
          </mj-button>
        </mj-column>
      </mj-section>
    </mj-container>
  </mj-body>
</mjml>
```
