import { sellAllPlayers } from "@/actions/discardAllPlayers";

export async function POST() {
  const result = await sellAllPlayers();

  if (result.error) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json(result);
}
