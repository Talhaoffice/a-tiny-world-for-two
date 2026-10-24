# Milestone 3 Firebase setup

The application now has Firebase Authentication and Realtime Database client integration. It fails closed when the web-app configuration is missing, when a membership record is absent, or when membership cannot be checked. The client has no registration flow; only Firebase Console-provisioned email/password accounts can sign in through the app.

## Configure a Firebase project

1. Create or select a Firebase project on the **Spark** plan.
2. Register a Web App in Project settings. Create or update the local `.env.local` from `.env.example` with its five `VITE_FIREBASE_*` values. A local `.env.local` may already exist; do not overwrite it blindly. Get the Realtime Database URL from that database's page; its host may end in `firebasedatabase.app` or `firebaseio.com`.
3. In Authentication, enable **Email/Password** and manually create exactly two accounts. There is no public registration screen in this app. Do not add any other app accounts as authorized members.
4. Copy the two accounts' UIDs from the Authentication users list.
5. Create a Realtime Database. Publish the contents of `database.rules.json` in its Rules tab.
6. Using the Console's privileged Data view, add exactly these two entries at the database root, replacing the placeholders with the two provisioned UIDs:

   ```json
   {
     "members": {
       "<first-provisioned-uid>": true,
       "<second-provisioned-uid>": true
     }
   }
   ```

   Do not add additional `members` entries. Client writes to `/members` are denied by the rules. Authenticated users can read only their own membership value; the app checks `members/{auth.uid}` before mounting the world. World reads require an allowlist entry, and each member can write only their own presence and position. Position records may include the optional `zone` field with the validated value `island` or `home`, allowing both clients to show each other only while they share a room. Older records without `zone` are treated as island presence.

## Configuration and privacy

`.env.local` is ignored by Git. This guide does not record the file's presence or contents. Firebase web-app configuration is public client configuration and Vite embeds configured values in the browser bundle; it is not a place for passwords, service-account keys, or other privileged credentials. Access control is enforced by Firebase Authentication and the published Realtime Database rules. Do not put account passwords, private letters, memories, or personal data in client code or database records.

The rules use the Realtime Database membership list as the authorization source because database rules cannot query another Firebase product. They deny access by default. They do not count membership records, so provisioning exactly two UIDs in the Console is a required administrator step.

## Setup requirements and verification status

The steps above describe required Firebase setup; this document alone does not confirm that any Firebase project, accounts, membership records, rules, or local configuration have been provisioned. TypeScript and production builds are local code checks. Live sign-in, allowlist checks, presence, two-client movement, and Emulator rule tests require a configured Firebase project and are separate checks; record their results only after actually running them. Never loosen the rules to make local checks pass.

Persistent home, garden, and mailbox data use Cloud Firestore. Review its separate membership setup, collection structure, rules, and manual publishing steps in [FIRESTORE_SETUP.md](FIRESTORE_SETUP.md). Realtime Database rules do not authorize Firestore access.
