// js/sunburst.js
class SunburstChart {
    constructor(containerId, margins, tooltipInstance) {
        this.containerId = containerId;
        this.container = d3.select(containerId);
        this.tooltip = tooltipInstance;
        this.margin = margins || { top: 40, right: 20, bottom: 20, left: 20 };

        this.svg = null;
        this.g = null; // Main group for chart elements

        this.data = null; // Store the D3 hierarchy root
        this.settings = null;
        this.currentRoot = null; // For zoom state

        this.selectedItems = new Set(); // Store selected segment paths or unique identifiers

        this.colorScale = null;
        
        this.radius = 0;
        this.xScale = d3.scaleLinear().range([0, 2 * Math.PI]).clamp(true);
        this.yScale = d3.scaleSqrt().range([0, this.radius]); // Sqrt scale for better area perception

        this.partition = d3.partition();
        
        this.arcGenerator = d3.arc()
            .startAngle(d => this.xScale(d.x0))
            .endAngle(d => this.xScale(d.x1))
            .innerRadius(d => Math.max(0, this.yScale(d.y0)))
            .outerRadius(d => Math.max(0, this.yScale(d.y1)))
            .padAngle(d => Math.min((this.xScale(d.x1) - this.xScale(d.x0)) / 2, 0.005)) // Add padding
            .padRadius(this.radius / 2);

        this._setupSVG();
    }

    _setupSVG() {
        this.container.select('svg').remove();
        const containerRect = this.container.node().getBoundingClientRect();
        this.width = containerRect.width - this.margin.left - this.margin.right;
        this.height = containerRect.height - this.margin.top - this.margin.bottom;

        if (this.width <= 0 || this.height <= 0) {
            this._addPlaceholder("Container too small or data not ready.");
            return false;
        }

        this.radius = Math.min(this.width, this.height) / 2;
        this.yScale.range([this.radius * 0.1, this.radius]); // Inner part for center circle, outer for segments

        this.svg = this.container.append('svg')
            .attr('width', containerRect.width)
            .attr('height', containerRect.height)
            .attr('viewBox', `${-containerRect.width/2} ${-containerRect.height/2} ${containerRect.width} ${containerRect.height}`); // Center 0,0

        this.g = this.svg.append('g');
            // .attr('transform', `translate(${containerRect.width / 2}, ${containerRect.height / 2})`); // Centered by viewBox

        this.svg.append("text") // Title is outside the 'g' transform
            .attr("class", "chart-title")
            .attr("x", 0) 
            .attr("y", -this.height / 2 + this.margin.top / 2) // Position above chart
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("font-weight", "bold");
            
        // Center circle for "Up" button / zoom out
        this.centerCircle = this.g.append("circle")
            .datum(null) // Will be bound to root later
            .attr("r", this.yScale.range()[0] * 0.9) // Slightly smaller than the smallest innerRadius
            .attr("fill", "var(--surface-color)")
            .attr("stroke", "var(--border-color)")
            .style("cursor", "pointer")
            .on("click", (event, d) => this._zoomOnClick(event, this.currentRoot.parent || this.currentRoot)); // Zoom to parent

        this.centerText = this.g.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", ".35em")
            .style("font-size", "10px")
            .style("pointer-events", "none") // Text doesn't capture click
            .text("UP");
            
        return true;
    }

    _addPlaceholder(message) {
        this.container.select('.chart-placeholder-text').remove();
        const p = this.container.append('p')
            .attr('class', 'chart-placeholder-text')
            .style('display', 'block');
        p.text(message);
    }

    update(hierarchicalData, settings, colorScale) {
        if (!hierarchicalData || !hierarchicalData.children || !settings || !settings.hierarchy || !settings.value) {
            console.error("Sunburst Chart: Missing data or required dimensions", hierarchicalData, settings);
            this.clear();
            this._addPlaceholder("Missing data or required dimension settings for Sunburst Chart.");
            return;
        }

        if (!this.svg || !this.g) {
            if(!this._setupSVG()) return;
        }
        this.container.select('.chart-placeholder-text').style('display', 'none');

        console.log("Sunburst Chart: Updating with data", hierarchicalData);
        
        // Convert data to a proper D3 hierarchy if it isn't already
        if (!hierarchicalData.sum) {
            console.log("Sunburst Chart: Converting data to D3 hierarchy");
            this.data = d3.hierarchy(hierarchicalData)
                .sum(d => d.value || 0)
                .sort((a, b) => b.value - a.value);
        } else {
            this.data = hierarchicalData;
        }
        
        this.settings = settings;
        this.colorScale = colorScale;
        
        // Properly partition the data
        this.currentRoot = this.partition(this.data); 
        this.centerCircle.datum(this.currentRoot); // Bind current root to center circle for context

        console.log("Sunburst Chart: Partitioned data", this.currentRoot);

        this.svg.select(".chart-title")
            .text(`Hierarchy: ${settings.hierarchy.join('/')} by ${settings.value}`);

        // Set color domain based on first-level children for consistency if needed
        // this.colorScale.domain(this.currentRoot.children.map(d => d.data.name));

        this._renderSlices(this.currentRoot);
    }
    
