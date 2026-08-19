/**
 * A structural representation of a Firestore Timestamp, without importing
 * `firebase-admin` (or the Firebase Web SDK) into this dependency-free
 * package. Both `firebase-admin`'s `Timestamp` class instances (which expose
 * public `seconds`/`nanoseconds` fields) and plain JSON objects shaped this
 * way (e.g. after being sent to a client) satisfy this interface
 * structurally. Callers that need real Timestamp *behavior* (`.toDate()`,
 * `.toMillis()`, arithmetic, …) should import the actual `Timestamp` type
 * from `firebase-admin/firestore` at their own call site — this package only
 * describes the storage/wire shape, per
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §8.
 */
export interface FirestoreTimestampLike {
  readonly seconds: number;
  readonly nanoseconds: number;
}
