// js/chord.js
class ChordDiagram {
    constructor(containerId, margins, tooltipInstance) {
        this.containerId = containerId;
        this.container = d3.select(containerId);
        this.tooltip = tooltipInstance; // Use global tooltip
        this.margin = margins || { top: 60, right: 40, bottom: 40, left: 40 };

        this.svg = null;
        this.g = null;

        this.data = null; // Store processed data for resize
        this.settings = null;
        this.entities = []; // Store unique entities for consistent indexing

        this.selectedItems = new Set(); // Store selected entity names

        this.colorScale = null; // Passed from dashboard
        this.chordLayout = d3.chord().padAngle(0.05).sortSubgroups(d3.descending);
        this.arcGenerator = d3.arc();
        this.ribbonGenerator = d3.ribbon();

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

        this.outerRadius = Math.min(this.width, this.height) / 2 * 0.9; // 0.9 to leave space for labels
        this.innerRadius = this.outerRadius * 0.9;

        this.svg = this.container.append('svg')
            .attr('width', containerRect.width)
            .attr('height', containerRect.height);

        this.g = this.svg.append('g')
            .attr('transform', `translate(${containerRect.width / 2}, ${containerRect.height / 2})`);
        
        this.g.append("text")
            .attr("class", "chart-title")
            .attr("x", 0)
            .attr("y", - (this.outerRadius + this.margin.top / 3))
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("font-weight", "bold");
            
        return true;
    }
    
    _addPlaceholder(message) {
        this.container.select('.chart-placeholder-text').remove();
        const p = this.container.append('p')
            .attr('class', 'chart-placeholder-text')
            .style('display', 'block');
        p.text(message);
    }

    update(processedData, settings, colorScale) {
        if (!processedData || !settings || !settings.source || !settings.target || !settings.value) {
            this.clear();
            this._addPlaceholder("Missing data or required dimension settings for Chord Diagram.");
            return;
        }
        
        if (!this.svg || !this.g) {
            if(!this._setupSVG()) return;
        }
        this.container.select('.chart-placeholder-text').style('display', 'none');

        this.data = processedData;
        this.settings = settings;
        this.colorScale = colorScale;

        // Update chart title
        this.g.select(".chart-title")
            .text(`${settings.source} to ${settings.target} by ${settings.value}`);

        // Process data from rows to matrix
        // First, get all unique entities (source and target values)
        this.entities = [...new Set([
            ...this.data.map(d => d.source),
            ...this.data.map(d => d.target)
        ])].sort();
        
        // If no entities after filtering, show a message
        if (!this.entities.length) {
            this.clear();
            this._addPlaceholder("No valid relationships found in data. Check your source/target settings.");
            return;
        }

        // Initialize a matrix of zeros
        const n = this.entities.length;
        const matrix = Array(n).fill().map(() => Array(n).fill(0));

        // Fill the matrix with values
        this.data.forEach(d => {
            const sourceIndex = this.entities.indexOf(d.source);
            const targetIndex = this.entities.indexOf(d.target);
            if (sourceIndex !== -1 && targetIndex !== -1) {
                matrix[sourceIndex][targetIndex] += +d.value; // += to aggregate multiple rows with same source->target
                // For non-directional: matrix[targetIndex][sourceIndex] += +d.value;
            }
        });
        
        // Create chord layout
        this.chordLayout = d3.chord()
            .padAngle(0.05)
            .sortSubgroups(d3.descending);

        // Store the chords data for later use in resize
        this.chords = this.chordLayout(matrix);
        
        // Create arc generator for the outer ring
        // Update color scale domain with current entities
        // this.colorScale.domain(this.entities); // Dashboard should manage global color domain

        this.g.select(".chart-title")
            .text(`Relationships: ${this.settings.source} to ${this.settings.target} by ${this.settings.value}`);

        const chords = this.chordLayout(matrix);

        this.arcGenerator
            .innerRadius(this.innerRadius)
            .outerRadius(this.outerRadius);

        this.ribbonGenerator.radius(this.innerRadius);

        // --- Groups (Arcs) ---
        const groups = this.g.selectAll('.group')
            .data(chords.groups, d => this.entities[d.index]); // Key by entity name

        groups.exit().remove();

        const groupsEnter = groups.enter().append('g')
            .attr('class', 'group');

        groupsEnter.append('path')
            .attr('class', 'arc')
            .style('fill', d => this.colorScale(this.entities[d.index]))
            .style('stroke', d => d3.rgb(this.colorScale(this.entities[d.index])).darker())
            .on('mouseover', (event, d_arc) => this._handleMouseOverArc(event, d_arc))
            .on('mouseout', (event, d_arc) => this._handleMouseOutArc(event, d_arc))
            .on('click', (event, d_arc) => this._handleClickArc(event, d_arc));
        
        groupsEnter.append('text') // Add labels to entering groups
            .attr('class', 'group-label')
            .attr('dy', '.35em')
            .each(function(d) { d.angle = (d.startAngle + d.endAngle) / 2; }) // Store angle for transform
            .attr('transform', d => `
                rotate(${(d.angle * 180 / Math.PI - 90)})
                translate(${this.outerRadius + 5})
                ${d.angle > Math.PI ? 'rotate(180)' : ''}
            `)
            .attr('text-anchor', d => d.angle > Math.PI ? 'end' : 'start')
            .text(d => this.entities[d.index])
            .style('font-size', '10px');


        groups.merge(groupsEnter).select('.arc')
            .transition().duration(750)
            .attrTween('d', (d, i, nodes) => {
                const S_NODE = nodes[i];
                const C_INTERPOLATOR = d3.interpolate(S_NODE._current || d, d);
                S_NODE._current = C_INTERPOLATOR(0); // Store for next transition
                return t => this.arcGenerator(C_INTERPOLATOR(t));
            });
        
        groups.merge(groupsEnter).select('text.group-label') // Update existing labels
            .transition().duration(750)
            .each(function(d) { d.angle = (d.startAngle + d.endAngle) / 2; })
            .attr('transform', d => `
                rotate(${(d.angle * 180 / Math.PI - 90)})
                translate(${this.outerRadius + 5})
                ${d.angle > Math.PI ? 'rotate(180)' : ''}
            `)
            .attr('text-anchor', d => d.angle > Math.PI ? 'end' : 'start')
            .text(d => this.entities[d.index]);


        // --- Ribbons ---
        const ribbons = this.g.selectAll('.ribbon')
            .data(chords, d => `${this.entities[d.source.index]}-${this.entities[d.target.index]}`); // Key by source-target pair

        ribbons.exit().remove();

        const ribbonsEnter = ribbons.enter().append('path')
            .attr('class', 'ribbon')
            .style('fill', d => this.colorScale(this.entities[d.source.index])) // Color by source
            .style('opacity', 0.75);

        ribbons.merge(ribbonsEnter)
            .transition().duration(750)
            .attrTween('d', (d, i, nodes) => {
                 const S_NODE = nodes[i];
                 const C_INTERPOLATOR = d3.interpolate(S_NODE._current || d, d);
                 S_NODE._current = C_INTERPOLATOR(0); // Store for next transition
                 return t => this.ribbonGenerator(C_INTERPOLATOR(t));
            })
            .style('fill', d => this.colorScale(this.entities[d.source.index]));

        this._applySelectionVisuals();
    }

