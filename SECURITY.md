# Security policy

## Supported versions

Waylit is pre-alpha and has no releases yet. Security fixes land on the latest `dev` and `main` branches. Once releases exist, this table will list the supported versions.

## Reporting a vulnerability

Please do not report security issues in public issues, discussions or pull requests.

Use GitHub's private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. Include what you found, how to reproduce it, and the impact you expect.

This is a volunteer project. We aim to acknowledge reports within a week and to keep you updated as we investigate, but we cannot promise fixed timelines. We are happy to credit you in the fix unless you prefer to stay anonymous.

## What counts

- Leaked or hardcoded secrets in the repository or its history.
- Flaws that expose rider location, trip history or other personal data.
- Cross-site scripting, injection or unsafe handling of user-supplied speed-zone data.
- Anything in the vehicle integration that could send unintended commands to a vehicle.

Vehicle safety matters most. If you find any way the software could affect braking, firmware or other critical systems, please report it immediately through the private channel above.

## If you find a secret

Rotate it with the provider first. Then report it privately so the history can be cleaned.
