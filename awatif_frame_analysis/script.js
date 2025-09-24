// Frame Analysis Tool using Awatif-inspired approach
// Since we can't easily compile TypeScript in browser, we'll implement core functionality

class FrameAnalysisTool {
    constructor() {
        this.nodes = [];           // User-defined nodes
        this.elements = [];        // User-defined elements
        this.supports = [];
        this.loads = [];
        this.results = null;

        // Internal subdivided mesh (like awatif)
        this.meshNodes = [];       // Subdivided nodes for FEM analysis
        this.meshElements = [];    // Subdivided elements for FEM analysis
        this.meshSupports = [];    // Mapped supports for subdivided mesh
        this.meshLoads = [];       // Mapped loads for subdivided mesh
        this.subdivisionCount = 8; // Number of subdivisions per user element (like awatif's meshDensity)
    }

    // Add node
    addNode(x, y) {
        const nodeId = this.nodes.length;
        this.nodes.push([parseFloat(x), parseFloat(y), 0]); // [x, y, z] format
        return nodeId;
    }

    // Add beam element
    addElement(node1, node2, E, A, I) {
        const elementId = this.elements.length;
        this.elements.push({
            nodes: [parseInt(node1), parseInt(node2)],
            E: parseFloat(E) * 1e9, // Convert GPa to Pa
            A: parseFloat(A) * 1e-4, // Convert cm² to m²
            I: parseFloat(I) * 1e-8, // Convert cm⁴ to m⁴
            elementId: elementId
        });
        return elementId;
    }

    // Add support
    addSupport(nodeId, type) {
        let constraints;
        switch(type) {
            case 'fixed':
                constraints = [true, true, true, false, false, false]; // dx, dy, rz fixed
                break;
            case 'pinned':
                constraints = [true, true, false, false, false, false]; // dx, dy fixed
                break;
            case 'roller':
                constraints = [false, true, false, false, false, false]; // dy fixed
                break;
            default:
                constraints = [false, false, false, false, false, false];
        }

        this.supports.push({
            nodeId: parseInt(nodeId),
            type: type,
            constraints: constraints
        });
    }

    // Add point load
    addLoad(nodeId, fx, fy, mz) {
        this.loads.push({
            nodeId: parseInt(nodeId),
            fx: parseFloat(fx) * 1000, // Convert kN to N
            fy: parseFloat(fy) * 1000, // Convert kN to N
            mz: parseFloat(mz) * 1000  // Convert kNm to Nm
        });
    }

    // Create subdivided mesh for accurate analysis (like awatif's approach)
    createSubdividedMesh() {
        this.meshNodes = [];
        this.meshElements = [];
        this.meshSupports = [];
        this.meshLoads = [];

        // Step 1: Create subdivided nodes for each user element
        let nodeCounter = 0;
        const userNodeToMeshNodes = new Map(); // Maps user node index to mesh node indices

        // First, add all user nodes to mesh (they'll be refined later)
        this.nodes.forEach((userNode, userNodeIdx) => {
            this.meshNodes.push([...userNode]); // Copy coordinates
            userNodeToMeshNodes.set(userNodeIdx, nodeCounter);
            nodeCounter++;
        });

        // Step 2: For each user element, create subdivisions
        const elementToMeshElements = new Map(); // Maps user element to array of mesh elements

        this.elements.forEach((userElement, elemIdx) => {
            const node1Idx = userElement.nodes[0];
            const node2Idx = userElement.nodes[1];

            const node1 = this.nodes[node1Idx];
            const node2 = this.nodes[node2Idx];

            const meshElementsForThisElement = [];

            // Create subdivision points along the element
            const subdivisionNodes = [];
            for (let i = 0; i <= this.subdivisionCount; i++) {
                const t = i / this.subdivisionCount; // Parameter from 0 to 1
                const x = node1[0] + t * (node2[0] - node1[0]);
                const y = node1[1] + t * (node2[1] - node1[1]);

                let nodeIdx;
                if (i === 0) {
                    // Use existing mesh node for start
                    nodeIdx = userNodeToMeshNodes.get(node1Idx);
                } else if (i === this.subdivisionCount) {
                    // Use existing mesh node for end
                    nodeIdx = userNodeToMeshNodes.get(node2Idx);
                } else {
                    // Create new intermediate node
                    this.meshNodes.push([x, y, 0]);
                    nodeIdx = nodeCounter++;
                }
                subdivisionNodes.push(nodeIdx);
            }

            // Create mesh elements between subdivision nodes
            for (let i = 0; i < this.subdivisionCount; i++) {
                const meshElement = {
                    nodes: [subdivisionNodes[i], subdivisionNodes[i + 1]],
                    E: userElement.E,
                    A: userElement.A,
                    I: userElement.I,
                    elementId: this.meshElements.length,
                    userElementId: elemIdx // Reference back to user element
                };
                this.meshElements.push(meshElement);
                meshElementsForThisElement.push(this.meshElements.length - 1);
            }

            elementToMeshElements.set(elemIdx, meshElementsForThisElement);
        });

        // Step 3: Map supports to mesh nodes
        this.supports.forEach(support => {
            const meshNodeIdx = userNodeToMeshNodes.get(support.nodeId);
            this.meshSupports.push({
                nodeId: meshNodeIdx,
                type: support.type,
                constraints: support.constraints
            });
        });

        // Step 4: Map loads to mesh nodes
        this.loads.forEach(load => {
            const meshNodeIdx = userNodeToMeshNodes.get(load.nodeId);
            this.meshLoads.push({
                nodeId: meshNodeIdx,
                fx: load.fx,
                fy: load.fy,
                mz: load.mz
            });
        });

        return {
            userNodeToMeshNodes,
            elementToMeshElements
        };
    }

    // Simple matrix operations
    createMatrix(rows, cols, value = 0) {
        return Array(rows).fill().map(() => Array(cols).fill(value));
    }

    multiplyMatrices(a, b) {
        const result = Array(a.length).fill().map(() => Array(b[0].length).fill(0));
        for (let i = 0; i < a.length; i++) {
            for (let j = 0; j < b[0].length; j++) {
                for (let k = 0; k < b.length; k++) {
                    result[i][j] += a[i][k] * b[k][j];
                }
            }
        }
        return result;
    }

