import { NextRequest, NextResponse } from "next/server";
import * as satellite from "satellite.js";

const EARTH_RADIUS_KM = 6371;

// Increase Vercel function timeout (requires Pro plan for > 10s; default is 10s)
export const maxDuration = 30;
export const runtime = "nodejs";

async function fetchTLE(norad: number) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${norad}&FORMAT=TLE`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SatelliteAltitudeApp/1.0 (Next.js)",
        Accept: "text/plain",
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Failed to fetch TLE: ${res.status} ${res.statusText} ${errorText}`);
  }

  const text = await res.text();
  const lines = text.trim().split("\n");

  if (lines.length < 3) {
    throw new Error("Invalid TLE");
  }

  return {
    line1: lines[1],
    line2: lines[2],
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const noradStr = searchParams.get("n");
    const startStr = searchParams.get("start");
    const endStr = searchParams.get("end");
    const stepStr = searchParams.get("step_seconds");

    if (!noradStr || !startStr || !endStr) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const norad = Number(noradStr);
    const start = new Date(startStr);
    const end = new Date(endStr);
    const step = Number(stepStr || 60);

    if (isNaN(norad) || isNaN(start.getTime()) || isNaN(end.getTime()) || isNaN(step)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    if (start >= end) {
      return NextResponse.json({ error: "Start time must be before end time" }, { status: 400 });
    }

    const totalSeconds = (end.getTime() - start.getTime()) / 1000;
    const numPoints = Math.floor(totalSeconds / step) + 1;
    const MAX_DATA_POINTS = 20000;

    if (numPoints > MAX_DATA_POINTS) {
      return NextResponse.json(
        { detail: `Too many data points (${numPoints}). Maximum allowed is ${MAX_DATA_POINTS}. Please increase step_seconds or reduce time range.` },
        { status: 400 }
      );
    }

    const { line1, line2 } = await fetchTLE(norad);

    const satrec = satellite.twoline2satrec(line1, line2);

    const points = [];
    let current = new Date(start);

    while (current <= end) {
      const positionAndVelocity = satellite.propagate(satrec, current);
      const position = positionAndVelocity?.position;

      if (position && typeof position !== "boolean") {
        const gmst = satellite.gstime(current);
        const geodetic = satellite.eciToGeodetic(position, gmst);
        const lat = satellite.degreesLat(geodetic.latitude);
        const lon = satellite.degreesLong(geodetic.longitude);

        const distance = Math.sqrt(
          position.x * position.x +
          position.y * position.y +
          position.z * position.z
        );
        const altitude = distance - EARTH_RADIUS_KM;
        points.push({
          t: current.toISOString(),
          alt_km: Number(altitude.toFixed(2)),
          lat: Number(lat.toFixed(4)),
          lon: Number(lon.toFixed(4)),
        });
      }

      current = new Date(current.getTime() + step * 1000);
    }

    const tle_epoch_str = line1.substring(18, 32).trim();

    return NextResponse.json({
      norad_id: norad,
      start,
      end,
      step_seconds: step,
      points,
      meta: {
        tle_source: "celestrak",
        tle_epoch: tle_epoch_str,
        earth_radius_km: EARTH_RADIUS_KM,
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Internal error", detail: errorMessage },
      { status: 500 }
    );
  }
}