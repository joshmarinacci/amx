# Changes

## 2026-03-20

- Updated the README to match the implemented feature set.
- Removed documentation for unsupported features including webhook/repo watching, email alerts, crash auto-restart, log following, and the unsupported `amx make <task> <file>` shortcut.
- Corrected the documented task removal command to `amx nuke taskname taskname`.
- Implemented basic `amx follow` support by polling `stdout.log` and `stderr.log` for newly appended output.
- Added tests covering follow behavior for existing logs and logs created after following begins.
- Added an `npm test` script and fixed the follow polling interval to use the correct sleep units.
