import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [-14.235, -51.9253]; // Brasil
const DEFAULT_ZOOM = 4;

// Mini-mapa de um ponto só (endereço do salão) - clone simplificado de
// src/components/views/MapView.jsx (mesmo padrão L.map/tileLayer direto,
// sem react-leaflet), sem os múltiplos marcadores/enquadramento por
// conjunto: aqui é sempre um marcador, ou nenhum. circleMarker, não
// L.marker: o ícone padrão do Leaflet resolve o caminho do PNG relativo ao
// próprio pacote, e o bundle do Vite quebra essa resolução - é o mesmo
// motivo pelo qual MapView.jsx usa circleMarker em vez do pino padrão.
export default function BeautyMiniMap({ lat, lng }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(mapElRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (lat != null && lng != null) {
      markerRef.current = L.circleMarker([lat, lng], { radius: 9, weight: 2, color: "#ffffff", fillColor: "#E5417F", fillOpacity: 1 }).addTo(map);
      map.setView([lat, lng], 15);
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [lat, lng]);

  return <div ref={mapElRef} className="beauty-minimap" />;
}
