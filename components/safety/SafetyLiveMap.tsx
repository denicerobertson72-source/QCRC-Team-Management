"use client";

import { useEffect, useRef, useState } from "react";
import type { SafetyLiveMapState } from "@/lib/types";
import { formatLocationAge, getLocationFreshness, SAFETY_LOCATION_REFRESH_INTERVAL_MS } from "@/lib/location-tracking";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatEasternDateTime } from "@/lib/time";

declare global {
  interface Window {
    mapboxgl?: any;
    __mapboxGlPromise?: Promise<any>;
  }
}

const MAPBOX_GL_VERSION = "v3.23.1";
const DEFAULT_CENTER: [number, number] = [-84.512, 39.1031];

function shortRowerName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Rower";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function formatPointTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function formatAccuracy(value: number | null) {
  if (value === null || Number.isNaN(value)) return "unknown";
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(1)} km`;
}

function locationUpdateLabel(recordedAt: string | null | undefined) {
  const freshness = getLocationFreshness(recordedAt);
  if (!recordedAt || freshness === "unavailable") return { text: "Location unavailable", className: "error" };
  if (freshness === "stale") return { text: `Location stale — last update ${formatLocationAge(recordedAt)}`, className: "error" };
  if (freshness === "delayed") return { text: `Location update delayed — last update ${formatLocationAge(recordedAt)}`, className: "error" };
  return { text: `Updated ${formatLocationAge(recordedAt)}`, className: "success" };
}

function trackingOverview(outings: SafetyLiveMapState["outings"]) {
  return outings.reduce(
    (summary, outing) => {
      const freshness = getLocationFreshness(outing.latest_point?.recorded_at);
      if (freshness === "current") summary.tracking += 1;
      else if (freshness === "delayed") summary.delayed += 1;
      else if (freshness === "stale") summary.stale += 1;
      else summary.unavailable += 1;
      return summary;
    },
    { tracking: 0, delayed: 0, stale: 0, unavailable: 0 },
  );
}

function loadMapboxGl() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Mapbox GL JS can only load in the browser."));
  }
  if (window.mapboxgl) {
    return Promise.resolve(window.mapboxgl);
  }
  if (window.__mapboxGlPromise) {
    return window.__mapboxGlPromise;
  }

  window.__mapboxGlPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[data-mapbox-gl="${MAPBOX_GL_VERSION}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_GL_VERSION}/mapbox-gl.css`;
      link.dataset.mapboxGl = MAPBOX_GL_VERSION;
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector(`script[data-mapbox-gl="${MAPBOX_GL_VERSION}"]`) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.mapboxgl), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Mapbox GL JS.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_GL_VERSION}/mapbox-gl.js`;
    script.async = true;
    script.dataset.mapboxGl = MAPBOX_GL_VERSION;
    script.onload = () => resolve(window.mapboxgl);
    script.onerror = () => reject(new Error("Failed to load Mapbox GL JS."));
    document.body.appendChild(script);
  });

  return window.__mapboxGlPromise;
}

function buildTrackGeoJson(state: SafetyLiveMapState) {
  return {
    type: "FeatureCollection",
    features: state.outings
      .filter((outing) => outing.track_points.length > 1)
      .map((outing) => ({
        type: "Feature",
        properties: {
          outingId: outing.outing_id,
          outingKind: outing.outing_kind,
          boatName: outing.boat_name,
          rowerName: outing.rower_name,
          rowerShortName: shortRowerName(outing.rower_name),
          isMine: outing.outing_id === state.my_active_outing_id,
          isOverdue: outing.is_overdue,
        },
        geometry: {
          type: "LineString",
          coordinates: outing.track_points.map((point) => [point.longitude, point.latitude]),
        },
      })),
  };
}

function buildPointGeoJson(state: SafetyLiveMapState) {
  return {
    type: "FeatureCollection",
    features: state.outings
      .filter((outing) => outing.latest_point)
      .map((outing) => ({
        type: "Feature",
        properties: {
          outingId: outing.outing_id,
          outingKind: outing.outing_kind,
          boatName: outing.boat_name,
          rowerName: outing.rower_name,
          rowerShortName: shortRowerName(outing.rower_name),
          locationLabel: outing.checkout_location ?? "Launch location not set",
          direction: outing.river_direction ?? "Direction not set",
          isMine: outing.outing_id === state.my_active_outing_id,
          isOverdue: outing.is_overdue,
          lastRecordedAt: outing.latest_point?.recorded_at ?? "",
        },
        geometry: {
          type: "Point",
          coordinates: [outing.latest_point!.longitude, outing.latest_point!.latitude],
        },
      })),
  };
}

export function SafetyLiveMap({
  initialState,
  showTrackingOverview = false,
  canManageSafety = false,
  mapboxAccessToken,
  mapboxStyleUrl,
  weatherRadarSources,
  weatherRadarAttribution,
}: {
  initialState: SafetyLiveMapState;
  showTrackingOverview?: boolean;
  canManageSafety?: boolean;
  mapboxAccessToken: string | null;
  mapboxStyleUrl: string | null;
  weatherRadarSources: Array<{ id: string; label: string; tileUrl: string | null }>;
  weatherRadarAttribution: string | null;
}) {
  const [state, setState] = useState(initialState);
  const [sharingMessage, setSharingMessage] = useState<string | null>(null);
  const [sharingMessageKind, setSharingMessageKind] = useState<"success" | "error">("success");
  const [radarVisible, setRadarVisible] = useState(false);
  const [selectedRadarId, setSelectedRadarId] = useState(weatherRadarSources[0]?.id ?? "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  const selectedRadarSource = weatherRadarSources.find((source) => source.id === selectedRadarId) ?? weatherRadarSources[0] ?? null;
  const weatherRadarTileUrl = selectedRadarSource?.tileUrl ?? null;

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (!weatherRadarSources.some((source) => source.id === selectedRadarId)) {
      setSelectedRadarId(weatherRadarSources[0]?.id ?? "");
    }
  }, [selectedRadarId, weatherRadarSources]);

  useEffect(() => {
    if (!mapboxAccessToken || !containerRef.current) return;
    let cancelled = false;

    void loadMapboxGl()
      .then((mapboxgl) => {
        if (cancelled || !containerRef.current) return;
        mapboxgl.accessToken = mapboxAccessToken;

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: mapboxStyleUrl || "mapbox://styles/mapbox/outdoors-v12",
          center: DEFAULT_CENTER,
          zoom: 11,
        });
        mapRef.current = map;

        map.addControl(new mapboxgl.NavigationControl(), "top-right");
        map.addControl(new mapboxgl.ScaleControl({ unit: "imperial" }));

        const geolocate = new mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true,
          },
          trackUserLocation: true,
          showUserHeading: true,
        });
        map.addControl(geolocate, "top-right");

        map.on("load", () => {
          map.addSource("outing-tracks", {
            type: "geojson",
            data: buildTrackGeoJson(state),
          });
          map.addLayer({
            id: "outing-tracks-layer",
            type: "line",
            source: "outing-tracks",
            paint: {
              "line-color": [
                "case",
                ["boolean", ["get", "isMine"], false],
                "#12724f",
                ["boolean", ["get", "isOverdue"], false],
                "#b42318",
                "#ff5a1f",
              ],
              "line-width": 4,
              "line-opacity": 0.82,
            },
          });

          map.addSource("outing-points", {
            type: "geojson",
            data: buildPointGeoJson(state),
          });
          map.addLayer({
            id: "outing-points-layer",
            type: "circle",
            source: "outing-points",
            paint: {
              "circle-radius": 8,
              "circle-color": [
                "case",
                ["boolean", ["get", "isMine"], false],
                "#12724f",
                ["boolean", ["get", "isOverdue"], false],
                "#b42318",
                "#ff5a1f",
              ],
              "circle-stroke-color": "#fff7f2",
              "circle-stroke-width": 2,
            },
          });
          map.addLayer({
            id: "outing-point-labels-layer",
            type: "symbol",
            source: "outing-points",
            layout: {
              "text-field": ["get", "rowerShortName"],
              "text-size": 12,
              "text-offset": [0, 1.25],
              "text-anchor": "top",
              "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            },
            paint: {
              "text-color": "#140f0d",
              "text-halo-color": "#fff7f2",
              "text-halo-width": 1.6,
            },
          });

          if (weatherRadarTileUrl) {
            map.addSource("weather-radar", {
              type: "raster",
              tiles: [weatherRadarTileUrl],
              tileSize: 256,
              attribution: weatherRadarAttribution || undefined,
            });
            map.addLayer({
              id: "weather-radar-layer",
              type: "raster",
              source: "weather-radar",
              layout: {
                visibility: radarVisible ? "visible" : "none",
              },
              paint: {
                "raster-opacity": 0.35,
              },
            });
          }

          const coordinates = state.outings.flatMap((outing) =>
            outing.track_points.map((point) => [point.longitude, point.latitude] as [number, number]),
          );
          if (coordinates.length > 0) {
            const bounds = coordinates.reduce(
              (accumulator, coordinate) => accumulator.extend(coordinate),
              new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]),
            );
            map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 });
          }

          map.on("click", "outing-points-layer", (event: any) => {
            const feature = event.features?.[0];
            if (!feature) return;
            const coordinates = feature.geometry.coordinates.slice();
            const properties = feature.properties ?? {};
            new mapboxgl.Popup({ closeButton: false, offset: 14 })
              .setLngLat(coordinates)
              .setHTML(
                `<strong>${properties.boatName ?? "Boat"}</strong><br/>${properties.rowerName ?? "Unknown rower"}<br/>${properties.locationLabel ?? ""}${properties.direction ? ` | ${properties.direction}` : ""}<br/>Last point: ${properties.lastRecordedAt ? formatPointTimestamp(properties.lastRecordedAt) : "unknown"}`,
              )
              .addTo(map);
          });

          map.on("mouseenter", "outing-points-layer", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "outing-points-layer", () => {
            map.getCanvas().style.cursor = "";
          });
        });
      })
      .catch((error: unknown) => {
        setSharingMessageKind("error");
        setSharingMessage(error instanceof Error ? error.message : "Could not load the map.");
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapboxAccessToken, mapboxStyleUrl, weatherRadarAttribution, weatherRadarTileUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const trackSource = map.getSource("outing-tracks");
    if (trackSource) {
      trackSource.setData(buildTrackGeoJson(state));
    }
    const pointSource = map.getSource("outing-points");
    if (pointSource) {
      pointSource.setData(buildPointGeoJson(state));
    }
    if (weatherRadarTileUrl && map.getLayer("weather-radar-layer")) {
      map.setLayoutProperty("weather-radar-layer", "visibility", radarVisible ? "visible" : "none");
    }
  }, [radarVisible, state, weatherRadarTileUrl]);

  useEffect(() => {
    const intervalId = window.setInterval(async () => {
      const response = await fetch("/api/safety/live-map", { cache: "no-store" });
      if (!response.ok) return;
      const nextState = (await response.json()) as SafetyLiveMapState;
      setState(nextState);
    }, SAFETY_LOCATION_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  const myActiveOutingId = state.my_active_outing_id;
  const myOuting = myActiveOutingId
    ? state.outings.find((outing) => outing.outing_id === myActiveOutingId) ?? null
    : null;
  const overview = trackingOverview(state.outings);

  function fitMapToOutings() {
    const map = mapRef.current;
    if (!map || state.outings.length === 0 || !window.mapboxgl) return;
    const coordinates = state.outings.flatMap((outing) =>
      outing.track_points.map((point) => [point.longitude, point.latitude] as [number, number]),
    );
    if (coordinates.length === 0) return;
    const bounds = coordinates.reduce(
      (accumulator, coordinate) => accumulator.extend(coordinate),
      new window.mapboxgl.LngLatBounds(coordinates[0], coordinates[0]),
    );
    map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 700 });
  }

  if (!mapboxAccessToken) {
    return <p className="muted">Live map is not configured yet.</p>;
  }

  return (
    <div className="stack">
      <div className="page-title">
        <div className="stack" style={{ gap: "0.35rem" }}>
          <h3>Live River Map</h3>
          <span className="muted">
            All signed-in QCRC rowers can view active boats on the river.
          </span>
        </div>
        <div className="quick-links">
          {state.outings.length > 0 ? (
            <button type="button" onClick={fitMapToOutings}>
              Fit Active Boats
            </button>
          ) : null}
          {weatherRadarSources.length > 1 ? (
            <select value={selectedRadarId} onChange={(event) => setSelectedRadarId(event.target.value)}>
              {weatherRadarSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          ) : null}
          {weatherRadarTileUrl ? (
            <button type="button" onClick={() => setRadarVisible((current) => !current)}>
              {radarVisible ? "Hide Radar" : "Show Radar"}
            </button>
          ) : null}
        </div>
      </div>

      {showTrackingOverview ? (
        <div className="card-subtle stack">
          <div className="page-title">
            <strong>Tracking Overview</strong>
            <span className="muted">Active boats, based on the most recently stored location.</span>
          </div>
          <div className="row" aria-label={`${state.outings.length} boats on water, ${overview.tracking} tracking, ${overview.delayed} delayed, ${overview.stale} stale, ${overview.unavailable} unavailable`}>
            <StatusChip label={`${state.outings.length} on water`} />
            <StatusChip label={`${overview.tracking} tracking`} kind="checked_in" />
            {overview.delayed > 0 ? <StatusChip label={`${overview.delayed} delayed`} kind="reserved" /> : null}
            {overview.stale > 0 ? <StatusChip label={`${overview.stale} stale`} kind="reserved" /> : null}
            {overview.unavailable > 0 ? <StatusChip label={`${overview.unavailable} unavailable`} kind="reserved" /> : null}
          </div>
        </div>
      ) : null}

      <div
        ref={containerRef}
        style={{
          width: "100%",
          minHeight: "420px",
          borderRadius: "18px",
          overflow: "hidden",
          border: "1px solid rgba(85, 43, 27, 0.18)",
        }}
      />

      <div className="grid">
        <div className="card-subtle stack">
          <strong>Live Safety View</strong>
          <p className="muted">
            {`${state.outings.length} active boat${state.outings.length === 1 ? "" : "s"} visible on the river map.`}
          </p>
          {sharingMessage ? <p className={sharingMessageKind}>{sharingMessage}</p> : null}
          {weatherRadarTileUrl ? (
            <p className="muted">
              Radar source: {selectedRadarSource?.label ?? "Configured radar"}
            </p>
          ) : (
            <p className="muted">Radar overlay not configured yet.</p>
          )}
        </div>

        {myOuting ? (
          <div className="card-subtle stack">
            <strong>{myOuting.latest_point && getLocationFreshness(myOuting.latest_point.recorded_at) === "current" ? "Location Sharing Active" : "Location Sharing Needs Attention"}</strong>
            <p className="muted">
              {myOuting.latest_point
                ? `Last known point: ${formatPointTimestamp(myOuting.latest_point.recorded_at)}. Accuracy ${formatAccuracy(myOuting.latest_point.accuracy_meters)}.`
                : "Location unavailable — no GPS point recorded yet for this outing."}
            </p>
            <p className={locationUpdateLabel(myOuting.latest_point?.recorded_at).className}>{locationUpdateLabel(myOuting.latest_point?.recorded_at).text}</p>
            <p className="muted">
              {myOuting.checkout_location ?? "Location not set"}
              {myOuting.river_direction ? ` | ${myOuting.river_direction}` : ""}
            </p>
          </div>
        ) : null}
      </div>

      <div className="card-subtle stack">
        <h3>Currently On The Water</h3>
        {state.on_water.length === 0 ? <p className="muted">No active launches right now.</p> : null}
        {state.on_water.map((entry) => (
          <div key={entry.id} className="card-subtle stack">
            <div className="page-title">
              <h4>{entry.boat_name}</h4>
              <StatusChip label={entry.is_overdue ? "overdue" : "on water"} kind={entry.is_overdue ? "reserved" : "checked_out"} />
            </div>
            <p className="muted">{entry.rower_name}</p>
            {entry.crew_names.length > 0 ? <p>Boat roster: {[entry.rower_name, ...entry.crew_names].join(", ")}</p> : null}
            <p>Launched: {formatEasternDateTime(entry.checked_out_at ?? entry.start_time)} ET</p>
            {canManageSafety ? (
              <p>{entry.checkout_location ?? "Location not set"} | {entry.river_direction ?? "Direction not set"}</p>
            ) : entry.river_direction ? (
              <p>Route: {entry.river_direction}</p>
            ) : null}
            {entry.launch_comment || entry.notes ? <p>Launch comments: {entry.launch_comment ?? entry.notes}</p> : null}
            {entry.return_comment ? <p>Return comments: {entry.return_comment}</p> : null}
            <p>Gate: {entry.gate_status === "unlocked" ? "Left unlocked" : entry.gate_status === "locked" ? "Locked" : "Not recorded"}</p>
          </div>
        ))}
      </div>

      <div className="grid">
        {state.outings.length === 0 ? <p className="muted">No active tracked outings yet.</p> : null}
        {state.outings.map((outing) => (
          <div key={outing.outing_id} className="card-subtle stack">
            <div className="page-title">
              <h4>{outing.boat_name}</h4>
              <span className="muted">
                {outing.outing_id === state.my_active_outing_id ? "Your outing" : outing.is_overdue ? "Overdue" : "On Water"}
              </span>
            </div>
            <p className="muted">{outing.rower_name}</p>
            <p>
              {outing.latest_point
                ? `Last point: ${outing.latest_point.latitude.toFixed(5)}, ${outing.latest_point.longitude.toFixed(5)}`
                : "No GPS point captured yet."}
            </p>
            {outing.latest_point ? (
              <p className={locationUpdateLabel(outing.latest_point.recorded_at).className}>
                {locationUpdateLabel(outing.latest_point.recorded_at).text} · Last known point at {formatPointTimestamp(outing.latest_point.recorded_at)} · Accuracy {formatAccuracy(outing.latest_point.accuracy_meters)}
              </p>
            ) : null}
            <p className="muted">
              {outing.checkout_location ?? "Location not set"}
              {outing.river_direction ? ` | ${outing.river_direction}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
