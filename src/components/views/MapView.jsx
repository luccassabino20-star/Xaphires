import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { flattenCards } from "../../utils/boardCards.js";
import { LABEL_COLORS } from "../../utils/labels.js";

const DEFAULT_CENTER = [-14.235, -51.9253]; // Brazil
const DEFAULT_ZOOM = 4;

export default function MapView({ board, searchQuery, memberFilter, onOpenCard }) {
  const { t } = useTranslation();
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);

  const allCards = useMemo(() => flattenCards(board), [board]);
  // filtered/located precisam ser memoizados: sem isso cada render produzia arrays
  // novos, o efeito dos marcadores rodava sempre e o enquadramento era refeito a
  // cada tecla digitada na busca — não dava para arrastar o mapa.
  const filtered = useMemo(
    () =>
      allCards.filter((c) => {
        const matchesSearch = !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesMember = !memberFilter || (c.memberIds || []).includes(memberFilter);
        return matchesSearch && matchesMember;
      }),
    [allCards, searchQuery, memberFilter]
  );
  const located = useMemo(
    () => filtered.filter((c) => c.location?.lat != null && c.location?.lng != null),
    [filtered]
  );
  const unlocatedCount = useMemo(
    () => filtered.filter((c) => c.location?.address && c.location?.lat == null).length,
    [filtered]
  );

  // Assinatura de quais pontos estão no mapa. O reenquadramento automático olha só
  // para ela: mudou o conjunto de pontos, reenquadra; mudou qualquer outra coisa no
  // cartão (título, etiqueta, responsável), o mapa fica onde o usuário deixou.
  const locatedKey = useMemo(
    () => located.map((c) => `${c.id}:${c.location.lat},${c.location.lng}`).join("|"),
    [located]
  );

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
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
    const layer = markersLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    located.forEach((c) => {
      const labelMeta = c.labels?.length ? LABEL_COLORS.find((l) => l.id === c.labels[0]) : null;
      const color = labelMeta ? labelMeta.color : "#4d7ea8";
      const marker = L.circleMarker([c.location.lat, c.location.lng], {
        radius: 9,
        weight: 2,
        color: "#ffffff",
        fillColor: color,
        fillOpacity: 1,
      });
      marker.bindTooltip(c.title, { direction: "top", offset: [0, -10] });
      marker.on("click", () => onOpenCard(c.id));
      marker.addTo(layer);
    });
  }, [located, onOpenCard]);

  // Enquadramento em efeito separado, dependente só da assinatura dos pontos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (located.length === 1) {
      map.setView([located[0].location.lat, located[0].location.lng], 12);
    } else if (located.length > 1) {
      const bounds = L.latLngBounds(located.map((c) => [c.location.lat, c.location.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
    // located sai de propósito das dependências: locatedKey já resume o que
    // interessa, e incluir o array faria o reenquadramento voltar a disparar sozinho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locatedKey]);

  return (
    <div className="map-view-wrap">
      <div ref={mapElRef} className="map-view-canvas" />
      {located.length === 0 && (
        <div className="map-empty-overlay">
          {t("views.map.emptyLine1")}
          <br />
          {t("views.map.emptyLine2")}
        </div>
      )}
      {unlocatedCount > 0 && (
        <div className="map-footnote-overlay">{t("views.map.unlocated", { count: unlocatedCount })}</div>
      )}
    </div>
  );
}