    // Enhanced analysis using subdivided mesh (awatif approach)
    analyze() {
        if (this.nodes.length < 2 || this.elements.length < 1) {
            throw new Error("Structure must have at least 2 nodes and 1 element");
        }

        // Create subdivided mesh for high-resolution analysis
        const meshMapping = this.createSubdividedMesh();

        const numNodes = this.meshNodes.length;
        const dofPerNode = 3; // x, y, rotation
        const totalDOF = numNodes * dofPerNode;

        // Create global stiffness matrix
        const K = this.createMatrix(totalDOF, totalDOF);

        // Add element stiffnesses from subdivided mesh
        this.meshElements.forEach((element, elemIdx) => {
            const node1 = element.nodes[0];
            const node2 = element.nodes[1];

            const x1 = this.meshNodes[node1][0];
            const y1 = this.meshNodes[node1][1];
            const x2 = this.meshNodes[node2][0];
            const y2 = this.meshNodes[node2][1];

            const L = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
            const c = (x2-x1)/L;
            const s = (y2-y1)/L;

            const E = element.E;
            const A = element.A;
            const I = element.I;

            // Local stiffness matrix for beam element (6x6)
            const k_local = [
                [E*A/L,     0,           0,         -E*A/L,     0,           0],
                [0,         12*E*I/L**3, 6*E*I/L**2, 0,        -12*E*I/L**3, 6*E*I/L**2],
                [0,         6*E*I/L**2,  4*E*I/L,    0,        -6*E*I/L**2,  2*E*I/L],
                [-E*A/L,    0,           0,          E*A/L,     0,           0],
                [0,        -12*E*I/L**3,-6*E*I/L**2, 0,         12*E*I/L**3,-6*E*I/L**2],
                [0,         6*E*I/L**2,  2*E*I/L,    0,        -6*E*I/L**2,  4*E*I/L]
            ];

            // Transformation matrix
            const T = [
                [c,  s,  0,  0,  0,  0],
                [-s, c,  0,  0,  0,  0],
                [0,  0,  1,  0,  0,  0],
                [0,  0,  0,  c,  s,  0],
                [0,  0,  0, -s,  c,  0],
                [0,  0,  0,  0,  0,  1]
            ];

            // Transform to global coordinates
            const T_transpose = T[0].map((_, colIndex) => T.map(row => row[colIndex]));
            const k_temp = this.multiplyMatrices(T_transpose, k_local);
            const k_global = this.multiplyMatrices(k_temp, T);

            // Assemble into global stiffness matrix
            const dofs = [
                node1*3, node1*3+1, node1*3+2,
                node2*3, node2*3+1, node2*3+2
            ];

            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    K[dofs[i]][dofs[j]] += k_global[i][j];
                }
            }
        });

        // Create load vector using mesh loads
        const F = new Array(totalDOF).fill(0);
        this.meshLoads.forEach(load => {
            const nodeIdx = load.nodeId;
            F[nodeIdx*3] += load.fx;     // x force
            F[nodeIdx*3+1] += load.fy;   // y force
            F[nodeIdx*3+2] += load.mz;   // moment
        });

        // Apply supports using mesh supports
        const supportedDOFs = new Set();
        this.meshSupports.forEach(support => {
            const nodeIdx = support.nodeId;
            support.constraints.forEach((isFixed, dofIdx) => {
                if (isFixed && dofIdx < 3) {
                    supportedDOFs.add(nodeIdx*3 + dofIdx);
                }
            });
        });

        // Simple support handling - zero out rows/columns for supported DOFs
        supportedDOFs.forEach(dof => {
            for (let i = 0; i < totalDOF; i++) {
                K[dof][i] = 0;
                K[i][dof] = 0;
            }
            K[dof][dof] = 1;
            F[dof] = 0;
        });

        // Solve K*u = F (simplified using Gaussian elimination)
        const displacements = this.solveLinearSystem(K, F);

        // Calculate element forces from mesh (high resolution)
        const meshElementForces = this.calculateMeshElementForces(displacements);

        // Aggregate forces for user elements (for summary table)
        const userElementForces = this.aggregateUserElementForces(meshElementForces, meshMapping);

        this.results = {
            displacements: displacements,
            elementForces: userElementForces,    // For summary table
            meshElementForces: meshElementForces, // For detailed diagrams
            meshMapping: meshMapping
        };

        return this.results;
    }

    // Simplified Gaussian elimination solver
    solveLinearSystem(A, b) {
        const n = A.length;
        const augmented = A.map((row, i) => [...row, b[i]]);

        // Forward elimination
        for (let i = 0; i < n; i++) {
            // Find pivot
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                    maxRow = k;
                }
            }
            [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

            // Make diagonal 1
            if (Math.abs(augmented[i][i]) > 1e-10) {
                for (let k = i + 1; k <= n; k++) {
                    augmented[i][k] /= augmented[i][i];
                }
            }

            // Eliminate column
            for (let k = i + 1; k < n; k++) {
                for (let j = i + 1; j <= n; j++) {
                    augmented[k][j] -= augmented[k][i] * augmented[i][j];
                }
            }
        }

        // Back substitution
        const x = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            x[i] = augmented[i][n];
            for (let k = i + 1; k < n; k++) {
                x[i] -= augmented[i][k] * x[k];
            }
        }

        return x;
    }

    // Calculate forces for all mesh elements (high resolution) - AWATIF APPROACH
    calculateMeshElementForces(displacements) {
        const meshElementForces = [];

        this.meshElements.forEach((element, elemIdx) => {
            const node1 = element.nodes[0];
            const node2 = element.nodes[1];

            const x1 = this.meshNodes[node1][0];
            const y1 = this.meshNodes[node1][1];
            const x2 = this.meshNodes[node2][0];
            const y2 = this.meshNodes[node2][1];

            const L = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
            const c = (x2-x1)/L;
            const s = (y2-y1)/L;

            // Element displacements in global coordinates
            const u = [
                displacements[node1*3],     // u1
                displacements[node1*3+1],   // v1
                displacements[node1*3+2],   // θ1
                displacements[node2*3],     // u2
                displacements[node2*3+1],   // v2
                displacements[node2*3+2]    // θ2
            ];

            // Transform to local coordinates
            const T = [
                [c,  s,  0,  0,  0,  0],
                [-s, c,  0,  0,  0,  0],
                [0,  0,  1,  0,  0,  0],
                [0,  0,  0,  c,  s,  0],
                [0,  0,  0, -s,  c,  0],
                [0,  0,  0,  0,  0,  1]
            ];

            const u_local = [0, 0, 0, 0, 0, 0];
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    u_local[i] += T[i][j] * u[j];
                }
            }

            const E = element.E;
            const A = element.A;
            const I = element.I;

            // Calculate local stiffness matrix forces (like awatif analyze.ts)
            const k_local = [
                [E*A/L,     0,           0,         -E*A/L,     0,           0],
                [0,         12*E*I/L**3, 6*E*I/L**2, 0,        -12*E*I/L**3, 6*E*I/L**2],
                [0,         6*E*I/L**2,  4*E*I/L,    0,        -6*E*I/L**2,  2*E*I/L],
                [-E*A/L,    0,           0,          E*A/L,     0,           0],
                [0,        -12*E*I/L**3,-6*E*I/L**2, 0,         12*E*I/L**3,-6*E*I/L**2],
                [0,         6*E*I/L**2,  2*E*I/L,    0,        -6*E*I/L**2,  4*E*I/L]
            ];

            // Calculate local forces: F = K * u_local (like awatif)
            const f_local = [0, 0, 0, 0, 0, 0];
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    f_local[i] += k_local[i][j] * u_local[j];
                }
            }

            // AWATIF approach: normals, shearsY, bendingsZ [start, end]
            const axialForce = [f_local[0], f_local[3]];    // [N1, N2]
            const shearForce = [f_local[1], f_local[4]];    // [V1, V2]
            const moment = [f_local[2], f_local[5]];        // [M1, M2]

            meshElementForces.push({
                elementId: elemIdx,
                userElementId: element.userElementId,
                node1: [x1, y1],
                node2: [x2, y2],
                // AWATIF format: [startValue, endValue] for each force type
                normals: [axialForce[0] / 1000, axialForce[1] / 1000],      // Convert to kN
                shearsY: [shearForce[0] / 1000, shearForce[1] / 1000],      // Convert to kN
                bendingsZ: [moment[0] / 1000, moment[1] / 1000]             // Convert to kNm
            });
        });

        return meshElementForces;
    }

    // Aggregate mesh element forces to user element summary - AWATIF APPROACH
    aggregateUserElementForces(meshElementForces, meshMapping) {
        const userElementForces = [];

        this.elements.forEach((userElement, userElemIdx) => {
            // Find all mesh elements for this user element
            const meshElementsForUser = meshElementForces.filter(mef => mef.userElementId === userElemIdx);

            if (meshElementsForUser.length === 0) {
                // Fallback for single element
                userElementForces.push({
                    elementId: userElemIdx,
                    axialForce: 0,
                    shearForce: 0,
                    moment1: 0,
                    moment2: 0
                });
                return;
            }

            // For user element summary: take forces from first and last mesh elements
            const firstMeshElement = meshElementsForUser[0];
            const lastMeshElement = meshElementsForUser[meshElementsForUser.length - 1];

            // Use AWATIF approach: forces at element ends
            userElementForces.push({
                elementId: userElemIdx,
                axialForce: Math.abs(firstMeshElement.normals[0]),  // Display absolute value
                shearForce: Math.abs(firstMeshElement.shearsY[0]),  // Display absolute value
                moment1: firstMeshElement.bendingsZ[0],              // Start moment
                moment2: lastMeshElement.bendingsZ[1],               // End moment

                // Store awatif-format forces for diagram drawing
                normals: [firstMeshElement.normals[0], lastMeshElement.normals[1]],
                shearsY: [firstMeshElement.shearsY[0], lastMeshElement.shearsY[1]],
                bendingsZ: [firstMeshElement.bendingsZ[0], lastMeshElement.bendingsZ[1]]
            });
        });

        return userElementForces;
    }
}

