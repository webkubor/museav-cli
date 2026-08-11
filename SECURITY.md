# Security

This CLI holds two kinds of credentials in `~/.studio-image.json`: a personal login token (7-day JWT) and/or a tenant apiKey. The file is written with `0600` permissions (owner read/write only).

## Reporting a vulnerability

If you find a security issue in this CLI or in the `manager.museav.top` platform it talks to, please open a GitHub issue on this repo, or contact the maintainer directly rather than filing a public issue if the report involves a live credential leak or an exploitable server-side bug.

## Scope

This repo covers the CLI client only. It does not hold or process upstream model-provider keys — those stay server-side on the studio platform and are never sent to or stored by this CLI.
