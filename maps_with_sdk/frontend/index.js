// JavaScript
import React, { useEffect, useRef, useState } from 'react';
import {
  initializeBlock,
  useBase,
  useRecords,
  useCustomProperties,
} from '@airtable/blocks/interface/ui';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './style.css';

// ---------------------- //
//   Helper Functions     //
// ---------------------- //

function isPosition(x) {
  return Array.isArray(x) && x.length >= 2 && typeof x[0] === 'number' && typeof x[1] === 'number';
}

function ensureLngLatOrder(pos) {
  // Swap [lat, lng] -> [lng, lat] if needed
  const [a, b] = pos;
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
    return [b, a, ...pos.slice(2)];
  }
  return pos;
}

function closeRingIfNeeded(ring) {
  if (!ring || ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...ring, first];
  }
  return ring;
}

function normalizePolygonCoords(coords) {
  return coords.map(ring => closeRingIfNeeded(ring.map(ensureLngLatOrder)));
}

function normalizeMultiPolygonCoords(coords) {
  return coords.map(poly => normalizePolygonCoords(poly));
}

function normalizeGeometry(geom) {
  if (!geom || !geom.type) return null;

  switch (geom.type) {
    case 'Polygon':
      return { type: 'Polygon', coordinates: normalizePolygonCoords(geom.coordinates || []) };
    case 'MultiPolygon':
      return { type: 'MultiPolygon', coordinates: normalizeMultiPolygonCoords(geom.coordinates || []) };
    case 'Point':
      return { type: 'Point', coordinates: ensureLngLatOrder(geom.coordinates || []) };
    case 'MultiPoint':
      return { type: 'MultiPoint', coordinates: (geom.coordinates || []).map(ensureLngLatOrder) };
    case 'LineString':
      return { type: 'LineString', coordinates: (geom.coordinates || []).map(ensureLngLatOrder) };
    case 'MultiLineString':
      return { type: 'MultiLineString', coordinates: (geom.coordinates || []).map(line => line.map(ensureLngLatOrder)) };
    default:
      console.warn('Unsupported geometry type:', geom.type);
      return null;
  }
}

function wrapAsFeature(geom, props = {}) {
  return { type: 'Feature', geometry: geom, properties: props };
}

function explodeToFeatures(geo, baseProps = {}) {
  if (!geo) return [];
  if (geo.type === 'FeatureCollection') {
    const out = [];
    for (const f of geo.features || []) {
      if (!f) continue;
      if (f.type === 'Feature') {
        const g = normalizeGeometry(f.geometry);
        if (g) out.push(wrapAsFeature(g, { ...f.properties, ...baseProps }));
      } else if (f.type && f.coordinates) {
        const g = normalizeGeometry(f);
        if (g) out.push(wrapAsFeature(g, baseProps));
      }
    }
    return out;
  }
  if (geo.type === 'Feature') {
    const g = normalizeGeometry(geo.geometry);
    return g ? [wrapAsFeature(g, { ...geo.properties, ...baseProps })] : [];
  }
  if (geo.type) {
    const g = normalizeGeometry(geo);
    return g ? [wrapAsFeature(g, baseProps)] : [];
  }
  console.warn('Unrecognized GeoJSON object:', geo);
  return [];
}

function extendBoundsFromGeometry(bounds, geom) {
  const push = (p) => { if (isPosition(p)) bounds.extend(p); };

  const walk = (g) => {
    if (!g) return;
    switch (g.type) {
      case 'Point':
        push(g.coordinates);
        break;
      case 'MultiPoint':
      case 'LineString':
        (g.coordinates || []).forEach(push);
        break;
      case 'MultiLineString':
        (g.coordinates || []).forEach(line => line.forEach(push));
        break;
      case 'Polygon':
        (g.coordinates || []).forEach(ring => ring.forEach(push));
        break;
      case 'MultiPolygon':
        (g.coordinates || []).forEach(poly => poly.forEach(ring => ring.forEach(push)));
        break;
      default:
        break;
    }
  };

  walk(geom);
}

// ---------------------- //
//   Custom Properties    //
// ---------------------- //

function getCustomProperties(base) {
  return [
    {
      key: 'pasturesTable',
      label: 'Pastures Table',
      type: 'table',
      defaultValue:
        base.getTableByIdIfExists('tblH2WjR4nvt3tpYA') ||
        base.tables.find((table) => table.name.toLowerCase().includes('pasture')),
    },
    {
      key: 'mapboxAccessToken',
      label: 'Mapbox Access Token',
      type: 'string',
      defaultValue: '',
    },
  ];
}

// ---------------------- //
//      Main Block        //
// ---------------------- //

