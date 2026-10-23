# Friend Group Manager (Standalone)

This app is integrated as a UnityShop standalone app and is hosted at:

- `/standalone/friend-group-manager/`

AI generation requests are routed through API Manager via shared proxy utilities.
The frontend does not call external provider APIs directly.

## Local Development

1. Install shared workspace dependencies:
   - `cd /root/projects/unityshop/apps/shared_dependencies`
   - `pnpm install -r`
2. Run app dev server:
   - `cd /root/projects/unityshop/apps/standalone_apps/friend-group-manager`
   - `pnpm dev`

## Build

- `cd /root/projects/unityshop/apps/shared_dependencies`
- `pnpm --filter friend-group-manager-standalone build`
