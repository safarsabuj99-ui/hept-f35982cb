

## Plan: Lock App Orientation to Portrait

### Problem
The `manifest.json` has `"orientation": "any"`, which allows the PWA to rotate freely — even when the device rotation lock is enabled. When installed as a standalone PWA, the manifest orientation overrides the device setting.

### Solution
Change `"orientation": "any"` to `"orientation": "portrait"` in `manifest.json`. This locks the app to portrait mode regardless of device rotation.

### Files Changed
| Action | File |
|--------|------|
| Modify | `public/manifest.json` — Change line 9: `"orientation": "portrait"` |

Single-line change. After this, the installed PWA will always stay in portrait mode.

