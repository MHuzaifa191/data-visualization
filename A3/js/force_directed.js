// js/force_directed.js
class ForceDirectedGraph {
    constructor(containerId, margins, tooltipInstance) {
        this.containerId = containerId;
        this.container = d3.select(containerId);
        this.tooltip = tooltipInstance;
        this.margin = margins || { top: 20, right: 20, bottom: 20, left: 20 }; // FD graphs often use less margin

        this.svg = null;
        this.g = null; // Group for zoomable/pannable content
        this.linkGroup = null;
        this.nodeGroup = null;

        this.data = null; // To store {nodes, links}
        this.settings = null;

        this.selectedItems = new Set(); // Store selected node IDs

        this.colorScale = null;
        
        this.width = 0;
        this.height = 0;

        // Force Simulation
        this.simulation = d3.forceSimulation()
            .force("link", d3.forceLink().id(d => d.id).distance(50).strength(0.5)) // Adjust distance/strength
            .force("charge", d3.forceManyBody().strength(-150)) // Adjust charge strength
            .force("collision", d3.forceCollide().radius(15)) // Based on node radius
            .force("x", d3.forceX(() => this.width / 2).strength(0.05)) // Weaker centering
            .force("y", d3.forceY(() => this.height / 2).strength(0.05));


        // Zoom behavior
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 8]) // Min/max zoom levels
            .on("zoom", (event) => {
                if (this.g) {
                    this.g.attr("transform", event.transform);
                }
            });
        
        this._setupSVG();
    }

    _setupSVG() {
        this.container.select('svg').remove();
        const containerRect = this.container.node().getBoundingClientRect();
        
        // Use full container rect for SVG, internal width/height for simulation center
        this.svgWidth = containerRect.width;
        this.svgHeight = containerRect.height;
        this.width = this.svgWidth - this.margin.left - this.margin.right;
        this.height = this.svgHeight - this.margin.top - this.margin.bottom;


        if (this.svgWidth <= 0 || this.svgHeight <= 0) {
            this._addPlaceholder("Container too small or data not ready.");
            return false;
        }

        this.svg = this.container.append('svg')
            .attr('width', this.svgWidth)
            .attr('height', this.svgHeight)
            .call(this.zoom) // Apply zoom to the SVG element
            .on("dblclick.zoom", null); // Disable double click zoom if needed

        // Add a defs section for markers if you want arrows on links
        this.svg.append("defs").append("marker")
            .attr("id", "arrowhead")
            .attr("viewBox", "-0 -5 10 10")
            .attr("refX", 20) // Adjust based on node radius + desired arrow offset
            .attr("refY", 0)
            .attr("orient", "auto")
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("xoverflow", "visible")
            .append("svg:path")
            .attr("d", "M 0,-5 L 10 ,0 L 0,5")
            .attr("fill", "#999")
            .style("stroke", "none");

        this.g = this.svg.append('g'); // Main group for chart content, transformed by zoom
            // .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`); // No initial transform for g if svg handles zoom origin

        // Groups for links and nodes (for z-ordering)
        this.linkGroup = this.g.append("g").attr("class", "links");
        this.nodeGroup = this.g.append("g").attr("class", "nodes");

        this.svg.append("text") // Title is part of SVG, not zoomable group g
            .attr("class", "chart-title")
            .attr("x", this.svgWidth / 2)
            .attr("y", this.margin.top) // Position at top margin
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
    
    update(graphData, settings, colorScale) {
        if (!graphData || !graphData.nodes || !graphData.links || !settings || !settings.nodeId) {
            this.clear();
            this._addPlaceholder("Missing data or required dimension settings for Force-Directed Graph.");
            return;
        }
        
        if (!this.svg || !this.g) {
            if(!this._setupSVG()) return;
        }
        this.container.select('.chart-placeholder-text').style('display', 'none');

        this.data = graphData; // {nodes, links}
        this.settings = settings;
        this.colorScale = colorScale;

        // Make a mutable copy for D3 simulation if nodes/links are frozen
        const nodes = this.data.nodes.map(d => ({...d}));
        const links = this.data.links.map(d => ({...d}));

        console.log(`Force Directed Graph: Rendering with ${nodes.length} nodes and ${links.length} links`);

        // Update title
        const titleText = `Network: ${settings.nodeId}` + 
                         (settings.linkTarget ? ` to ${settings.linkTarget}` : '') +
                         (settings.linkValue ? ` by ${settings.linkValue}` : '');
        this.svg.select(".chart-title").text(titleText);
        
        // --- Links ---
        let link = this.linkGroup.selectAll("line.link")
            .data(links, d => `${d.source.id || d.source}-${d.target.id || d.target}`); // Use IDs if source/target are objects

        link.exit().remove();

        const linkEnter = link.enter().append("line")
            .attr("class", "link")
            .style("stroke", "#999")
            .style("stroke-opacity", 0.6)
            .style("stroke-width", d => d.value ? Math.sqrt(d.value) : 1.5);
            // .attr("marker-end", "url(#arrowhead)"); // Add if directed and want arrows

        link = linkEnter.merge(link);

        // --- Nodes ---
        let node = this.nodeGroup.selectAll("g.node")
            .data(nodes, d => d.id);

        node.exit().remove();

        const nodeEnter = node.enter().append("g")
            .attr("class", "node")
            .call(d3.drag()
                .on("start", (event, d) => this._dragstarted(event, d))
                .on("drag", (event, d) => this._dragged(event, d))
                .on("end", (event, d) => this._dragended(event, d)))
            .on('mouseover', (event, d) => this._handleMouseOverNode(event, d))
            .on('mouseout', (event, d) => this._handleMouseOutNode(event, d))
            .on('click', (event, d) => this._handleClickNode(event, d));

        nodeEnter.append("circle")
            .attr("r", 8) // Node radius
            .style("fill", d => this.colorScale(d.id)) // Color by node ID
            .style("stroke", "#fff")
            .style("stroke-width", 1.5);

        nodeEnter.append("text")
            .attr("dx", 12)
            .attr("dy", ".35em")
            .style("font-size", "10px")
            .text(d => d.id);
        
        node = nodeEnter.merge(node);
        node.select("circle").style("fill", d => this.colorScale(d.id)); // Ensure color update on existing nodes

        // --- Simulation ---
        // Check if the simulation has a link force, if not re-add it
        if (!this.simulation.force("link")) {
            console.log("Recreating link force that was previously removed");
            this.simulation.force("link", d3.forceLink().id(d => d.id).distance(50).strength(0.5));
        }

        this.simulation.nodes(nodes)
            .on("tick", () => {
                this._ticked(node, link); // Use this._ticked and pass node and link selections
            });

        // Set the links for the link force
        this.simulation.force("link").links(links);
        this.simulation.force("center", d3.forceCenter(this.width / 2, this.height / 2)); // Update center force

        this.simulation.alpha(1).restart(); // Restart the simulation
        this._applySelectionVisuals();
    }

    _ticked(nodeSelection, linkSelection) {
        linkSelection
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        nodeSelection
            .attr("transform", d => `translate(${d.x},${d.y})`);
    }

    _dragstarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    _dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    _dragended(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        // d.fx = null; // Keep node fixed after drag unless user wants it to drift
        // d.fy = null;
    }

    _handleMouseOverNode(event, d_node) {
        this.tooltip.transition().duration(200).style('opacity', 0.9);
        this.tooltip.html(`<strong>${d_node.id}</strong>`) // Add more info if available
            .style('left', (event.pageX + 15) + 'px')
            .style('top', (event.pageY - 28) + 'px');

        // Highlight node and connected links/nodes
        this.nodeGroup.selectAll('g.node')
            .style('opacity', n => (this._areNodesConnected(d_node, n) || n.id === d_node.id) ? 1 : 0.2);
        this.linkGroup.selectAll('line.link')
            .style('stroke-opacity', l => (l.source === d_node || l.target === d_node || l.source.id === d_node.id || l.target.id === d_node.id) ? 1 : 0.1)
            .style('stroke', l => (l.source === d_node || l.target === d_node || l.source.id === d_node.id || l.target.id === d_node.id) ? 'var(--accent-color)' : '#999');

        d3.select(event.currentTarget).select('circle').attr('r', 10); // Enlarge hovered node
    }
    
    _areNodesConnected(node1, node2) {
        if (!this.data || !this.data.links) return false;
        return this.data.links.some(link => 
            (link.source === node1 && link.target === node2) ||
            (link.source === node2 && link.target === node1) ||
            (link.source.id === node1.id && link.target.id === node2.id) ||
            (link.source.id === node2.id && link.target.id === node1.id)
        );
    }

    _handleMouseOutNode(event, d_node) {
        this.tooltip.transition().duration(500).style('opacity', 0);
        // Restore opacity based on selection state
        this._applySelectionVisuals(); 
        d3.select(event.currentTarget).select('circle').attr('r', 8); // Reset size
    }

    _handleClickNode(event, d_node) {
        const nodeId = d_node.id;
        const isSelected = this.selectedItems.has(nodeId);

        if (event.ctrlKey || event.shiftKey) {
            if (isSelected) this.selectedItems.delete(nodeId);
            else this.selectedItems.add(nodeId);
        } else {
            this.selectedItems.clear();
            if (!isSelected) this.selectedItems.add(nodeId);
        }
        
        this._applySelectionVisuals();

        const customEvent = new CustomEvent('selectionChanged', {
            detail: {
                data: Array.from(this.selectedItems), // Array of selected node IDs
                chartSourceType: 'forceDirected',
                selectedKey: this.settings.nodeId, // The actual column name for node IDs
                selectionValue: d_node // The raw d3 node data
            }
        });
        window.dispatchEvent(customEvent);
    }

    _applySelectionVisuals() {
        if (!this.nodeGroup || !this.linkGroup) return;

        this.nodeGroup.selectAll('g.node')
            .classed('selected', d => this.selectedItems.has(d.id))
            .classed('dimmed', d => this.selectedItems.size > 0 && !this.selectedItems.has(d.id))
            .style('opacity', d => (this.selectedItems.size > 0 && !this.selectedItems.has(d.id)) ? 0.2 : 1);
        
        this.nodeGroup.selectAll('g.node').select('circle')
            .style('stroke', d => this.selectedItems.has(d.id) ? 'var(--accent-color)' : '#fff');


        this.linkGroup.selectAll('line.link')
            .classed('selected', d => this.selectedItems.has(d.source.id) || this.selectedItems.has(d.target.id))
            .classed('dimmed', d => this.selectedItems.size > 0 && !(this.selectedItems.has(d.source.id) || this.selectedItems.has(d.target.id)))
            .style('stroke-opacity', d => (this.selectedItems.size > 0 && !(this.selectedItems.has(d.source.id) || this.selectedItems.has(d.target.id))) ? 0.1 : 0.6)
            .style('stroke', d => (this.selectedItems.has(d.source.id) || this.selectedItems.has(d.target.id)) ? 'var(--accent-color)' : '#999');
    }

    handleExternalSelection(selectedDataItems, sourceKey, colorScale) {
        this.selectedItems.clear();
        if (selectedDataItems && selectedDataItems.length > 0 && this.data && this.data.nodes) {
            // selectedDataItems are node IDs
            selectedDataItems.forEach(item => {
                // Check if item is a node ID in the current graph
                if (this.data.nodes.some(n => n.id === item)) {
                    this.selectedItems.add(item);
                }
            });
        }
        this._applySelectionVisuals();
    }
    
    resize() {
        if (!this.svg || !this.g) {
             if(!this._setupSVG() && this.data) {
                 console.warn("ForceDirectedGraph: Resize called but SVG setup failed.");
                 return;
            } else if (!this.data) {
                return;
            }
        } else {
            const containerRect = this.container.node().getBoundingClientRect();
            this.svgWidth = containerRect.width;
            this.svgHeight = containerRect.height;
            this.width = this.svgWidth - this.margin.left - this.margin.right;
            this.height = this.svgHeight - this.margin.top - this.margin.bottom;

            if (this.svgWidth <= 0 || this.svgHeight <= 0) return;

            this.svg.attr('width', this.svgWidth).attr('height', this.svgHeight);
        }
        
        this.svg.select(".chart-title")
             .attr("x", this.svgWidth / 2)
             .attr("y", this.margin.top);

        if (this.simulation) {
            // Update centering forces
            this.simulation.force("x", d3.forceX(this.width / 2).strength(0.05));
            this.simulation.force("y", d3.forceY(this.height / 2).strength(0.05));
            this.simulation.force("center", d3.forceCenter(this.width / 2, this.height / 2));


            if (this.data && this.data.nodes && this.data.nodes.length > 0) {
                 this.simulation.alpha(0.3).restart(); // Gently reheat simulation
            }
        }
    }

    clear() {
        if (this.simulation) {
            this.simulation.stop();
            
            // Don't set force("link") to null, just clear it with empty array if it exists
            if (this.simulation.force("link")) {
                this.simulation.force("link").links([]);
            }
            
            // Clear nodes
            this.simulation.nodes([]);
        }
        
        if (this.g) {
            this.g.selectAll('*').remove();
            // Re-add link/node groups as they were removed
            this.linkGroup = this.g.append("g").attr("class", "links");
            this.nodeGroup = this.g.append("g").attr("class", "nodes");
        }
        
        if (this.svg) {
            this.svg.select(".chart-title").text(""); // Clear title
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
        // For force-directed, ensure positions are fixed for export or export current state
        // Applying transform from the zoomable group 'g' to its children or to the SVG itself
        const currentTransform = this.g.attr('transform');
        
        const styleDef = `
            .node circle { stroke-width: 1.5px; }
            .node.selected circle { stroke: var(--accent-color, #e74c3c); }
            .node.dimmed { opacity: 0.2; }
            .node text { font-size: 10px; fill: var(--text-secondary, grey); }
            .link { stroke-opacity: 0.6; }
            .link.selected { stroke: var(--accent-color, #e74c3c); stroke-opacity: 1; }
            .link.dimmed { stroke-opacity: 0.1; }
            .chart-title { font-family: ${getComputedStyle(this.container.node()).fontFamily}; fill: var(--text-primary, black); text-anchor: middle; }
            text { font-family: ${getComputedStyle(this.container.node()).fontFamily}; }
            #arrowhead path { fill: #999; }
        `;

        // Create a clone to modify for export
        const svgClone = this.svg.node().cloneNode(true);
        d3.select(svgClone).insert('style', ':first-child').html(styleDef);
        
        // If there's a transform on the main 'g' due to zoom/pan, apply it to the clone's 'g'
        if (currentTransform) {
            d3.select(svgClone).select('g.links').attr('transform', currentTransform);
            d3.select(svgClone).select('g.nodes').attr('transform', currentTransform);
             // Or bake transform into coordinates (more complex)
        }


        const svgString = new XMLSerializer().serializeToString(svgClone);

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