import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { compressAvatar } from "@/lib/compress-avatar";
import { createOnboardingNpcWithAvatar } from "@/lib/onboarding-npc";


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

    // Compress avatar image to ≤300 KB WebP for good quality + fast browsing
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

    // Create 3 fresh onboarding NPCs with unique avatars for this user
    let assignedNpcIds: number[] = [];
    if (isFirstUpload) {
      try {
        // Create 3 NPCs in parallel for faster creation
        const npcPromises = [
          createOnboardingNpcWithAvatar(false),
          createOnboardingNpcWithAvatar(false),
          createOnboardingNpcWithAvatar(false),
        ];
        const npcIds = (await Promise.all(npcPromises)).filter((id): id is number => id !== null);
        assignedNpcIds = npcIds;

        if (npcIds.length > 0) {
          // Store the NPC IDs in the user's onboarding state
          await db
            .update(users)
            .set({
              onboardingNpcs: assignedNpcIds,
              onboardingStarted: 1,
            })
            .where(eq(users.id, userId));

          console.log(`Created ${npcIds.length} fresh NPCs for user ${userId}`);
        }

        // Note: If fewer than 3 NPCs created (Unsplash failure), user can retry by generating a new random avatar
      } catch (onboardingError) {
        // NPC creation failed but avatar upload succeeded - log and continue
        console.error("Failed to create onboarding NPCs (non-fatal):", onboardingError);
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
