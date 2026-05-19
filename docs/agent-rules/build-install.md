# Build And Install Rules

## Core Rule
Scott is the only person who runs Polaris installer executables or `build-install.ps1`.

Agents must not run `build-install.ps1` or launch installer executables. Even when Scott approves an installer-producing build command, do not run the generated installer yourself.

## Command Permissions
- `npm start` - safe for agents when a local Electron run is needed; no build, no installer.
- `npm run pack` - safe for agents when an unpacked app build is needed; no installer.
- `npm run dist:fast` - installer-producing build; requires Scott's explicit approval for that exact command.
- `npm run dist` - full release installer-producing build; requires Scott's explicit approval for that exact command.
- `& C:\Users\scott\Code\Polaris\scripts\build-install.ps1` - Scott-only daily reinstall loop; agents do not run it.

## Source Changes
Source changes in `C:\Users\scott\Code\Polaris` require Scott to rebuild/reinstall before the installed app reflects them.

When handing off source changes that affect runtime behavior, tell Scott that a rebuild/reinstall is required.

## Installed App
Do not edit `C:\Users\scott\AppData\Local\Programs\Polaris\resources` unless Scott explicitly approves touching the installed app.

## Installer Cleanup
Old installers are pruned by `scripts/prune-dist.js`, which keeps the newest 5 `dist\Polaris Setup *.exe` files through the `postdist`, `postdist:fast`, and `postdist:public` hooks.
