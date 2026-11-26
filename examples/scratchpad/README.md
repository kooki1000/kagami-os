# Scratchpad

The reference third-party app for Kagami OS: a few buttons that exercise the
bridge (`fs.write`, `fs.read`, `notifications.notify`, `window.setTitle`),
with comments explaining each part of the protocol. `e2e/app-lifecycle.spec.ts`
installs it, runs it, revokes a capability from Settings, and uninstalls it.

## Install it

Turn on the flag (`localStorage.setItem("kagami:flag:third_party_apps", "on")`,
or Settings › About), then zip the two files and pick the archive under
Settings › Apps › Install App:

```bash
cd examples/scratchpad
zip ../scratchpad.zip manifest.json entry.js
```

The consent screen lists the three capabilities it asks for. Turn any of them
off in Settings › Apps and the open window's next call reports
`capability_denied`.

## A bundle is

- `manifest.json`: `id`, `name`, `version`, `entry`, and `capabilities`.
- The entry script, plain JavaScript (never HTML).
