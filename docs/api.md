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

An API key never acts as a person. `/graphql`, the GraphQL WebSocket and `/mcp` reject it as if no token were sent.

The GraphQL operations behind the settings page are `apiKeys(workspaceId)`, `createApiKey(input)` and `revokeApiKey(id)`. They accept only a session JWT from a workspace owner.

### Rotating a key

1. Create a new key.
2. Replace the old key wherever the calling service stores it, and check that its requests succeed.
3. Revoke the old key.
