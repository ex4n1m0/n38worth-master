import { NextResponse } from "next/server";
import { deleteAccount } from "@/actions/deleteAccount";

export async function POST() {
  try {
    const result = await deleteAccount();

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Delete account API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
