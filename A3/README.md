# Interactive Data Dashboard

A dynamic, interactive dashboard built with D3.js that visualizes data through multiple coordinated views. The dashboard accepts any flat JSON data file and allows users to explore relationships and patterns through four different visualization types.

## Features

- **Dynamic Data Loading**: Upload any flat JSON file and automatically detect data dimensions
- **Multiple Visualization Types**:
  - Radial Bar Chart: Visualize quantities and distributions
  - Chord Diagram: Show relationships between entities
  - Force-Directed Graph: Display network connections with interactive nodes
  - Sunburst Chart: Explore hierarchical data structures
- **Interactive Features**:
  - Brushing & Linking across all visualizations
  - Zoom and pan capabilities
  - Dynamic filtering based on data types
  - Multi-select with Ctrl/Shift key support
  - Tooltips and hover effects
- **Responsive Design**: Automatically adjusts to window size
- **Professional UI**: Clean, modern interface with intuitive controls

## Setup & Running

1. Clone the repository
2. Due to browser security restrictions with local files, you need to serve the files through a web server. You can use any of these methods:

   Using Python:

   ```bash
   # Python 3
   python -m http.server 8000

   # Python 2
   python -m SimpleHTTPServer 8000
   ```

   Using Node.js:

   ```bash
   # Install http-server globally
   npm install -g http-server

   # Run server
   http-server
   ```

3. Open your browser and navigate to `http://localhost:8000`

## Usage

1. **Upload Data**:

   - Click "Choose a file" to upload your JSON data
   - The file should be a flat JSON array of objects

2. **Select Dimensions**:

   - For each visualization, select the appropriate data dimensions
   - The system will automatically filter compatible fields based on data type

3. **Interact with Visualizations**:

   - Click on elements to select them
   - Hold Ctrl/Shift for multi-selection
   - Use mouse wheel to zoom where applicable
   - Hover for detailed information
   - Drag nodes in the force-directed graph

4. **Use Filters**:
   - Numeric fields: Use range sliders
   - Categorical fields: Use multi-select dropdowns
   - All filters are dynamic and update in real-time

## Data Format

The dashboard accepts any flat JSON array of objects. Example structure:

```json
[
  {
    "category": "A",
    "value": 100,
    "relation": "B",
    "hierarchy": "group1/subgroup1"
  },
  {
    "category": "B",
    "value": 150,
    "relation": "C",
    "hierarchy": "group1/subgroup2"
  }
]
```

## Technical Details

- Built with D3.js version 7
- Uses ES6 modules
- No external dependencies beyond D3.js
- Implements the Observer pattern for cross-chart communication
- Responsive design using CSS Grid and Flexbox

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Known Limitations

- Large datasets (>10000 records) may impact performance
- Hierarchical data in the Sunburst chart must use "/" as the path separator
- Some visualizations may become crowded with too many categories

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - feel free to use this code in your own projects!
