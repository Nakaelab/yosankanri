"use client";

import { useState, useEffect, useCallback } from "react";
import {
    saveShakinPerson,
    deleteShakinPerson,
    getShakinPersons,
    calcShakinTotal,
} from "@/lib/storage";
import {
    ShakinPerson,
    ShakinMonthEntry,
    FISCAL_MONTHS,
    FiscalMonth,
    MONTH_LABELS,
} from "@/lib/types";

// ─── helpers ───────────────────────────────────────────────

const currentFiscalYear = () => {
    const now = new Date();
    return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
};

const emptyMonths = (): ShakinMonthEntry[] =>
    FISCAL_MONTHS.map((m) => ({ month: m, hours: null, hourlyRate: null }));

const calcMonthAmount = (entry: ShakinMonthEntry): number => {
    if (entry.hours === null || entry.hourlyRate === null) return 0;
    return Math.floor(entry.hours * entry.hourlyRate);
};

const fmt = (n: number) => n.toLocaleString("ja-JP");

// ─── PersonRow ─────────────────────────────────────────────

interface PersonRowProps {
    person: ShakinPerson;
    onSave: (p: ShakinPerson) => void;
    onDelete: (id: string) => void;
}

function PersonRow({ person, onSave, onDelete }: PersonRowProps) {

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<ShakinPerson>({ ...person, months: person.months.map((m) => ({ ...m })) });

    useEffect(() => {
        setDraft({ ...person, months: person.months.map((m) => ({ ...m })) });
    }, [person]);

    const handleCellChange = (month: FiscalMonth, field: "hours" | "hourlyRate", raw: string) => {
        const val = raw === "" ? null : parseFloat(raw);
        setDraft((prev) => ({
            ...prev,
            months: prev.months.map((m) =>
                m.month === month ? { ...m, [field]: val } : m
            ),
        }));
    };

    const handleSave = () => {
        onSave({ ...draft, updatedAt: new Date().toISOString() });
        setEditing(false);
    };

    const handleCancel = () => {
        setDraft({ ...person, months: person.months.map((m) => ({ ...m })) });
        setEditing(false);
    };

    const total = calcShakinTotal(draft);
    const source = editing ? draft : person;

    return (
        <div className="shakin-person-card">
            {/* Header */}
            <div
                className="shakin-person-header"
            >
                <div className="shakin-person-header-left">
                    <div className="shakin-avatar">
                        {person.name.slice(0, 1)}
                    </div>
                    <div>
                        <div className="shakin-person-name">{person.name}</div>
                        <div className="shakin-person-sub">{person.fiscalYear}年度</div>
                    </div>
                </div>
                <div className="shakin-person-header-right">
                    <div className="shakin-total-badge">
                        <span className="shakin-total-label">年間合計</span>
                        <span className="shakin-total-value">¥{fmt(total)}</span>
                    </div>
                    <button
                        className="shakin-action-btn shakin-edit-btn"
                        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                        title="編集"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                        </svg>
                    </button>
                    <button
                        className="shakin-action-btn shakin-delete-btn"
                        onClick={(e) => { e.stopPropagation(); if (confirm(`${person.name}さんを削除しますか？`)) onDelete(person.id); }}
                        title="削除"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Expanded table */}
            <div className="shakin-table-wrapper">
                    <div className="shakin-table-scroll">
                        <table className="shakin-table">
                            <thead>
                                <tr>
                                    <th className="shakin-th shakin-th-label">項目</th>
                                    {FISCAL_MONTHS.map((m) => (
                                        <th key={m} className="shakin-th">{MONTH_LABELS[m]}</th>
                                    ))}
                                    <th className="shakin-th shakin-th-total">合計</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* 時間 row */}
                                <tr>
                                    <td className="shakin-td-label">時間</td>
                                    {FISCAL_MONTHS.map((m) => {
                                        const entry = source.months.find((e) => e.month === m)!;
                                        return (
                                            <td key={m} className="shakin-td">
                                                {editing ? (
                                                    <input
                                                        className="shakin-input"
                                                        type="number"
                                                        min={0}
                                                        step={0.5}
                                                        value={entry.hours ?? ""}
                                                        onChange={(e) => handleCellChange(m, "hours", e.target.value)}
                                                        placeholder="—"
                                                    />
                                                ) : (
                                                    <span className={entry.hours !== null ? "shakin-cell-value" : "shakin-cell-empty"}>
                                                        {entry.hours !== null ? entry.hours : "—"}
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="shakin-td-total">
                                        {fmt(source.months.reduce((s, m) => s + (m.hours ?? 0), 0))}
                                    </td>
                                </tr>
                                {/* 時給 row */}
                                <tr>
                                    <td className="shakin-td-label">時給</td>
                                    {FISCAL_MONTHS.map((m) => {
                                        const entry = source.months.find((e) => e.month === m)!;
                                        return (
                                            <td key={m} className="shakin-td shakin-td-rate">
                                                {editing ? (
                                                    <input
                                                        className="shakin-input"
                                                        type="number"
                                                        min={0}
                                                        step={10}
                                                        value={entry.hourlyRate ?? ""}
                                                        onChange={(e) => handleCellChange(m, "hourlyRate", e.target.value)}
                                                        placeholder="—"
                                                    />
                                                ) : (
                                                    <span className={entry.hourlyRate !== null ? "shakin-cell-value shakin-cell-rate" : "shakin-cell-empty"}>
                                                        {entry.hourlyRate !== null ? entry.hourlyRate : "—"}
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="shakin-td-total">—</td>
                                </tr>
                                {/* 合計 row */}
                                <tr className="shakin-tr-total">
                                    <td className="shakin-td-label shakin-td-label-total">合計</td>
                                    {FISCAL_MONTHS.map((m) => {
                                        const entry = source.months.find((e) => e.month === m)!;
                                        const amt = calcMonthAmount(entry);
                                        return (
                                            <td key={m} className="shakin-td shakin-td-amount">
                                                {amt > 0 ? <span className="shakin-amount">{fmt(amt)}</span> : <span className="shakin-cell-empty">—</span>}
                                            </td>
                                        );
                                    })}
                                    <td className="shakin-td-total shakin-grand-total">¥{fmt(calcShakinTotal(source))}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {editing && (
                        <div className="shakin-edit-actions">
                            <button className="shakin-btn-cancel" onClick={handleCancel}>キャンセル</button>
                            <button className="shakin-btn-save" onClick={handleSave}>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                                保存
                            </button>
                        </div>
                    )}
                </div>
        </div>
    );
}

// ─── AddPersonModal ─────────────────────────────────────────

interface AddPersonModalProps {
    fiscalYear: number;
    onClose: () => void;
    onAdd: (p: ShakinPerson) => void;
}

function AddPersonModal({ fiscalYear, onClose, onAdd }: AddPersonModalProps) {
    const [name, setName] = useState("");
    const [defaultRate, setDefaultRate] = useState<number | "">(990);

    const handleSubmit = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const months: ShakinMonthEntry[] = FISCAL_MONTHS.map((m) => ({
            month: m,
            hours: null,
            hourlyRate: defaultRate === "" ? null : defaultRate,
        }));
        const now = new Date().toISOString();
        onAdd({
            id: crypto.randomUUID(),
            name: trimmed,
            fiscalYear,
            months,
            createdAt: now,
            updatedAt: now,
        });
        onClose();
    };

    return (
        <div className="shakin-modal-overlay" onClick={onClose}>
            <div className="shakin-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="shakin-modal-title">アルバイトを追加</h3>
                <div className="shakin-modal-body">
                    <div className="shakin-form-row">
                        <label className="shakin-form-label">氏名</label>
                        <input
                            className="shakin-form-input"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="例: 山田 太郎"
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                        />
                    </div>
                    <div className="shakin-form-row">
                        <label className="shakin-form-label">初期時給（円）</label>
                        <input
                            className="shakin-form-input"
                            type="number"
                            value={defaultRate}
                            onChange={(e) => setDefaultRate(e.target.value === "" ? "" : Number(e.target.value))}
                            placeholder="例: 990"
                            min={0}
                            step={10}
                        />
                        <p className="shakin-form-hint">各月で個別に変更できます</p>
                    </div>
                </div>
                <div className="shakin-modal-footer">
                    <button className="shakin-btn-cancel" onClick={onClose}>キャンセル</button>
                    <button className="shakin-btn-save" onClick={handleSubmit} disabled={!name.trim()}>
                        追加
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Page ───────────────────────────────────────────────────

export default function ShakinPage() {
    const [persons, setPersons] = useState<ShakinPerson[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);

    const load = useCallback(() => {
        setPersons(getShakinPersons());
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleSave = (p: ShakinPerson) => {
        saveShakinPerson(p);
        load();
    };

    const handleDelete = (id: string) => {
        deleteShakinPerson(id);
        load();
    };

    const handleAdd = (p: ShakinPerson) => {
        saveShakinPerson(p);
        load();
    };

    const grandTotal = persons.reduce((sum, p) => sum + calcShakinTotal(p), 0);


    return (
        <div className="shakin-page">
            {/* ヘッダー */}
            <div className="shakin-page-header">
                <div>
                    <h1 className="shakin-page-title">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                        </svg>
                        謝金管理
                    </h1>
                    <p className="shakin-page-sub">月別の稼働時間・時給を記録して謝金を自動計算します</p>
                </div>
                <div className="shakin-header-actions">
                    <button className="shakin-add-btn" onClick={() => setShowAddModal(true)}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        アルバイトを追加
                    </button>
                </div>
            </div>

            {/* サマリーバー */}
            {persons.length > 0 && (
                <div className="shakin-summary-bar">
                    <div className="shakin-summary-item">
                        <span className="shakin-summary-label">アルバイト数</span>
                        <span className="shakin-summary-value">{persons.length}名</span>
                    </div>
                    <div className="shakin-summary-divider" />
                    <div className="shakin-summary-item">
                        <span className="shakin-summary-label">謝金合計</span>
                        <span className="shakin-summary-value shakin-summary-grand">¥{fmt(grandTotal)}</span>
                    </div>
                </div>
            )}

            {/* 担当者リスト */}
            {persons.length === 0 ? (
                <div className="shakin-empty">
                    <svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                    <p className="shakin-empty-text">まだアルバイトが登録されていません</p>
                    <button className="shakin-add-btn" onClick={() => setShowAddModal(true)}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        最初のアルバイトを追加
                    </button>
                </div>
            ) : (
                <div className="shakin-list">
                    {persons.map((p) => (
                        <PersonRow key={p.id} person={p} onSave={handleSave} onDelete={handleDelete} />
                    ))}
                </div>
            )}

            {showAddModal && (
                <AddPersonModal
                    fiscalYear={currentFiscalYear()}
                    onClose={() => setShowAddModal(false)}
                    onAdd={handleAdd}
                />
            )}
        </div>
    );
}
