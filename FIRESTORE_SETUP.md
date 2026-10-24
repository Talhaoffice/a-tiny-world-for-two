# Milestone 4 Firestore setup

This guide describes required setup; it does not confirm that the steps have been completed or that the Firestore rules have been tested. The app initializes Firestore from the existing Firebase app. The client does not create or modify membership records.

## Membership and security model

Firestore security rules cannot read the Realtime Database `/members` allowlist. Firestore therefore uses its own owner-managed mirror: create exactly two documents in the Firestore `members` collection, using the two already-authorized Firebase Authentication UIDs as document IDs. Each document must contain:

```json
{ "active": true }
```

Do not put UIDs into source code. Create and change these records only through a privileged owner workflow such as the Firebase Console. The Firestore rules deny all client writes to `members`. If a user is removed, set their Firestore member record inactive and remove their Realtime Database membership separately. Keep both lists aligned. The rules authorize any UID with an active Firestore member document, so exactly two active records is an owner provisioning requirement.

## Persistent document structure

- `homes/shared/notes/{autoId}`: `authorUid`, `text` (1–500 characters), `createdAt` (server timestamp).
- `homes/shared/keepsakes/{autoId}`: `authorUid`, `title` (1–60), `description` (1–300), `createdAt` (server timestamp).
- `gardens/shared/flowers/{autoId}`: `authorUid`, `title` (1–60), `memory` (1–300), `flowerType` (`gold`, `rose`, `cream`, or `coral`), `createdAt` (server timestamp).
- `letters/{autoId}`: `senderUid`, `recipientUid`, `text` (1–2,000), `createdAt` (server timestamp), `opened` (initially `false`), and `openedAt` (initially `null`). The recipient must be a different active member. Only sender and recipient can read a letter, and only its recipient can change the unopened fields to `opened: true` and a server `openedAt` timestamp.

The app opens Firestore snapshot listeners for the active destination and unsubscribes them when leaving it. Shared notes, keepsakes, flowers, and letters can therefore update while that destination remains open. Each content query is limited to 50 documents (letters use separate 50-document sent and received queries before merging) and orders by `createdAt` descending. The shared notes, keepsakes, and flowers queries use only a single-field order, for which Firestore's automatic single-field index is sufficient. The letter queries combine equality on `senderUid` or `recipientUid` with ordering on `createdAt`; Firestore requires composite indexes for those two query shapes, which are listed in `firestore.indexes.json`. Rules validate individual document fields and the allowed letter update. There is no collection-wide write quota in this milestone.

## Review and publish the Firestore rules

1. In Firebase Console, open the intended project and select **Firestore Database → Rules**.
2. Compare the complete contents of the repository's `firestore.rules` with the rules in the Console. Confirm the project is the intended one and inspect the member, shared-content, and letter permissions.
3. Before publishing, confirm the two active `members/{uid}` documents correspond exactly to the two manually authorized Firebase Authentication accounts and the Realtime Database members.
4. Paste the reviewed `firestore.rules` into the Console editor and select **Publish**. This is a manual owner action; the app and this setup do not deploy rules or change live data.
5. Test both authorized accounts and a nonmember in the Firestore Emulator or a dedicated test project: reads/writes for shared content, invalid/oversized fields, recipient validation, cross-user letter reads, sender attempts to mark opened, recipient opening, and attempts to modify membership. Also verify empty collections and permission-denied UI. Do not call the rules secure until these checks pass.

The isolated Emulator configuration is in `firebase.json`; it loads `firestore.rules` on localhost and uses the mock project ID `demo-tiny-world-firestore-rules`. The test suite is `tests/firestore.rules.test.js` and seeds only synthetic fixtures with rules disabled; its assertions run with rules enabled. The compatible test tools are listed in `package.json` and installed in this workspace. Run the suite with Java 21 or newer on `PATH`:

```powershell
npm run test:security
```

The Emulator command was attempted in this workspace, but the Firestore Emulator exited before the test runner started: Java 21 could not create its local selector pipe because the environment rejected its loopback connection. No security assertions have run here. TypeScript and production builds do not test Firestore security behavior. Do not use production content as test data, and do not relax rules to make a check pass.
