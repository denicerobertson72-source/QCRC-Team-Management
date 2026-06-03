"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RowingLocationPoint, SafetyLiveMapState } from "@/lib/types";

declare global {
  interface Window {
    mapboxgl?: any;
    __mapboxGlPromise?: Promise<any>;
  }
}

const MAPBOX_GL_VERSION = "v3.23.1";
const DEFAULT_CENTER: [number, number] = [-84.512, 39.1031];

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
          reservationId: outing.reservation_id,
          boatName: outing.boat_name,
          rowerName: outing.rower_name,
          isMine: outing.reservation_id === state.my_active_reservation_id,
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
          reservationId: outing.reservation_id,
          boatName: outing.boat_name,
          rowerName: outing.rower_name,
          locationLabel: outing.checkout_location ?? "Launch location not set",
          direction: outing.river_direction ?? "Direction not set",
          isMine: outing.reservation_id === state.my_active_reservation_id,
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

function withMyLatestPoint(state: SafetyLiveMapState, reservationId: string, memberId: string, point: RowingLocationPoint) {
  return {
    ...state,
    outings: state.outings.map((outing) => {
      if (outing.reservation_id !== reservationId) return outing;
      const existingWithoutLatest = outing.track_points.filter((entry) => entry.id !== point.id);
      return {
        ...outing,
        member_id: memberId,
        latest_point: point,
        track_points: [...existingWithoutLatest, point].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)),
      };
    }),
  };
}

export function SafetyLiveMap({
  initialState,
  currentUserId,
  mapboxAccessToken,
  mapboxStyleUrl,
  weatherRadarSources,
  weatherRadarAttribution,
}: {
  initialState: SafetyLiveMapState;
  currentUserId: string;
  mapboxAccessToken: string | null;
  mapboxStyleUrl: string | null;
  weatherRadarSources: Array<{ id: string; label: string; tileUrl: string | null }>;
  weatherRadarAttribution: string | null;
}) {
  const [state, setState] = useState(initialState);
  const [sharingEnabled, setSharingEnabled] = useState(false);
  const [sharingMessage, setSharingMessage] = useState<string | null>(null);
  const [sharingMessageKind, setSharingMessageKind] = useState<"success" | "error">("success");
  const [radarVisible, setRadarVisible] = useState(false);
  const [selectedRadarId, setSelectedRadarId] = useState(weatherRadarSources[0]?.id ?? "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const geolocateRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastUploadAtRef = useRef<number>(0);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }

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
        geolocateRef.current = geolocate;
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
              "text-field": ["get", "boatName"],
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
      setState((current) => {
        if (!sharingEnabled || !current.my_active_reservation_id) {
          return nextState;
        }
        const myOuting = current.outings.find((outing) => outing.reservation_id === current.my_active_reservation_id);
        if (!myOuting?.latest_point) {
          return nextState;
        }
        return withMyLatestPoint(nextState, current.my_active_reservation_id, currentUserId, myOuting.latest_point);
      });
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [currentUserId, sharingEnabled]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const myActiveReservationId = state.my_active_reservation_id;
  const myOuting = myActiveReservationId
    ? state.outings.find((outing) => outing.reservation_id === myActiveReservationId) ?? null
    : null;

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

  async function startSharing() {
    if (!myActiveReservationId || !navigator.geolocation) {
      setSharingMessageKind("error");
      setSharingMessage("Location sharing is unavailable on this device.");
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setSharingEnabled(true);
    setSharingMessageKind("success");
    setSharingMessage("Location sharing active.");
    geolocateRef.current?.trigger?.();

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const point: RowingLocationPoint = {
          id: `local-${position.timestamp}`,
          reservation_id: myActiveReservationId,
          member_id: currentUserId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_meters: position.coords.accuracy ?? null,
          recorded_at: new Date(position.timestamp).toISOString(),
        };

        setState((current) => withMyLatestPoint(current, myActiveReservationId, currentUserId, point));

        const now = Date.now();
        if (now - lastUploadAtRef.current < 30000) return;
        lastUploadAtRef.current = now;

        const { error } = await supabaseRef.current!.from("rowing_location_points").insert({
          reservation_id: myActiveReservationId,
          member_id: currentUserId,
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy_meters: point.accuracy_meters,
          recorded_at: point.recorded_at,
        });

        if (error) {
          setSharingMessageKind("error");
          setSharingMessage(`Location upload failed: ${error.message}`);
        } else {
          setSharingMessageKind("success");
          setSharingMessage("Live location sharing is active for your current outing.");
        }
      },
      (error) => {
        setSharingEnabled(false);
        setSharingMessageKind("error");
        setSharingMessage(error.message || "Location sharing was denied.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 20000,
      },
    );
  }

  function stopSharing() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharingEnabled(false);
    setSharingMessageKind("success");
    setSharingMessage("Location sharing paused.");
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
            {state.can_manage_all_boats
              ? "Admins and coaches can monitor all active boats."
              : "You can monitor only your active outing while on the water."}
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
          {myOuting ? (
            <button type="button" onClick={sharingEnabled ? stopSharing : startSharing}>
              {sharingEnabled ? "Stop Sharing" : "Start Sharing"}
            </button>
          ) : null}
        </div>
      </div>

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
          <strong>{state.can_manage_all_boats ? "Safety Dashboard View" : "My Live Outing"}</strong>
          <p className="muted">
            {state.can_manage_all_boats
              ? `${state.outings.length} active boat${state.outings.length === 1 ? "" : "s"} visible on the river map.`
              : myOuting
                ? `Tracking ${myOuting.boat_name} while you are checked out.`
                : "Launch a reservation to begin live sharing and route capture."}
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
            <strong>{sharingEnabled ? "Live Sharing Active" : "Live Sharing Ready"}</strong>
            <p className="muted">
              {myOuting.latest_point
                ? `Last point recorded ${formatPointTimestamp(myOuting.latest_point.recorded_at)}. Accuracy ${formatAccuracy(myOuting.latest_point.accuracy_meters)}.`
                : "No GPS point recorded yet for this outing."}
            </p>
            <p className="muted">
              {myOuting.checkout_location ?? "Location not set"}
              {myOuting.river_direction ? ` | ${myOuting.river_direction}` : ""}
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid">
        {state.outings.length === 0 ? <p className="muted">No active tracked outings yet.</p> : null}
        {state.outings.map((outing) => (
          <div key={outing.reservation_id} className="card-subtle stack">
            <div className="page-title">
              <h4>{outing.boat_name}</h4>
              <span className="muted">
                {outing.reservation_id === state.my_active_reservation_id ? "Your outing" : outing.is_overdue ? "Overdue" : "On Water"}
              </span>
            </div>
            <p className="muted">{outing.rower_name}</p>
            <p>
              {outing.latest_point
                ? `Last point: ${outing.latest_point.latitude.toFixed(5)}, ${outing.latest_point.longitude.toFixed(5)}`
                : "No GPS point captured yet."}
            </p>
            {outing.latest_point ? (
              <p className="muted">
                Updated {formatPointTimestamp(outing.latest_point.recorded_at)} | Accuracy {formatAccuracy(outing.latest_point.accuracy_meters)}
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
