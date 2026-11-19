import type { User } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  FIELD_LIMITS,
  type Campaign,
  type GalleryImage,
  type UserMembership,
  type WikiCategory,
  type WikiEntry,
} from '../types';
import { DEMO_DIARY_TEXT, DEMO_ENTRIES, generateInviteCode } from '../utils/campaignUtils';

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return sanitizeId(`${prefix}_${Date.now()}_${rand}`);
}

function trimToMaxBytes(text: string, maxBytes: number): string {
  const sliced = text.slice(0, maxBytes);
  const encoder = new TextEncoder();
  if (encoder.encode(sliced).length <= maxBytes) {
    return sliced;
  }
  let end = sliced.length;
  while (end > 0 && encoder.encode(sliced.slice(0, end)).length > maxBytes) {
    end = Math.max(0, end - Math.max(1, Math.ceil((encoder.encode(sliced.slice(0, end)).length - maxBytes) / 2)));
  }
  return sliced.slice(0, end);
}

async function batchDeleteRefs(refs: DocumentReference[], pathForErrors: string): Promise<void> {
  for (let i = 0; i < refs.length; i += 400) {
    const slice = refs.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const ref of slice) {
      batch.delete(ref);
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, pathForErrors);
    }
  }
}

export function subscribeUserMemberships(
  uid: string,
  onData: (memberships: UserMembership[]) => void
): () => void {
  const path = `users/${uid}/memberships`;
  const q = query(collection(db, 'users', uid, 'memberships'), orderBy('joinedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.metadata.hasPendingWrites) {
        return;
      }
      const items = snap.docs.map((d) => d.data() as UserMembership);
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeCampaign(
  campaignId: string,
  onData: (campaign: Campaign | null) => void
): () => void {
  const path = `campaigns/${campaignId}`;
  return onSnapshot(
    doc(db, 'campaigns', campaignId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData({ id: snap.id, ...(snap.data() as Omit<Campaign, 'id'>) });
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export function subscribeEntries(
  campaignId: string,
  onData: (entries: WikiEntry[]) => void
): () => void {
  const path = `campaigns/${campaignId}/entries`;
  return onSnapshot(
    collection(db, 'campaigns', campaignId, 'entries'),
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<WikiEntry, 'id'>),
      }));
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeGallery(
  campaignId: string,
  onData: (images: GalleryImage[]) => void
): () => void {
  const path = `campaigns/${campaignId}/gallery`;
  const q = query(collection(db, 'campaigns', campaignId, 'gallery'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<GalleryImage, 'id'>),
      }));
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function createCampaign(
  user: User,
  name: string,
  system = 'Pathfinder 2E'
): Promise<string> {
  const campaignId = makeDocId('camp');
  const inviteCode = generateInviteCode();
  const safeName = (name.trim() || 'Cronache di Golarion').slice(0, FIELD_LIMITS.campaignNameMax);
  const safeSystem = (system.trim() || 'Pathfinder 2E').slice(0, FIELD_LIMITS.systemMax);
  const displayName = (user.displayName || user.email?.split('@')[0] || 'Game Master').slice(0, 80);

  const batch = writeBatch(db);
  batch.set(doc(db, 'campaigns', campaignId), {
    name: safeName,
    system: safeSystem,
    diaryText: '',
    driveFileId: null,
    driveFileName: null,
    driveSyncedAt: null,
    ownerId: user.uid,
    inviteCode,
    memberUids: [user.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'campaigns', campaignId, 'members', user.uid), {
    uid: user.uid,
    displayName,
    role: 'gm',
    inviteCode,
    campaignOwnerId: user.uid,
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', user.uid, 'memberships', campaignId), {
    campaignId,
    campaignName: safeName,
    role: 'gm',
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'campaignInvites', inviteCode), {
    campaignId,
    campaignName: safeName,
    ownerId: user.uid,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return campaignId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `campaigns/${campaignId}`);
  }
}

export async function joinCampaignByInviteCode(user: User, rawCode: string): Promise<string> {
  const code = rawCode.trim().toUpperCase();
  if (!FIELD_LIMITS.inviteCodeRegex.test(code) || code.length < FIELD_LIMITS.inviteCodeMin) {
    throw new Error('Codice invito non valido.');
  }

  let inviteData: { campaignId: string; campaignName: string; ownerId: string } | null = null;
  try {
    const inviteSnap = await getDoc(doc(db, 'campaignInvites', code));
    if (!inviteSnap.exists()) {
      throw new Error('Codice invito inesistente o scaduto.');
    }
    inviteData = inviteSnap.data() as { campaignId: string; campaignName: string; ownerId: string };
  } catch (err) {
    if (err instanceof Error && err.message.includes('Codice invito')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, `campaignInvites/${code}`);
  }

  const { campaignId, campaignName, ownerId } = inviteData;

  const existingMemberSnap = await getDoc(
    doc(db, 'campaigns', campaignId, 'members', user.uid)
  ).catch(() => null);

  if (existingMemberSnap?.exists()) {
    return campaignId;
  }

  const displayName = (user.displayName || user.email?.split('@')[0] || 'Avventuriero').slice(0, 80);
  const batch = writeBatch(db);

  batch.set(doc(db, 'campaigns', campaignId, 'members', user.uid), {
    uid: user.uid,
    displayName,
    role: 'player',
    inviteCode: code,
    campaignOwnerId: ownerId,
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', user.uid, 'memberships', campaignId), {
    campaignId,
    campaignName: campaignName.slice(0, FIELD_LIMITS.campaignNameMax),
    role: 'player',
    joinedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'campaigns', campaignId), {
    memberUids: arrayUnion(user.uid),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return campaignId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `campaigns/${campaignId}/members/${user.uid}`);
  }
}

export async function updateCampaignDiary(
  campaignId: string,
  diaryText: string,
  driveMeta?: { fileId: string; fileName: string } | null
): Promise<void> {
  const safeDiary = trimToMaxBytes(diaryText, FIELD_LIMITS.diaryTextMax);
  const payload: Record<string, unknown> = {
    diaryText: safeDiary,
    updatedAt: serverTimestamp(),
  };

  if (driveMeta) {
    payload.driveFileId = sanitizeId(driveMeta.fileId);
    payload.driveFileName = driveMeta.fileName.slice(0, FIELD_LIMITS.driveFileNameMax);
    payload.driveSyncedAt = serverTimestamp();
  }

  try {
    await updateDoc(doc(db, 'campaigns', campaignId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `campaigns/${campaignId}`);
  }
}

export async function deleteCampaign(user: User, campaignId: string): Promise<void> {
  const campRef = doc(db, 'campaigns', campaignId);
  const membershipRef = doc(db, 'users', user.uid, 'memberships', campaignId);

  let campSnap;
  try {
    campSnap = await getDoc(campRef);
  } catch {
    // If campaign is already deleted or inaccessible, clean up own membership doc
    await deleteDoc(membershipRef).catch(() => undefined);
    return;
  }

  if (!campSnap.exists()) {
    await deleteDoc(membershipRef).catch(() => undefined);
    return;
  }

  const campData = campSnap.data() as { ownerId?: string; inviteCode?: string };
  if (campData.ownerId !== user.uid) {
    throw new Error('Solo il Game Master creatore può eliminare definitivamente questa campagna.');
  }

  // 1. Delete entries and gallery while campaign and membership still exist
  const [entriesSnap, gallerySnap, membersSnap] = await Promise.all([
    getDocs(collection(db, 'campaigns', campaignId, 'entries')),
    getDocs(collection(db, 'campaigns', campaignId, 'gallery')),
    getDocs(
      query(
        collection(db, 'campaigns', campaignId, 'members'),
        where('campaignOwnerId', '==', user.uid)
      )
    ),
  ]);

  if (!entriesSnap.empty) {
    await batchDeleteRefs(
      entriesSnap.docs.map((d) => d.ref),
      `campaigns/${campaignId}/entries`
    );
  }

  if (!gallerySnap.empty) {
    await batchDeleteRefs(
      gallerySnap.docs.map((d) => d.ref),
      `campaigns/${campaignId}/gallery`
    );
  }

  // 2. Delete invite doc if present
  if (campData.inviteCode) {
    try {
      await deleteDoc(doc(db, 'campaignInvites', campData.inviteCode));
    } catch {
      // Ignore if invite already removed
    }
  }

  // 3. Delete member docs (other members first, then own member doc) while campaign doc exists
  const otherMemberRefs = membersSnap.docs
    .filter((d) => d.id !== user.uid)
    .map((d) => d.ref);
  if (otherMemberRefs.length > 0) {
    await batchDeleteRefs(otherMemberRefs, `campaigns/${campaignId}/members`);
  }

  const selfMemberDoc = membersSnap.docs.find((d) => d.id === user.uid);
  if (selfMemberDoc) {
    try {
      await deleteDoc(selfMemberDoc.ref);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `campaigns/${campaignId}/members/${user.uid}`);
    }
  }

  // 4. Finally delete own membership pointer and the campaign document itself
  try {
    const finalBatch = writeBatch(db);
    finalBatch.delete(membershipRef);
    finalBatch.delete(campRef);
    await finalBatch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `campaigns/${campaignId}`);
  }
}

export async function leaveCampaign(user: User, campaignId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'campaigns', campaignId, 'members', user.uid));
  } catch {
    // Campaign may already be deleted by GM; still remove local membership pointer
  }

  try {
    await deleteDoc(doc(db, 'users', user.uid, 'memberships', campaignId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/memberships/${campaignId}`);
  }
}

export async function disconnectCampaignDrive(campaignId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'campaigns', campaignId), {
      driveFileId: null,
      driveFileName: null,
      driveSyncedAt: null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `campaigns/${campaignId}`);
  }
}

export async function saveWikiEntry(
  campaignId: string,
  userUid: string,
  input: {
    category: WikiCategory;
    name: string;
    role: string;
    status: string;
    desc: string;
    order?: number | null;
    image?: string | null;
  },
  entryId?: string
): Promise<void> {
  const safeName = input.name.trim().slice(0, FIELD_LIMITS.entryNameMax);
  if (!safeName) throw new Error('Il nome è obbligatorio.');

  const safePayload = {
    category: input.category,
    name: safeName,
    role: input.role.trim().slice(0, FIELD_LIMITS.entryRoleMax),
    status: input.status.trim().slice(0, FIELD_LIMITS.entryStatusMax),
    desc: input.desc.trim().slice(0, FIELD_LIMITS.entryDescMax),
    order:
      input.category === 'timeline' && typeof input.order === 'number' && Number.isFinite(input.order)
        ? Math.max(0, Math.min(100000, Math.round(input.order)))
        : null,
    image:
      input.image && input.image.length <= FIELD_LIMITS.entryImageMax ? input.image : null,
  };

  if (entryId) {
    const path = `campaigns/${campaignId}/entries/${entryId}`;
    try {
      await updateDoc(doc(db, 'campaigns', campaignId, 'entries', entryId), {
        ...safePayload,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  } else {
    const newId = makeDocId(input.category);
    const path = `campaigns/${campaignId}/entries/${newId}`;
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'campaigns', campaignId, 'entries', newId), {
        ...safePayload,
        createdBy: userUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }
}

export async function batchAddWikiEntries(
  campaignId: string,
  userUid: string,
  entries: Array<{
    category: WikiCategory;
    name: string;
    role: string;
    status: string;
    desc: string;
    order?: number | null;
  }>
): Promise<number> {
  if (entries.length === 0) return 0;

  let added = 0;
  for (let i = 0; i < entries.length; i += 400) {
    const slice = entries.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const item of slice) {
      const safeName = item.name.trim().slice(0, FIELD_LIMITS.entryNameMax);
      if (!safeName) continue;
      const newId = makeDocId(item.category);
      batch.set(doc(db, 'campaigns', campaignId, 'entries', newId), {
        category: item.category,
        name: safeName,
        role: (item.role || '').trim().slice(0, FIELD_LIMITS.entryRoleMax),
        status: (item.status || '').trim().slice(0, FIELD_LIMITS.entryStatusMax),
        desc: (item.desc || '').trim().slice(0, FIELD_LIMITS.entryDescMax),
        order:
          item.category === 'timeline' && typeof item.order === 'number'
            ? Math.max(0, Math.min(100000, Math.round(item.order)))
            : null,
        image: null,
        createdBy: userUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      added++;
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `campaigns/${campaignId}/entries`);
    }
  }
  return added;
}

export async function deleteWikiEntry(campaignId: string, entryId: string): Promise<void> {
  const path = `campaigns/${campaignId}/entries/${entryId}`;
  try {
    await deleteDoc(doc(db, 'campaigns', campaignId, 'entries', entryId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function addGalleryImage(
  campaignId: string,
  userUid: string,
  title: string,
  dataUrl: string
): Promise<void> {
  const newId = makeDocId('img');
  const path = `campaigns/${campaignId}/gallery/${newId}`;
  const safeTitle = (title.trim() || 'Mappa o Illustrazione').slice(0, FIELD_LIMITS.galleryTitleMax);
  if (dataUrl.length > FIELD_LIMITS.galleryDataUrlMax) {
    throw new Error('Immagine troppo pesante anche dopo la compressione.');
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'campaigns', campaignId, 'gallery', newId), {
      title: safeTitle,
      dataUrl,
      createdBy: userUid,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function batchAddGalleryImages(
  campaignId: string,
  userUid: string,
  images: Array<{ title: string; dataUrl: string }>
): Promise<number> {
  const valid = images.filter(
    (img) => img.dataUrl && img.dataUrl.length >= 10 && img.dataUrl.length <= FIELD_LIMITS.galleryDataUrlMax
  );
  if (valid.length === 0) return 0;

  let added = 0;
  for (let i = 0; i < valid.length; i += 15) {
    const slice = valid.slice(i, i + 15);
    const batch = writeBatch(db);
    for (const img of slice) {
      const newId = makeDocId('img');
      const safeTitle = (img.title.trim() || 'Mappa o Illustrazione').slice(
        0,
        FIELD_LIMITS.galleryTitleMax
      );
      batch.set(doc(db, 'campaigns', campaignId, 'gallery', newId), {
        title: safeTitle,
        dataUrl: img.dataUrl,
        createdBy: userUid,
        createdAt: serverTimestamp(),
      });
      added++;
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `campaigns/${campaignId}/gallery`);
    }
  }
  return added;
}

export async function deleteGalleryImage(campaignId: string, imageId: string): Promise<void> {
  const path = `campaigns/${campaignId}/gallery/${imageId}`;
  try {
    await deleteDoc(doc(db, 'campaigns', campaignId, 'gallery', imageId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function loadDemoIntoCampaign(
  campaignId: string,
  userUid: string,
  existingEntries: WikiEntry[]
): Promise<void> {
  await updateCampaignDiary(campaignId, DEMO_DIARY_TEXT);
  const existingNames = new Set(existingEntries.map((e) => e.name.trim().toLowerCase()));
  const missing = DEMO_ENTRIES.filter((d) => !existingNames.has(d.name.toLowerCase()));
  if (missing.length > 0) {
    await batchAddWikiEntries(campaignId, userUid, missing);
  }
}
