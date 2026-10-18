# Admin is one actor, reached through two doors

Partyman has one concept of Admin, but two ways to become one. An Admin normally
signs in with Steam and is therefore a Participant like anyone else, with a display
name, points and party history; `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` provisions a
separate `admin_users` row for the case where Steam is unreachable. Both yield
`role: "admin"` from `GET /api/me`, and an `admin_users` session deliberately has no
`participants` row (`auth/guards.ts`). We chose one actor with two doors over two
separate admin kinds because the password door is a fallback, not a second class of
person — but the asymmetry is real and should not be "tidied up" by unifying the tables.
`participants.role` (migration 010) covers promoting a Steam Member to Admin;
`admin_users` covers the no-Steam fallback.