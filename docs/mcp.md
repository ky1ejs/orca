# MCP servers

Orca exposes its tools to agents through two MCP servers. They share most tools but run in different places.

|               | Local (desktop app)                                    | Remote (backend)                        |
| ------------- | ------------------------------------------------------ | --------------------------------------- |
| URL           | `http://127.0.0.1:<hook-port>/mcp`                     | `https://<backend-host>/mcp`            |
| Runs in       | The PTY daemon's hook server (`web/src/shared/hooks/`) | The Bun backend (`backend/src/mcp/`)    |
| Auth          | The desktop app's stored JWT                           | OAuth sign-in, or a static bearer token |
| Configured by | Orca, automatically, for agents it launches            | You, in any MCP client                  |

Use the local server for agents Orca launches on your machine. Use the remote server for anything else: agents on another machine, cloud sessions, or any MCP client that cannot reach the desktop app.

## Tools

Both servers expose the workspace, initiative, project, task, label, member, task-link and `get_docs` tools.

The local server also has tools that need the desktop app:

- `get_current_task` and `update_task_status` resolve the task from the agent's terminal session (`X-Orca-Session-Id`).
- `get_logs` and `get_perf_logs` read the daemon and main-process log files.

The remote server has no session, so pass task IDs explicitly. On both servers, `create_task` takes an optional `sourceTaskId` (a task UUID in the same workspace) and adds a `CREATED_FROM` link to it. The tool returns an error if that task is missing or in another workspace. When `sourceTaskId` is omitted, the local server links to the session's task instead.

## Connecting to the remote server

The server URL is `https://orca-api.fly.dev/mcp`. Add it to your MCP client and sign in with your Orca email and password when the client opens the Orca page.

**Claude (web, desktop, iOS and Android):** go to **Customize → Connectors → + Add → Add custom connector**. Paste the URL. If Claude asks how to register, choose **Automatic registration**: Orca supports Dynamic Client Registration, not Claude's published client identity. Claude opens the Orca sign-in page; choose **Allow**. A connector added on web or desktop is also available in the mobile apps.

**Claude Code:**

```bash
claude mcp add --transport http orca https://orca-api.fly.dev/mcp
```

Then run `/mcp` in a session, pick `orca` and choose **Authenticate**. Claude Code opens the sign-in page in your browser.

Other clients that implement the MCP authorization spec work the same way: they find the sign-in flow from the URL alone.

### Static bearer token

Clients that cannot do OAuth can send a session JWT from `login` in an `Authorization: Bearer <token>` header instead. These tokens expire after 30 days.

```bash
curl -s https://orca-api.fly.dev/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { login(email: \"you@example.com\", password: \"...\") { token } }"}'
```

For local development the backend runs on `http://localhost:4000`, and `web/.env` already holds a dev token in `VITE_AUTH_TOKEN`.

## How sign-in works

The backend is its own OAuth 2.1 authorization server (`backend/src/oauth/`), following the MCP authorization spec.

1. An unauthenticated request to `/mcp` gets a 401 whose `WWW-Authenticate` header points to `/.well-known/oauth-protected-resource/mcp` (RFC 9728).
2. That document names the backend as the authorization server. Its metadata is at `/.well-known/oauth-authorization-server` (RFC 8414).
3. The client registers itself at `/oauth/register` (Dynamic Client Registration, RFC 7591). All clients are public: they prove themselves with PKCE, not a secret.
4. The client opens `/oauth/authorize` in a browser. The user signs in with their Orca email and password and chooses **Allow**.
5. The backend redirects to the client with a single-use code. The client exchanges it at `/oauth/token` with its PKCE verifier.

Tokens:

| Token              | Lifetime   | Stored as        | Notes                                                                                       |
| ------------------ | ---------- | ---------------- | ------------------------------------------------------------------------------------------- |
| Authorization code | 10 minutes | SHA-256 hash     | Deleted when used.                                                                          |
| Access token       | 1 hour     | Not stored (JWT) | Audience is the `/mcp` URL. `/graphql` and WebSockets reject it.                            |
| Refresh token      | 90 days    | SHA-256 hash     | Rotates on every use. Reusing an old one revokes all of that client's tokens for that user. |

Redirect URIs must be HTTPS or `http://localhost` / `127.0.0.1`. Loopback redirects may use any port, because native clients pick a free port when they start.

The backend builds its URLs from `PUBLIC_URL` (set in `fly.toml`). Without it, it uses the request's host and `X-Forwarded-Proto`.

## How the endpoint works

`/mcp` speaks MCP Streamable HTTP in stateless mode: every `POST` builds a fresh MCP server, answers with JSON, and keeps nothing between requests. `GET` and `DELETE` return 405, so there is no server-initiated SSE stream. `OPTIONS` answers CORS preflight, so browser-based clients can connect.

The endpoint rejects JSON-RPC batch arrays (MCP 2025-06-18 removed batching) and bodies over 4 MiB.

Tools do not call the backend over the network. They run through one shared in-process graphql-yoga instance, and each operation gets a fresh context bound to the caller's user ID. That gives them the same resolvers, validation and error masking as `/graphql`. Unexpected resolver errors are masked for the client and logged on the server. The instance has no `useAuth` plugin: the endpoint has already rejected unauthenticated requests before any tool runs.

## Limitations

- No way to see or revoke connected apps yet. Changing your password does not revoke OAuth tokens. Deleting the user does.
- No scopes. A connected app can do anything the user can do in Orca.
- No rate limit on `/mcp`, `/oauth/register` or the sign-in form. Each request is one tool call, but a client can send requests as fast as it likes.
- The GraphQL-backed tool definitions exist in both `web/src/shared/hooks/mcp-tools/` and `backend/src/mcp/tools/`. Change both when you change a tool.

## Keeping the two copies in sync

`backend/src/mcp/tools.manifest.json` records the name, description and input schema of every remote tool. Two tests check it:

- `backend/src/mcp/server.test.ts` fails if the remote server's tools differ from the manifest.
- `web/src/shared/hooks/mcp-tools.test.ts` fails if a local copy of a remote tool differs from the manifest.

After changing a tool in both places, regenerate the manifest:

```bash
cd backend && UPDATE_MCP_MANIFEST=1 bunx vitest run src/mcp && bunx prettier --write src/mcp/tools.manifest.json
```

The manifest covers definitions, not behavior. Tool handler bodies can still drift.
