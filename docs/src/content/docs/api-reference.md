---
title: API Reference
description: Crypto REST API endpoints
---

Crypto runs a Fastify HTTP server alongside the Discord bot for health checks, the account/legal dashboard, Discord OAuth recovery flows, and Alchemy webhooks.

## Base URL

```
http://localhost:3000
```

---

## `GET /health`

Health check endpoint.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-03-22T12:00:00.000Z",
  "uptime": 3600.5
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` if the server is running |
| `timestamp` | string | Current server time (ISO 8601) |
| `uptime` | number | Server uptime in seconds |

---

## `GET /stats`

Public bot statistics.

**Response:**

```json
{
  "users": 42,
  "wallets": 336,
  "transactions": {
    "mainnet": 100,
    "testnet": 50,
    "total": 150
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `users` | number | Total registered users |
| `wallets` | number | Total wallets created |
| `transactions.mainnet` | number | Mainnet transaction count |
| `transactions.testnet` | number | Testnet transaction count |
| `transactions.total` | number | Combined total |

---

## `POST /webhooks/alchemy`

Receives [Alchemy Address Activity webhooks](https://docs.alchemy.com/reference/address-activity-webhook) to detect deposits.

**Headers:**

| Header | Description |
|--------|-------------|
| `x-alchemy-signature` | HMAC-SHA256 signature for payload verification |

**Request Body:**

Standard Alchemy webhook payload. See [Alchemy docs](https://docs.alchemy.com/reference/address-activity-webhook) for the full schema.

**Response:**

```json
{
  "ok": true,
  "credited": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Whether processing succeeded |
| `credited` | number | Number of deposits credited to users |

**Error Responses:**

| Status | Description |
|--------|-------------|
| `401` | Invalid or missing webhook signature |
| `500` | Internal processing error |
