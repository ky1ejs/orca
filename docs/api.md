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

- `Idempotency-Key` (required): 1–100 printable ASCII characters, unique per task you mean to create. Retry with the same key and the same body after a timeout, a 5xx, a 409 or a 429, so a request that did succeed isn't duplicated. A repeat is answered before the body is validated:
  - **200** with the task the key created;
  - **410** (`task_deleted`) if that task has since been deleted;
  - **409** while the first request is still running;
  - **422** if the key was used for a different request.

  Keys are scoped to the workspace, so rotating API keys doesn't reset them. Orca keeps a finished key for 30 days.
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
  | `externalUserRef` | no | 1–128 letters, digits, `-` or `_`: your opaque reference for the person the task came from, used by the delete endpoint below. Refs are shared by every integration in the workspace, so prefix yours (e.g. `cut-…`) |

  Other fields are refused.
- `attachment` (0–5): PNG or JPEG files, 1 byte to 10 MB each. Orca checks the type against the file's first bytes and names the files itself (`attachment-1.png`, …).

No other parts are accepted, and there must be exactly one `task` part.

Limits: 60 requests a minute per API key, and 4 intake requests at once across Orca. Over either limit you get 429 with `Retry-After`.

Responses:

| Status | Meaning |
| --- | --- |
| 201 | Created: `{ "id", "displayId" }` |
| 200 | This `Idempotency-Key` already created a task: the same body as its 201 |
| 400 | Invalid headers, parts, JSON or attachment |
| 401 | Missing, unknown or revoked API key |
| 403 | The key lacks `TASKS_CREATE`, or a label or project isn't in its workspace |
| 409 | A request with this `Idempotency-Key` is still running. Retry later; a request that crashed is cleared within about 15 minutes |
| 410 | `task_deleted`: the key's task was deleted. `external_user_deleted`: the `externalUserRef` was purged, and new tasks for it are refused. Don't retry |
| 411 / 413 / 415 | No `Content-Length` / body over 52 MiB / not multipart |
| 422 | This `Idempotency-Key` was used for a different request |
| 429 | Over a rate or concurrency limit: retry after `Retry-After` seconds |
| 503 | Attachments were sent but Orca has no attachment storage |

### Delete a person's tasks: `DELETE /api/v1/external-tasks?externalUserRef=…`

Scope `TASKS_DELETE_EXTERNAL`. Deletes every external task in the key's workspace with that `externalUserRef`, whichever API key created it. It removes their attachment files first, then the tasks with their attachments, relationships, pull request links and audit history. Text that people or agents copied out of these tasks elsewhere is not touched.

From then on, Orca refuses tasks for that `externalUserRef` with 410, including a create that was in flight during the purge, and a retry of a create that had already succeeded. The two endpoints take the same lock for a reference, so a create either commits before the purge and is deleted by it, or is refused.

Returns 200 with `{ "deletedTaskCount": n, "deletedTaskDisplayIds": [...] }`, including when nothing matched. A 5xx leaves everything it hadn't yet deleted in place, so retrying is safe. Open desktop apps drop the deleted tasks. The server logs which API key deleted which task IDs, without the reference.

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