// Global variables
const frameAnalysis = new FrameAnalysisTool();
let currentDiagramType = 'axial'; // 'none', 'axial', 'shear', 'moment'

// UI Functions
function updateNodeSelects() {
    const selects = ['elementNode1', 'elementNode2', 'supportNode', 'loadNode'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="">Select Node</option>';
        frameAnalysis.nodes.forEach((node, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Node ${index} (${node[0]}, ${node[1]})`;
            select.appendChild(option);
        });
    });
}

function updateNodesList() {
    const list = document.getElementById('nodesList');
    list.innerHTML = '';
    frameAnalysis.nodes.forEach((node, index) => {
        const item = document.createElement('div');
        item.className = 'data-item';
        item.innerHTML = `
            <span>Node ${index}: (${node[0]}, ${node[1]})</span>
            <button class="delete-btn" onclick="deleteNode(${index})">Delete</button>
        `;
        list.appendChild(item);
    });
    updateNodeSelects();
    drawStructure();
}

function updateElementsList() {
    const list = document.getElementById('elementsList');
    list.innerHTML = '';
    frameAnalysis.elements.forEach((element, index) => {
        const item = document.createElement('div');
        item.className = 'data-item';
        item.innerHTML = `
            <span>Element ${index}: Node ${element.nodes[0]} → Node ${element.nodes[1]}
                  (E: ${(element.E/1e9).toFixed(1)} GPa, A: ${(element.A*1e4).toFixed(1)} cm², I: ${(element.I*1e8).toFixed(1)} cm⁴)</span>
            <button class="delete-btn" onclick="deleteElement(${index})">Delete</button>
        `;
        list.appendChild(item);
    });
    drawStructure();
}

function updateSupportsList() {
    const list = document.getElementById('supportsList');
    list.innerHTML = '';
    frameAnalysis.supports.forEach((support, index) => {
        const item = document.createElement('div');
        item.className = 'data-item';
        item.innerHTML = `
            <span>Support ${index}: Node ${support.nodeId} (${support.type})</span>
            <button class="delete-btn" onclick="deleteSupport(${index})">Delete</button>
        `;
        list.appendChild(item);
    });
    drawStructure();
}

function updateLoadsList() {
    const list = document.getElementById('loadsList');
    list.innerHTML = '';
    frameAnalysis.loads.forEach((load, index) => {
        const item = document.createElement('div');
        item.className = 'data-item';
        item.innerHTML = `
            <span>Load ${index}: Node ${load.nodeId}
                  (Fx: ${(load.fx/1000).toFixed(1)} kN, Fy: ${(load.fy/1000).toFixed(1)} kN, Mz: ${(load.mz/1000).toFixed(1)} kNm)</span>
            <button class="delete-btn" onclick="deleteLoad(${index})">Delete</button>
        `;
        list.appendChild(item);
    });
    drawStructure();
}

function addNode() {
    const x = document.getElementById('nodeX').value;
    const y = document.getElementById('nodeY').value;

    if (x === '' || y === '') {
        showStatus('Please enter both X and Y coordinates', 'error');
        return;
    }

    frameAnalysis.addNode(x, y);
    updateNodesList();

    // Clear inputs
    document.getElementById('nodeX').value = '';
    document.getElementById('nodeY').value = '';

    showStatus('Node added successfully', 'success');
}

function addElement() {
    const node1 = document.getElementById('elementNode1').value;
    const node2 = document.getElementById('elementNode2').value;
    const E = document.getElementById('elementE').value || 200;
    const A = document.getElementById('elementA').value || 100;
    const I = document.getElementById('elementI').value || 10000;

    if (node1 === '' || node2 === '' || node1 === node2) {
        showStatus('Please select two different nodes', 'error');
        return;
    }

    frameAnalysis.addElement(node1, node2, E, A, I);
    updateElementsList();

    // Clear inputs
    document.getElementById('elementNode1').value = '';
    document.getElementById('elementNode2').value = '';

    showStatus('Element added successfully', 'success');
}

function addSupport() {
    const nodeId = document.getElementById('supportNode').value;
    const type = document.getElementById('supportType').value;

    if (nodeId === '') {
        showStatus('Please select a node', 'error');
        return;
    }

    frameAnalysis.addSupport(nodeId, type);
    updateSupportsList();

    // Clear inputs
    document.getElementById('supportNode').value = '';

    showStatus('Support added successfully', 'success');
}

function addLoad() {
    const nodeId = document.getElementById('loadNode').value;
    const fx = document.getElementById('loadFx').value || 0;
    const fy = document.getElementById('loadFy').value || 0;
    const mz = document.getElementById('loadMz').value || 0;

    if (nodeId === '') {
        showStatus('Please select a node', 'error');
        return;
    }

    if (fx == 0 && fy == 0 && mz == 0) {
        showStatus('Please enter at least one non-zero load component', 'error');
        return;
    }

    frameAnalysis.addLoad(nodeId, fx, fy, mz);
    updateLoadsList();

    // Clear inputs
    document.getElementById('loadNode').value = '';
    document.getElementById('loadFx').value = '';
    document.getElementById('loadFy').value = '';
    document.getElementById('loadMz').value = '';

    showStatus('Load added successfully', 'success');
}

function analyzeStructure() {
    try {
        if (frameAnalysis.supports.length === 0) {
            showStatus('Please add at least one support', 'error');
            return;
        }

        const results = frameAnalysis.analyze();
        displayResults(results);
        showStatus('Analysis completed successfully', 'success');
    } catch (error) {
        showStatus(`Analysis error: ${error.message}`, 'error');
    }
}

function displayResults(results) {
    const table = document.getElementById('resultsTable');
    const tableBody = document.getElementById('resultsTableBody');
    const noResults = document.getElementById('noResults');

    tableBody.innerHTML = '';

    results.elementForces.forEach((force, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>Element ${force.elementId}</td>
            <td>${force.axialForce.toFixed(2)}</td>
            <td>${force.shearForce.toFixed(2)}</td>
            <td>${force.moment1.toFixed(2)}</td>
            <td>${force.moment2.toFixed(2)}</td>
        `;
        tableBody.appendChild(row);
    });

    table.style.display = 'table';
    noResults.style.display = 'none';

    // Update visualizations
    drawStructure();
    drawDiagrams();
}

// Diagram control functions
function setDiagramType(type) {
    currentDiagramType = type;

    // Update button states
    document.querySelectorAll('.btn-diagram').forEach(btn => {
        btn.classList.remove('active');
    });

    // Map type to button ID
    const buttonMap = {
        'none': 'btnNone',
        'axial': 'btnAxial',
        'shear': 'btnShear',
        'moment': 'btnMoment'
    };

    const button = document.getElementById(buttonMap[type]);
    if (button) {
        button.classList.add('active');
    }

    // Redraw diagrams
    drawDiagrams();
}

function drawStructure() {
    const canvas = document.getElementById('visualization');
    if (!canvas) return;

    // Clear and create SVG for structure visualization
    canvas.innerHTML = '';

    if (frameAnalysis.nodes.length === 0) return;

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 800 400');
    svg.style.background = '#f8f9fa';

    // Find bounds for scaling
    const xs = frameAnalysis.nodes.map(n => n[0]);
    const ys = frameAnalysis.nodes.map(n => n[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = Math.min(600 / rangeX, 300 / rangeY);

    // Scale and center coordinates
    function scalePoint(x, y) {
        const scaledX = (x - minX) * scale + 100;
        const scaledY = 350 - (y - minY) * scale - 50; // Flip Y and add margin
        return [scaledX, scaledY];
    }

    // Draw elements
    frameAnalysis.elements.forEach((element, index) => {
        const node1 = frameAnalysis.nodes[element.nodes[0]];
        const node2 = frameAnalysis.nodes[element.nodes[1]];

        const [x1, y1] = scalePoint(node1[0], node1[1]);
        const [x2, y2] = scalePoint(node2[0], node2[1]);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', '#2c3e50');
        line.setAttribute('stroke-width', '3');
        svg.appendChild(line);

        // Add element label
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', midX);
        label.setAttribute('y', midY - 10);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', '#e74c3c');
        label.setAttribute('font-size', '12');
        label.setAttribute('font-weight', 'bold');
        label.textContent = `E${index}`;
        svg.appendChild(label);
    });

    // Draw nodes
    frameAnalysis.nodes.forEach((node, index) => {
        const [x, y] = scalePoint(node[0], node[1]);

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '8');
        circle.setAttribute('fill', '#3498db');
        circle.setAttribute('stroke', '#2c3e50');
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);

        // Add node label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', x + 15);
        label.setAttribute('y', y + 5);
        label.setAttribute('fill', '#2c3e50');
        label.setAttribute('font-size', '12');
        label.setAttribute('font-weight', 'bold');
        label.textContent = `N${index}`;
        svg.appendChild(label);
    });

    // Draw supports
    frameAnalysis.supports.forEach(support => {
        const node = frameAnalysis.nodes[support.nodeId];
        const [x, y] = scalePoint(node[0], node[1]);

        if (support.type === 'fixed') {
            // Draw fixed support (triangle)
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', `${x-10},${y+8} ${x+10},${y+8} ${x},${y-2}`);
            polygon.setAttribute('fill', '#27ae60');
            polygon.setAttribute('stroke', '#2c3e50');
            polygon.setAttribute('stroke-width', '2');
            svg.appendChild(polygon);
        } else if (support.type === 'pinned') {
            // Draw pinned support (triangle outline)
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', `${x-10},${y+8} ${x+10},${y+8} ${x},${y-2}`);
            polygon.setAttribute('fill', 'none');
            polygon.setAttribute('stroke', '#27ae60');
            polygon.setAttribute('stroke-width', '3');
            svg.appendChild(polygon);
        } else if (support.type === 'roller') {
            // Draw roller support (circle on line)
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y + 12);
            circle.setAttribute('r', '6');
            circle.setAttribute('fill', '#27ae60');
            circle.setAttribute('stroke', '#2c3e50');
            circle.setAttribute('stroke-width', '2');
            svg.appendChild(circle);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x - 12);
            line.setAttribute('y1', y + 18);
            line.setAttribute('x2', x + 12);
            line.setAttribute('y2', y + 18);
            line.setAttribute('stroke', '#27ae60');
            line.setAttribute('stroke-width', '3');
            svg.appendChild(line);
        }
    });

    // Draw loads with enhanced visualization
    frameAnalysis.loads.forEach((load, loadIdx) => {
        const node = frameAnalysis.nodes[load.nodeId];
        const [x, y] = scalePoint(node[0], node[1]);

        // Base arrow length scale
        const baseArrowLength = 40;

        // Draw force arrows with improved styling
        if (load.fx !== 0) {
            const forceScale = Math.min(1, Math.abs(load.fx) / 50000); // Scale based on 50kN max
            const arrowLength = baseArrowLength * (0.3 + 0.7 * forceScale);
            const endX = load.fx > 0 ? x + arrowLength : x - arrowLength;

            // Draw arrow shaft
            const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            arrow.setAttribute('x1', x);
            arrow.setAttribute('y1', y);
            arrow.setAttribute('x2', endX);
            arrow.setAttribute('y2', y);
            arrow.setAttribute('stroke', '#e74c3c');
            arrow.setAttribute('stroke-width', '4');
            arrow.setAttribute('marker-end', 'url(#loadArrowhead)');
            svg.appendChild(arrow);

            // Add force magnitude background
            const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            labelBg.setAttribute('x', endX - 25);
            labelBg.setAttribute('y', y - 25);
            labelBg.setAttribute('width', '50');
            labelBg.setAttribute('height', '18');
            labelBg.setAttribute('fill', 'white');
            labelBg.setAttribute('stroke', '#e74c3c');
            labelBg.setAttribute('stroke-width', '1');
            labelBg.setAttribute('rx', '3');
            svg.appendChild(labelBg);

            // Add load value label
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', endX);
            label.setAttribute('y', y - 12);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('fill', '#e74c3c');
            label.setAttribute('font-size', '11');
            label.setAttribute('font-weight', 'bold');
            label.textContent = `${(load.fx/1000).toFixed(1)} kN`;
            svg.appendChild(label);
        }

        if (load.fy !== 0) {
            const forceScale = Math.min(1, Math.abs(load.fy) / 50000); // Scale based on 50kN max
            const arrowLength = baseArrowLength * (0.3 + 0.7 * forceScale);
            const endY = load.fy > 0 ? y - arrowLength : y + arrowLength;

            // Draw arrow shaft
            const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            arrow.setAttribute('x1', x);
            arrow.setAttribute('y1', y);
            arrow.setAttribute('x2', x);
            arrow.setAttribute('y2', endY);
            arrow.setAttribute('stroke', '#e74c3c');
            arrow.setAttribute('stroke-width', '4');
            arrow.setAttribute('marker-end', 'url(#loadArrowhead)');
            svg.appendChild(arrow);

            // Add force magnitude background
            const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            labelBg.setAttribute('x', x + 5);
            labelBg.setAttribute('y', endY - 9);
            labelBg.setAttribute('width', '50');
            labelBg.setAttribute('height', '18');
            labelBg.setAttribute('fill', 'white');
            labelBg.setAttribute('stroke', '#e74c3c');
            labelBg.setAttribute('stroke-width', '1');
            labelBg.setAttribute('rx', '3');
            svg.appendChild(labelBg);

            // Add load value label
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', x + 30);
            label.setAttribute('y', endY);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('fill', '#e74c3c');
            label.setAttribute('font-size', '11');
            label.setAttribute('font-weight', 'bold');
            label.textContent = `${(load.fy/1000).toFixed(1)} kN`;
            svg.appendChild(label);
        }

        // Draw moment loads with curved arrows
        if (load.mz !== 0) {
            const radius = 20;
            const momentScale = Math.min(1, Math.abs(load.mz) / 100000); // Scale based on 100kNm max
            const scaledRadius = radius * (0.5 + 0.5 * momentScale);

            // Create curved arrow path for moment
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const direction = load.mz > 0 ? 1 : -1; // Counterclockwise for positive moment
            const startAngle = direction > 0 ? 0 : Math.PI;
            const endAngle = direction > 0 ? 1.5 * Math.PI : 2.5 * Math.PI;

            const x1 = x + scaledRadius * Math.cos(startAngle);
            const y1 = y + scaledRadius * Math.sin(startAngle);
            const x2 = x + scaledRadius * Math.cos(endAngle);
            const y2 = y + scaledRadius * Math.sin(endAngle);

            const pathData = `M ${x1} ${y1} A ${scaledRadius} ${scaledRadius} 0 1 ${direction > 0 ? 1 : 0} ${x2} ${y2}`;

            path.setAttribute('d', pathData);
            path.setAttribute('stroke', '#9b59b6');
            path.setAttribute('stroke-width', '3');
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', 'url(#momentArrowhead)');
            svg.appendChild(path);

            // Add moment magnitude background
            const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            labelBg.setAttribute('x', x + scaledRadius + 5);
            labelBg.setAttribute('y', y - 9);
            labelBg.setAttribute('width', '65');
            labelBg.setAttribute('height', '18');
            labelBg.setAttribute('fill', 'white');
            labelBg.setAttribute('stroke', '#9b59b6');
            labelBg.setAttribute('stroke-width', '1');
            labelBg.setAttribute('rx', '3');
            svg.appendChild(labelBg);

            // Add moment value label
            const momentLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            momentLabel.setAttribute('x', x + scaledRadius + 37.5);
            momentLabel.setAttribute('y', y);
            momentLabel.setAttribute('text-anchor', 'middle');
            momentLabel.setAttribute('fill', '#9b59b6');
            momentLabel.setAttribute('font-size', '11');
            momentLabel.setAttribute('font-weight', 'bold');
            momentLabel.textContent = `${(load.mz/1000).toFixed(1)} kNm`;
            svg.appendChild(momentLabel);
        }
    });

    // Add arrow marker definitions
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

    // Standard arrowhead for structure elements
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', '#e74c3c');
    marker.appendChild(polygon);
    defs.appendChild(marker);

    // Load arrowhead (larger and more prominent)
    const loadMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    loadMarker.setAttribute('id', 'loadArrowhead');
    loadMarker.setAttribute('markerWidth', '14');
    loadMarker.setAttribute('markerHeight', '10');
    loadMarker.setAttribute('refX', '13');
    loadMarker.setAttribute('refY', '5');
    loadMarker.setAttribute('orient', 'auto');

    const loadPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    loadPolygon.setAttribute('points', '0 0, 14 5, 0 10');
    loadPolygon.setAttribute('fill', '#e74c3c');
    loadPolygon.setAttribute('stroke', '#c0392b');
    loadPolygon.setAttribute('stroke-width', '1');
    loadMarker.appendChild(loadPolygon);
    defs.appendChild(loadMarker);

    // Moment arrowhead (for curved arrows)
    const momentMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    momentMarker.setAttribute('id', 'momentArrowhead');
    momentMarker.setAttribute('markerWidth', '12');
    momentMarker.setAttribute('markerHeight', '8');
    momentMarker.setAttribute('refX', '11');
    momentMarker.setAttribute('refY', '4');
    momentMarker.setAttribute('orient', 'auto');

    const momentPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    momentPolygon.setAttribute('points', '0 0, 12 4, 0 8');
    momentPolygon.setAttribute('fill', '#9b59b6');
    momentPolygon.setAttribute('stroke', '#8e44ad');
    momentPolygon.setAttribute('stroke-width', '1');
    momentMarker.appendChild(momentPolygon);
    defs.appendChild(momentMarker);

    svg.appendChild(defs);

    canvas.appendChild(svg);
}

