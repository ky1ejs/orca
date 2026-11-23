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

The endpoints that use these scopes are not built yet; this page will describe them when they are.

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
