// js/radial_bar.js
class RadialBarChart {
    constructor(containerId, margins, tooltipInstance) {
        this.containerId = containerId;
        this.container = d3.select(containerId);
        this.tooltip = tooltipInstance; // Use global tooltip
        this.margin = margins || { top: 60, right: 40, bottom: 60, left: 40 }; // Increased top/bottom for title/legend

        this.svg = null; // Will be created in update/clear
        this.g = null; // Main group for chart elements

        this.data = null; // To store the processed data for resizing
        this.settings = null; // To store current settings

        this.selectedItems = new Set(); // Store selected category names

        this.angleScale = d3.scaleBand().padding(0.1); // Add padding
        this.radiusScale = d3.scaleRadial(); // Use scaleRadial for radial charts
        this.colorScale = null; // Will be passed from dashboard

        this._setupSVG();
    }

    _setupSVG() {
        // Clear previous SVG if any
        this.container.select('svg').remove();

        const containerRect = this.container.node().getBoundingClientRect();
        this.width = containerRect.width - this.margin.left - this.margin.right;
        this.height = containerRect.height - this.margin.top - this.margin.bottom;
        
        // Ensure width and height are positive
        if (this.width <= 0 || this.height <= 0) {
            // console.warn("RadialBarChart: Container dimensions are too small or not yet available.");
            // Add placeholder if SVG cannot be properly sized
            this._addPlaceholder("Container too small or data not ready.");
            return false; // Indicate setup failure
        }

        this.outerRadius = Math.min(this.width, this.height) / 2;
        this.innerRadius = this.outerRadius * 0.2; // Example: make it a donut, not a pie

        this.svg = this.container.append('svg')
            .attr('width', containerRect.width)
            .attr('height', containerRect.height);

        this.g = this.svg.append('g')
            .attr('transform', `translate(${containerRect.width / 2}, ${containerRect.height / 2})`);

        // Chart title placeholder
        this.g.append("text")
            .attr("class", "chart-title")
            .attr("x", 0)
            .attr("y", -this.outerRadius - this.margin.top / 3) // Position above chart
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("font-weight", "bold");
        
        return true; // Indicate setup success
    }

    _addPlaceholder(message) {
        this.container.select('.chart-placeholder-text').remove(); // Remove old one if exists
        const p = this.container.append('p')
            .attr('class', 'chart-placeholder-text')
            .style('display', 'block'); // Make sure it's visible
        p.text(message);
    }

