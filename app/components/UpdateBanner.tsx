"use client";

import { useEffect, useState } from "react";

function getNextUpdate(): Date {
    const now = new Date();
    // Schedule: 1st of each month at 3:00 AM UTC
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 3, 0, 0));
    return next;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    });
}

export default function UpdateBanner() {
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

    useEffect(() => {
        fetch("https://raw.githubusercontent.com/bobarke2000/moviechat004/main/update_log.csv")
            .then((r) => r.text())
            .then((csv) => {
                const rows = csv.trim().split("\n").filter((r) => r && !r.startsWith("timestamp"));
                const last = rows[rows.length - 1];
                if (last) setLastUpdatedAt(last.split(",")[0]);
            })
            .catch(() => {});
    }, []);

    const nextUpdateStr = getNextUpdate().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    });

    return (
        <p
            style={{
                fontSize: "0.85rem",
                fontStyle: "italic",
                color: "#888",
                fontFamily: "'Instrument Serif', serif",
                textAlign: "center",
                marginTop: "0.25rem",
                marginBottom: "1.25rem",
            }}
        >
            {lastUpdatedAt ? `Updated ${formatDate(lastUpdatedAt)} · ` : ""}Next update {nextUpdateStr}
        </p>
    );
}
