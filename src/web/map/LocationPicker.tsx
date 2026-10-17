import { Marker } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";
import { useMap } from "./base.ts";

type Props = {
  center: [number, number];
  value: { lat: number; lng: number } | null;
  onChange: (value: { lat: number; lng: number }) => void;
};

export function LocationPicker({ center, value, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useMap(container, {
    center: value ? [value.lng, value.lat] : center,
    zoom: value ? 15 : 12.5,
  });
  const marker = useRef<Marker | null>(null);
  const change = useEffectEvent((position: { lat: number; lng: number }) => onChange(position));

  useEffect(() => {
    if (!handle) {
      return;
    }
    const { map } = handle;
    map.getCanvas().style.cursor = "crosshair";
    map.on("click", (event) => change({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
  }, [handle]);

  useEffect(() => {
    if (!handle || !value) {
      return;
    }
    if (!marker.current) {
      marker.current = new Marker({ color: "#ffc20e", draggable: true })
        .setLngLat([value.lng, value.lat])
        .addTo(handle.map);
      marker.current.on("dragend", () => {
        const position = marker.current?.getLngLat();
        if (position) {
          change({ lat: position.lat, lng: position.lng });
        }
      });
    } else {
      marker.current.setLngLat([value.lng, value.lat]);
    }
    if (!handle.map.getBounds().contains([value.lng, value.lat])) {
      handle.map.easeTo({
        center: [value.lng, value.lat],
        zoom: Math.max(handle.map.getZoom(), 15),
      });
    }
  }, [handle, value]);

  return (
    <div className="picker-map">
      <div
        ref={container}
        className="map"
        role="application"
        aria-label="Mapa para escolher a localização. Clique no mapa ou arraste o marcador."
      />
    </div>
  );
}
