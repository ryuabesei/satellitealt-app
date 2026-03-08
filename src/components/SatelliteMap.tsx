"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import * as L from "leaflet";
import * as satellite from "satellite.js";
import "leaflet/dist/leaflet.css";

interface DataPoint {
    t: string;
    alt_km: number;
    lat: number;
    lon: number;
}

interface SatelliteMapProps {
    points: DataPoint[];
    tle1: string;
    tle2: string;
}

// ---------------------------------------------------------------
// Inner component: runs inside MapContainer so it has map context
// ---------------------------------------------------------------
function LiveMarker({
    tle1,
    tle2,
    initialPoint,
}: {
    tle1: string;
    tle2: string;
    initialPoint: DataPoint;
}) {
    const map = useMap();
    const markerRef = useRef<L.CircleMarker | null>(null);
    const [liveData, setLiveData] = useState<{
        lat: number;
        lon: number;
        alt: number;
    }>({
        lat: initialPoint.lat,
        lon: initialPoint.lon,
        alt: initialPoint.alt_km,
    });

    useEffect(() => {
        // Build satrec once
        const satrec = satellite.twoline2satrec(tle1, tle2);

        // Create a Leaflet CircleMarker imperatively (avoids React re-render)
        const marker = L.circleMarker([initialPoint.lat, initialPoint.lon], {
            radius: 9,
            color: "#f472b6",
            fillColor: "#f472b6",
            fillOpacity: 1,
            weight: 2,
        }).addTo(map);

        marker.bindTooltip(
            `🛰️ ${initialPoint.alt_km.toFixed(1)} km`,
            { permanent: true, direction: "top", offset: [0, -12] }
        );

        markerRef.current = marker;

        // Pulse ring (optional visual flair)
        const pulse = L.circleMarker([initialPoint.lat, initialPoint.lon], {
            radius: 14,
            color: "#f472b6",
            fillOpacity: 0,
            weight: 1,
            opacity: 0.4,
        }).addTo(map);

        const tick = () => {
            const now = new Date();
            const pv = satellite.propagate(satrec, now);
            if (!pv || !pv.position || typeof pv.position === "boolean") return;

            const gmst = satellite.gstime(now);
            const geo = satellite.eciToGeodetic(pv.position, gmst);
            const lat = satellite.degreesLat(geo.latitude);
            const lon = satellite.degreesLong(geo.longitude);

            // ECI velocity magnitude → approximate speed km/s
            let altKm = 0;
            if (pv.position) {
                const pos = pv.position as satellite.EciVec3<number>;
                altKm = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2) - 6371;
            }

            // Imperatively update marker — no React re-render needed
            marker.setLatLng([lat, lon]);
            pulse.setLatLng([lat, lon]);
            marker.getTooltip()?.setContent(`🛰️ ${altKm.toFixed(1)} km`);

            // Also update React state for the info bar
            setLiveData({ lat, lon, alt: altKm });
        };

        tick(); // run immediately
        const interval = setInterval(tick, 1000);

        return () => {
            clearInterval(interval);
            marker.remove();
            pulse.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tle1, tle2, map]);

    // Live info bar rendered outside the map via portal-like pattern
    return (
        <div
            style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                zIndex: 1000,
                background: "rgba(15,23,42,0.85)",
                backdropFilter: "blur(6px)",
                borderRadius: 8,
                padding: "6px 12px",
                color: "#e2e8f0",
                fontSize: 13,
                fontFamily: "monospace",
                pointerEvents: "none",
                border: "1px solid rgba(129,140,248,0.3)",
            }}
        >
            <span style={{ color: "#f472b6" }}>🛰️</span>{" "}
            <span>Lat: {liveData.lat.toFixed(2)}°</span>{" "}
            <span style={{ marginLeft: 8 }}>Lon: {liveData.lon.toFixed(2)}°</span>{" "}
            <span style={{ marginLeft: 8 }}>Alt: {liveData.alt.toFixed(1)} km</span>
        </div>
    );
}

// ---------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------
export default function SatelliteMap({ points, tle1, tle2 }: SatelliteMapProps) {
    const positions: [number, number][] = points
        .filter((p) => typeof p.lat === "number" && typeof p.lon === "number")
        .map((p) => [p.lat, p.lon]);

    // Split track at antimeridian crossings (|Δlon| > 180)
    const segments: [number, number][][] = [];
    let seg: [number, number][] = [];
    for (let i = 0; i < positions.length; i++) {
        if (i > 0 && Math.abs(positions[i][1] - positions[i - 1][1]) > 180) {
            if (seg.length > 1) segments.push(seg);
            seg = [];
        }
        seg.push(positions[i]);
    }
    if (seg.length > 1) segments.push(seg);

    const latestPoint = points[points.length - 1];

    return (
        <div
            className="w-full rounded-xl overflow-hidden"
            style={{ height: "420px", position: "relative" }}
        >
            <MapContainer
                center={[0, 0]}
                zoom={2}
                style={{ height: "100%", width: "100%", background: "#0f172a" }}
                scrollWheelZoom={true}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
                />

                {/* Static ground track polyline */}
                {segments.map((s, i) => (
                    <Polyline
                        key={i}
                        positions={s}
                        pathOptions={{ color: "#818cf8", weight: 2, opacity: 0.7 }}
                    />
                ))}

                {/* Live marker — updates every second via setInterval */}
                {latestPoint && <LiveMarker tle1={tle1} tle2={tle2} initialPoint={latestPoint} />}
            </MapContainer>
        </div>
    );
}