    update(processedData, settings, colorScale) {
        if (!processedData || !settings || !settings.category || !settings.value) {
            this.clear();
            this._addPlaceholder("Missing data or required dimension settings for Radial Bar Chart.");
            return;
        }
        
        // Check if SVG setup failed or needs re-setup (e.g., after clear)
        if (!this.svg || !this.g) {
            if (!this._setupSVG()) return; // Attempt to setup SVG, if fails, exit
        }
        // Remove placeholder if data is being rendered
        this.container.select('.chart-placeholder-text').style('display', 'none');

        this.data = processedData;
        this.settings = settings;
        this.colorScale = colorScale;


        // --- Data Aggregation ---
        // The dashboard's _prepareDataForChart for radialBar just maps keys.
        // We need to aggregate here if multiple rows have the same category.
        const aggregatedData = Array.from(
            d3.group(this.data, d => d.category), // Group by the category field from settings
            ([key, values]) => ({
                category: key,
                value: d3.sum(values, d => d.value) // Sum the value field
            })
        ).sort((a, b) => d3.descending(a.value, b.value)); // Optional: sort by value

        // Update chart title
        this.g.select(".chart-title")
            .text(`${this.settings.value} by ${this.settings.category}`);

        // Update scales
        this.angleScale
            .domain(aggregatedData.map(d => d.category))
            .range([0, 2 * Math.PI]);

        this.radiusScale
            .domain([0, d3.max(aggregatedData, d => d.value)])
            .range([this.innerRadius, this.outerRadius]);
        
        // Update color scale domain if it's not already set or needs to include these categories
        // The global color scale might have a broader domain, or we adapt it.
        // For now, assume the global colorScale passed is ready to be used.
        // If necessary: this.colorScale.domain(aggregatedData.map(d => d.category));


        // Arc generator
        const arcGenerator = d3.arc()
            .innerRadius(this.innerRadius)
            .outerRadius(d => this.radiusScale(d.value))
            .startAngle(d => this.angleScale(d.category))
            .endAngle(d => this.angleScale(d.category) + this.angleScale.bandwidth())
            .padAngle(0.01)
            .padRadius(this.innerRadius);

        // Data join
        const bars = this.g.selectAll('.bar')
            .data(aggregatedData, d => d.category); // Use category as key

        // Exit
        bars.exit()
            .transition().duration(300)
            .attr('opacity', 0)
            .remove();

        // Enter
        const barsEnter = bars.enter().append('path')
            .attr('class', 'bar')
            .attr('fill', d => this.colorScale(d.category))
            .attr('opacity', 0) // Start transparent for entry transition
            .on('mouseover', (event, d) => {
                this.tooltip.transition().duration(200).style('opacity', 0.9);
                this.tooltip.html(`<strong>${d.category}</strong><br/>${this.settings.value}: ${d3.format(",.0f")(d.value)}`)
                    .style('left', (event.pageX + 15) + 'px')
                    .style('top', (event.pageY - 28) + 'px');
                
                d3.select(event.currentTarget).style('stroke', 'black').style('stroke-width', '1px');
            })
            .on('mouseout', (event) => {
                this.tooltip.transition().duration(500).style('opacity', 0);
                d3.select(event.currentTarget).style('stroke', 'none');
            })
            .on('click', (event, d) => {
                const categoryName = d.category;
                const isSelected = this.selectedItems.has(categoryName);

                if (event.ctrlKey || event.shiftKey) {
                    if (isSelected) this.selectedItems.delete(categoryName);
                    else this.selectedItems.add(categoryName);
                } else {
                    this.selectedItems.clear();
                    if (!isSelected) this.selectedItems.add(categoryName);
                }
                
                this._applySelectionVisuals();

                // Dispatch custom event for brushing and linking
                const customEvent = new CustomEvent('selectionChanged', {
                    detail: {
                        data: Array.from(this.selectedItems), // Array of selected category names
                        chartSourceType: 'radialBar',
                        selectedKey: this.settings.category, // The actual column name used for categories
                        selectionValue: d // The raw data object of the clicked bar
                    }
                });
                window.dispatchEvent(customEvent);
            });

        // Update
        bars.merge(barsEnter)
            .transition().duration(750)
            .attr('opacity', 1)
            .attrTween('d', (d, i, nodes) => { // Smooth transition for arcs
                const S_NODE = nodes[i];
                const current = S_NODE._current || { startAngle: 0, endAngle: 0, innerRadius: this.innerRadius, outerRadius: this.innerRadius };
                const interpolate = d3.interpolate(current, {
                    startAngle: this.angleScale(d.category),
                    endAngle: this.angleScale(d.category) + this.angleScale.bandwidth(),
                    innerRadius: this.innerRadius,
                    outerRadius: this.radiusScale(d.value)
                });
                S_NODE._current = interpolate(0); // Store initial for next transition
                return t => arcGenerator(interpolate(t));
            })
            .attr('fill', d => this.colorScale(d.category)); // Ensure color is updated

        this._applySelectionVisuals(); // Apply selection visuals after update

        // Optional: Add labels (can get crowded on radial bars)
        this.g.selectAll('.bar-label').remove(); // Clear old labels
        /*
        this.g.selectAll('.bar-label')
            .data(aggregatedData)
            .enter().append('text')
            .attr('class', 'bar-label')
            .attr('dy', '.35em')
            .attr('text-anchor', 'middle')
            .attr('transform', d => {
                const angle = this.angleScale(d.category) + this.angleScale.bandwidth() / 2;
                const rotation = (angle * 180 / Math.PI) - 90;
                const labelRadius = this.radiusScale(d.value) + 10; // Position outside the bar
                return `rotate(${rotation}) translate(${labelRadius},0) rotate(${rotation > 90 ? 180 : 0})`;
            })
            .text(d => d.category)
            .style('font-size', '10px')
            .style('fill', 'var(--text-secondary)');
        */
    }

