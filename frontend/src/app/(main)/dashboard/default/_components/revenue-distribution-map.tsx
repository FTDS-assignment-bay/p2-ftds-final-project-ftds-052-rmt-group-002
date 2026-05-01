"use client";

import { useEffect, useRef, useState } from "react";
import type { Feature } from "geojson";
import type { Path } from "leaflet";
import { fetchCityRevenue } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

declare global {
  interface Window {
    L: typeof import("leaflet");
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type CityRevenueMap = Record<string, number>;
type GeoLayer = Path;

// ── Constants ─────────────────────────────────────────────────────────────────
const NAME_MAP: Record<string, string> = {
  Istanbul: "İstanbul",
  Izmir: "İzmir",
  Eskisehir: "Eskişehir",
};

const TURKEY_GEOJSON_URL =
  "https://raw.githubusercontent.com/alpers/Turkey-Maps-GeoJSON/master/tr-cities.json";
let cachedGeoJson: unknown = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `₺ ${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;

function getColor(revenue: number, max: number): string {
  if (revenue <= 0 || max <= 0) return "#f1f1f1";
  const pct = revenue / max;
  if (pct >= 0.8) return "#111111";
  if (pct >= 0.6) return "#333333";
  if (pct >= 0.4) return "#555555";
  if (pct >= 0.2) return "#888888";
  if (pct >= 0.1) return "#bbbbbb";
  return "#dedede";
}

function buildTooltip(cityName: string, revenue: number): string {
  return `
    <div class="sw-tooltip">
      <div class="sw-tooltip-title">${cityName}</div>
      <div class="sw-tooltip-row">
        <span>Revenue</span>
        <strong>${fmt(revenue)}</strong>
      </div>
    </div>
  `;
}

function loadLeaflet(onLoad: () => void): () => void {
  if (!document.querySelector('link[href*="leaflet"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }

  if (window.L) {
    onLoad();
    return () => { };
  }

  const existing = document.querySelector<HTMLScriptElement>('script[src*="leaflet"]');
  const script = existing ?? document.createElement("script");

  if (!existing) {
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    document.head.appendChild(script);
  }

  script.addEventListener("load", onLoad);
  return () => script.removeEventListener("load", onLoad);
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CustomerDistributionMap() {
  // --- refs ---
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<ReturnType<typeof window.L.map> | null>(null);
  const geoLayerRef = useRef<ReturnType<typeof window.L.geoJSON<any>> | null>(null);

  // --- state ---
  const [cityData, setCityData] = useState<CityRevenueMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);

  // --- derived values ---
  const sortedCities = Object.entries(cityData).sort((a, b) => b[1] - a[1]);
  const max = sortedCities[0]?.[1] ?? 1;
  const totalRevenue = Object.values(cityData).reduce((sum, v) => sum + v, 0);
  const topCity = sortedCities[0];

  // ── Effect 1: Fetch revenue data ───────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();

    fetchCityRevenue(controller.signal)
      .then((json) => {
        const mapped: CityRevenueMap = {};
        for (const item of json.data) {
          const geoName = NAME_MAP[item.city] ?? item.city;
          mapped[geoName] = item.total_revenue;
        }
        setCityData(mapped);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  // ── Effect 2: Init Leaflet map (once) ─────────────────────────────────────
  useEffect(() => {
    if (loading || error || !mapRef.current || mapInstanceRef.current) return;

    const cleanup = loadLeaflet(() => {
      if (!mapRef.current || mapInstanceRef.current) return;

      mapInstanceRef.current = window.L.map(mapRef.current, {
        center: [39, 35],
        zoom: 5.5,
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true,
      });

      setMapReady(true);
    });

    return () => {
      cleanup();
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      geoLayerRef.current = null;
      setMapReady(false);
    };
  }, [loading, error]);

  // ── Effect 3: Render / update GeoJSON layer ────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map || !window.L) return;

    if (geoLayerRef.current) {
      map.removeLayer(geoLayerRef.current);
      geoLayerRef.current = null;
    }

    if (Object.keys(cityData).length === 0) return;

    const entries = Object.entries(cityData).sort((a, b) => b[1] - a[1]);
    const currentMax = entries[0]?.[1] ?? 1;
    const controller = new AbortController();

    (cachedGeoJson
      ? Promise.resolve(cachedGeoJson)
      : fetch(TURKEY_GEOJSON_URL, { signal: controller.signal }).then((r) => r.json())
    )
      .then((geojson) => {
        cachedGeoJson = geojson;
        if (!mapInstanceRef.current) return;

        const layer = window.L.geoJSON(geojson, {
          style: (feature?: Feature) => ({
            fillColor: getColor(cityData[feature?.properties?.["name"] ?? ""] ?? 0, currentMax),
            weight: 0.8,
            opacity: 1,
            color: "#ffffff",
            fillOpacity: 0.85,
          }),
          onEachFeature: (feature: Feature, layer: GeoLayer) => {
            const cityName = feature?.properties?.["name"] ?? "";
            const revenue = cityData[cityName] ?? 0;

            layer.bindTooltip(buildTooltip(cityName, revenue), {
              sticky: true,
              opacity: 1,
              className: "sw-leaflet-tooltip",
            });

            layer.on({
              mouseover: (e: { target: GeoLayer }) => {
                e.target.setStyle({ weight: 2, color: "#000000", fillOpacity: 1 });
                e.target.bringToFront();
              },
              mouseout: (e: { target: GeoLayer }) => {
                e.target.setStyle({
                  weight: 0.8,
                  color: "#ffffff",
                  fillColor: getColor(revenue, currentMax),
                  fillOpacity: 0.85,
                });
              },
            });
          },
        });

        layer.addTo(map);
        geoLayerRef.current = layer as any;
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") console.error(err);
      });

    return () => controller.abort();
  }, [mapReady, cityData]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Card className="col-span-1 xl:col-span-4">
      <CardHeader>
        <CardTitle className="leading-none">Revenue Distribution by City</CardTitle>
        <CardDescription>
          {loading ? (
            "Loading data..."
          ) : error ? (
            <span className="text-destructive">Failed to load: {error}</span>
          ) : (
            <>
              Total revenue{" "}
              <span className="font-medium text-foreground">{fmt(totalRevenue)}</span>{" "}
              across {Object.keys(cityData).length} cities — highest in{" "}
              <span className="font-medium text-foreground">{topCity?.[0]}</span>{" "}
              ({fmt(topCity?.[1] ?? 0)})
            </>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div
          className="relative overflow-hidden rounded-lg border bg-card text-card-foreground"
          style={{ height: "420px" }}
        >
          {(loading || error) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/50">
              <span className={`text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}>
                {error ? "Failed to load data" : "Loading map data..."}
              </span>
            </div>
          )}

          <div ref={mapRef} className="h-full w-full" />

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[1000] rounded-lg border bg-card/95 shadow-md backdrop-blur-sm">
            <button
              onClick={() => setLegendOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-4 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Revenue by City
              <span className="text-xs">{legendOpen ? "▲" : "▼"}</span>
            </button>

            {legendOpen && (
              <div className="max-h-64 overflow-y-auto px-3 pb-2.5">
                <div className="flex flex-col gap-1.5">
                  {sortedCities.map(([city, revenue], index) => (
                    <div key={city} className="flex items-center gap-2">
                      <div
                        className="size-3 shrink-0 rounded-sm border border-white/20"
                        style={{ background: getColor(revenue, max) }}
                      />
                      <span className="text-xs text-muted-foreground">
                        #{index + 1} {city}
                      </span>
                      <span className="ml-auto text-xs font-medium tabular-nums text-foreground">
                        {fmt(revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>

      <style>{`
          .sw-leaflet-tooltip {
            background: #ffffff !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.12) !important;
            padding: 0 !important;
          }
          .sw-leaflet-tooltip::before { display: none !important; }
          .sw-tooltip {
            padding: 10px 12px;
            min-width: 160px;
            font-family: inherit;
          }
          .sw-tooltip-title {
            font-weight: 600;
            font-size: 13px;
            color: #111111;
            margin-bottom: 6px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 6px;
          }
          .sw-tooltip-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            font-size: 12px;
            color: #666666;
            margin-top: 4px;
          }
          .sw-tooltip-row strong {
            color: #111111;
            font-weight: 600;
          }
          .leaflet-container {
            background: transparent !important;
            font-family: inherit;
          }
        `}</style>
    </Card>
  );
}
