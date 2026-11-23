# Public API

Other services, such as an app's backend, call Orca with an API key instead of a person's sign-in. A key belongs to one workspace, not to a person, and can do only what its scopes allow.

## API keys

Workspace owners manage keys in the desktop app, under **Workspace Settings › API Keys**. Members who are not owners don't see the tab, and the API refuses them.

- **Create** takes a name and one or more scopes. Orca shows the key once, with a copy button. It stores only a SHA-256 hash, so a lost key can't be recovered: create another and revoke the old one.
- **Revoke** stops the key at once. Revoked keys stay in the list, marked Revoked, and are never deleted.

Keys look like `orca_` followed by 43 URL-safe characters. The list shows each key's last 4 characters so you can tell them apart.

| Scope | Allows |
| --- | --- |
| `TASKS_CREATE` | Creating tasks |
| `TASKS_DELETE_EXTERNAL` | Deleting tasks the workspace's keys created for an external user |

Each endpoint below names the scope it needs.

## Endpoints

Send the key as `Authorization: Bearer orca_…`. Only API keys work here; session tokens and OAuth tokens get 401. Missing, unknown and revoked keys all get the same 401.

Errors are JSON: `{ "error": { "code": "…", "message": "…" } }`.

### Create a task: `POST /api/v1/tasks`

Scope `TASKS_CREATE`. Creates an external task (`isExternal: true`) in the key's workspace.

Headers:

- `Idempotency-Key` (required): 1–100 printable ASCII characters, unique per task you mean to create. Repeating a key returns the task that key already created, with status 200, and doesn't compare the body. Retry with the same key after a timeout or a 5xx, so a request that did succeed isn't duplicated. Keys are scoped to the workspace, so rotating API keys doesn't reset them.
- `Content-Type: multipart/form-data`, with a `Content-Length` of at most 52 MiB.

Parts:

- `task` (required): JSON.

  | Field | Required | Notes |
  | --- | --- | --- |
  | `title` | yes | 1–200 characters after trimming |
  | `description` | no | Markdown, up to 50,000 characters |
  | `priority` | no | `NONE` (default), `LOW`, `MEDIUM`, `HIGH` or `URGENT` |
  | `projectId` | no | A project in the key's workspace |
  | `labelIds` | no | Up to 20 labels in the key's workspace |
  | `externalUserRef` | no | 1–128 letters, digits, `-` or `_`: your opaque reference for the person the task came from, used by the delete endpoint below |

  Other fields are refused.
- `attachment` (0–5): PNG or JPEG files, 1 byte to 10 MB each. Orca checks the type against the file's first bytes and names the files itself (`attachment-1.png`, …).

Responses:

| Status | Meaning |
| --- | --- |
| 201 | Created: `{ "id", "displayId" }` |
| 200 | This `Idempotency-Key` already created a task: the same body as its 201 |
| 400 | Invalid headers, JSON or attachment |
| 401 | Missing, unknown or revoked API key |
| 403 | The key lacks `TASKS_CREATE`, or a label or project isn't in its workspace |
| 409 | A request with this `Idempotency-Key` is still running. Retry later; a request that crashed is cleared within about 15 minutes |
| 411 / 413 / 415 | No `Content-Length` / body over 52 MiB / not multipart |
| 503 | Attachments were sent but Orca has no attachment storage |

### Delete a person's tasks: `DELETE /api/v1/external-tasks?externalUserRef=…`

Scope `TASKS_DELETE_EXTERNAL`. Deletes every external task in the key's workspace with that `externalUserRef`. It removes their attachment files first, then the tasks with their attachments, relationships, pull request links and audit history. Text that people or agents copied out of these tasks elsewhere is not touched.

Returns 200 with `{ "deletedTaskCount": n }`, including when nothing matched. A 5xx leaves everything it hadn't yet deleted in place, so retrying is safe.

## Task attachments

A task can have image attachments (PNG or JPEG), such as screenshots from a bug report. The task page shows them as thumbnails; clicking one opens it full size.

- **Download:** `GET /attachments/:id` with a session JWT returns the file to members of the task's workspace. Anyone else gets 404, the same as for a missing attachment. API keys and OAuth tokens are refused.
- **GraphQL:** `Task.attachments` lists them and `taskAttachment(id)` fetches one. `taskAttachmentContent(id)` returns one file's bytes, base64-encoded, for PNG or JPEG files up to 5 MB. It is a top-level query, so one request reads at most one file.
- **MCP:** `get_task` lists a task's attachments, and `get_task_attachment` returns one as an image an agent can read.
- **Storage:** production uses the Tigris bucket from `fly storage create -a orca-api`. Locally, set `ATTACHMENT_STORAGE_DIR` in `backend/.env`. Without either, the server starts and logs that attachments are unavailable.

## External tasks

Tasks created through the public API have `isExternal: true`. Their title, description and attachments come from outside the team, so Orca treats them as untrusted:

- The task page shows an **External** badge. In the description, images show as their alt text, and only `http`, `https` and `mailto` links stay clickable, with their address shown. Other links become plain text.
- MCP tool results add an `untrustedNotice` to every external task, including related tasks and the results of `create_task` and `update_task`. `get_task_attachment` repeats it.
- Agents launched on the task get `ORCA_TASK_IS_EXTERNAL=1`. Their system prompt warns that the task is untrusted and leaves out its title.
- Starting or restarting an agent on an external task asks for confirmation first. Orca never starts one automatically.

In every task, the desktop app opens only `http`, `https` and `mailto` links outside the app.

An API key never acts as a person. `/graphql`, the GraphQL WebSocket and `/mcp` reject it as if no token were sent.

The GraphQL operations behind the settings page are `apiKeys(workspaceId)`, `createApiKey(input)` and `revokeApiKey(id)`. They accept only a session JWT from a workspace owner.

### Rotating a key

1. Create a new key.
2. Replace the old key wherever the calling service stores it, and check that its requests succeed.
3. Revoke the old key.