    _getSegmentPathId(d) {
        // Creates a unique ID for a segment based on its path from the root
        // Use try-catch to prevent errors with deep or circular structures
        try {
            // Safer approach: manually build the path to avoid potential recursion
            let path = [];
            let current = d;
            // Limit to a reasonable depth (e.g., 10 levels) to prevent stack overflow
            const MAX_DEPTH = 10;
            let depth = 0;
            
            while (current && depth < MAX_DEPTH) {
                if (current.data && current.data.name) {
                    path.unshift(current.data.name);
                }
                current = current.parent;
                depth++;
            }
            
            return path.join("--") || "unknown";
        } catch (error) {
            console.error("Error generating segment path ID:", error);
            // Fallback to a simple ID based on available properties
            return `node-${d.depth || 0}-${d.value || 0}`;
        }
    }

    _renderSlices(rootNode, transitionDuration = 750) {
        console.log("Rendering sunburst slices with transition duration:", transitionDuration);
        
        // Safe check for rootNode descendants to prevent recursion issues
        let descendants;
        try {
            // Skip the root node (index 0) as it's typically invisible
            descendants = rootNode.descendants().slice(1);
            console.log(`Got ${descendants.length} descendants for rendering`);
        } catch (error) {
            console.error("Error getting descendants:", error);
            descendants = [];
        }
        
        const S_THIS = this; // For use in closures

        // Safe check for descendants length
        if (descendants.length === 0) {
            console.warn("No descendants to render in sunburst");
            return;
        }

        const slice = this.g.selectAll("path.slice")
            .data(descendants, d => this._getSegmentPathId(d)); // Key by path

        slice.exit().remove();

        const sliceEnter = slice.enter().append("path")
            .attr("class", "slice")
            .attr("fill", d => {
                // Color by first-level ancestor below the root
                let p = d;
                while (p.depth > 1) p = p.parent;
                return this.colorScale(p.data.name);
            })
            .attr("fill-opacity", 0.7)
            .style("cursor", "pointer")
            .on("click", (event, d) => {
                 if (event.ctrlKey || event.shiftKey) {
                    S_THIS._handleSelectionClick(event, d);
                } else {
                    S_THIS._zoomOnClick(event, d);
                }
            })
            .on("mouseover", (event, d) => this._handleMouseOverSlice(event, d))
            .on("mouseout", (event, d) => this._handleMouseOutSlice(event, d));

        slice.merge(sliceEnter)
            .transition().duration(transitionDuration)
            .attrTween("d", function(d) {
                const S_NODE = this;
                const i = d3.interpolate(S_NODE._current || d, d); // _current stores previous data for transition
                S_NODE._current = i(0); 
                return t => S_THIS.arcGenerator(i(t));
            });

        // Only render labels for visible segments that are large enough
        this.g.selectAll("text.slice-label").remove();
        
        // Filter for visibility - be more conservative with size thresholds
        const visibleLabels = descendants.filter(d => {
            const angleSize = S_THIS.xScale(d.x1) - S_THIS.xScale(d.x0);
            const radiusSize = S_THIS.yScale(d.y1) - S_THIS.yScale(d.y0);
            return angleSize > 0.1 && radiusSize > 15; // More conservative thresholds
        });
        
        console.log(`Rendering ${visibleLabels.length} labels for visible segments`);
        
        this.g.selectAll("text.slice-label")
            .data(visibleLabels)
            .enter().append("text")
            .attr("class", "slice-label")
            .attr("transform", d => S_THIS._computeLabelTransform(d))
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .style("font-size", "9px")
            .style("fill-opacity", 0)
            .style("pointer-events", "none")
            .text(d => d.data.name.length > 15 ? d.data.name.substring(0,12)+"..." : d.data.name) // Truncate long names
            .transition().duration(transitionDuration)
            .style("fill-opacity", 1);
            
        this._applySelectionVisuals();
    }
    
    _computeLabelTransform(d) {
        const x = (this.xScale(d.x0) + this.xScale(d.x1)) / 2 * 180 / Math.PI;
        const y = (this.yScale(d.y0) + this.yScale(d.y1)) / 2;
        let rotate = x - 90;
        // Flip text for readability on the left side
        const flip = rotate > 90 && rotate < 270; 
        if (flip) rotate += 180;
        return `rotate(${rotate}) translate(${y},0) ${flip ? "rotate(180) scale(-1,1)" : ""}`;
    }


