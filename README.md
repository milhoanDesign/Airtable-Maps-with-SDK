# Airtable Maps with SDK

An Airtable Interface Extension that visualizes pasture data on an interactive map using Mapbox GL JS. This extension allows you to display GeoJSON polygons from your Airtable base on a satellite map with custom styling and interactive popups.

## Features

- **Interactive Map Visualization**: Display pasture boundaries as polygons on a Mapbox satellite map
- **Custom Styling**: Configure colors, transparency, and boundary widths for each pasture
- **Rich Popups**: Click on any pasture to see details including:
  - Pasture name
  - Total acres
  - Estimated grazeable acres
  - Total forage available
- **Dynamic Filtering**: Toggle pasture visibility with an "Is Active" checkbox field
- **Configurable Fields**: All field mappings are configurable through custom properties
- **Utilization Color Key**: Visual legend showing pasture utilization levels

## Requirements

- Airtable Interface Extension environment
- Mapbox Access Token (free tier available at [mapbox.com](https://www.mapbox.com/))
- Table with the following field types:
  - GeoJSON field (Text/Long Text)
  - Name field (Single/Multi-line Text)
  - Numeric fields for acres and forage calculations
  - Optional: Color, alpha, and boundary width fields
  - Optional: "Is Active" checkbox field

## Installation

1. Clone this repository or add it to your Airtable base
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure the extension in your Airtable Interface:
   - Add your Mapbox Access Token in the properties panel
   - Select the table containing your pasture data
   - Map the required fields (Name, GeoJSON, etc.)

## Configuration

### Custom Properties

The extension uses Airtable's custom properties system for configuration. You can configure:

- **Pastures Table**: The table containing your pasture data
- **Mapbox Access Token**: Your Mapbox API token
- **Field Mappings**:
  - Name Field
  - GeoJSON Field (required)
  - Total Acres Field
  - Est. Grazeable Acres Field
  - Est. Forage/Acre Field
  - Pasture Color Field
  - Alpha Value Field (transparency)
  - Boundary Width Field
  - Is Active Field (checkbox)

### GeoJSON Format

The GeoJSON field should contain valid GeoJSON geometry in one of these formats:
- `Point`
- `LineString`
- `Polygon`
- `MultiPoint`
- `MultiLineString`
- `MultiPolygon`
- `Feature`
- `FeatureCollection`

Coordinates can be in either `[lng, lat]` or `[lat, lng]` format - the extension automatically detects and corrects the order.

## Development

This extension follows the [Airtable Interface Extensions v0.3.0](https://airtable.com/developers/extensions) best practices:

- Uses the `@airtable/blocks/interface/ui` and `@airtable/blocks/interface/models` imports
- Implements proper field type checking with `FieldType` enum
- Uses custom properties instead of hard-coded field names
- Includes `shouldFieldBeAllowed` filters for field selection

### File Structure

```
├── frontend/
│   ├── index.js          # Main application code
│   └── style.css         # Custom styles
├── .cursor/
│   └── rules/
│       └── interface-extensions.mdc  # Development guidelines
├── package.json          # Dependencies
└── README.md            # This file
```

## Technologies

- **React 19**: UI framework
- **Airtable Blocks SDK**: Interface Extensions API (v0.3.0)
- **Mapbox GL JS**: Interactive map rendering
- **Tailwind CSS**: Styling utilities

## License

See LICENSE.md for details.

## Contributing

This is a private project for pasture management visualization. For questions or issues, please contact the repository owner.
