"use client";

import { useEffect, useState } from "react";
import * as satellite from "satellite.js";
import { useLanguage } from "@/lib/i18n";

interface SatelliteInfoProps {
    noradId: number;
    satelliteName: string;
    tle1: string;
    tle2: string;
}

interface LiveData {
    altKm: number;
    speedKms: number;
}

interface SatcatEntry {
    OBJECT_NAME?: string;
    LAUNCH_DATE?: string;
    COUNTRY_CODE?: string;
}

// ── Parse orbital elements from TLE lines ─────────────────────────────────
function parseTLEParams(tle1: string, tle2: string) {
    // Inclination: TLE2 col 8-16
    const inclination = parseFloat(tle2.substring(8, 16).trim());
    // Mean motion: TLE2 col 52-63 (rev/day)
    const meanMotion = parseFloat(tle2.substring(52, 63).trim());
    // Period in minutes
    const periodMin = meanMotion > 0 ? 1440 / meanMotion : 0;
    // Eccentricity: TLE2 col 26-33 (decimal point assumed)
    const eccentricity = parseFloat("0." + tle2.substring(26, 33).trim());
    // Epoch year + day from TLE1
    const epochField = tle1.substring(18, 32).trim();
    const epochYear2 = parseInt(epochField.substring(0, 2));
    const year = epochYear2 >= 57 ? 1900 + epochYear2 : 2000 + epochYear2;
    const dayOfYear = parseFloat(epochField.substring(2));
    const epochDate = new Date(Date.UTC(year, 0, 1));
    epochDate.setUTCDate(epochDate.getUTCDate() + Math.floor(dayOfYear) - 1);

    return { inclination, periodMin, eccentricity, epochDate };
}

// ── Country code → display name mapping ──────────────────────────────────
const COUNTRY_MAP: Record<string, string> = {
    US: "United States (NASA)",
    CIS: "Russia (Roscosmos)",
    ISS: "International (NASA / Roscosmos / ESA / JAXA)",
    CN: "China (CNSA)",
    ESA: "ESA (Europe)",
    EUTELSAT: "Eutelsat",
    PRC: "China",
    JP: "Japan (JAXA)",
    IN: "India (ISRO)",
    FR: "France (CNES)",
    UK: "United Kingdom",
};

export default function SatelliteInfoPanel({
    noradId,
    satelliteName,
    tle1,
    tle2,
}: SatelliteInfoProps) {
    const { t } = useLanguage();
    const tr = t.results as Record<string, string>;
    const { inclination, periodMin, eccentricity, epochDate } = parseTLEParams(tle1, tle2);
    const [liveData, setLiveData] = useState<LiveData | null>(null);
    const [satcat, setSatcat] = useState<SatcatEntry | null>(null);

    // ── Real-time altitude + velocity ─────────────────────────────────────
    useEffect(() => {
        const satrec = satellite.twoline2satrec(tle1, tle2);

        const tick = () => {
            const now = new Date();
            const pv = satellite.propagate(satrec, now);
            if (!pv || !pv.position || typeof pv.position === "boolean") return;

            const pos = pv.position as satellite.EciVec3<number>;
            const altKm =
                Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2) - 6371;

            let speedKms = 0;
            if (pv.velocity && typeof pv.velocity !== "boolean") {
                const vel = pv.velocity as satellite.EciVec3<number>;
                speedKms = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
            }

            setLiveData({ altKm, speedKms });
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [tle1, tle2]);

    // ── Fetch satcat metadata from Celestrak ──────────────────────────────
    useEffect(() => {
        const controller = new AbortController();
        fetch(
            `https://celestrak.org/satcat/records.php?CATNR=${noradId}&FORMAT=JSON`,
            { signal: controller.signal }
        )
            .then((r) => r.json())
            .then((data: SatcatEntry[]) => {
                if (Array.isArray(data) && data.length > 0) setSatcat(data[0]);
            })
            .catch(() => { });
        return () => controller.abort();
    }, [noradId]);

    const rows: { label: string; value: string; live?: boolean }[] = [
        { label: tr["infoName"] ?? "Name", value: satelliteName },
        { label: tr["infoNoradId"] ?? "NORAD ID", value: String(noradId) },
        {
            label: tr["infoAltitude"] ?? "Altitude",
            value: liveData ? `${liveData.altKm.toFixed(1)} km` : "—",
            live: true,
        },
        {
            label: tr["infoVelocity"] ?? "Velocity",
            value: liveData ? `${liveData.speedKms.toFixed(2)} km/s` : "—",
            live: true,
        },
        { label: tr["infoPeriod"] ?? "Orbital Period", value: `${periodMin.toFixed(1)} min` },
        { label: tr["infoInclination"] ?? "Inclination", value: `${inclination.toFixed(2)}°` },
        { label: tr["infoEccentricity"] ?? "Eccentricity", value: eccentricity.toFixed(7) },
        {
            label: tr["infoTleEpoch"] ?? "TLE Epoch",
            value: epochDate.toISOString().split("T")[0],
        },
        {
            label: tr["infoLaunchDate"] ?? "Launch Date",
            value: satcat?.LAUNCH_DATE ?? "—",
        },
        {
            label: tr["infoOperator"] ?? "Operator / Country",
            value: satcat?.COUNTRY_CODE
                ? COUNTRY_MAP[satcat.COUNTRY_CODE] ?? satcat.COUNTRY_CODE
                : "—",
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map(({ label, value, live }) => (
                <div key={label} className="stat-card relative">
                    {live && (
                        <span
                            className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-400"
                            style={{ boxShadow: "0 0 6px #4ade80" }}
                            title="Live"
                        />
                    )}
                    <div className="text-gray-400 text-sm">{label}</div>
                    <div
                        className="text-white font-mono mt-1"
                        style={{ fontSize: "1rem", wordBreak: "break-all" }}
                    >
                        {value}
                    </div>
                </div>
            ))}
        </div>
    );
}
