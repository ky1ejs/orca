# MCP servers

Orca exposes its tools to agents through two MCP servers. They share most tools but run in different places.

| | Local (desktop app) | Remote (backend) |
|---|---|---|
| URL | `http://127.0.0.1:<hook-port>/mcp` | `https://<backend-host>/mcp` |
| Runs in | The PTY daemon's hook server (`web/src/shared/hooks/`) | The Bun backend (`backend/src/mcp/`) |
| Auth | The desktop app's stored JWT | `Authorization: Bearer <JWT>` per request |
| Configured by | Orca, automatically, for agents it launches | You, in any MCP client |

Use the local server for agents Orca launches on your machine. Use the remote server for anything else: agents on another machine, cloud sessions, or any MCP client that cannot reach the desktop app.

## Tools

Both servers expose the workspace, initiative, project, task, label, member, task-link and `get_docs` tools.

The local server also has tools that need the desktop app:

- `get_current_task` and `update_task_status` resolve the task from the agent's terminal session (`X-Orca-Session-Id`).
- `get_logs` and `get_perf_logs` read the daemon and main-process log files.

The remote server has no session, so pass task IDs explicitly. Its `create_task` takes an optional `sourceTaskId` to add the `CREATED_FROM` link that the local server infers from the session.

## Connecting to the remote server

The remote server accepts the same JWT as the GraphQL API. Get one by logging in:

```bash
curl -s https://<backend-host>/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { login(email: \"you@example.com\", password: \"...\") { token } }"}'
```

Tokens expire after 30 days. Then register the server with Claude Code:

```bash
claude mcp add --transport http orca https://<backend-host>/mcp \
  --header "Authorization: Bearer <token>"
```

For local development the backend runs on `http://localhost:4000`, and `web/.env` already holds a dev token in `VITE_AUTH_TOKEN`.

## How it works

`/mcp` speaks MCP Streamable HTTP in stateless mode: every `POST` builds a fresh MCP server, answers with JSON, and keeps nothing between requests. `GET` and `DELETE` return 405, so there is no server-initiated SSE stream.

Tools do not call the backend over the network. Each request gets an in-process graphql-yoga instance bound to the caller's user ID, so tools run the same resolvers, validation and error masking as `/graphql`.

## Limitations

- No OAuth. Clients that require OAuth discovery, such as claude.ai custom connectors, cannot connect yet. Clients that accept a static bearer header can.
- The GraphQL-backed tool definitions exist in both `web/src/shared/hooks/mcp-tools/` and `backend/src/mcp/tools/`. Change both when you change a tool.