    _handleMouseOverArc(event, d_arc) {
        this.tooltip.transition().duration(200).style('opacity', 0.9);
        this.tooltip.html(`<strong>${this.entities[d_arc.index]}</strong><br>Value: ${d3.format(",.0f")(d_arc.value)}`)
            .style('left', (event.pageX + 15) + 'px')
            .style('top', (event.pageY - 28) + 'px');

        this.g.selectAll('.ribbon')
            .filter(d_ribbon => d_ribbon.source.index !== d_arc.index && d_ribbon.target.index !== d_arc.index)
            .transition().duration(200)
            .style('opacity', 0.1);
        
        this.g.selectAll('.ribbon')
            .filter(d_ribbon => d_ribbon.source.index === d_arc.index || d_ribbon.target.index === d_arc.index)
            .transition().duration(200)
            .style('opacity', 1);
    }

    _handleMouseOutArc(event, d_arc) {
        this.tooltip.transition().duration(500).style('opacity', 0);
        this.g.selectAll('.ribbon')
            .transition().duration(200)
            .style('opacity', d_ribbon => this.selectedItems.size > 0 ? (this.selectedItems.has(this.entities[d_ribbon.source.index]) || this.selectedItems.has(this.entities[d_ribbon.target.index]) ? 0.75 : 0.1) : 0.75);
    }

    _handleClickArc(event, d_arc) {
        const entityName = this.entities[d_arc.index];
        const isSelected = this.selectedItems.has(entityName);

        if (event.ctrlKey || event.shiftKey) {
            if (isSelected) this.selectedItems.delete(entityName);
            else this.selectedItems.add(entityName);
        } else {
            this.selectedItems.clear();
            if (!isSelected) this.selectedItems.add(entityName);
        }
        
        this._applySelectionVisuals();

        const customEvent = new CustomEvent('selectionChanged', {
            detail: {
                data: Array.from(this.selectedItems), // Array of selected entity names
                chartSourceType: 'chord',
                // For chord, selectedKey can represent the type of entity selected.
                // The actual value is in `data`. Dashboard needs to know how to map this.
                // We can pass the original column names used for source/target as context.
                selectedKey: [this.settings.source, this.settings.target], 
                selectionValue: d_arc // The raw d3 group data
            }
        });
        window.dispatchEvent(customEvent);
    }

