import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
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
    const [currentUser] = await db
      .select({ avatarUrl: users.avatarUrl, credits: users.credits })
      .from(users)
      .where(eq(users.id, userId));

    // First custom upload = no avatar at all, or current avatar is an external URL (Unsplash etc.)
    // Only data: URLs mean the user has already uploaded their own avatar
    const isFirstUpload = !currentUser?.avatarUrl || !currentUser.avatarUrl.startsWith("data:");

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

    return NextResponse.json({ avatarUrl: dataUrl, bonusAwarded: isFirstUpload, bonusAmount });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
