# Security Specification — Cronache di Golarion (PF2E)

## 1. Data Invariants
1. **Authenticated & Verified Identity**: Only signed-in users with `email_verified == true` can read or mutate campaign data.
2. **Path Variable Integrity**: All document IDs (`campaignId`, `memberUid`, `entryId`, `imageId`, `userId`) must match `^[a-zA-Z0-9_-]+$` and be at most 128 characters.
3. **Campaign Ownership & Bounded Membership**: A campaign must declare a valid `ownerId == request.auth.uid` on creation, an immutable `createdAt`, and a `memberUids` list bounded to `<= 12` entries starting with `[request.auth.uid]`.
4. **Master Gate & Invite Authorization**: Joining `/campaigns/{campaignId}/members/{memberUid}` requires an existing parent campaign and either `ownerId == request.auth.uid` (for GM) or matching `inviteCode` (for player).
5. **Atomic Membership Sync**: Creating `/users/{userId}/memberships/{campaignId}` requires `existsAfter(/databases/$(database)/documents/campaigns/$(campaignId)/members/$(userId))`.
6. **Subcollection Gate & Query Isolation**: Reading or writing `/campaigns/{campaignId}/entries/{entryId}` or `/campaigns/{campaignId}/gallery/{imageId}` requires parent membership; `allow list` validates `request.auth.uid in resource.data.memberUids` with zero `get()`/`exists()` calls inside `allow list`.
7. **Strict Key & Size Enforcement**: Every entity uses `keys().hasAll(...) && keys().hasOnly(...)` on creation, `affectedKeys().hasOnly(...)` on update, and `.size()` bounds on every string and array.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: Create `/campaigns/c1` with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Create `/campaigns/c1` with `email_verified == false` -> `PERMISSION_DENIED`.
3. **Owner Spoofing**: Create `/campaigns/c1` with `ownerId: "victim_uid"` while signed in as `"attacker_uid"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Create `/campaigns/c1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
5. **ID Poisoning**: Create `/campaigns/bad$id..` or 300-char ID -> `PERMISSION_DENIED`.
6. **Invite Code Bypass**: Create `/campaigns/c1/members/attacker` with wrong `inviteCode: "WRONG1"` -> `PERMISSION_DENIED`.
7. **Self-Promotion to GM**: Non-owner creates `/campaigns/c1/members/attacker` with `role: "gm"` -> `PERMISSION_DENIED`.
8. **Orphan User Membership**: Create `/users/attacker/memberships/c1` without atomic `/campaigns/c1/members/attacker` write -> `PERMISSION_DENIED`.
9. **Blanket List Scraping**: `list` `/campaigns/c1/entries` without membership in `resource.data.memberUids` -> `PERMISSION_DENIED`.
10. **Immutable Field Tampering**: `update` `/campaigns/c1` modifying `ownerId` or `createdAt` -> `PERMISSION_DENIED`.
11. **Timestamp Forgery**: `create` `/campaigns/c1/entries/e1` with forged past `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
12. **Payload Exhaustion**: `create` `/campaigns/c1/entries/e1` with `desc` > 8000 chars or `memberUids` > 12 -> `PERMISSION_DENIED`.