    _applySelectionVisuals() {
        if (!this.g || !this.entities.length) return;

        this.g.selectAll('.group')
            .classed('selected', d => this.selectedItems.has(this.entities[d.index]))
            .classed('dimmed', d => this.selectedItems.size > 0 && !this.selectedItems.has(this.entities[d.index]));
        
        this.g.selectAll('.arc') // Specifically target path within group for opacity
            .transition().duration(200)
            .style('opacity', d => (this.selectedItems.size > 0 && !this.selectedItems.has(this.entities[d.index])) ? 0.3 : 1);

        this.g.selectAll('.ribbon')
            .classed('selected', d => this.selectedItems.has(this.entities[d.source.index]) || this.selectedItems.has(this.entities[d.target.index]))
            .classed('dimmed', d => this.selectedItems.size > 0 && !(this.selectedItems.has(this.entities[d.source.index]) || this.selectedItems.has(this.entities[d.target.index])))
            .transition().duration(200)
            .style('opacity', d => (this.selectedItems.size > 0 && !(this.selectedItems.has(this.entities[d.source.index]) || this.selectedItems.has(this.entities[d.target.index]))) ? 0.1 : 0.75);
    }

    handleExternalSelection(selectedDataItems, sourceKey, colorScale) {
        this.selectedItems.clear();
        if (selectedDataItems && selectedDataItems.length > 0 && this.entities.length > 0) {
            // selectedDataItems are names of entities that should be highlighted
            selectedDataItems.forEach(item => {
                if (this.entities.includes(item)) { // Check if item is part of this chord's entities
                    this.selectedItems.add(item);
                }
            });
        }
        this._applySelectionVisuals();
    }

    resize() {
        if (!this.svg || !this.g) {
            if(!this._setupSVG() && this.data) {
                 console.warn("ChordDiagram: Resize called but SVG setup failed.");
                 return;
            } else if (!this.data) {
                return;
            }
        } else {
            const containerRect = this.container.node().getBoundingClientRect();
            this.width = containerRect.width - this.margin.left - this.margin.right;
            this.height = containerRect.height - this.margin.top - this.margin.bottom;

            if (this.width <= 0 || this.height <= 0) return;

            this.outerRadius = Math.min(this.width, this.height) / 2 * 0.9;
            this.innerRadius = this.outerRadius * 0.9;
            
            this.svg.attr('width', containerRect.width).attr('height', containerRect.height);
            this.g.attr('transform', `translate(${containerRect.width / 2}, ${containerRect.height / 2})`);
        }
        
        this.g.select(".chart-title")
            .attr("y", - (this.outerRadius + this.margin.top / 3));

        if (this.data && this.settings && this.colorScale) {
            // Re-apply generators and re-render elements
            this.arcGenerator.innerRadius(this.innerRadius).outerRadius(this.outerRadius);
            this.ribbonGenerator.radius(this.innerRadius);
            
            // Check if we have the necessary data to resize
            if (this.chords && this.chords.groups && this.chords.length > 0) {
                // Use existing chord layout data instead of trying to get matrix
                this.g.selectAll('.arc').attr('d', this.arcGenerator);
                this.g.selectAll('.ribbon').attr('d', this.ribbonGenerator);
                
                // Update label positions
                this.g.selectAll('text.group-label')
                    .each(function(d) { d.angle = (d.startAngle + d.endAngle) / 2; })
                    .attr('transform', d => `
                        rotate(${(d.angle * 180 / Math.PI - 90)})
                        translate(${this.outerRadius + 5})
                        ${d.angle > Math.PI ? 'rotate(180)' : ''}
                    `)
                    .attr('text-anchor', d => d.angle > Math.PI ? 'end' : 'start');
                
                this._applySelectionVisuals();
            } else {
                // If no chords data available, do a full update
                console.log("ChordDiagram: No existing chord data, performing full update");
                this.update(this.data, this.settings, this.colorScale);
            }
        }
    }

    clear() {
        if (this.g) {
            this.g.selectAll('*').remove();
             this.g.append("text") // Re-add title placeholder
                .attr("class", "chart-title")
                .attr("x", 0)
                .attr("y", - (this.outerRadius || 150) - this.margin.top/3)
                .attr("text-anchor", "middle")
                .style("font-size", "16px")
                .style("font-weight", "bold");
        }
        this.data = null;
        this.settings = null;
        this.entities = [];
        this.selectedItems.clear();
        this._addPlaceholder("");
    }

    downloadSVG(filename) {
        if (!this.svg) {
            alert("Chart is not rendered yet.");
            return;
        }
        const styleDef = `
            .group .arc { stroke-width: 1px; transition: opacity 0.2s; }
            .group.selected .arc { stroke: var(--accent-color, #e74c3c); stroke-width: 2.5px; opacity: 1; }
            .group.dimmed .arc { opacity: 0.2; }
            .ribbon { stroke-width: 0.5px; stroke: rgba(0,0,0,0.2); transition: opacity 0.2s; }
            .ribbon.selected { stroke: var(--accent-color, #e74c3c); stroke-width: 1px; opacity: 1; }
            .ribbon.dimmed { opacity: 0.05; }
            .group-label { font-size: 10px; fill: var(--text-secondary, grey); }
            .chart-title { font-family: ${getComputedStyle(this.container.node()).fontFamily}; fill: var(--text-primary, black); }
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