// Enhanced diagram visualization
function drawDiagrams() {
    const canvas = document.getElementById('diagramVisualization');
    if (!canvas || !frameAnalysis.results) {
        canvas.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #6c757d; font-size: 16px;">Force/moment diagrams will appear here after analysis</div>';
        return;
    }

    // Clear canvas
    canvas.innerHTML = '';

    if (frameAnalysis.nodes.length === 0 || currentDiagramType === 'none') {
        canvas.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #6c757d; font-size: 16px;">Select a diagram type to view force/moment distributions</div>';
        return;
    }

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 800 350');
    svg.style.background = '#fafafa';

    // Find bounds for scaling
    const xs = frameAnalysis.nodes.map(n => n[0]);
    const ys = frameAnalysis.nodes.map(n => n[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = Math.min(600 / rangeX, 200 / rangeY);

    // Scale and center coordinates
    function scalePoint(x, y) {
        const scaledX = (x - minX) * scale + 100;
        const scaledY = 300 - (y - minY) * scale - 50; // Flip Y and add margin
        return [scaledX, scaledY];
    }

    // Use awatif-format forces from user elements for proper diagrams
    const userElementForces = frameAnalysis.results.elementForces;
    let maxValue = 0;

    if (currentDiagramType === 'axial') {
        maxValue = Math.max(...userElementForces.map(f => Math.max(Math.abs(f.normals[0]), Math.abs(f.normals[1]))));
    } else if (currentDiagramType === 'shear') {
        maxValue = Math.max(...userElementForces.map(f => Math.max(Math.abs(f.shearsY[0]), Math.abs(f.shearsY[1]))));
    } else if (currentDiagramType === 'moment') {
        maxValue = Math.max(...userElementForces.map(f => Math.max(Math.abs(f.bendingsZ[0]), Math.abs(f.bendingsZ[1]))));
    }

    const diagramScale = maxValue > 0 ? 60 / maxValue : 1; // Max diagram height of 60 pixels

    console.log(`Diagram scaling: currentDiagramType=${currentDiagramType}, maxValue=${maxValue.toFixed(3)}, diagramScale=${diagramScale.toFixed(3)}`);

    // Draw structure outline first
    frameAnalysis.elements.forEach((element, index) => {
        const node1 = frameAnalysis.nodes[element.nodes[0]];
        const node2 = frameAnalysis.nodes[element.nodes[1]];

        const [x1, y1] = scalePoint(node1[0], node1[1]);
        const [x2, y2] = scalePoint(node2[0], node2[1]);

        // Draw element line (faded)
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', '#bdc3c7');
        line.setAttribute('stroke-width', '2');
        svg.appendChild(line);
    });

    // Draw AWATIF-style diagrams with proper start/end values
    if (currentDiagramType !== 'none' && maxValue > 0) {
        frameAnalysis.elements.forEach((userElement, userElemIdx) => {
            const elementForce = userElementForces.find(ef => ef.elementId === userElemIdx);
            if (!elementForce) return;

            const node1 = frameAnalysis.nodes[userElement.nodes[0]];
            const node2 = frameAnalysis.nodes[userElement.nodes[1]];
            const [x1, y1] = scalePoint(node1[0], node1[1]);
            const [x2, y2] = scalePoint(node2[0], node2[1]);

            // Element direction and perpendicular vectors
            const dx = x2 - x1;
            const dy = y2 - y1;
            const length = Math.sqrt(dx*dx + dy*dy);
            const perpX = -dy / length; // Perpendicular for diagram offset
            const perpY = dx / length;

            let startValue = 0, endValue = 0, diagramColor = '#e74c3c';

            // Get AWATIF-format forces [start, end]
            if (currentDiagramType === 'axial') {
                startValue = elementForce.normals[0] * diagramScale;
                endValue = elementForce.normals[1] * diagramScale;
                diagramColor = elementForce.normals[0] >= 0 ? '#e74c3c' : '#3498db'; // Red for tension, blue for compression
            } else if (currentDiagramType === 'shear') {
                startValue = elementForce.shearsY[0] * diagramScale;
                endValue = elementForce.shearsY[1] * diagramScale;
                diagramColor = '#f39c12'; // Orange for shear

                // Debug shear values
                console.log(`Shear forces - Element ${userElemIdx}: raw=[${elementForce.shearsY[0].toFixed(3)}, ${elementForce.shearsY[1].toFixed(3)}], scaled=[${startValue.toFixed(3)}, ${endValue.toFixed(3)}], diagramScale=${diagramScale.toFixed(3)}`);
            } else if (currentDiagramType === 'moment') {
                startValue = elementForce.bendingsZ[0] * diagramScale;
                endValue = elementForce.bendingsZ[1] * diagramScale;
                diagramColor = '#9b59b6'; // Purple for moments
            }

            // AWATIF approach: create proper diagram shapes
            // Debug log for moment diagrams
            if (currentDiagramType === 'moment') {
                console.log(`Element ${userElemIdx}: startValue=${startValue.toFixed(3)}, endValue=${endValue.toFixed(3)}, startMoment=${elementForce.bendingsZ[0].toFixed(3)}, endMoment=${elementForce.bendingsZ[1].toFixed(3)}`);
            }

            if (Math.abs(startValue) > 0.1 || Math.abs(endValue) > 0.1) { // Lower threshold for moments
                let shape;

                if (currentDiagramType === 'axial' || currentDiagramType === 'shear') {
                    // Constant Result (rectangular shape for axial/shear) - should be perpendicular to beam
                    // For shear force diagrams, use the average of start/end values for better accuracy
                    let constantValue;
                    if (currentDiagramType === 'shear') {
                        // For shear, average the start and end values to get the constant shear force
                        constantValue = (startValue + endValue) / 2;
                    } else {
                        // For axial, use start value (should be same as end value anyway)
                        constantValue = startValue;
                    }

                    console.log(`${currentDiagramType} diagram - Element ${userElemIdx}: startValue=${startValue.toFixed(3)}, endValue=${endValue.toFixed(3)}, using constantValue=${constantValue.toFixed(3)}`);

                    shape = [
                        [x1, y1],                                           // Start point on beam
                        [x1 + perpX * constantValue, y1 + perpY * constantValue], // Start point offset
                        [x2 + perpX * constantValue, y2 + perpY * constantValue], // End point offset
                        [x2, y2]                                            // End point on beam
                    ];
                } else if (currentDiagramType === 'moment') {
                    // Linear Result (trapezoidal shape for moments)
                    const intersection = startValue * endValue < 0; // Check if diagram crosses zero

                    if (intersection && Math.abs(startValue) > 0.1 && Math.abs(endValue) > 0.1) {
                        // Two-segment diagram (crossing zero)
                        const totalLength = Math.sqrt(dx*dx + dy*dy);
                        const crossPoint = totalLength * Math.abs(startValue) / (Math.abs(startValue) + Math.abs(endValue));
                        const xCross = x1 + (dx * crossPoint / totalLength);
                        const yCross = y1 + (dy * crossPoint / totalLength);

                        // First segment (triangular)
                        const shape1 = [
                            [x1, y1],
                            [x1 + perpX * startValue, y1 + perpY * startValue],
                            [xCross, yCross],
                            [x1, y1]
                        ];

                        // Second segment (triangular)
                        const shape2 = [
                            [xCross, yCross],
                            [x2 + perpX * endValue, y2 + perpY * endValue],
                            [x2, y2],
                            [xCross, yCross]
                        ];

                        // Draw both segments
                        [shape1, shape2].forEach((segmentShape, idx) => {
                            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                            polygon.setAttribute('points', segmentShape.map(p => `${p[0]},${p[1]}`).join(' '));
                            const segmentColor = idx === 0 ?
                                (startValue >= 0 ? '#9b59b6' : '#8e44ad') :
                                (endValue >= 0 ? '#9b59b6' : '#8e44ad');
                            polygon.setAttribute('fill', segmentColor);
                            polygon.setAttribute('fill-opacity', '0.6');
                            polygon.setAttribute('stroke', segmentColor);
                            polygon.setAttribute('stroke-width', '1');
                            svg.appendChild(polygon);
                        });

                        // Set flag to skip single polygon drawing
                        shape = null;
                    } else {
                        // Single segment (triangular/trapezoidal)
                        shape = [
                            [x1, y1],
                            [x1 + perpX * startValue, y1 + perpY * startValue],
                            [x2 + perpX * endValue, y2 + perpY * endValue],
                            [x2, y2]
                        ];
                    }
                }

                // Draw single-segment shapes (axial, shear, or single moment)
                if (shape) {
                    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                    polygon.setAttribute('points', shape.map(p => `${p[0]},${p[1]}`).join(' '));
                    polygon.setAttribute('fill', diagramColor);
                    polygon.setAttribute('fill-opacity', '0.6');
                    polygon.setAttribute('stroke', diagramColor);
                    polygon.setAttribute('stroke-width', '1');
                    svg.appendChild(polygon);
                }

                // Add value labels (awatif style)
                if (currentDiagramType === 'moment' && Math.abs(startValue) > 2) {
                    // Start value label
                    const label1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    label1.setAttribute('x', x1 + perpX * startValue * 0.6);
                    label1.setAttribute('y', y1 + perpY * startValue * 0.6);
                    label1.setAttribute('text-anchor', 'middle');
                    label1.setAttribute('fill', diagramColor);
                    label1.setAttribute('font-size', '9');
                    label1.setAttribute('font-weight', 'bold');
                    label1.textContent = (elementForce.bendingsZ[0]).toFixed(1);
                    svg.appendChild(label1);
                }

                if (currentDiagramType === 'moment' && Math.abs(endValue) > 2) {
                    // End value label
                    const label2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    label2.setAttribute('x', x2 + perpX * endValue * 0.6);
                    label2.setAttribute('y', y2 + perpY * endValue * 0.6);
                    label2.setAttribute('text-anchor', 'middle');
                    label2.setAttribute('fill', diagramColor);
                    label2.setAttribute('font-size', '9');
                    label2.setAttribute('font-weight', 'bold');
                    label2.textContent = (elementForce.bendingsZ[1]).toFixed(1);
                    svg.appendChild(label2);
                }

                if ((currentDiagramType === 'axial' || currentDiagramType === 'shear') && (Math.abs(startValue) > 0.5 || Math.abs(endValue) > 0.5)) {
                    // Single value label for constant diagrams
                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2;
                    const avgValue = (startValue + endValue) / 2;
                    const rawValue = currentDiagramType === 'axial' ?
                        Math.abs((elementForce.normals[0] + elementForce.normals[1]) / 2) :
                        Math.abs((elementForce.shearsY[0] + elementForce.shearsY[1]) / 2);

                    if (rawValue > 0.01) { // Only show if there's a meaningful value
                        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        label.setAttribute('x', midX + perpX * avgValue * 0.6);
                        label.setAttribute('y', midY + perpY * avgValue * 0.6);
                        label.setAttribute('text-anchor', 'middle');
                        label.setAttribute('fill', diagramColor);
                        label.setAttribute('font-size', '10');
                        label.setAttribute('font-weight', 'bold');
                        label.textContent = rawValue.toFixed(1);
                        svg.appendChild(label);
                    }
                }
            }

            // Add element label
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const elemLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            elemLabel.setAttribute('x', midX);
            elemLabel.setAttribute('y', midY - 15);
            elemLabel.setAttribute('text-anchor', 'middle');
            elemLabel.setAttribute('fill', '#2c3e50');
            elemLabel.setAttribute('font-size', '11');
            elemLabel.setAttribute('font-weight', 'bold');
            elemLabel.textContent = `E${userElemIdx}`;
            svg.appendChild(elemLabel);
        });
    }

    // Draw nodes
    frameAnalysis.nodes.forEach((node, index) => {
        const [x, y] = scalePoint(node[0], node[1]);

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '6');
        circle.setAttribute('fill', '#2c3e50');
        circle.setAttribute('stroke', 'white');
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);
    });

    // Add legend
    const legend = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    legend.setAttribute('x', 20);
    legend.setAttribute('y', 25);
    legend.setAttribute('fill', '#2c3e50');
    legend.setAttribute('font-size', '14');
    legend.setAttribute('font-weight', 'bold');

    let legendText = '';
    if (currentDiagramType === 'axial') {
        legendText = 'Axial Forces (kN) - Red: Tension, Blue: Compression';
    } else if (currentDiagramType === 'shear') {
        legendText = 'Shear Forces (kN)';
    } else if (currentDiagramType === 'moment') {
        legendText = 'Bending Moments (kNm)';
    }

    legend.textContent = legendText;
    svg.appendChild(legend);

    // Add scale reference
    if (maxValue > 0) {
        const scaleRef = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        scaleRef.setAttribute('x', 20);
        scaleRef.setAttribute('y', 45);
        scaleRef.setAttribute('fill', '#6c757d');
        scaleRef.setAttribute('font-size', '12');
        scaleRef.textContent = `Max value: ${maxValue.toFixed(2)} ${currentDiagramType === 'moment' ? 'kNm' : 'kN'}`;
        svg.appendChild(scaleRef);
    }

    canvas.appendChild(svg);
}

