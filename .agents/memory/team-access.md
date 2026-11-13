---
name: Team access
description: Shared team access scope and preview cookie behavior
---

The platform uses shared team access rather than public registration or individual accounts.

**Why:** The user requested one shared login to distribute to their team.

**How to apply:** Keep dashboard data behind server-side authentication as well as the UI gate. Do not introduce public signup without a new request. Never put the password in client code or memory.

The development HTTPS preview proxy changes outgoing `SameSite=Lax` cookies to `SameSite=None`.

**Why:** During login verification, the same sign-out request returned Lax through the local shared proxy and None through the external development preview. Secure and HttpOnly remained intact.

**How to apply:** Compare value-redacted cookie attributes through both proxies before changing application cookie policy. Preserve independent same-origin write checks; do not weaken request protections to work around preview behavior.
