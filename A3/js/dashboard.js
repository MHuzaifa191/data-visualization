// js/dashboard.js
class Dashboard {
    constructor() {
        this.originalData = null;
        this.filteredData = null;
        this.dimensions = {}; // { colName: { type: 'numeric'/'categorical', uniqueValues: [], min: 0, max: 100 }}
        this.chartInstances = {};
        this.chartSettings = {}; // Stores selected dimensions for each chart
        this.globalFilters = {}; // { colName: { type: 'numeric'/'categorical', selected: ... }}
        this.globalColorScale = d3.scaleOrdinal(d3.schemeCategory10); // Default
        this.primaryColorDimension = null; // User might select this later

        // UI Elements
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-upload');
        this.fileInfoDiv = document.getElementById('file-info');
        this.fileNameSpan = document.getElementById('file-name');
        this.removeFileBtn = document.getElementById('remove-file-btn');
        this.uploadStatusDiv = document.getElementById('upload-status');
        
        this.dimensionConfigSection = document.getElementById('dimension-config-section');
        this.renderChartsBtn = document.getElementById('render-charts-btn');
        
        this.filtersSection = document.getElementById('filters-section');
        this.filterContainer = document.getElementById('filter-container');
        this.applyFiltersBtn = document.getElementById('apply-filters-btn');
        this.clearFiltersBtn = document.getElementById('clear-filters-btn');
        this.filtersEmptyState = document.getElementById('filters-empty-state');

        this.visualizationGrid = document.getElementById('visualization-grid');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingMessage = document.getElementById('loading-message');
        this.mainTooltip = d3.select('#main-tooltip'); // Use the global tooltip

        this.chartConfigs = {
            radialBar: {
                id: 'radial-bar',
                selector: '#radial-bar-chart',
                settingsSelector: '#radial-bar-settings',
                instance: null,
                dimensions: [
                    { name: 'category', label: 'Category (Categorical)', type: 'categorical', required: true },
                    { name: 'value', label: 'Value (Numeric)', type: 'numeric', required: true }
                ]
            },
            chord: {
                id: 'chord',
                selector: '#chord-chart',
                settingsSelector: '#chord-settings',
                instance: null,
                dimensions: [
                    { name: 'source', label: 'Source (Categorical)', type: 'categorical', required: true },
                    { name: 'target', label: 'Target (Categorical)', type: 'categorical', required: true },
                    { name: 'value', label: 'Value (Numeric)', type: 'numeric', required: true }
                ]
            },
            forceDirected: {
                id: 'force-directed',
                selector: '#force-directed-chart',
                settingsSelector: '#force-directed-settings',
                instance: null,
                dimensions: [ // This needs more complex handling for node/link definitions
                    { name: 'nodeId', label: 'Node ID (Categorical)', type: 'categorical', required: true },
                    // For links, we might need to infer from relationships or ask for specific source/target link columns
                    // Simplified for now: assume data rows define links based on a 'target' column related to 'nodeId'
                    { name: 'linkTarget', label: 'Link Target (Categorical, related to Node ID)', type: 'categorical', required: true },
                    { name: 'linkValue', label: 'Link Value (Numeric, optional)', type: 'numeric', required: false }
                ]
            },
            sunburst: {
                id: 'sunburst',
                selector: '#sunburst-chart',
                settingsSelector: '#sunburst-settings',
                instance: null,
                dimensions: [
                    // Special handling for multiple hierarchy levels
                    { name: 'hierarchy', label: 'Hierarchy Levels (Categorical, select one or more)', type: 'categorical', required: true, multiple: true },
                    { name: 'value', label: 'Segment Value (Numeric)', type: 'numeric', required: true }
                ]
            }
        };

        this._initializeChartInstances();
        this._initializeEventListeners();
        this._updateUIState('initial');
    }

    _initializeChartInstances() {
        // Pass the global tooltip to chart instances
        const chartMargins = { top: 50, right: 20, bottom: 50, left: 60 }; // Example margins
        
        try {
            console.log("Initializing RadialBarChart...");
            this.chartConfigs.radialBar.instance = new RadialBarChart(this.chartConfigs.radialBar.selector, chartMargins, this.mainTooltip);
            console.log("RadialBarChart initialized:", this.chartConfigs.radialBar.instance);
        } catch (e) {
            console.error("Failed to initialize RadialBarChart:", e);
        }
        
        try {
            console.log("Initializing ChordDiagram...");
            this.chartConfigs.chord.instance = new ChordDiagram(this.chartConfigs.chord.selector, chartMargins, this.mainTooltip);
            console.log("ChordDiagram initialized:", this.chartConfigs.chord.instance);
        } catch (e) {
            console.error("Failed to initialize ChordDiagram:", e);
        }
        
        try {
            console.log("Initializing ForceDirectedGraph...");
            this.chartConfigs.forceDirected.instance = new ForceDirectedGraph(this.chartConfigs.forceDirected.selector, chartMargins, this.mainTooltip);
            console.log("ForceDirectedGraph initialized:", this.chartConfigs.forceDirected.instance);
        } catch (e) {
            console.error("Failed to initialize ForceDirectedGraph:", e);
        }
        
        try {
            console.log("Initializing SunburstChart...");
            this.chartConfigs.sunburst.instance = new SunburstChart(this.chartConfigs.sunburst.selector, chartMargins, this.mainTooltip);
            console.log("SunburstChart initialized:", this.chartConfigs.sunburst.instance);
        } catch (e) {
            console.error("Failed to initialize SunburstChart:", e);
        }
    }