function clearAll() {
    frameAnalysis.nodes = [];
    frameAnalysis.elements = [];
    frameAnalysis.supports = [];
    frameAnalysis.loads = [];
    frameAnalysis.results = null;

    updateNodesList();
    updateElementsList();
    updateSupportsList();
    updateLoadsList();

    // Hide results and clear diagrams
    document.getElementById('resultsTable').style.display = 'none';
    document.getElementById('noResults').style.display = 'block';

    // Clear diagram visualization
    const diagramCanvas = document.getElementById('diagramVisualization');
    if (diagramCanvas) {
        diagramCanvas.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #6c757d; font-size: 16px;">Force/moment diagrams will appear here after analysis</div>';
    }

    showStatus('All data cleared', 'success');
}

function deleteNode(index) {
    frameAnalysis.nodes.splice(index, 1);
    // Also remove elements, supports, and loads that reference this node
    frameAnalysis.elements = frameAnalysis.elements.filter(elem =>
        !elem.nodes.includes(index)).map(elem => ({
        ...elem,
        nodes: elem.nodes.map(n => n > index ? n - 1 : n)
    }));
    frameAnalysis.supports = frameAnalysis.supports.filter(sup =>
        sup.nodeId !== index).map(sup => ({
        ...sup,
        nodeId: sup.nodeId > index ? sup.nodeId - 1 : sup.nodeId
    }));
    frameAnalysis.loads = frameAnalysis.loads.filter(load =>
        load.nodeId !== index).map(load => ({
        ...load,
        nodeId: load.nodeId > index ? load.nodeId - 1 : load.nodeId
    }));

    updateNodesList();
    updateElementsList();
    updateSupportsList();
    updateLoadsList();
}

