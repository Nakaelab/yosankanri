const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanData() {
    const { data: rows, error } = await supabase.from("app_data").select("key, value").like("key", "%budget_app_transactions%");
    if (error) {
        console.error("fetch error:", error);
        return;
    }
    
    for (const row of rows) {
        if (!row.value) continue;
        const originalLength = row.value.length;
        if (originalLength < 1000000) {
            console.log(`Skipping ${row.key}, size is small (${originalLength})`);
            continue;
        }
        
        try {
            const parsed = JSON.parse(row.value);
            let cleanedCount = 0;
            // Iterate over all transactions
            for (const tx of parsed) {
                if (tx.attachments && Array.isArray(tx.attachments)) {
                    for (const att of tx.attachments) {
                        if (att.storageUrl && att.storageUrl.startsWith("data:")) {
                            att.storageUrl = ""; // Remove the massive base64 payload
                            cleanedCount++;
                        }
                    }
                }
            }
            if (cleanedCount > 0) {
                const newValue = JSON.stringify(parsed);
                const newLength = newValue.length;
                console.log(`Cleaning ${row.key}: Removed ${cleanedCount} base64 strings. Size: ${originalLength} -> ${newLength}`);
                
                const { error: updateError } = await supabase.from("app_data").upsert({
                    key: row.key,
                    value: newValue,
                    updated_at: new Date().toISOString()
                });
                if (updateError) {
                    console.error("Failed to update:", row.key, updateError);
                } else {
                    console.log(`Successfully updated ${row.key}!`);
                }
            } else {
                 console.log(`No base64 attachments found in ${row.key} despite large size.`);
            }
        } catch (e) {
            console.error(`Failed to parse/clean ${row.key}:`, e);
        }
    }
}

cleanData();