    _initializeEventListeners() {
        // File Upload
        this.fileInput.addEventListener('change', (event) => this._handleFileSelect(event.target.files));
        this.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); this.dropZone.classList.add('drag-over'); });
        this.dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); this.dropZone.classList.remove('drag-over'); });
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.dropZone.classList.remove('drag-over');
            this._handleFileSelect(e.dataTransfer.files);
        });
        this.removeFileBtn.addEventListener('click', () => this._resetDashboard());

        // Dimension Configuration & Rendering
        this.renderChartsBtn.addEventListener('click', () => this._renderAllChartsWithSelectedDimensions());

        // Filters
        this.applyFiltersBtn.addEventListener('click', () => this._applyAllFilters());
        this.clearFiltersBtn.addEventListener('click', () => this._clearAllFilters());

        // Chart Downloads
        document.querySelectorAll('.download-svg-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const chartType = e.currentTarget.dataset.chartType;
                if (this.chartConfigs[chartType] && this.chartConfigs[chartType].instance) {
                    this.chartConfigs[chartType].instance.downloadSVG(`${chartType}-chart`);
                }
            });
        });

        // Brushing & Linking
        window.addEventListener('selectionChanged', (event) => this._handleBrushAndLink(event.detail));
        
        // Window Resize
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                Object.values(this.chartConfigs).forEach(config => {
                    if (config.instance && typeof config.instance.resize === 'function') {
                        config.instance.resize();
                    }
                });
            }, 250);
        });
    }

    _showLoading(message = "Processing...") {
        this.loadingMessage.textContent = message;
        this.loadingOverlay.style.display = 'flex';
    }

    _hideLoading() {
        this.loadingOverlay.style.display = 'none';
    }

    _updateUIState(state) {
        console.log(`Updating UI state to: ${state}`);
        
        // Hide all conditional sections initially
        this.dimensionConfigSection.style.display = 'none';
        this.filtersSection.style.display = 'none';
        this.visualizationGrid.style.display = 'none';
        this.renderChartsBtn.style.display = 'none';
        this.fileInfoDiv.style.display = 'none';
        this.uploadStatusDiv.innerHTML = '';
        this.uploadStatusDiv.className = 'upload-status';


        switch (state) {
            case 'initial':
                console.log('Setting initial state - showing upload zone');
                this.dropZone.style.display = 'block';
                break;
            
            case 'file-loaded':
                console.log('File loaded - showing dimension config');
                this.dropZone.style.display = 'none'; 
                this.fileInfoDiv.style.display = 'flex';
                this.dimensionConfigSection.style.display = 'block';
                this.renderChartsBtn.style.display = 'inline-flex';
                
                // Force all chart settings containers to be visible
                Object.entries(this.chartConfigs).forEach(([chartKey, config]) => {
                    console.log(`Making ${chartKey} settings visible`);
                    const settingsContainer = document.querySelector(config.settingsSelector);
                    if (settingsContainer) {
                        settingsContainer.style.display = 'block';
                        console.log(`${chartKey} settings container found and made visible`);
                    } else {
                        console.error(`Settings container for ${chartKey} not found: ${config.settingsSelector}`);
                    }
                });
                
                // Show chart containers but with placeholders
                this.visualizationGrid.style.display = 'flex';
                
                this._populateDimensionSelectors();
                this._clearAllChartPlaceholders();
                break;
            
            case 'charts-rendered':
                console.log('Charts rendered - showing all sections');
                this.dropZone.style.display = 'none';
                this.fileInfoDiv.style.display = 'flex';
                this.dimensionConfigSection.style.display = 'block';
                this.renderChartsBtn.style.display = 'inline-flex';
                this.filtersSection.style.display = 'block';
                this.visualizationGrid.style.display = 'flex';
                this._initializeGlobalFiltersUI();
                break;
        }
    }
    
    _clearAllChartPlaceholders() {
        document.querySelectorAll('.chart-placeholder-text').forEach(p => p.style.display = 'none');
        Object.values(this.chartConfigs).forEach(config => {
            if (config.instance && typeof config.instance.clear === 'function') {
                config.instance.clear();
            } else {
                d3.select(config.selector).select('svg').remove(); // Fallback clear
                 // Re-add placeholder if needed, or ensure clear() handles this
                const chartDiv = document.querySelector(config.selector);
                if (chartDiv && !chartDiv.querySelector('.chart-placeholder-text')) {
                    const p = document.createElement('p');
                    p.className = 'chart-placeholder-text';
                    p.textContent = 'Select dimensions and click "Render Charts".';
                    chartDiv.appendChild(p);
                }
            }
            // Clear previous settings
            const settingsContainer = document.querySelector(config.settingsSelector);
            if (settingsContainer) {
                 const existingPrompt = settingsContainer.querySelector('.settings-prompt');
                 if (existingPrompt) existingPrompt.remove();
            }
        });
    }
    

    _showUploadStatus(message, type = 'success') {
        this.uploadStatusDiv.textContent = message;
        this.uploadStatusDiv.className = `upload-status ${type}`; // 'success' or 'error'
        setTimeout(() => {
            this.uploadStatusDiv.textContent = '';
            this.uploadStatusDiv.className = 'upload-status';
        }, 5000);
    }

    async _handleFileSelect(files) {
        if (!files || files.length === 0) return;
        const file = files[0];

        if (!file.type.match('application/json')) {
            this._showUploadStatus('Invalid file type. Please upload a JSON file.', 'error');
            this.fileInput.value = ''; // Reset file input
            return;
        }

        this.fileNameSpan.textContent = file.name;
        this._showLoading('Reading and parsing file...');

        try {
            const fileContent = await file.text();
            const jsonData = JSON.parse(fileContent);

            if (!Array.isArray(jsonData) || jsonData.length === 0) {
                throw new Error("JSON data must be a non-empty array of objects.");
            }
            if (typeof jsonData[0] !== 'object' || jsonData[0] === null) {
                 throw new Error("JSON array elements must be objects.");
            }

            console.log("JSON data loaded successfully", jsonData.length, "records");
            this.originalData = jsonData;
            this.filteredData = [...this.originalData]; // Initially, filtered data is all data

            this._analyzeDataStructure();
            
            // Update UI before showing charts
            this._updateUIState('file-loaded');
            
            // Log dimension information
            console.log("Data dimensions analyzed:", this.dimensions);
            console.log("Chart settings:", this.chartSettings);
            
            // Force display of dimension config section
            this.dimensionConfigSection.style.display = 'block';
            this.renderChartsBtn.style.display = 'inline-flex';
            
            // Make sure chart settings panels are visible
            Object.entries(this.chartConfigs).forEach(([chartKey, config]) => {
                const settingsContainer = document.querySelector(config.settingsSelector);
                if (settingsContainer) {
                    settingsContainer.style.display = 'block';
                }
            });

            this._showUploadStatus('File loaded successfully! Configure dimensions for charts.', 'success');

        } catch (error) {
            console.error("Error processing file:", error);
            this._showUploadStatus(`Error: ${error.message}`, 'error');
            this._resetDashboardToInitial(); // More graceful reset
        } finally {
            this._hideLoading();
        }
    }

    _analyzeDataStructure() {
        console.log("Analyzing data structure...");
        this.dimensions = {};
        if (!this.originalData || this.originalData.length === 0) {
            console.error("No data to analyze");
            return;
        }

        const sample = this.originalData[0];
        const keys = Object.keys(sample);
        
        console.log(`Found ${keys.length} columns in data:`, keys);

        keys.forEach(key => {
            const values = this.originalData.map(d => d[key]);
            const uniqueValues = [...new Set(values.map(v => v === null || v === undefined ? "null" : v.toString()))];
            
            // Try to determine if this is a numeric or categorical column
            let type = 'categorical'; // Default assumption
            const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== "");
            
            if (nonNullValues.length > 0) {
                // Check if all values are numbers or can be parsed as numbers
                const allNumeric = nonNullValues.every(v => {
                    if (typeof v === 'number') return true;
                    if (typeof v === 'string') {
                        const parsed = parseFloat(v);
                        return !isNaN(parsed) && isFinite(parsed);
                    }
                    return false;
                });
                
                if (allNumeric) {
                    type = 'numeric';
                    console.log(`Column "${key}" identified as numeric`);
                } else {
                    console.log(`Column "${key}" identified as categorical with ${uniqueValues.length} unique values`);
                }
            }

            this.dimensions[key] = {
                type: type,
                uniqueValues: uniqueValues.sort(),
            };
            
            if (type === 'numeric') {
                const numericVals = nonNullValues.map(v => typeof v === 'number' ? v : parseFloat(v)).filter(v => !isNaN(v));
                this.dimensions[key].min = d3.min(numericVals);
                this.dimensions[key].max = d3.max(numericVals);
                console.log(`Numeric range for "${key}": ${this.dimensions[key].min} to ${this.dimensions[key].max}`);
            }
        });
    }

    _populateDimensionSelectors() {
        Object.entries(this.chartConfigs).forEach(([chartKey, config]) => {
            // First, make sure the settings container exists and is visible
            const settingsContainerElement = document.querySelector(config.settingsSelector);
            if (!settingsContainerElement) {
                console.error(`Settings container for ${chartKey} not found: ${config.settingsSelector}`);
                return; // Skip this chart if container not found
            }
            
            // Ensure settings containers are visible
            settingsContainerElement.style.display = 'block';
            
            const container = d3.select(config.settingsSelector);
            container.html(''); // Clear previous settings

            // Add header to make it clear this is for settings
            container.append('p')
                .attr('class', 'settings-instruction')
                .text('Select data columns for this chart:');

            config.dimensions.forEach(dimSpec => {
                const fieldGroup = container.append('div').attr('class', 'field-group');
                fieldGroup.append('label')
                    .attr('for', `${chartKey}-${dimSpec.name}-select`)
                    .text(dimSpec.label + (dimSpec.required ? ' *' : ''));

                if (dimSpec.multiple) { // For Sunburst hierarchy
                    const multiSelectContainer = fieldGroup.append('div').attr('class', 'multi-select-container');
                    // Create checkboxes for each compatible dimension
                    Object.keys(this.dimensions)
                        .filter(dKey => this.dimensions[dKey].type === dimSpec.type)
                        .forEach(optionKey => {
                            const lbl = multiSelectContainer.append('label');
                            lbl.append('input')
                                .attr('type', 'checkbox')
                                .attr('name', `${chartKey}-${dimSpec.name}`)
                                .attr('value', optionKey)
                                .on('change', () => this._storeChartDimensionSetting(chartKey, dimSpec.name, optionKey, 'multiple'));
                            lbl.append('span').text(optionKey);
                        });
                     // Add drag-and-drop reordering for selected hierarchy items (advanced)
                     // For now, just selection. Order will be selection order.
                } else {
                    const select = fieldGroup.append('select')
                        .attr('id', `${chartKey}-${dimSpec.name}-select`)
                        .attr('class', 'dimension-select')
                        .on('change', function() { // Use function for 'this'
                            dashboardApp._storeChartDimensionSetting(chartKey, dimSpec.name, this.value);
                        });

                    select.append('option')
                        .attr('value', '')
                        .text(dimSpec.required ? 'Select dimension... *' : 'Select dimension (optional)...');

                    Object.keys(this.dimensions)
                        .filter(dKey => {
                            // Simple type check, can be more sophisticated
                            if (dimSpec.type === 'numeric') return this.dimensions[dKey].type === 'numeric';
                            if (dimSpec.type === 'categorical') return this.dimensions[dKey].type === 'categorical';
                            return true; // If no specific type, allow all
                        })
                        .forEach(optionKey => {
                            select.append('option')
                                .attr('value', optionKey)
                                .text(optionKey);
                        });
                }
            });
            
            // Add a visual indicator if this section has been correctly populated
            container.append('p')
                .attr('class', 'settings-complete')
                .text('* Required fields');
        });
        
        // Make sure the whole section is visible
        this.dimensionConfigSection.style.display = 'block';
        this.renderChartsBtn.style.display = 'inline-flex';
    }
    
    _storeChartDimensionSetting(chartKey, dimensionName, value, selectionType = 'single') {
        if (!this.chartSettings[chartKey]) {
            this.chartSettings[chartKey] = {};
        }
        if (selectionType === 'multiple') {
            if (!this.chartSettings[chartKey][dimensionName]) {
                this.chartSettings[chartKey][dimensionName] = [];
            }
            const G_VALUE = value; // d3 passes event, data. For checkboxes, value is direct.
            const currentSelection = this.chartSettings[chartKey][dimensionName];
            const checkbox = document.querySelector(`input[name="${chartKey}-${dimensionName}"][value="${G_VALUE}"]`);


            if (checkbox && checkbox.checked) {
                if (!currentSelection.includes(G_VALUE)) {
                    currentSelection.push(G_VALUE);
                }
            } else {
                this.chartSettings[chartKey][dimensionName] = currentSelection.filter(v => v !== G_VALUE);
            }
        } else {
             this.chartSettings[chartKey][dimensionName] = value;
        }
        
        console.log(`Settings updated for ${chartKey}:`, this.chartSettings[chartKey]);
        
        // Auto-render this specific chart whenever settings change
        this._renderSingleChart(chartKey);
    }

    _renderSingleChart(chartKey) {
        console.log(`Auto-rendering ${chartKey} chart`);
        const config = this.chartConfigs[chartKey];
        if (!config) {
            console.error(`Chart config not found for ${chartKey}`);
            return;
        }
        
        const currentSettings = this.chartSettings[chartKey] || {};
        let chartIsValid = true;
        
        // Validate required dimensions are set
        config.dimensions.forEach(dimSpec => {
            if (dimSpec.required) {
                if (dimSpec.multiple) {
                    if (!currentSettings[dimSpec.name] || currentSettings[dimSpec.name].length === 0) {
                        chartIsValid = false;
                        console.log(`Missing required dimension ${dimSpec.name} for ${chartKey}`);
                    }
                } else {
                    if (!currentSettings[dimSpec.name]) {
                        chartIsValid = false;
                        console.log(`Missing required dimension ${dimSpec.name} for ${chartKey}`);
                    }
                }
            }
        });

        if (!chartIsValid) {
            console.log(`${chartKey} chart is not ready to render - missing required dimensions`);
            this._setChartPlaceholderMessage(config.selector, `Select all required dimensions for ${chartKey} chart.`);
            if(config.instance && config.instance.clear) config.instance.clear();
            return;
        }

        // If valid, prepare data and update chart
        try {
            console.log(`Preparing data for ${chartKey} chart`);
            const chartData = this._prepareDataForChart(chartKey, this.filteredData || this.originalData, currentSettings);
            
            if (chartData) {
                console.log(`Rendering ${chartKey} chart with data:`, chartData);
                if(config.instance) {
                    console.log(`${chartKey} chart instance:`, config.instance);
                    config.instance.update(chartData, currentSettings, this.globalColorScale, this.dimensions);
                    console.log(`${chartKey} chart updated successfully`);
                    
                    // Show visualization grid when at least one chart is rendered
                    this.visualizationGrid.style.display = 'flex';
                } else {
                    console.error(`${chartKey} chart instance is not initialized`);
                }
            } else {
                console.error(`Failed to prepare data for ${chartKey} chart`);
                this._setChartPlaceholderMessage(config.selector, `Could not prepare data for ${chartKey} with selected dimensions.`);
                if(config.instance && config.instance.clear) config.instance.clear();
            }
        } catch (e) {
            console.error(`Error rendering ${chartKey}:`, e);
            this._setChartPlaceholderMessage(config.selector, `Error rendering ${chartKey}: ${e.message}`);
            if(config.instance && config.instance.clear) config.instance.clear();
        }
    }

    _renderAllChartsWithSelectedDimensions() {
        this._showLoading("Rendering charts...");
        let allDimensionsValid = true;

        Object.entries(this.chartConfigs).forEach(([chartKey, config]) => {
            const currentSettings = this.chartSettings[chartKey] || {};
            let chartIsValid = true;
            
            // Validate required dimensions are set
            config.dimensions.forEach(dimSpec => {
                if (dimSpec.required) {
                    if (dimSpec.multiple) {
                        if (!currentSettings[dimSpec.name] || currentSettings[dimSpec.name].length === 0) {
                            chartIsValid = false;
                        }
                    } else {
                        if (!currentSettings[dimSpec.name]) {
                            chartIsValid = false;
                        }
                    }
                }
            });

            if (!chartIsValid) {
                allDimensionsValid = false;
                this._setChartPlaceholderMessage(config.selector, `Missing required dimensions for ${chartKey}. Please check settings.`);
                if(config.instance.clear) config.instance.clear();
                return; // Skip rendering this chart
            }

            // If valid, prepare data and update chart
            try {
                const chartData = this._prepareDataForChart(chartKey, this.filteredData, currentSettings);
                if (chartData) {
                     config.instance.update(chartData, currentSettings, this.globalColorScale, this.dimensions); // Pass all settings and global color
                } else {
                     this._setChartPlaceholderMessage(config.selector, `Could not prepare data for ${chartKey} with selected dimensions.`);
                     if(config.instance.clear) config.instance.clear();
                }
            } catch (e) {
                console.error(`Error rendering ${chartKey}:`, e);
                this._setChartPlaceholderMessage(config.selector, `Error rendering ${chartKey}: ${e.message}`);
                if(config.instance.clear) config.instance.clear();
                allDimensionsValid = false; 
            }
        });
        
        this._hideLoading();
        if (allDimensionsValid && this.originalData) { // Only transition if data is loaded
            this._updateUIState('charts-rendered');
        } else if (!this.originalData) {
            // If no data, but trying to render (e.g. from a saved state in future)
             this._showUploadStatus('No data loaded. Please upload a file first.', 'error');
        } else {
            this._showUploadStatus('Some charts could not be rendered. Please check dimension selections.', 'warning');
        }
    }

    _setChartPlaceholderMessage(selector, message) {
        const chartDiv = document.querySelector(selector);
        if (chartDiv) {
            let p = chartDiv.querySelector('.chart-placeholder-text');
            if (!p) {
                p = document.createElement('p');
                p.className = 'chart-placeholder-text';
                // Clear previous chart SVG if any
                const svg = chartDiv.querySelector('svg');
                if (svg) svg.remove();
                chartDiv.appendChild(p);
            }
            p.textContent = message;
            p.style.display = 'block';
        }
    }
    
    _prepareDataForChart(chartKey, data, settings) {
        if (!data || data.length === 0) return null;
        const config = this.chartConfigs[chartKey];
    
        // Coerce numeric string data to numbers
        const processedData = data.map(row => {
            const newRow = { ...row };
            config.dimensions.forEach(dimSpec => {
                const colName = settings[dimSpec.name];
                if (colName && this.dimensions[colName] && this.dimensions[colName].type === 'numeric') {
                    if (typeof newRow[colName] === 'string') {
                        newRow[colName] = parseFloat(newRow[colName]);
                        if (isNaN(newRow[colName])) newRow[colName] = null; // Handle parse failures
                    }
                }
            });
            // For Sunburst hierarchy (multiple categorical fields)
            if (chartKey === 'sunburst' && settings.hierarchy && Array.isArray(settings.hierarchy)) {
                 settings.hierarchy.forEach(hierColName => {
                     if (this.dimensions[hierColName] && this.dimensions[hierColName].type === 'numeric') {
                          if (typeof newRow[hierColName] === 'string') {
                            newRow[hierColName] = parseFloat(newRow[hierColName]);
                             if (isNaN(newRow[hierColName])) newRow[hierColName] = null;
                          }
                     }
                 });
            }
            return newRow;
        });

        switch (chartKey) {
            case 'radialBar':
                const { category, value } = settings;
                if (!category || !value) return null;
                // Group by category and sum value. D3 chart itself should handle this.
                // For now, just ensure the columns exist. The chart class will do the aggregation.
                return processedData.map(d => ({ category: d[category], value: d[value] }));

            case 'chord':
                const { source, target, value: chordValue } = settings;
                if (!source || !target || !chordValue) return null;
                // Data structure is usually an array of objects {source, target, value}
                // The ChordDiagram class will convert this to a matrix.
                return processedData.map(d => ({
                    source: d[source],
                    target: d[target],
                    value: +d[chordValue] // Ensure value is numeric
                })).filter(d => d.value > 0); // Chord diagram usually for positive values

            case 'forceDirected':
                const { nodeId, linkTarget, linkValue } = settings;
                if (!nodeId || !linkTarget) {
                    console.error("ForceDirected chart missing required dimensions:", settings);
                    return null;
                }
                
                console.log("Preparing force directed data with nodeId:", nodeId, "linkTarget:", linkTarget);
                
                try {
                    // Create unique set of nodes from both nodeId and linkTarget fields
                    const nodeSet = new Set();
                    processedData.forEach(d => {
                        if (d[nodeId] !== null && d[nodeId] !== undefined) nodeSet.add(d[nodeId].toString());
                        if (d[linkTarget] !== null && d[linkTarget] !== undefined) nodeSet.add(d[linkTarget].toString());
                    });
                    
                    // Create nodes array with unique IDs
                    const nodes = Array.from(nodeSet).map(id => ({ id }));
                    console.log("Created", nodes.length, "unique nodes");
                    
                    // Create links with proper source/target references
                    const links = processedData
                        .filter(d => d[nodeId] && d[linkTarget] && d[nodeId] !== d[linkTarget])
                        .map(d => ({
                            source: d[nodeId].toString(),
                            target: d[linkTarget].toString(),
                            value: linkValue && d[linkValue] ? +d[linkValue] : 1
                        }));
                    
                    console.log("Created", links.length, "links between nodes");
                    
                    // Validate that we have data to show
                    if (nodes.length === 0) {
                        console.error("No valid nodes found for Force-Directed Graph");
                        return null;
                    }
                    
                    if (links.length === 0) {
                        console.warn("No links found for Force-Directed Graph - nodes will be disconnected");
                    }
                    
                    return { nodes, links };
                } catch (error) {
                    console.error("Error preparing force directed data:", error);
                    return null;
                }

            case 'sunburst':
                const { hierarchy: hierarchyCols, value: sunburstValueCol } = settings;
                if (!hierarchyCols || hierarchyCols.length === 0 || !sunburstValueCol) {
                    console.error("Missing required dimensions for sunburst chart", settings);
                    return null;
                }
                
                // Sunburst data needs to be hierarchical.
                console.log("Building hierarchy for sunburst with levels:", hierarchyCols);
                
                function buildHierarchy(data, levels, valueField) {
                    console.log("Building hierarchy with data length:", data.length);
                    
                    const root = { name: "root", children: [] };
                    data.forEach(d => {
                        let currentLevel = root;
                        
                        // Process through each hierarchy level
                        levels.forEach((levelKey, i) => {
                            if (!d[levelKey] && d[levelKey] !== 0) {
                                console.warn(`Missing value for hierarchy level ${levelKey} in record:`, d);
                                return; // Skip this record or level
                            }
                            
                            const levelName = d[levelKey] !== null && d[levelKey] !== undefined ? 
                                d[levelKey].toString() : "Unknown";
                            
                            // Find or create the node at this level
                            let existingNode = currentLevel.children.find(child => child.name === levelName);
                            
                            if (!existingNode) {
                                existingNode = { 
                                    name: levelName, 
                                    children: [], 
                                    value: 0 
                                };
                                currentLevel.children.push(existingNode);
                            }
                            
                            // Add value at leaf level
                            if (i === levels.length - 1) {
                                const nodeValue = +d[valueField] || 0;
                                existingNode.value += nodeValue;
                                console.log(`Adding value ${nodeValue} to node ${levelName}`);
                            }
                            
                            // Move to next level
                            currentLevel = existingNode;
                        });
                        
                        // Remove empty children arrays from leaf nodes
                        if (currentLevel.children && currentLevel.children.length === 0) {
                            delete currentLevel.children;
                        }
                    });
                    
                    // Recursively sum values up the tree from leaves
                    function sumValues(node) {
                        if (node.children && node.children.length > 0) {
                            node.value = node.children.reduce((sum, child) => sum + sumValues(child), 0);
                        }
                        return node.value || 0;
                    }
                    
                    sumValues(root);
                    console.log("Built hierarchy:", root);
                    return root;
                }
                
                return buildHierarchy(processedData, hierarchyCols, sunburstValueCol);

            default:
                return processedData; // Or null if chartKey is unknown
        }
    }

    _initializeGlobalFiltersUI() {
        this.filterContainer.innerHTML = ''; // Clear existing
        this.globalFilters = {}; // Reset stored filter values

        if (Object.keys(this.dimensions).length === 0) {
            this.filtersEmptyState.style.display = 'block';
            return;
        }
        this.filtersEmptyState.style.display = 'none';
        
        let filterAdded = false;
        Object.entries(this.dimensions).forEach(([key, dimInfo]) => {
            const filterDiv = d3.select(this.filterContainer)
                .append('div')
                .attr('class', 'filter');

            filterDiv.append('label')
                .attr('for', `filter-${key}`)
                .text(key);

            if (dimInfo.type === 'numeric' && dimInfo.min !== undefined && dimInfo.max !== undefined) {
                filterAdded = true;
                filterDiv.classed('numeric-filter', true);
                const rangeContainer = filterDiv.append('div').attr('class', 'range-container');
                
                const createSlider = (type, initialValue) => {
                    rangeContainer.append('span').text(`${type.charAt(0).toUpperCase() + type.slice(1)}: `);
                    const slider = rangeContainer.append('input')
                        .attr('type', 'range')
                        .attr('id', `filter-${key}-${type}`)
                        .attr('min', dimInfo.min)
                        .attr('max', dimInfo.max)
                        .attr('value', initialValue)
                        .attr('step', (dimInfo.max - dimInfo.min) / 100); // Sensible step
                    const valueSpan = rangeContainer.append('span')
                        .attr('class', 'range-value')
                        .text(initialValue);
                    slider.on('input', function() { 
                        valueSpan.text(this.value);
                        // No immediate apply, wait for Apply button
                    });
                };
                createSlider('min', dimInfo.min);
                createSlider('max', dimInfo.max);
                this.globalFilters[key] = { type: 'numeric', min: dimInfo.min, max: dimInfo.max };

            } else if (dimInfo.type === 'categorical' && dimInfo.uniqueValues.length > 0 && dimInfo.uniqueValues.length < 1000) { // Limit for practical multi-select
                filterAdded = true;
                filterDiv.classed('categorical-filter', true);
                const select = filterDiv.append('select')
                    .attr('id', `filter-${key}`)
                    .attr('multiple', true);
                
                dimInfo.uniqueValues.forEach(val => {
                    select.append('option').attr('value', val).text(val);
                });
                this.globalFilters[key] = { type: 'categorical', selected: [] }; // Initially empty
            } else {
                filterDiv.remove(); // No suitable filter for this dimension
            }
        });
        if (!filterAdded) {
             this.filtersEmptyState.textContent = "No filterable dimensions found in the current data.";
             this.filtersEmptyState.style.display = 'block';
        }
    }

    _applyAllFilters() {
        let newFilteredData = [...this.originalData];

        // Gather current filter values from UI
        Object.keys(this.globalFilters).forEach(key => {
            const filterSpec = this.globalFilters[key];
            if (filterSpec.type === 'numeric') {
                const minVal = parseFloat(document.getElementById(`filter-${key}-min`).value);
                const maxVal = parseFloat(document.getElementById(`filter-${key}-max`).value);
                filterSpec.min = minVal; // Store for persistence if needed
                filterSpec.max = maxVal;
                newFilteredData = newFilteredData.filter(d => {
                    const val = parseFloat(d[key]);
                    return !isNaN(val) && val >= minVal && val <= maxVal;
                });
            } else if (filterSpec.type === 'categorical') {
                const selectElement = document.getElementById(`filter-${key}`);
                const selectedOptions = Array.from(selectElement.selectedOptions).map(opt => opt.value);
                filterSpec.selected = selectedOptions;
                if (selectedOptions.length > 0) {
                    newFilteredData = newFilteredData.filter(d => selectedOptions.includes(d[key] ? d[key].toString() : "null"));
                }
            }
        });
        
        this.filteredData = newFilteredData;
        this._updatePrimaryColorDimensionDomain(); // Update color domain if filters change it
        this._renderAllChartsWithSelectedDimensions(); // Re-render with new filtered data
        this._showUploadStatus('Filters applied.', 'success');
    }

    _clearAllFilters() {
        this.filteredData = [...this.originalData];
        // Reset UI elements for filters
        Object.keys(this.globalFilters).forEach(key => {
            const filterSpec = this.globalFilters[key];
            const dimInfo = this.dimensions[key];
            if (filterSpec.type === 'numeric' && dimInfo) {
                document.getElementById(`filter-${key}-min`).value = dimInfo.min;
                document.getElementById(`filter-${key}-min`).nextElementSibling.textContent = dimInfo.min; // Update span
                document.getElementById(`filter-${key}-max`).value = dimInfo.max;
                document.getElementById(`filter-${key}-max`).nextElementSibling.textContent = dimInfo.max; // Update span
                filterSpec.min = dimInfo.min;
                filterSpec.max = dimInfo.max;
            } else if (filterSpec.type === 'categorical') {
                const selectElement = document.getElementById(`filter-${key}`);
                Array.from(selectElement.options).forEach(opt => opt.selected = false);
                filterSpec.selected = [];
            }
        });
        this._updatePrimaryColorDimensionDomain();
        this._renderAllChartsWithSelectedDimensions();
        this._showUploadStatus('Filters cleared.', 'success');
    }
    
    _updatePrimaryColorDimensionDomain() {
        // This method should be called after data load and after filters are applied
        // For now, let's assume the first categorical dimension is used for coloring or let user pick
        // For simplicity, we'll just use the default scheme10 which auto-assigns.
        // A more advanced version would let the user pick a column for consistent coloring.
        // Example:
        // if (this.primaryColorDimension && this.dimensions[this.primaryColorDimension]) {
        // const uniqueValuesInFilteredData = [...new Set(this.filteredData.map(d => d[this.primaryColorDimension]))];
        // this.globalColorScale.domain(uniqueValuesInFilteredData.sort());
        // } else {
        // Fallback if no specific dimension is chosen, or clear domain to let d3 assign.
        // this.globalColorScale.domain([]); // Or let it be, d3.schemeCategory10 handles new values
        // }
    }

    _handleBrushAndLink(detail) {
        const { data, chartSourceType, selectionValue, selectedKey } = detail;
        // `data` is the array of selected item identifiers (e.g., category names, node IDs)
        // `chartSourceType` is like 'radialBar', 'chord', etc.
        // `selectionValue` could be the raw d from d3, `selectedKey` is the field used for selection

        if (!data || data.length === 0) { // Clear selection
            Object.values(this.chartConfigs).forEach(config => {
                if (config.instance && config.id !== chartSourceType) {
                    config.instance.handleExternalSelection([], null, this.globalColorScale); // Pass empty array
                }
            });
            return;
        }
        
        // This is the complex part: mapping selections.
        // For a selection in chart A based on dimension X, how does it relate to chart B using dimension Y and Z?
        // We need to find all rows in `this.filteredData` that match the selection from the source chart.
        let relevantOriginalDataRows = [];
        if (selectedKey && this.filteredData) {
             relevantOriginalDataRows = this.filteredData.filter(row => {
                 return data.includes(row[selectedKey] ? row[selectedKey].toString() : null);
             });
        } else { // If no selectedKey, perhaps selection is more direct (e.g. a whole node object)
            // This needs careful handling based on what `data` contains.
            // For now, assume `selectedKey` is provided by the chart's event.
            console.warn("Brushing: selectedKey not provided from source chart", chartSourceType);
            return;
        }


        Object.values(this.chartConfigs).forEach(config => {
            if (config.instance && config.id !== chartSourceType) {
                const chartSettings = this.chartSettings[config.id];
                if (chartSettings) {
                    // Determine what to highlight in the target chart based on its own dimensions
                    // and the `relevantOriginalDataRows`.
                    let highlightDataForTargetChart = new Set();

                    // Example: If RadialBar (source) selected 'Region A',
                    // and Chord diagram (target) uses 'Company' as source/target.
                    // We need to find all 'Company' values from `relevantOriginalDataRows` where Region is 'Region A'.

                    // This logic is highly dependent on how each chart expects its selection data.
                    // For simplicity, let's try to pass identifiers based on the target chart's main dimensions.
                    
                    if (config.id === 'radialBar' && chartSettings.category) {
                        relevantOriginalDataRows.forEach(row => highlightDataForTargetChart.add(row[chartSettings.category]));
                    } else if (config.id === 'chord' && chartSettings.source && chartSettings.target) {
                        relevantOriginalDataRows.forEach(row => {
                            highlightDataForTargetChart.add(row[chartSettings.source]);
                            highlightDataForTargetChart.add(row[chartSettings.target]);
                        });
                    } else if (config.id === 'forceDirected' && chartSettings.nodeId) {
                         relevantOriginalDataRows.forEach(row => highlightDataForTargetChart.add(row[chartSettings.nodeId]));
                         // also consider linkTarget if it's different
                         if (chartSettings.linkTarget && chartSettings.linkTarget !== chartSettings.nodeId) {
                            relevantOriginalDataRows.forEach(row => highlightDataForTargetChart.add(row[chartSettings.linkTarget]));
                         }
                    } else if (config.id === 'sunburst' && chartSettings.hierarchy && chartSettings.hierarchy.length > 0) {
                        // Sunburst is tricky. Highlight paths.
                        // For now, let's try highlighting based on the first hierarchy level.
                        const firstHierarchyLevel = chartSettings.hierarchy[0];
                        relevantOriginalDataRows.forEach(row => highlightDataForTargetChart.add(row[firstHierarchyLevel]));
                    }
                    
                    config.instance.handleExternalSelection(Array.from(highlightDataForTargetChart), null, this.globalColorScale);
                }
            }
        });
    }
    
    _resetDashboardToInitial() {
        this.originalData = null;
        this.filteredData = null;
        this.dimensions = {};
        this.chartSettings = {};
        this.globalFilters = {};
        this.fileInput.value = ''; // Clear file input
        
        Object.values(this.chartConfigs).forEach(config => {
             if (config.instance && typeof config.instance.clear === 'function') {
                config.instance.clear();
            }
            // Reset settings panel to prompt
            const settingsContainer = document.querySelector(config.settingsSelector);
            if (settingsContainer) {
                settingsContainer.innerHTML = '<p class="settings-prompt">Load data to see dimension options.</p>';
            }
        });
        this.filterContainer.innerHTML = ''; // Clear filters UI
        this.filtersEmptyState.textContent = 'Load data and configure charts to see available filters.';
        this.filtersEmptyState.style.display = 'block';
        this._updateUIState('initial');
    }

    _resetDashboard() { // Called by remove file button
        this._resetDashboardToInitial();
        this._showUploadStatus("Dashboard reset. Upload a new file.", "success");
    }
}

// Initialize dashboard when DOM is loaded
// This is now handled in index.html inline script for timing,
// but ensure Dashboard class is available globally or imported if using modules.
// document.addEventListener('DOMContentLoaded', () => {
//    window.dashboardApp = new Dashboard();
// });