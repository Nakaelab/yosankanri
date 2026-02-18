"use server";

import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Teacher, Budget, Transaction, AttachmentMeta } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const TEACHERS_FILE = path.join(DATA_DIR, "teachers.json");
const BUDGETS_FILE = path.join(DATA_DIR, "budgets.json");
const TRANSACTIONS_FILE = path.join(DATA_DIR, "transactions.json");
const ATTACHMENTS_FILE = path.join(DATA_DIR, "attachments.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

// Ensure data directory exists
async function ensureDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (e) {
        // ignore if exists
    }
}

// Generic file helpers
async function readData<T>(file: string): Promise<T[]> {
    try {
        await ensureDir();
        const data = await fs.readFile(file, "utf-8");
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function writeData<T>(file: string, data: T[]): Promise<void> {
    await ensureDir();
    await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

// --------------------------------------------------------
// Teachers
// --------------------------------------------------------

export async function getTeachersAction(): Promise<Teacher[]> {
    return readData<Teacher>(TEACHERS_FILE);
}

export async function saveTeacherAction(teacher: Teacher): Promise<void> {
    const list = await getTeachersAction();
    // Check if exists
    if (!list.find((t) => t.id === teacher.id)) {
        list.push(teacher);
        await writeData(TEACHERS_FILE, list);
    }
}

// --------------------------------------------------------
// Budgets
// --------------------------------------------------------

// Add teacherId field to Budget type (extended locally for now if not in types.ts)
interface BudgetWithTeacher extends Budget {
    teacherId?: string; // Optional for backward compatibility (default user)
}

export async function getBudgetsAction(teacherId?: string): Promise<BudgetWithTeacher[]> {
    const all = await readData<BudgetWithTeacher>(BUDGETS_FILE);
    if (!teacherId || teacherId === "default") {
        // Return default budgets (no teacherId or teacherId === "default")
        return all.filter((b) => !b.teacherId || b.teacherId === "default");
    }
    return all.filter((b) => b.teacherId === teacherId);
}

export async function saveBudgetAction(budget: BudgetWithTeacher): Promise<void> {
    const all = await readData<BudgetWithTeacher>(BUDGETS_FILE);
    const index = all.findIndex((b) => b.id === budget.id);
    if (index >= 0) {
        all[index] = budget;
    } else {
        all.push(budget);
    }
    await writeData(BUDGETS_FILE, all);
}

export async function deleteBudgetAction(id: string): Promise<void> {
    const all = await readData<BudgetWithTeacher>(BUDGETS_FILE);
    const filtered = all.filter((b) => b.id !== id);
    await writeData(BUDGETS_FILE, filtered);
}

// --------------------------------------------------------
// Transactions
// --------------------------------------------------------

export async function getTransactionsAction(teacherId?: string): Promise<Transaction[]> {
    const all = await readData<Transaction>(TRANSACTIONS_FILE);
    if (!teacherId || teacherId === "default") {
        return all.filter((t) => !t.teacherId || t.teacherId === "default");
    }
    return all.filter((t) => t.teacherId === teacherId);
}

export async function saveTransactionAction(tx: Transaction): Promise<void> {
    const all = await readData<Transaction>(TRANSACTIONS_FILE);
    const index = all.findIndex((t) => t.id === tx.id);
    if (index >= 0) {
        all[index] = tx;
    } else {
        all.push(tx);
    }
    await writeData(TRANSACTIONS_FILE, all);
}

export async function deleteTransactionAction(id: string): Promise<void> {
    // Delete attachments
    const attachments = await readData<AttachmentMeta>(ATTACHMENTS_FILE);
    const toDelete = attachments.filter((a) => a.transactionId === id);

    // Delete files
    for (const att of toDelete) {
        try {
            await fs.unlink(path.join(UPLOADS_DIR, att.id));
        } catch { }
    }

    // Update attachments.json
    const newAttachments = attachments.filter((a) => a.transactionId !== id);
    await writeData(ATTACHMENTS_FILE, newAttachments);

    // Delete transaction
    const all = await readData<Transaction>(TRANSACTIONS_FILE);
    const filtered = all.filter((t) => t.id !== id);
    await writeData(TRANSACTIONS_FILE, filtered);
}

// --------------------------------------------------------
// Attachments
// --------------------------------------------------------

export async function getAttachmentsAction(transactionId: string): Promise<AttachmentMeta[]> {
    const all = await readData<AttachmentMeta>(ATTACHMENTS_FILE);
    return all.filter((a) => a.transactionId === transactionId);
}
