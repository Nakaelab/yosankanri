const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function updateBudgets() {
    const { data: rows, error } = await supabase.from("app_data").select("key, value").like("key", "budget_app_budgets_v2%");
    if (error) {
        console.error("fetch error:", error);
        return;
    }
    
    for (const row of rows) {
        if (!row.value) continue;
        
        try {
            const parsed = JSON.parse(row.value);
            let updatedCount = 0;
            
            for (const budget of parsed) {
                if (budget.fiscalYear === 2027) {
                    budget.fiscalYear = 2026;
                    updatedCount++;
                }
            }
            
            if (updatedCount > 0) {
                const newValue = JSON.stringify(parsed);
                const { error: updateError } = await supabase.from("app_data").upsert({
                    key: row.key,
                    value: newValue,
                    updated_at: new Date().toISOString()
                });
                if (updateError) {
                    console.error("Failed to update:", row.key, updateError);
                } else {
                    console.log(`Updated ${updatedCount} budgets to 2026 in ${row.key}`);
                }
            } else {
                 console.log(`No 2027 budgets found in ${row.key}.`);
            }
        } catch (e) {
            console.error(`Failed to parse/update ${row.key}:`, e);
        }
    }
}

updateBudgets();
