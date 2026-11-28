# Security Policy

## Supported versions

Security fixes are applied to the current default branch. Older releases are not guaranteed to receive fixes.

## Reporting a vulnerability

Do not publish exploitable details, credentials, tokens, personal data, or proof-of-concept exploits in public issues or pull requests.

Use GitHub's **Private vulnerability reporting** feature from the repository's Security tab when it is available. Include:
- affected component, branch, commit, and version;
- impact and realistic attack prerequisites;
- minimal reproduction steps, avoiding access to third-party data;
- suggested mitigation, if known.

If private reporting is unavailable, contact the repository maintainer privately through an established channel before disclosing details publicly. Do not assume that a public issue is a secure reporting channel.

## Secrets and credentials

Never commit `.env` files, private keys, access tokens, service-role keys, database passwords, signing keys, or production credentials. Use GitHub Actions secrets or the relevant hosting/provider secret manager.

If a credential is exposed, revoke or rotate it immediately. Removing it from the latest commit is not sufficient: treat it as compromised and assess repository history, logs, deployments, and dependent services.

## Scope

Reports may cover authentication, authorization, data exposure, injection, dependency vulnerabilities, CI/CD permissions, and insecure configuration in this repository and its deployed application.
