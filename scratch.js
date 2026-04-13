const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from("app_data").select("key").limit(100);
    if (error) {
        console.error("error", error);
    } else {
        console.log("Keys in cloud:", data.map(d => d.key));
        
        const tx = await supabase.from("app_data").select("key, value").like("key", "%budget_app_transactions%").limit(10);
        if (tx.data) {
            for (const row of tx.data) {
                const len = row.value ? row.value.length : 0;
                let parsed = [];
                try { parsed = JSON.parse(row.value); } catch {}
                console.log(`Key: ${row.key}, Length: ${len}, ElementCount: ${parsed?.length ?? "Error Parsing JSON"}`);
            }
        }
    }
}
check();