function deleteElement(index) {
    frameAnalysis.elements.splice(index, 1);
    updateElementsList();
}

function deleteSupport(index) {
    frameAnalysis.supports.splice(index, 1);
    updateSupportsList();
}

function deleteLoad(index) {
    frameAnalysis.loads.splice(index, 1);
    updateLoadsList();
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.className = `status-message status-${type}`;
    statusDiv.textContent = message;

    // Clear message after 3 seconds
    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = '';
    }, 3000);
}

// Auto-populate test cantilever for development
function createTestCantilever() {
    console.log('Creating test cantilever: 10m beam, fixed at origin, 10kN tip load');

    // Add nodes
    frameAnalysis.addNode(0, 0);  // Fixed end
    frameAnalysis.addNode(10, 0); // Free end

    // Add element (10m cantilever)
    frameAnalysis.addElement(0, 1, 210, 100, 10000); // Steel beam properties

    // Add fixed support at node 0
    frameAnalysis.addSupport(0, 'fixed');

    // Add 10kN downward load at tip (node 1)
    frameAnalysis.addLoad(1, 0, -10, 0); // Fx=0, Fy=-10kN (downward), Mz=0

    // Update all UI lists
    updateNodesList();
    updateElementsList();
    updateSupportsList();
    updateLoadsList();

    console.log('Test cantilever created successfully');
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Create test structure first
    createTestCantilever();

    // Then update visualizations
    drawStructure();
    drawDiagrams();

    console.log('Page loaded with test cantilever. Expected results:');
    console.log('- Axial: 0 kN (no axial force)');
    console.log('- Shear: 10 kN constant');
    console.log('- Moment: Linear from 0 to 100 kNm');
});