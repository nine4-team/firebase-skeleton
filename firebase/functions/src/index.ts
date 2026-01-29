import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

admin.initializeApp();

type CreateWithQuotaRequest = {
  // Identifies which quota bucket to enforce (e.g. "memory", "entry", "project").
  objectKey: string;

  // Document path under the user's namespace where the new doc should be created.
  // Example: "users/{uid}/objects"
  collectionPath: string;

  // The doc payload to write. Server will add timestamps.
  data: Record<string, unknown>;
};

export const createWithQuota = onCall<CreateWithQuotaRequest>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const { objectKey, collectionPath, data } = request.data ?? ({} as CreateWithQuotaRequest);
  if (!objectKey || !collectionPath || !data) {
    throw new HttpsError('invalid-argument', 'Missing objectKey, collectionPath, or data.');
  }

  // NOTE: This is intentionally a template/starter.
  // Real apps will likely:
  // - check “isPro” (from custom claims or a user doc updated by a billing webhook)
  // - load the quota limit from config
  // - enforce per-objectKey rules
  const db = admin.firestore();

  const quotaRef = db.doc(`users/${uid}/quota/${objectKey}`);
  const newDocRef = db.collection(collectionPath.replace('{uid}', uid)).doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const result = await db.runTransaction(async (tx) => {
    const quotaSnap = await tx.get(quotaRef);
    const current = (quotaSnap.exists ? (quotaSnap.data()?.count as number | undefined) : 0) ?? 0;

    // Template default: free limit = 10. Apps should parameterize this.
    const freeLimit = 10;

    if (current >= freeLimit) {
      // Client should interpret this as “show paywall”.
      throw new HttpsError('resource-exhausted', `Quota exceeded for ${objectKey}.`);
    }

    tx.set(
      newDocRef,
      {
        ...data,
        uid,
        createdAt: now,
        updatedAt: now
      },
      { merge: false }
    );

    tx.set(
      quotaRef,
      {
        count: current + 1,
        updatedAt: now
      },
      { merge: true }
    );

    return { id: newDocRef.id };
  });

  return result;
});

