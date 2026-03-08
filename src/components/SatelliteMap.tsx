"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface DataPoint {
    t: string;
    alt_km: number;
    lat: number;
    lon: number;
}

interface SatelliteMapProps {
    points: DataPoint[];
}

export default function SatelliteMap({ points }: SatelliteMapProps) {
    const positions: [number, number][] = points
        .filter((p) => typeof p.lat === "number" && typeof p.lon === "number")
        .map((p) => [p.lat, p.lon]);

    // Split track at antimeridian crossings (|Δlon| > 180)
    const segments: [number, number][][] = [];
    let current: [number, number][] = [];
    for (let i = 0; i < positions.length; i++) {
        if (
            i > 0 &&
            Math.abs(positions[i][1] - positions[i - 1][1]) > 180
        ) {
            if (current.length > 1) segments.push(current);
            current = [];
        }
        current.push(positions[i]);
    }
    if (current.length > 1) segments.push(current);

    const latest = positions[positions.length - 1];

    return (
        <div className="w-full rounded-xl overflow-hidden" style={{ height: "400px" }}>
            <MapContainer
                center={[0, 0]}
                zoom={2}
                style={{ height: "100%", width: "100%", background: "#0f172a" }}
                scrollWheelZoom={true}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
                />
                {segments.map((seg, i) => (
                    <Polyline
                        key={i}
                        positions={seg}
                        pathOptions={{ color: "#818cf8", weight: 2, opacity: 0.8 }}
                    />
                ))}
                {latest && (
                    <CircleMarker
                        center={latest}
                        radius={7}
                        pathOptions={{ color: "#f472b6", fillColor: "#f472b6", fillOpacity: 1, weight: 2 }}
                    >
                        <Tooltip permanent direction="top" offset={[0, -10]}>
                            🛰️ {points[points.length - 1].alt_km.toFixed(1)} km
                        </Tooltip>
                    </CircleMarker>
                )}
            </MapContainer>
        </div>
    );
}