    _applySelectionVisuals() {
        this.g.selectAll('.bar')
            .classed('selected', d => this.selectedItems.has(d.category))
            .classed('dimmed', d => this.selectedItems.size > 0 && !this.selectedItems.has(d.category));
    }

    handleExternalSelection(selectedDataItems, sourceKey, colorScale) {
        // selectedDataItems is an array of category names (or whatever the external selection is based on)
        // sourceKey is not directly used here as radial bar's primary key is its own category
        
        this.selectedItems.clear();
        if (selectedDataItems && selectedDataItems.length > 0 && this.data) {
             // Assuming selectedDataItems are values that can match `d.category`
            this.data.forEach(d => {
                if (selectedDataItems.includes(d.category)) {
                    this.selectedItems.add(d.category);
                }
            });
        }
        if (this.g) { // Ensure g exists
           this._applySelectionVisuals();
        }
    }

    resize() {
        if (!this.svg || !this.g) { // If SVG not set up (e.g., cleared, initial load failed)
            if (!this._setupSVG() && this.data) { // Try to set up, if data exists
                 // If setup fails again, it might be due to container size
                 console.warn("RadialBarChart: Resize called but SVG setup failed.");
                 return;
            } else if (!this.data) {
                return; // No data to render
            }
        } else { // SVG exists, just update its dimensions and transform
            const containerRect = this.container.node().getBoundingClientRect();
            this.width = containerRect.width - this.margin.left - this.margin.right;
            this.height = containerRect.height - this.margin.top - this.margin.bottom;

            if (this.width <= 0 || this.height <= 0) return; // Prevent errors if container hidden

            this.outerRadius = Math.min(this.width, this.height) / 2;
            this.innerRadius = this.outerRadius * 0.2;

            this.svg.attr('width', containerRect.width).attr('height', containerRect.height);
            this.g.attr('transform', `translate(${containerRect.width / 2}, ${containerRect.height / 2})`);
        }


        if (this.data && this.settings && this.colorScale) {
            // Re-apply scales and re-render
            // Update scales domain only if necessary, range always
            this.angleScale.range([0, 2 * Math.PI]);
            this.radiusScale.range([this.innerRadius, this.outerRadius]);
            
            // Update title position
            this.g.select(".chart-title")
                .attr("y", -this.outerRadius - this.margin.top / 3);

            // Re-render bars (simplified, full update logic might be better)
             const arcGenerator = d3.arc()
                .innerRadius(this.innerRadius)
                .outerRadius(d => this.radiusScale(d.value))
                .startAngle(d => this.angleScale(d.category))
                .endAngle(d => this.angleScale(d.category) + this.angleScale.bandwidth())
                .padAngle(0.01)
                .padRadius(this.innerRadius);

            this.g.selectAll('.bar')
                .attr('d', arcGenerator);
            
            // Re-apply selections and potentially labels
            this._applySelectionVisuals();
            // If labels were used: re-calculate their positions.
        }
    }

    clear() {
        if (this.g) {
            this.g.selectAll('*').remove();
            this.g.append("text") // Re-add title placeholder
                .attr("class", "chart-title")
                .attr("x", 0)
                .attr("y", -this.outerRadius - this.margin.top / 3)
                .attr("text-anchor", "middle")
                .style("font-size", "16px")
                .style("font-weight", "bold");
        }
        this.data = null;
        this.settings = null;
        this.selectedItems.clear();
        this._addPlaceholder("");
    }

    downloadSVG(filename) {
        if (!this.svg) {
            alert("Chart is not rendered yet.");
            return;
        }
        // Temporarily add styles to the SVG for export
        const styleDef = `
            .bar { transition: opacity 0.3s ease, fill 0.3s ease; }
            .bar.selected { stroke: var(--accent-color, #e74c3c); stroke-width: 2px; opacity: 1; }
            .bar.dimmed { opacity: 0.2; }
            .chart-title { font-family: ${getComputedStyle(this.container.node()).fontFamily}; fill: var(--text-primary, black); }
            text { font-family: ${getComputedStyle(this.container.node()).fontFamily}; fill: var(--text-secondary, grey); }
        `;
        
        this.svg.insert('style', ':first-child').html(styleDef);

        const svgString = new XMLSerializer().serializeToString(this.svg.node());
        this.svg.select('style').remove(); // Remove temporary styles

        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}