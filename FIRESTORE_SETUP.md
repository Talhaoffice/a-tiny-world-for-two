# Firestore and emulator setup

This guide documents the P0 security model and owner-run setup steps. No production rules, indexes, documents, or Firebase console settings have been changed by this work.

## Membership and owner-managed metadata

Firestore rules use a Firestore membership mirror because Firestore rules cannot read Realtime Database data. Create exactly two `members/{uid}` documents using the already-authorized Authentication UIDs. Each document contains:

```json
{ "active": true }
```

Manage these records only through an owner workflow such as the Firebase Console. Client writes to `members` are denied. Keep this list aligned with the separate Realtime Database `members/{uid}: true` records.

The Firestore document `world/main` contains `talhaUid` and `mannuUid`. It is owner-managed, readable by active members, and identifies which member may edit `content/introLetter`. Clients cannot write `world/main`.

For manual provisioning, open the intended project in Firebase Console, then **Firestore Database → Data**. Create a `members` collection with one document per already-authorized Authentication UID; add the `active` field as a Boolean set to `true` on each. Create the `world` collection and its `main` document; add `talhaUid` and `mannuUid` as string fields containing the corresponding Authentication UIDs. Make the matching `members/{uid}: true` entries separately under **Realtime Database → Data**. Keep those IDs in the console only; do not paste them into source, tests, or reports.

## Persistent document structure

- `homes/shared/notes/{autoId}`: `authorUid`, `text` (1–500 characters), `createdAt`.
- `homes/shared/keepsakes/{autoId}`: `authorUid`, `title` (1–60), `description` (1–300), `createdAt`.
- `gardens/shared/flowers/{autoId}`: `authorUid`, `title` (1–60), `memory` (1–300), `flowerType` (`gold`, `rose`, `cream`, or `coral`), `createdAt`.

Active members can read shared content. The creator can edit or delete their own item. Updates preserve `authorUid` and `createdAt`, validate the complete document, and require `updatedAt` to be the server request time.

New letters use a protected v2 schema:

```text
letters/{id}
  senderUid
  recipientUid
  createdAt
  releaseAt
  schemaVersion: 2
  openedAt?                 // set once by the recipient after release

letters/{id}/private/body
  title
  text
  updatedAt
```

The parent contains metadata only. The sender can always read the body. The recipient can read it only after the server time reaches `releaseAt`. New letters write parent and body in one batch; immediate letters use a server timestamp, while scheduled times are converted from the viewer's local date and time to UTC. Rules cap release time at 1,826 days ahead and do not trust the viewer's clock.

Before release and before the recipient opens a letter, the sender can edit its body, reschedule it, or delete the parent and body together. The recipient can set `openedAt` once after release. Existing letters without `releaseAt` remain readable and retain their previous open behavior. The sender can optionally upgrade an unopened legacy letter; the upgrade moves its text into `private/body` and removes the parent text in one batch. No existing letters are migrated automatically.

`playerProfiles/{uid}` is readable and writable only by its owner. A profile requires a validated appearance (`hair`, `outfit`, `accessory`); `introCompletedAt` can be set once and cannot be changed or removed. `playerTutorials/{uid}` retains the existing owner-only M5 rules.

`playerCorners/{uid}` stores the small, structured state for the corner assigned to that member. `world/main.talhaUid` owns `lantern-post`; `world/main.mannuUid` owns `greenhouse`. Both active members can read either corner while visiting. Only the assigned owner can create or update its document, and deleting or listing corner documents is denied. The lantern document allows `postLanternLit`, `workshopLanternLit`, and decoration (`none`, `wind-chime`, or `flower-box`). The greenhouse document allows `plotOneWatered`, `plotTwoWatered`, and decoration (`none`, `herb-shelf`, or `plant-stand`). Both also require `ownerUid`, the matching `cornerId`, and the server `updatedAt`. These fields contain game settings only; no private notes or personal letters are stored there.

`content/introLetter` is readable by active members and writable only by the account identified as `world/main.talhaUid`. Store only the letter text and `updatedAt`; if no document exists, the client can show its visible placeholder.

`content/specialDates` is readable by both active members and writable only by Talha. It stores five optional `MM-DD` values and a server `updatedAt`; the rules validate month/day ranges and reject extra fields. The client treats these as annual dates, checks only for a same-day match, and shows a gentle island glow without a countdown. It stores no year, label, or personal note. The game loads the document once, then listens only while the special-dates panel is open.

## Indexes

The sent and received mailbox queries still use the existing `senderUid + createdAt` and `recipientUid + createdAt` composite indexes in `firestore.indexes.json`. V2 body reads and personal-corner listeners address one document directly, so the corner schema adds no query requiring a new index. Deploy and wait for the index step before publishing the rules and client.

## Emulator tests

The emulator configuration uses Firestore at `127.0.0.1:8080`, Realtime Database at `127.0.0.1:9000`, and disables the Emulator UI. Security fixtures use synthetic test IDs and data. The rules test file covers shared-content ownership, v2 and legacy letters, profiles, intro and special-date content, player corners, tutorial progress, Firestore membership, and RTDB player ownership, validated appearance, and emote cooldowns.

The suite command is:

```powershell
npm run test:security
```

The sandbox attempts stopped before the test runner because the emulator Java child could not establish its loopback selector connection. No rules assertions have run here. To retry in your own PowerShell from the repository root with the installed Temurin Java 21 path:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
npm run test:security
```

If the command fails, paste the complete `java -version` and `npm run test:security` output, plus the relevant `firestore-debug.log` tail. Do not use production content as test data or relax rules to make a check pass.

## Review and publish order

These commands are prepared for the project owner; they have not been run:

1. Deploy indexes and wait until the Firebase Console shows them ready:

   ```powershell
   .\node_modules\.bin\firebase.cmd deploy --only firestore:indexes --project a-tiny-world-for-two
   ```

2. Publish the reviewed rules:

   ```powershell
   .\node_modules\.bin\firebase.cmd deploy --only firestore:rules --project a-tiny-world-for-two
   ```

3. Build the client, then publish Hosting:

   ```powershell
   npm run build
   .\node_modules\.bin\firebase.cmd deploy --only hosting --project a-tiny-world-for-two
   ```

Before deploying, review `firestore.rules` and confirm the two active Firestore membership records, the separate RTDB membership records, and `world/main` are correct. Test with the emulator first. Do not deploy rules and a client that disagree about the letter schema.
