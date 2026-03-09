"use client";

import { useEffect, useRef, useState } from "react";
import * as satellite from "satellite.js";

// ── CesiumJS CDN version ───────────────────────────────────────────────────
const CESIUM_VERSION = "1.125";
const CESIUM_BASE = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium`;

// Cesium global injected by CDN script
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CesiumType = any;

interface DataPoint {
    t: string;
    alt_km: number;
    lat: number;
    lon: number;
}

interface SatelliteGlobeProps {
    points: DataPoint[];
    tle1: string;
    tle2: string;
}

export default function SatelliteGlobe({ points, tle1, tle2 }: SatelliteGlobeProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<CesiumType>(null);
    const satEntityRef = useRef<CesiumType>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [cesiumLoaded, setCesiumLoaded] = useState(false);
    const [followSat, setFollowSat] = useState(false);
    const [liveInfo, setLiveInfo] = useState<{ lat: number; lon: number; alt: number } | null>(null);

    // ── Load Cesium CSS + JS from CDN ──────────────────────────────────────
    useEffect(() => {
        const cssId = "cesium-css";
        const jsId = "cesium-js";

        if (!document.getElementById(cssId)) {
            const link = document.createElement("link");
            link.id = cssId;
            link.rel = "stylesheet";
            link.href = `${CESIUM_BASE}/Widgets/widgets.css`;
            document.head.appendChild(link);
        }

        if (!document.getElementById(jsId)) {
            const script = document.createElement("script");
            script.id = jsId;
            script.src = `${CESIUM_BASE}/Cesium.js`;
            script.async = true;
            script.onload = () => setCesiumLoaded(true);
            document.head.appendChild(script);
        } else if ((window as CesiumType).Cesium) {
            // already loaded in a previous render
            setCesiumLoaded(true);
        }
    }, []);

    // ── Init Cesium viewer once CDN is ready ──────────────────────────────
    useEffect(() => {
        if (!cesiumLoaded || !containerRef.current || viewerRef.current) return;

        const Cesium: CesiumType = (window as CesiumType).Cesium;

        // Use empty token — OSM imagery doesn't need ion
        Cesium.Ion.defaultAccessToken =
            process.env.NEXT_PUBLIC_CESIUM_TOKEN ?? "";

        const viewer = new Cesium.Viewer(containerRef.current, {
            imageryProvider: new Cesium.UrlTemplateImageryProvider({
                url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                credit: "Esri, Maxar, Earthstar Geographics, and the GIS User Community",
                maximumLevel: 19,
            }),
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            animation: false,
            timeline: false,
            fullscreenButton: false,
            vrButton: false,
            selectionIndicator: false,
            infoBox: false,
            skyAtmosphere: new Cesium.SkyAtmosphere(),
        });

        viewerRef.current = viewer;

        // ── Dark space background ─────────────────────────────────────────
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0a0a1a");
        viewer.scene.globe.enableLighting = true;

        // ── Build orbit polyline from pre-computed points ─────────────────
        // Split at antimeridian the Cesium way: just pass Cartesian3 list —
        // Cesium handles 3D correctly without 2D antimeridian artifacts.
        const orbitCartesians: CesiumType[] = points.map((p) =>
            Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt_km * 1000)
        );

        viewer.entities.add({
            polyline: {
                positions: orbitCartesians,
                width: 2,
                arcType: Cesium.ArcType.NONE, // straight in 3D space = correct orbit arc
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.25,
                    taperPower: 1.0,
                    color: Cesium.Color.fromCssColorString("#818cf8").withAlpha(0.9),
                }),
            },
        });

        // ── Satellite SGP4 propagator ─────────────────────────────────────
        const satrec = satellite.twoline2satrec(tle1, tle2);

        const getSatPosition = (date: Date) => {
            const pv = satellite.propagate(satrec, date);
            if (!pv || !pv.position || typeof pv.position === "boolean") return null;
            const gmst = satellite.gstime(date);
            const geo = satellite.eciToGeodetic(pv.position, gmst);
            const pos = pv.position as satellite.EciVec3<number>;
            const altKm = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2) - 6371;
            return {
                lat: satellite.degreesLat(geo.latitude),
                lon: satellite.degreesLong(geo.longitude),
                alt: altKm,
            };
        };

        // ── Initial satellite entity ──────────────────────────────────────
        const initPos = getSatPosition(new Date()) ?? { lat: 0, lon: 0, alt: 400 };

        const satEntity = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(
                initPos.lon, initPos.lat, initPos.alt * 1000
            ),
            point: {
                pixelSize: 12,
                color: Cesium.Color.fromCssColorString("#f472b6"),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.NONE,
                scaleByDistance: new Cesium.NearFarScalar(1e4, 2.0, 2e7, 0.8),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
                text: "🛰️",
                font: "18px sans-serif",
                pixelOffset: new Cesium.Cartesian2(0, -22),
                showBackground: false,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2e7),
            },
        });

        satEntityRef.current = satEntity;

        // ── Real-time tick ────────────────────────────────────────────────
        const tick = () => {
            const pos = getSatPosition(new Date());
            if (!pos) return;
            satEntity.position = new Cesium.ConstantPositionProperty(
                Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt * 1000)
            );
            setLiveInfo(pos);
        };

        tick();
        intervalRef.current = setInterval(tick, 1000);

        // ── Initial camera: pull back to see full Earth ───────────────────
        viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(
                initPos.lon, initPos.lat, 20_000_000
            ),
        });

        // Cleanup
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            viewer.destroy();
            viewerRef.current = null;
            satEntityRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cesiumLoaded]);

    // ── Follow-satellite toggle ────────────────────────────────────────────
    useEffect(() => {
        if (!viewerRef.current || !satEntityRef.current) return;
        const Cesium: CesiumType = (window as CesiumType).Cesium;
        const viewer = viewerRef.current;
        if (followSat) {
            viewer.trackedEntity = satEntityRef.current;
        } else {
            viewer.trackedEntity = undefined;
            // Zoom back out to see whole Earth
            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(0, 0, 20_000_000),
                duration: 1.5,
            });
        }
    }, [followSat]);

    return (
        <div className="relative w-full rounded-xl overflow-hidden" style={{ height: "520px" }}>
            {/* Loading overlay */}
            {!cesiumLoaded && (
                <div
                    className="absolute inset-0 flex flex-col items-center justify-center z-10"
                    style={{ background: "#0a0a1a" }}
                >
                    <div className="text-5xl mb-4 animate-bounce">🌍</div>
                    <p className="text-slate-400 text-sm font-mono">Loading 3D Globe…</p>
                </div>
            )}

            {/* Cesium container */}
            <div ref={containerRef} style={{ height: "100%", width: "100%" }} />

            {/* Live info bar */}
            {cesiumLoaded && liveInfo && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 10,
                        left: 10,
                        zIndex: 1000,
                        background: "rgba(10,10,26,0.82)",
                        backdropFilter: "blur(6px)",
                        borderRadius: 8,
                        padding: "6px 14px",
                        color: "#e2e8f0",
                        fontSize: 12,
                        fontFamily: "monospace",
                        pointerEvents: "none",
                        border: "1px solid rgba(129,140,248,0.35)",
                    }}
                >
                    <span style={{ color: "#f472b6" }}>🛰️</span>
                    {" "}Lat <b>{liveInfo.lat.toFixed(2)}°</b>
                    {" "}Lon <b>{liveInfo.lon.toFixed(2)}°</b>
                    {" "}Alt <b>{liveInfo.alt.toFixed(1)} km</b>
                </div>
            )}

            {/* Follow-satellite button */}
            {cesiumLoaded && (
                <button
                    onClick={() => setFollowSat((f) => !f)}
                    style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        zIndex: 1000,
                        padding: "8px 16px",
                        background: followSat
                            ? "rgba(244,114,182,0.9)"
                            : "rgba(10,10,26,0.82)",
                        color: "#fff",
                        border: `1px solid ${followSat ? "#f472b6" : "rgba(129,140,248,0.4)"}`,
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 12,
                        fontFamily: "monospace",
                        backdropFilter: "blur(6px)",
                        transition: "all 0.2s",
                    }}
                >
                    {followSat ? "🔓 Free Camera" : "📡 Follow Satellite"}
                </button>
            )}
        </div>
    );
}
