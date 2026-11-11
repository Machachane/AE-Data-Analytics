import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { JurisdictionRiskRecord } from "@workspace/api-client-react";
import { AlertTriangle, Maximize2, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryColor, prettyRegion, prettyType } from "@/lib/jurisdiction-risk";

const ATTR = 'Boundaries: <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Natural Earth</a> (public domain); centroids: <a href="https://github.com/mledoze/countries" target="_blank" rel="noopener">mledoze/countries</a> (ODbL)';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const sc = (v: number | null) => (v == null ? "blank" : String(v));

export function JurisdictionRiskMap({ rows, selected, onToggle, loading, geography, filteredView, overview = false }: { rows: JurisdictionRiskRecord[]; selected: string[]; onToggle: (country: string) => void; loading: boolean; geography: string; filteredView: boolean; overview?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const background = useRef<L.GeoJSON | null>(null);
  const labels = useRef<L.LayerGroup | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const bounds = useRef<L.LatLngBounds | null>(null);
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;
  const [backgroundError, setBackgroundError] = useState(false);

  const addBackground = () => {
    if (!map.current) return;
    background.current?.remove();
    labels.current?.remove();
    setBackgroundError(false);
    if (!geography) return;
    try {
      const world = JSON.parse(geography);
      if (world.type !== "FeatureCollection" || !Array.isArray(world.features)) throw new Error("Invalid geography");
      background.current = L.geoJSON(world, {
        interactive: false,
        style: { color: "#b7bec2", weight: 0.7, fillColor: "#f0f1f1", fillOpacity: 1 },
      }).addTo(map.current);
      background.current.bringToBack();
      const names = L.layerGroup().addTo(map.current);
      for (const f of world.features) {
        const p = f.properties;
        if (!p || p.LABELRANK > 2 || p.LABEL_X == null || p.LABEL_Y == null) continue;
        L.marker([p.LABEL_Y, p.LABEL_X], {
          interactive: false, keyboard: false,
          icon: L.divIcon({
            className: "pointer-events-none text-center text-[8px] font-medium uppercase leading-tight text-slate-500",
            html: esc(String(p.NAME_EN ?? "")), iconSize: [90, 16], iconAnchor: [45, 8],
          }),
        }).addTo(names);
      }
      labels.current = names;
    } catch {
      setBackgroundError(true);
    }
  };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { minZoom: overview ? 0 : 1, maxZoom: 8, zoomSnap: overview ? 0.25 : 0.5 }).setView([35, 10], 2.5);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    m.attributionControl.addAttribution(ATTR);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; background.current = null; labels.current = null; layer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    addBackground();
    // The geography snapshot is immutable between source refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geography]);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngExpression[] = [];
    const anySel = selected.length > 0;
    for (const r of rows) {
      if (r.latitude == null || r.longitude == null) continue;
      const on = selected.includes(r.country);
      const color = categoryColor(r.repossessionCategory);
      const mk = L.circleMarker([r.latitude, r.longitude], {
        radius: on ? 8 : 6, color: on ? "#0b2236" : "#ffffff", weight: on ? 2.5 : 1, fillColor: color,
        fillOpacity: anySel && !on ? 0.4 : 0.9,
      });
      mk.bindTooltip(
        `<b>${esc(r.country)}</b><br/>Repossession overall: ${sc(r.repossessionOverallScore)}<br/>Deregistration: ${sc(r.deregistrationScore)}<br/>${esc(prettyType(r.jurisdictionType))} &middot; ${esc(prettyRegion(r.region))}<br/>Category: <b style="color:${color}">${esc(r.repossessionCategory)}</b> (high = higher score, better)`,
        { direction: "top", sticky: false },
      );
      mk.on("click", () => toggleRef.current(r.country));
      mk.on("add", () => {
        const p = mk.getElement() as SVGElement | undefined;
        if (!p) return;
        p.setAttribute("tabindex", "0");
        p.setAttribute("role", "button");
        p.setAttribute("aria-pressed", String(on));
        p.setAttribute("aria-label", `${r.country}, repossession overall ${sc(r.repossessionOverallScore)}, category ${r.repossessionCategory}`);
        p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRef.current(r.country); } });
        p.addEventListener("focus", () => mk.openTooltip());
        p.addEventListener("blur", () => mk.closeTooltip());
      });
      mk.addTo(g);
      pts.push([r.latitude, r.longitude]);
    }
    bounds.current = pts.length ? L.latLngBounds(pts) : null;
  }, [rows, selected]);

  const prevKey = useRef("");
  useEffect(() => {
    const key = rows.map((r) => r.id).join(",");
    if (key !== prevKey.current) {
      prevKey.current = key;
      if (filteredView) fit();
      else map.current?.setView([35, 10], 2.5);
    }
  });
  function fit() {
    const m = map.current, b = bounds.current;
    if (!m) return;
    if (b) m.fitBounds(b.pad(0.15), { maxZoom: 5 }); else m.setView([25, 10], 1.5);
  }

  const unmapped = rows.filter((r) => r.latitude == null || r.longitude == null).length;
  return (
    <section className="panel relative isolate z-0 min-w-0 rounded-[3px] bg-card" aria-label="Repossession score map">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-[11px]">
        <h2 className="text-[11.5px] font-semibold">Repossession Score (Powered by GARI)</h2>
        {(["high", "low", "moderate"] as const).map((c) => (
          <span key={c} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: categoryColor(c) }} />{c}</span>
        ))}
        <span className="text-muted-foreground">high = higher score (better conditions)</span>
        <button data-testid="button-map-fit" onClick={fit} className="ml-auto flex h-[22px] items-center gap-1 rounded-[3px] bg-foreground/10 px-1.5 hover:bg-foreground/20 print:hidden"><Maximize2 className="h-3 w-3" /> Fit all</button>
      </div>
      <div className="relative">
        <div ref={el} data-testid="map-jurisdiction" className="relative z-0 h-[260px] w-full bg-[#e6e8ea] sm:h-[300px] [&_.leaflet-pane]:z-[1] [&_.leaflet-top]:z-[2] [&_.leaflet-bottom]:z-[2] [&_.leaflet-tooltip-pane]:z-[3]" />
        {loading && <Skeleton className="absolute inset-0 z-[5] rounded-none" />}
        {backgroundError && (
          <div role="status" data-testid="map-tile-error" className="absolute left-2 top-2 z-[6] flex max-w-[90%] items-center gap-2 rounded-[3px] border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            Bundled map background unavailable; jurisdiction points/tables remain available.
            <button data-testid="button-retry-tiles" onClick={addBackground} className="flex items-center gap-1 rounded-[3px] bg-primary px-1.5 py-0.5 text-primary-foreground"><RefreshCw className="h-3 w-3" /> Retry map background</button>
          </div>
        )}
      </div>
      <div className="px-2 py-1 text-[10.5px] text-muted-foreground">
        Markers are approximate country centroids, not aircraft locations. Click a marker (or focus and press Enter) to toggle the country filter.
        {unmapped > 0 && <span data-testid="text-unmapped"> {unmapped} filtered countr{unmapped === 1 ? "y has" : "ies have"} no coordinates and appear in tables only.</span>}
      </div>
    </section>
  );
}
