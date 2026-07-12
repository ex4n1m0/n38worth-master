import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function check() {
  const rows = await sql`
    SELECT o.id, o.owner_id, u.username as owner_name
    FROM ownership o
    JOIN users u ON u.id = o.owner_id
    JOIN users mh ON mh.id = o.owned_id
    WHERE mh.username = 'Mass Hire'
  `;
  console.log("Current Mass Hire owner:", rows.length > 0 ? `${rows[0].owner_name} (id=${rows[0].owner_id})` : "none");
  process.exit(0);
}

check().catch((e) => { console.error(e); process.exit(1); });