    _zoomOnClick(event, d) {
        console.log("Zoom clicked on segment:", d ? d.data.name : "unknown");
        
        // Safety checks
        if (!d) {
            console.warn("No segment data provided for zoom");
            return;
        }
        
        // Only zoom on nodes with children or when zooming out to parent
        if (!d.children && (!this.currentRoot || !this.currentRoot.parent || d !== this.currentRoot.parent)) {
            console.log("Not zooming on leaf node without parent context");
            return;
        }

        // Update current root for center circle context
        this.currentRoot = d;
        this.centerCircle.datum(this.currentRoot);
        
        // Update center text (with fallback)
        const centerText = d.parent ? 
            (d.data.name ? (d.data.name.substring(0,8) || "UP") : "UP") : 
            "UP";
        this.centerText.text(centerText);

        // Transition the scales
        this.g.transition().duration(750)
            .tween("scale", () => {
                // Safety check for valid coordinates
                const x0 = d.x0 || 0;
                const x1 = d.x1 || 1;
                const y0 = d.y0 || 0;
                
                const xd = d3.interpolate(this.xScale.domain(), [x0, x1]);
                const yd = d3.interpolate(this.yScale.domain(), [y0, 1]); // y1 is always 1 for the root of the current view
                const yr = d3.interpolate(this.yScale.range(), [y0 ? this.radius*0.2 : 0, this.radius]); // Zoom in from y0
                
                return t => {
                    this.xScale.domain(xd(t));
                    this.yScale.domain(yd(t)).range(yr(t));
                };
            })
            .on("end", () => {
                try {
                    // Re-render slices based on the new root `d`
                    this._renderSlices(d, 0); // No transition for re-render, scale transition handled it
                } catch (error) {
                    console.error("Error re-rendering after zoom:", error);
                    // If re-rendering fails, try to reset to a known good state
                    this.clear();
                    this.update(this.data, this.settings, this.colorScale);
                }
            });
    }
    
    _handleSelectionClick(event, d_slice) {
        const segmentId = this._getSegmentPathId(d_slice); // Unique path like "root--USA--Electronics"
        const isSelected = this.selectedItems.has(segmentId);

        if (event.ctrlKey || event.shiftKey) {
            if (isSelected) this.selectedItems.delete(segmentId);
            else this.selectedItems.add(segmentId);
        } else {
            this.selectedItems.clear();
            if (!isSelected) this.selectedItems.add(segmentId);
        }
        
        this._applySelectionVisuals();

        // For brushing, we need to identify what these selected segments mean in terms of original flat data.
        // This is complex. One way is to get all leaf nodes under the selected segment.
        let leafDataIdentifiers = [];
        if (this.selectedItems.size > 0) {
            this.selectedItems.forEach(selectedPathId => {
                // Find the node corresponding to selectedPathId
                const targetNode = this.currentRoot.descendants().find(n => this._getSegmentPathId(n) === selectedPathId);
                if (targetNode) {
                    targetNode.leaves().forEach(leaf => {
                        // Assume leaf.data.name is an identifier or part of one from original data
                        // Or, if original data was attached to hierarchy nodes: leaf.data.originalDataItem.id
                        leafDataIdentifiers.push(leaf.data.name); // This needs to be more robust
                    });
                }
            });
        }
        
        const customEvent = new CustomEvent('selectionChanged', {
            detail: {
                data: leafDataIdentifiers, // Array of leaf node names/IDs under selected paths
                chartSourceType: 'sunburst',
                selectedKey: this.settings.hierarchy, // Array of columns used for hierarchy
                selectionValue: d_slice // The d3 data of the clicked slice
            }
        });
        window.dispatchEvent(customEvent);
    }


