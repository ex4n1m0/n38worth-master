import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, lt, and, desc, notInArray } from "drizzle-orm";
import { compressAvatar } from "@/lib/compress-avatar";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, and WebP are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 2MB." },
        { status: 400 }
      );
    }

    // Compress avatar image to 50–100 KB for fast browsing
    const bytes = await file.arrayBuffer();
    const rawBuffer = Buffer.from(bytes);
    const { buffer: compressedBuffer, mimeType } = await compressAvatar(rawBuffer, file.type);
    const base64 = compressedBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Check if this is the first avatar upload (for bonus credits)
    const userId = parseInt(session.user.id);
    let currentAvatarCompleted = 0;
    const [currentUser] = await db
      .select({ avatarUrl: users.avatarUrl, credits: users.credits })
      .from(users)
      .where(eq(users.id, userId));

    // Try to get avatarCompleted - column may not exist yet
    try {
      const [onbUser] = await db
        .select({ avatarCompleted: users.avatarCompleted })
        .from(users)
        .where(eq(users.id, userId));
      currentAvatarCompleted = onbUser?.avatarCompleted ?? 0;
    } catch { /* column may not exist */ }

    // First custom upload = no avatar at all, or current avatar is an external URL (Unsplash etc.)
    // Only data: URLs mean the user has already uploaded their own avatar
    const isFirstUpload = !currentUser?.avatarUrl || !currentUser.avatarUrl.startsWith("data:");
    const hasExistingCustomAvatar = currentUser?.avatarUrl && currentUser.avatarUrl.startsWith("data:");

    // Update user avatar in database
    const updateData: { avatarUrl: string; updatedAt: Date; credits?: number } = {
      avatarUrl: dataUrl,
      updatedAt: new Date(),
    };

    // Award 1× total players credit bonus for first-time avatar upload
    let bonusAmount = 0;
    if (isFirstUpload) {
      const [countResult] = await db
        .select({ totalPlayers: sql<number>`COUNT(*)` })
        .from(users);
      const totalPlayers = Number(countResult?.totalPlayers ?? 0);
      bonusAmount = totalPlayers;
      updateData.credits = (currentUser?.credits ?? 0) + bonusAmount;
    }

    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    // Set avatar_completed flag (column may not exist yet)
    try {
      await db
        .update(users)
        .set({ avatarCompleted: 1 })
        .where(eq(users.id, userId));
    } catch {
      // Column may not exist yet - continue
    }

    // Assign onboarding NPCs only for first-time avatar uploads (optional - columns may not exist yet)
    let assignedNpcIds: number[] = [];
    if (isFirstUpload) {
      try {
        const [onboardingUser] = await db
          .select({ onboardingNpcs: users.onboardingNpcs })
          .from(users)
          .where(eq(users.id, userId));

        const existingNpcs = (onboardingUser?.onboardingNpcs as number[]) || [];
        assignedNpcIds = existingNpcs;

        if (existingNpcs.length === 0) {
          // Get all owned NPC IDs to exclude them
          const ownedNpcs = await db
            .select({ ownedId: ownership.ownedId })
            .from(ownership);
          const ownedIds = ownedNpcs.map((o) => o.ownedId);

          // Query: 3 newest NPCs, price < $20, still available (ownerless)
          const conditions = [
            eq(users.isNpc, 1),
            lt(users.playerValue, 20),
          ];

          // Exclude owned NPCs
          if (ownedIds.length > 0) {
            conditions.push(notInArray(users.id, ownedIds));
          }

          const npcs = await db
            .select({ id: users.id })
            .from(users)
            .where(and(...conditions))
            .orderBy(desc(users.createdAt))
            .limit(3);

          assignedNpcIds = npcs.map((n) => n.id);

          // Store the NPC IDs in the user's onboarding state
          await db
            .update(users)
            .set({ onboardingNpcs: assignedNpcIds })
            .where(eq(users.id, userId));
        }
      } catch (onboardingError) {
        // Onboarding columns may not exist yet - continue without them
        console.log("Onboarding assignment skipped (columns may not exist):", onboardingError);
      }
    }

    return NextResponse.json({
      avatarUrl: dataUrl,
      bonusAwarded: isFirstUpload,
      bonusAmount,
      avatarCompleted: true,
      starterNpcIds: assignedNpcIds,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
