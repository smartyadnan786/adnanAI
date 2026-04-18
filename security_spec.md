# Firestore Security Specification - Brevity AI

## Data Invariants
1. **User Profiles**: Only the authenticated user can read or write their own profile document at `/users/{userId}`.
2. **Chat Sessions**: A user can only access chat documents where `userId` matches their own UID.
3. **Chat Messages**: Access to messages is strictly tied to the parent chat session's ownership.
4. **Immutability**: `createdAt` fields and `userId` fields must not change after creation.
5. **Validation**: All messages must have a role of either 'user' or 'model' and content must be a string within size limits.

## The "Dirty Dozen" Payloads (Tested for Rejection)
1. **Identity Theft**: Attempting to create a profile for a different UID.
2. **Shadow Updates**: Including an `isAdmin: true` field in a user profile update.
3. **Orphaned Message**: Attempting to write a message to a chat belonging to another user.
4. **Message Hijack**: Updating a message to change its `role` from 'user' to 'model'.
5. **ID Poisoning**: Using a 1MB string as a `chatId` to bloat metadata.
6. **Timeline Warp**: Setting a future date for `createdAt`.
7. **Role Escalation**: Attempting to list all users as a guest.
8. **Resource Exhaustion**: Sending a 2MB string as message content.
9. **Cross-Session Leak**: Querying messages from someone else's chat.
10. **Admin Bypass**: Attempting to delete the `system` collection.
11. **Spoofed Ownership**: Creating a chat with another user's `userId`.
12. **Status Lock Break**: Modifying a locked/terminal chat session field.

## Security Verification Plan
- [ ] User A cannot read User B's profiles.
- [ ] User A cannot see User B's chats.
- [ ] User A cannot write messages to User B's chats.
- [ ] Schema validation rejects non-string message content.
- [ ] Immutability checks protect `userId`.
