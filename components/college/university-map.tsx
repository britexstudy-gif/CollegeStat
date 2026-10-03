"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MapType, GeoJSONSource } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { University } from "@/lib/domain";
export function UniversityMap({
  universities,
  onSelect,
}: {
  universities: University[];
  onSelect?: (u: University) => void;
}) {
  const node = useRef<HTMLDivElement>(null),
    map = useRef<MapType | null>(null),
    [error, setError] = useState("");
  const locatedCount = universities.filter(
    (u) => u.latitude != null && u.longitude != null,
  ).length;
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    let stopped = false;
    import("maplibre-gl")
      .then(({ Map, setWorkerUrl }) => {
        if (!node.current || stopped) return;
        setWorkerUrl(workerUrl);
        const m = new Map({
          container: node.current,
          style:
            process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
            "https://demotiles.maplibre.org/style.json",
          center: [15, 30],
          zoom: 1,
          attributionControl: { compact: true },
        });
        map.current = m;
        m.on("error", () =>
          setError(
            "Map tiles are unavailable. University results remain accessible in the list.",
          ),
        );
        m.on("load", () => {
          if (stopped) return;
          m.addSource("universities", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: universities
                .filter((u) => u.latitude != null && u.longitude != null)
                .map((u) => ({
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: [u.longitude!, u.latitude!],
                  },
                  properties: { id: u.id },
                })),
            },
            cluster: true,
            clusterRadius: 45,
          });
          m.addLayer({
            id: "clusters",
            type: "circle",
            source: "universities",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#3978ff",
              "circle-radius": [
                "step",
                ["get", "point_count"],
                18,
                20,
                25,
                100,
                32,
              ],
              "circle-opacity": 0.8,
            },
          });
          m.addLayer({
            id: "unclustered",
            type: "circle",
            source: "universities",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": "#3978ff",
              "circle-radius": 7,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            },
          });
          m.on("click", "clusters", async (e) => {
            const f = e.features?.[0];
            if (!f || f.geometry.type !== "Point") return;
            const zoom = await (
              m.getSource("universities") as GeoJSONSource
            ).getClusterExpansionZoom(f.properties.cluster_id);
            m.easeTo({
              center: f.geometry.coordinates as [number, number],
              zoom,
              duration: 250,
            });
          });
          m.on("click", "unclustered", (e) => {
            const u = universities.find(
              (u) => u.id === e.features?.[0]?.properties.id,
            );
            if (u) onSelectRef.current?.(u);
          });
        });
      })
      .catch(() =>
        setError("The map could not be loaded. Use list view to continue."),
      );
    return () => {
      stopped = true;
      map.current?.remove();
      map.current = null;
    };
  }, [universities]);
  return (
    <div className="map-view" aria-label="Interactive university map">
      <div ref={node} style={{ position: "absolute", inset: 0 }} />
      <div className="map-zoom">
        <button aria-label="Zoom map in" onClick={() => map.current?.zoomIn()}>
          +
        </button>
        <button
          aria-label="Zoom map out"
          onClick={() => map.current?.zoomOut()}
        >
          −
        </button>
      </div>
      <div className="map-note">
        {error ||
          `${locatedCount} geolocated universities in this page · ${universities.length - locatedCount} without sourced coordinates`}
      </div>
    </div>
  );
}