    _handleMouseOverSlice(event, d_slice) {
        this.tooltip.transition().duration(200).style('opacity', 0.9);
        const path = d_slice.ancestors().map(d => d.data.name).reverse().slice(1).join(" > "); // Exclude "root"
        this.tooltip.html(`<strong>${path}</strong><br/>${this.settings.value}: ${d3.format(",.0f")(d_slice.value)}`)
            .style('left', (event.pageX + 15) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        
        d3.select(event.currentTarget).attr("fill-opacity", 1);
    }

    _handleMouseOutSlice(event, d_slice) {
        this.tooltip.transition().duration(500).style('opacity', 0);
        const segmentId = this._getSegmentPathId(d_slice);
        d3.select(event.currentTarget).attr("fill-opacity", this.selectedItems.has(segmentId) ? 1 : 0.7);
    }

    _applySelectionVisuals() {
        if (!this.g) return;
        const S_THIS = this;
        this.g.selectAll('path.slice')
            .classed('selected', d => S_THIS.selectedItems.has(S_THIS._getSegmentPathId(d)))
            .classed('dimmed', d => S_THIS.selectedItems.size > 0 && !S_THIS.selectedItems.has(S_THIS._getSegmentPathId(d)))
            .attr("fill-opacity", function(d) {
                const G_NODE = this; // `this` is the path element
                if (S_THIS.selectedItems.size === 0) return 0.7;
                return S_THIS.selectedItems.has(S_THIS._getSegmentPathId(d)) ? 1 : 0.3;
            });
    }

    handleExternalSelection(selectedDataItems, sourceKey, colorScale) {
        this.selectedItems.clear();
        // External selection for sunburst is complex. It depends on what `selectedDataItems` represent.
        // If they are leaf node identifiers (e.g., product names), we need to find paths containing them.
        // This requires a robust mapping from flat data items to hierarchy paths.
        // For a simpler approach, if sourceKey matches one of the hierarchy levels,
        // we can highlight segments at that level.
        // This part is highly dependent on the overall brushing strategy.
        // For now, a simple clear and log:
        // console.log("Sunburst external selection:", selectedDataItems, sourceKey);

        // Example: if selectedDataItems are names that could appear at any level
        if (selectedDataItems && selectedDataItems.length > 0 && this.currentRoot) {
            this.currentRoot.descendants().forEach(d_node => {
                if (selectedDataItems.includes(d_node.data.name)) { // If a selected item matches a node name
                    this.selectedItems.add(this._getSegmentPathId(d_node));
                }
            });
        }
        this._applySelectionVisuals();
    }

    resize() {
        if (!this.svg || !this.g) {
            if(!this._setupSVG() && this.data) {
                 console.warn("SunburstChart: Resize called but SVG setup failed.");
                 return;
            } else if (!this.data) {
                return;
            }
        } else {
            const containerRect = this.container.node().getBoundingClientRect();
            this.width = containerRect.width - this.margin.left - this.margin.right;
            this.height = containerRect.height - this.margin.top - this.margin.bottom;

            if (this.width <= 0 || this.height <= 0) return;

            this.radius = Math.min(this.width, this.height) / 2;
            
            this.svg.attr('viewBox', `${-containerRect.width/2} ${-containerRect.height/2} ${containerRect.width} ${containerRect.height}`);
            this.svg.select(".chart-title")
                 .attr("y", -this.height / 2 + this.margin.top / 2);
        }

        if (this.currentRoot) { // currentRoot holds the currently zoomed view of the hierarchy
            // Update y-scale range based on new radius
            // The domain of yScale ([d.y0, 1]) is relative to the current zoomed root `d`.
            // The range needs to map this to the new physical radius.
            this.yScale.range([this.currentRoot.y0 ? this.radius * 0.2 : 0, this.radius]);
            this.centerCircle.attr("r", this.yScale.range()[0] * 0.9);


            // Re-render slices with the new arc generator settings
            this.arcGenerator
                .innerRadius(d => Math.max(0, this.yScale(d.y0)))
                .outerRadius(d => Math.max(0, this.yScale(d.y1)));

            this.g.selectAll("path.slice").attr("d", this.arcGenerator);
            this.g.selectAll("text.slice-label").attr("transform", d => this._computeLabelTransform(d));
            this._applySelectionVisuals();
        }
    }

    clear() {
        if (this.g) {
            this.g.selectAll('path.slice').remove();
            this.g.selectAll('text.slice-label').remove();
            this.centerText.text("UP"); // Reset center text
        }
         if (this.svg) {
            this.svg.select(".chart-title").text("");
        }
        this.data = null;
        this.settings = null;
        this.currentRoot = null;
        this.selectedItems.clear();
        this._addPlaceholder("");
    }

    downloadSVG(filename) {
         if (!this.svg) {
            alert("Chart is not rendered yet.");
            return;
        }
        const styleDef = `
            .slice { stroke: #fff; stroke-width: 0.5px; transition: opacity 0.2s; }
            .slice.selected { stroke: var(--accent-color, #e74c3c); stroke-width: 1.5px; }
            .slice.dimmed { opacity: 0.25; }
            text.slice-label { font-size: 9px; pointer-events: none; fill: var(--text-primary, black); }
            .chart-title { font-family: ${getComputedStyle(this.container.node()).fontFamily}; fill: var(--text-primary, black); text-anchor: middle; }
            #${this.containerId} circle { /* Style for center circle if needed */ }
            text { font-family: ${getComputedStyle(this.container.node()).fontFamily}; }
        `;
        
        this.svg.insert('style', ':first-child').html(styleDef);
        const svgString = new XMLSerializer().serializeToString(this.svg.node());
        this.svg.select('style').remove();

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