"use client";
import { useRef, useState, useCallback } from "react";

/**
 * useTouchSort
 * Long-press (500ms) on mobile or click-drag on desktop to reorder items.
 * Returns props to spread on each draggable item and the current dragging state.
 */
export function useTouchSort<T extends { id: string }>(
    items: T[],
    onReorder: (newItems: T[]) => void
) {
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);

    // ── Desktop HTML5 DnD ─────────────────────────────────────────────────────
    const handleDragStart = useCallback(
        (id: string, e: React.DragEvent) => {
            setDraggingId(id);
            e.dataTransfer.effectAllowed = "move";
            requestAnimationFrame(() => {
                const el = e.currentTarget as HTMLElement;
                el.style.opacity = "0.4";
            });
        },
        []
    );

    const handleDragOver = useCallback(
        (id: string, e: React.DragEvent) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (id !== draggingId) setOverId(id);
        },
        [draggingId]
    );

    const handleDrop = useCallback(
        (targetId: string, e: React.DragEvent) => {
            e.preventDefault();
            if (!draggingId || draggingId === targetId) {
                setDraggingId(null);
                setOverId(null);
                return;
            }
            const from = items.findIndex((i) => i.id === draggingId);
            const to = items.findIndex((i) => i.id === targetId);
            if (from === -1 || to === -1) return;
            const next = [...items];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            onReorder(next);
            setDraggingId(null);
            setOverId(null);
        },
        [draggingId, items, onReorder]
    );

    const handleDragEnd = useCallback((e: React.DragEvent) => {
        (e.currentTarget as HTMLElement).style.opacity = "1";
        setDraggingId(null);
        setOverId(null);
    }, []);

    // ── Touch (long-press → drag) ──────────────────────────────────────────────
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchDragging = useRef<string | null>(null);
    const ghostRef = useRef<HTMLElement | null>(null);
    const startPos = useRef({ x: 0, y: 0 });

    const clearGhost = () => {
        if (ghostRef.current) {
            ghostRef.current.remove();
            ghostRef.current = null;
        }
    };

    const handleTouchStart = useCallback(
        (id: string, e: React.TouchEvent) => {
            const touch = e.touches[0];
            startPos.current = { x: touch.clientX, y: touch.clientY };

            longPressTimer.current = setTimeout(() => {
                // Trigger vibration feedback if supported
                if (navigator.vibrate) navigator.vibrate(50);
                touchDragging.current = id;
                setDraggingId(id);

                // Create a ghost element
                const src = e.currentTarget as HTMLElement;
                const clone = src.cloneNode(true) as HTMLElement;
                clone.style.cssText = `
                    position: fixed;
                    pointer-events: none;
                    z-index: 9999;
                    width: ${src.offsetWidth}px;
                    opacity: 0.85;
                    box-shadow: 0 12px 32px rgba(0,0,0,0.25);
                    border-radius: 12px;
                    left: ${touch.clientX - src.offsetWidth / 2}px;
                    top: ${touch.clientY - src.offsetHeight / 2}px;
                    transform: scale(1.03);
                    transition: transform 0.15s;
                `;
                document.body.appendChild(clone);
                ghostRef.current = clone;
            }, 500);
        },
        []
    );

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            const touch = e.touches[0];
            const dx = touch.clientX - startPos.current.x;
            const dy = touch.clientY - startPos.current.y;

            // Cancel long press if moved too much before activation
            if (!touchDragging.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                if (longPressTimer.current) clearTimeout(longPressTimer.current);
                return;
            }

            if (!touchDragging.current) return;
            e.preventDefault(); // Prevent scroll while dragging

            // Move ghost
            if (ghostRef.current) {
                const src = e.currentTarget as HTMLElement;
                ghostRef.current.style.left = `${touch.clientX - src.offsetWidth / 2}px`;
                ghostRef.current.style.top = `${touch.clientY - src.offsetHeight / 2}px`;
            }

            // Hit test: which item is under the finger?
            const els = document.querySelectorAll("[data-sortable-id]");
            let foundId: string | null = null;
            els.forEach((el) => {
                const rect = el.getBoundingClientRect();
                if (
                    touch.clientX >= rect.left &&
                    touch.clientX <= rect.right &&
                    touch.clientY >= rect.top &&
                    touch.clientY <= rect.bottom
                ) {
                    foundId = (el as HTMLElement).dataset.sortableId || null;
                }
            });
            if (foundId && foundId !== touchDragging.current) {
                setOverId(foundId);
            }
        },
        []
    );

    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (longPressTimer.current) clearTimeout(longPressTimer.current);

            const dragId = touchDragging.current;
            touchDragging.current = null;
            clearGhost();

            if (!dragId || !overId) {
                setDraggingId(null);
                setOverId(null);
                return;
            }

            const from = items.findIndex((i) => i.id === dragId);
            const to = items.findIndex((i) => i.id === overId);
            if (from !== -1 && to !== -1 && from !== to) {
                const next = [...items];
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                onReorder(next);
            }
            setDraggingId(null);
            setOverId(null);
        },
        [items, onReorder, overId]
    );

    /** Spread these props on the outer wrapper div of each sortable card */
    const getItemProps = useCallback(
        (id: string) => ({
            "data-sortable-id": id,
            draggable: true,
            onDragStart: (e: React.DragEvent) => handleDragStart(id, e),
            onDragOver: (e: React.DragEvent) => handleDragOver(id, e),
            onDrop: (e: React.DragEvent) => handleDrop(id, e),
            onDragEnd: handleDragEnd,
            onTouchStart: (e: React.TouchEvent) => handleTouchStart(id, e),
            onTouchMove: (e: React.TouchEvent) => handleTouchMove(e),
            onTouchEnd: (e: React.TouchEvent) => handleTouchEnd(e),
        }),
        [handleDragStart, handleDragOver, handleDrop, handleDragEnd, handleTouchStart, handleTouchMove, handleTouchEnd]
    );

    return { draggingId, overI: overId, getItemProps };
}