function PastureMapApp() {
  const base = useBase();
  const { customPropertyValueByKey, errorState } = useCustomProperties(getCustomProperties);
  const pasturesTable = customPropertyValueByKey.pasturesTable;
  const mapboxToken = customPropertyValueByKey.mapboxAccessToken;

  // Use the "Mapping" view if it exists
  const mappingView = pasturesTable?.getViewByNameIfExists?.('Mapping');
  const records = useRecords(mappingView || pasturesTable);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const [error, setError] = useState(null);
  const isInitialLoadRef = useRef(true);

  // Initialize map
  useEffect(() => {
    if (!mapboxToken) {
      setError('Please configure a Mapbox Access Token in the properties panel.');
      return;
    }

    if (!mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = mapboxToken;

    try {
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [-110.70751489266341, 45.86793276137563],
        zoom: 8,  // Start zoomed out, then pan in
      });

      map.on('load', () => {
        map.addSource('pastures', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        map.addLayer({
          id: 'pastures-fill',
          type: 'fill',
          source: 'pastures',
          paint: {
            'fill-color': ['get', 'fillColor'],
            'fill-opacity': ['get', 'fillOpacity'],
          },
        });

        map.addLayer({
          id: 'pastures-outline',
          type: 'line',
          source: 'pastures',
          paint: {
            'line-color': ['get', 'fillColor'],
            'line-width': ['get', 'strokeWidth'],
          },
        });

        map.addLayer({
          id: 'pastures-labels',
          type: 'symbol',
          source: 'pastures',
          layout: {
            'text-field': [
              'format',
              ['get', 'name'],
              { 'font-scale': 1.0 },
              '\n',
              {},
              ['get', 'totalAcres'],
              { 'font-scale': 0.8 },
              ' acres',
              { 'font-scale': 0.8 }
            ],
            'text-size': 10,
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
          },
          paint: {
            'text-color': 'white',
            'text-halo-color': '#000000',
            'text-halo-width': 1.5,
          },
        });

        map.on('click', 'pastures-fill', (e) => {
          if (!e.features || e.features.length === 0) return;

          const feature = e.features[0];
          const properties = feature.properties;
          const coordinates = e.lngLat;

          // Debug alert - you can remove this later
          console.log('Clicked pasture properties:', properties);

          const popupContent = `
            <div style="
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #f5f7fa 0%, #e8f4f8 100%);
              padding: 20px;
              border-radius: 12px;
              box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
              width: max-content;
            ">
              <h3 style="
                margin: 0 0 16px 0;
                font-size: 18px;
                font-weight: 600;
                color: #1a202c;
                letter-spacing: -0.02em;
                white-space: nowrap;
              ">
                ${properties.name || 'Unnamed Pasture'}
              </h3>
              <div style="
                font-size: 14px;
                line-height: 1.8;
                color: #2d3748;
              ">
                <div style="margin-bottom: 8px; white-space: nowrap;">
                  <span style="color: #718096; font-weight: 500;">Total Acres:</span>
                  <span style="margin-left: 4px; font-weight: 600;">${properties.totalAcres || 'N/A'}</span>
                </div>
                <div style="margin-bottom: 8px; white-space: nowrap;">
                  <span style="color: #718096; font-weight: 500;">Est. Grazeable Acres:</span>
                  <span style="margin-left: 4px; font-weight: 600;">${properties.grazeableAcres || 'N/A'}</span>
                </div>
                <div style="white-space: nowrap;">
                  <span style="color: #718096; font-weight: 500;">Total Forage/Pasture:</span>
                  <span style="margin-left: 4px; font-weight: 600;">${properties.totalForage || 'N/A'} lbs</span>
                </div>
              </div>
            </div>
          `;

          if (popupRef.current) popupRef.current.remove();

          popupRef.current = new mapboxgl.Popup()
            .setLngLat(coordinates)
            .setHTML(popupContent)
            .addTo(map);
        });

        map.on('mouseenter', 'pastures-fill', () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'pastures-fill', () => {
          map.getCanvas().style.cursor = '';
        });
      });

      mapRef.current = map;

      return () => {
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      };
    } catch (err) {
      setError('Failed to initialize map. Please check your Mapbox Access Token.');
      console.error(err);
    }
  }, [mapboxToken]);

  // Update map when records change
  useEffect(() => {
    if (!mapRef.current || !records) return;
    const map = mapRef.current;

    if (!map.isStyleLoaded()) {
      map.once('load', () => updateMapData());
      return;
    }

    updateMapData();

    function updateMapData() {
      const nameField = pasturesTable.getFieldIfExists('Name');
      const geoJsonField = pasturesTable.getFieldIfExists('GeoJSON');
      const totalAcresField = pasturesTable.getFieldIfExists('Total Acres');
      const grazeableAcresField = pasturesTable.getFieldIfExists('Est. Grazeable Acres');
      const foragePerAcreField = pasturesTable.getFieldIfExists('Est. Forage/Acre (lbs)');
      const pastureColorField = pasturesTable.fields.find(f => f.name === 'pastureColor');
      const alphaValueField = pasturesTable.fields.find(f => f.name === 'pastureAlphaValue');
      const boundaryWidthField = pasturesTable.fields.find(f => f.name === 'boundaryWidth');
      const isActiveField = pasturesTable.getFieldIfExists('Is Active');

      const features = [];
      const bounds = new mapboxgl.LngLatBounds();

      for (const record of records) {
        if (!geoJsonField) continue;

        // Skip if 'Is Active' checkbox is unchecked
        const isActive = isActiveField ? record.getCellValue(isActiveField) : true;
        if (!isActive) continue;

        const cell = record.getCellValue(geoJsonField);
        if (!cell) continue;

        const geoJsonString = typeof cell === 'string' ? cell : (cell?.text || cell?.toString?.() || null);
        if (!geoJsonString) continue;

        let parsed;
        try {
          parsed = JSON.parse(geoJsonString);
        } catch (err) {
          console.warn('Skipping record with invalid GeoJSON:', record.id);
          continue;
        }

        const name = nameField ? record.getCellValueAsString(nameField) : 'Unnamed';
        const totalAcres = totalAcresField ? record.getCellValue(totalAcresField) : null;
        const grazeableAcresRaw = grazeableAcresField ? record.getCellValue(grazeableAcresField) : null;
        const foragePerAcre = foragePerAcreField ? record.getCellValue(foragePerAcreField) : null;

        // Get styling fields
        const pastureColor = pastureColorField ? record.getCellValue(pastureColorField) : '#22b14c';
        const alphaValue = alphaValueField ? record.getCellValue(alphaValueField) : 0.5;
        const boundaryWidth = boundaryWidthField ? record.getCellValue(boundaryWidthField) : 2;

        // Calculate total forage: Total Acres × Est. Forage/Acre
        const totalForageRaw = (totalAcres && foragePerAcre) ? totalAcres * foragePerAcre : null;

        // Format the values properly - handle numbers, percentages, and formulas
        const formatValue = (val) => {
          if (val === null || val === undefined) return 'N/A';
          if (typeof val === 'number') return Math.round(val).toLocaleString('en-US');
          return String(val);
        };

        // Convert percentage (decimal) to percentage display
        const formatPercentage = (val) => {
          if (val === null || val === undefined) return 'N/A';
          if (typeof val === 'number') return `${(val * 100).toFixed(1)}%`;
          return String(val);
        };

        const baseProps = {
          recordId: record.id,
          name,
          totalAcres: formatValue(totalAcres),
          grazeableAcres: formatPercentage(grazeableAcresRaw),
          totalForage: formatValue(totalForageRaw),
          fillColor: pastureColor,
          fillOpacity: alphaValue,
          strokeWidth: boundaryWidth,
        };

        const normalized = explodeToFeatures(parsed, baseProps);
        if (normalized.length === 0) {
          console.warn('No renderable features after normalization for record', record.id);
          continue;
        }

        normalized.forEach(f => extendBoundsFromGeometry(bounds, f.geometry));
        features.push(...normalized);
      }

      const source = map.getSource('pastures');
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features,
        });
      } else {
        console.warn('Map source "pastures" not found.');
      }

      if (features.length > 0 && !bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
          duration: 1200  // Short, smooth 0.8s animation
        });
      }
    }
  }, [records, pasturesTable]);

  // ---------------------- //
  //    Error States UI     //
  // ---------------------- //

  if (errorState) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-gray50 p-8">
        <div className="bg-white rounded-lg p-8 shadow-lg max-w-md text-center">
          <h2 className="text-xl font-bold mb-4">Configuration Error</h2>
          <p>{errorState.message}</p>
        </div>
      </div>
    );
  }

  if (!mapboxToken) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-gray50 p-8">
        <div className="bg-white rounded-lg p-8 shadow-lg max-w-md text-center">
          <h2 className="text-xl font-bold mb-4">Configure Mapbox Token</h2>
          <p>Please provide a Mapbox Access Token in the properties panel.</p>
          <p className="text-sm text-gray-500">
            You can get a free token from{' '}
            <a
              href="https://www.mapbox.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              mapbox.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-gray50 p-8">
        <div className="bg-white rounded-lg p-8 shadow-lg max-w-md text-center">
          <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen relative">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Pasture Utilization Color Key */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif',
          background: '#fff',
          border: '1px solid rgba(0,0,0,.12)',
          borderRadius: '8px',
          padding: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,.1)',
          zIndex: 1000,
        }}
      >
        <h3 style={{
          margin: '0 0 16px 0',
          fontSize: '12px',
          fontWeight: 700,
          color: '#000',
        }}>
          Pasture Utilization - Color Key
        </h3>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          {[
            { color: '#9e9e9e', name: 'Not Grazed' },
            { color: '#ff0000', name: 'Low' },
            { color: '#ff9900', name: 'Moderate' },
            { color: '#00ff00', name: 'Excellent' },
          ].map((item, idx) => (
            <div key={idx} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: item.color,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: '10px',
                color: '#000',
                fontWeight: 400,
              }}>
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

initializeBlock({ interface: () => <PastureMapApp /> });
