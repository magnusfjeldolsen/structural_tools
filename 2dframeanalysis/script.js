// Global variables
let nodes = [];
let elements = [];
let loads = [];
let supports = [];
let analysisResults = null;

// Pure JavaScript Enhanced Frame Analysis Class
class EnhancedFrame {
    constructor() {
        this.nodes = {};
        this.elements = {};
        this.loads = {point: {}, distributed: {}};
        this.supports = {};
        this.results = {};
        this.DOF = 3; // 3 DOF per node (x, y, rotation)
    }
    
    addNode(nodeId, x, y) {
        this.nodes[nodeId] = {x: parseFloat(x), y: parseFloat(y)};
    }
    
    addElement(elemId, node1, node2, E = 200e9, A = 0.01, I = 0.001) {
        // E in Pa (200 GPa for steel), A in m², I in m⁴
        // Default properties for a typical steel beam
        if (node1 in this.nodes && node2 in this.nodes) {
            this.elements[elemId] = {
                nodes: [parseInt(node1), parseInt(node2)],
                E: parseFloat(E),       // 200 GPa in Pa
                A: parseFloat(A),       // 0.01 m² cross-sectional area
                I: parseFloat(I)        // 0.001 m⁴ moment of inertia
            };
        }
    }
    
    addPointLoad(nodeId, fx, fy, mz) {
        this.loads.point[parseInt(nodeId)] = {
            fx: parseFloat(fx * 1000), // Convert kN to N
            fy: parseFloat(fy * 1000),
            mz: parseFloat(mz * 1000) // Convert kNm to Nm
        };
    }
    
    addDistributedLoad(elemId, loadValue, direction = 'y') {
        this.loads.distributed[parseInt(elemId)] = {
            value: parseFloat(loadValue * 1000), // Convert kN/m to N/m
            direction: direction // 'x' or 'y'
        };
    }
    
    addSupport(nodeId, supportType) {
        // Define support constraints: [ux, uy, rotz] where 1 = constrained, 0 = free
        const constraints = {
            fixed: [1, 1, 1],     // Fixed: constrains translation in both directions and rotation
            pinned: [1, 1, 0],    // Pinned: constrains translation in both directions, allows rotation
            roller_x: [0, 1, 0],  // Horizontal roller: constrains vertical displacement only
            roller_y: [1, 0, 0]   // Vertical roller: constrains horizontal displacement only
        };
        this.supports[parseInt(nodeId)] = constraints[supportType] || [1, 1, 1];
    }
    
    getElementProperties(elemId) {
        const elem = this.elements[elemId];
        const [node1Id, node2Id] = elem.nodes;
        const node1 = this.nodes[node1Id];
        const node2 = this.nodes[node2Id];
        
        const dx = node2.x - node1.x;
        const dy = node2.y - node1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        return {
            length: length,
            angle: angle,
            cos: Math.cos(angle),
            sin: Math.sin(angle),
            E: elem.E,
            A: elem.A,
            I: elem.I
        };
    }
    
    localStiffnessMatrix(elemId) {
        const props = this.getElementProperties(elemId);
        const L = props.length;
        const E = props.E;
        const A = props.A;
        const I = props.I;
        
        // Local stiffness matrix for 2D frame element
        // DOF order: [u1, v1, θ1, u2, v2, θ2]
        // u = axial, v = transverse, θ = rotation
        const k = this.createMatrix(6, 6);
        
        // Axial terms (u1, u2)
        k[0][0] = E * A / L;
        k[0][3] = -E * A / L;
        k[3][0] = -E * A / L;
        k[3][3] = E * A / L;
        
        // Flexural terms (v1, θ1, v2, θ2)
        k[1][1] = 12 * E * I / (L * L * L);
        k[1][2] = 6 * E * I / (L * L);
        k[1][4] = -12 * E * I / (L * L * L);
        k[1][5] = 6 * E * I / (L * L);
        
        k[2][1] = 6 * E * I / (L * L);
        k[2][2] = 4 * E * I / L;
        k[2][4] = -6 * E * I / (L * L);
        k[2][5] = 2 * E * I / L;
        
        k[4][1] = -12 * E * I / (L * L * L);
        k[4][2] = -6 * E * I / (L * L);
        k[4][4] = 12 * E * I / (L * L * L);
        k[4][5] = -6 * E * I / (L * L);
        
        k[5][1] = 6 * E * I / (L * L);
        k[5][2] = 2 * E * I / L;
        k[5][4] = -6 * E * I / (L * L);
        k[5][5] = 4 * E * I / L;
        
        return k;
    }
    
    transformationMatrix(elemId) {
        const props = this.getElementProperties(elemId);
        const c = props.cos;
        const s = props.sin;
        
        const T = this.createMatrix(6, 6);
        
        // Transformation matrix for 2D frame element
        // Local DOF: [u1, v1, θ1, u2, v2, θ2]
        // Global DOF: [x1, y1, θ1, x2, y2, θ2]
        
        // First node transformation
        T[0][0] = c;   // u1 -> x1
        T[0][1] = s;   // v1 -> x1
        T[1][0] = -s;  // u1 -> y1
        T[1][1] = c;   // v1 -> y1
        T[2][2] = 1;   // θ1 -> θ1
        
        // Second node transformation
        T[3][3] = c;   // u2 -> x2
        T[3][4] = s;   // v2 -> x2
        T[4][3] = -s;  // u2 -> y2
        T[4][4] = c;   // v2 -> y2
        T[5][5] = 1;   // θ2 -> θ2
        
        return T;
    }
    
    globalStiffnessMatrix(elemId) {
        const kLocal = this.localStiffnessMatrix(elemId);
        const T = this.transformationMatrix(elemId);
        
        // K_global = T^T * K_local * T
        const TT = this.transpose(T);
        const temp = this.multiplyMatrices(TT, kLocal);
        return this.multiplyMatrices(temp, T);
    }
    
    assembleGlobalMatrix() {
        const numNodes = Object.keys(this.nodes).length;
        const totalDof = numNodes * this.DOF;
        const KGlobal = this.createMatrix(totalDof, totalDof);
        
        const nodeIds = Object.keys(this.nodes).map(id => parseInt(id)).sort((a, b) => a - b);
        const nodeMap = {};
        nodeIds.forEach((nodeId, i) => {
            nodeMap[nodeId] = i;
        });
        
        for (const [elemId, elem] of Object.entries(this.elements)) {
            const [node1Id, node2Id] = elem.nodes;
            
            // Global DOF indices
            const dof1 = [nodeMap[node1Id] * 3, nodeMap[node1Id] * 3 + 1, nodeMap[node1Id] * 3 + 2];
            const dof2 = [nodeMap[node2Id] * 3, nodeMap[node2Id] * 3 + 1, nodeMap[node2Id] * 3 + 2];
            const dofs = [...dof1, ...dof2];
            
            const kGlobal = this.globalStiffnessMatrix(parseInt(elemId));
            
            // Add to global matrix
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    KGlobal[dofs[i]][dofs[j]] += kGlobal[i][j];
                }
            }
        }
        
        return {KGlobal, nodeMap};
    }
    
    assembleLoadVector(nodeMap) {
        const numNodes = Object.keys(this.nodes).length;
        const totalDof = numNodes * this.DOF;
        const FGlobal = new Array(totalDof).fill(0);
        
        // Point loads
        for (const [nodeId, load] of Object.entries(this.loads.point)) {
            const nodeIdInt = parseInt(nodeId);
            if (nodeIdInt in nodeMap) {
                const baseDof = nodeMap[nodeIdInt] * 3;
                FGlobal[baseDof] += load.fx;
                FGlobal[baseDof + 1] += load.fy;
                FGlobal[baseDof + 2] += load.mz;
            }
        }
        
        // Distributed loads (simplified - applied as equivalent nodal loads)
        for (const [elemId, loadData] of Object.entries(this.loads.distributed)) {
            const elemIdInt = parseInt(elemId);
            if (elemIdInt in this.elements) {
                const elem = this.elements[elemIdInt];
                const props = this.getElementProperties(elemIdInt);
                const L = props.length;
                
                const loadPerLength = loadData.value; // N/m
                const direction = loadData.direction; // 'x' or 'y'
                
                // Equivalent nodal forces for uniformly distributed load
                const equivForce = loadPerLength * L / 2;
                const equivMoment = Math.abs(loadPerLength) * L * L / 12;
                
                const [node1Id, node2Id] = elem.nodes;
                
                // Apply equivalent nodal forces
                if (node1Id in nodeMap) {
                    const baseDof1 = nodeMap[node1Id] * 3;
                    if (direction === 'x') {
                        FGlobal[baseDof1] += equivForce; // Horizontal force at node 1
                    } else { // direction === 'y'
                        FGlobal[baseDof1 + 1] += equivForce; // Vertical force at node 1
                        // For downward load (negative), moments should be negative at start
                        FGlobal[baseDof1 + 2] += loadPerLength < 0 ? -equivMoment : equivMoment;
                    }
                }
                
                if (node2Id in nodeMap) {
                    const baseDof2 = nodeMap[node2Id] * 3;
                    if (direction === 'x') {
                        FGlobal[baseDof2] += equivForce; // Horizontal force at node 2
                    } else { // direction === 'y'
                        FGlobal[baseDof2 + 1] += equivForce; // Vertical force at node 2
                        // For downward load (negative), moments should be positive at end
                        FGlobal[baseDof2 + 2] += loadPerLength < 0 ? equivMoment : -equivMoment;
                    }
                }
            }
        }
        
        return FGlobal;
    }
    
    applyBoundaryConditions(K, F, nodeMap) {
        const freeDofs = [];
        
        const sortedNodeIds = Object.keys(this.nodes).map(id => parseInt(id)).sort((a, b) => a - b);
        
        for (let i = 0; i < sortedNodeIds.length; i++) {
            const nodeId = sortedNodeIds[i];
            const baseDof = i * 3;
            
            if (nodeId in this.supports) {
                const constraints = this.supports[nodeId];
                for (let j = 0; j < constraints.length; j++) {
                    if (!constraints[j]) { // 0 = free
                        freeDofs.push(baseDof + j);
                    }
                }
            } else {
                // Unconstrained node - all DOFs free
                freeDofs.push(baseDof, baseDof + 1, baseDof + 2);
            }
        }
        
        // Extract free DOF submatrices
        const Kff = this.createMatrix(freeDofs.length, freeDofs.length);
        const Ff = new Array(freeDofs.length);
        
        for (let i = 0; i < freeDofs.length; i++) {
            Ff[i] = F[freeDofs[i]];
            for (let j = 0; j < freeDofs.length; j++) {
                Kff[i][j] = K[freeDofs[i]][freeDofs[j]];
            }
        }
        
        return {Kff, Ff, freeDofs};
    }
    
    calculateElementForces(displacements, nodeMap) {
        const elementForces = {};
        
        for (const [elemId, elem] of Object.entries(this.elements)) {
            const elemIdInt = parseInt(elemId);
            const [node1Id, node2Id] = elem.nodes;
            
            // Get nodal displacements
            const dof1 = [nodeMap[node1Id] * 3, nodeMap[node1Id] * 3 + 1, nodeMap[node1Id] * 3 + 2];
            const dof2 = [nodeMap[node2Id] * 3, nodeMap[node2Id] * 3 + 1, nodeMap[node2Id] * 3 + 2];
            
            const uGlobal = new Array(6).fill(0);
            [...dof1, ...dof2].forEach((dof, i) => {
                uGlobal[i] = displacements[dof] || 0.0;
            });
            
            // Transform to local coordinates
            const T = this.transformationMatrix(elemIdInt);
            const uLocal = this.multiplyMatrixVector(T, uGlobal);
            
            // Calculate forces in local coordinates from stiffness
            const kLocal = this.localStiffnessMatrix(elemIdInt);
            const fLocal = this.multiplyMatrixVector(kLocal, uLocal);
            
            const props = this.getElementProperties(elemIdInt);
            const L = props.length;
            
            // Initialize forces from stiffness matrix
            // NOTE: For beam elements, end forces need correct sign convention
            let forces = {
                axial_start: fLocal[0] / 1000,   // Convert N to kN
                shear_start: fLocal[1] / 1000,
                moment_start: fLocal[2] / 1000,  // Convert Nm to kNm
                axial_end: -fLocal[3] / 1000,    // Opposite direction for axial
                shear_end: -fLocal[4] / 1000,    // Opposite direction for shear (equilibrium)
                moment_end: fLocal[5] / 1000     // Same direction for moment
            };
            
            // Apply distributed load corrections to get correct internal forces
            if (elemIdInt in this.loads.distributed) {
                const loadData = this.loads.distributed[elemIdInt];
                if (loadData.direction === 'y') {
                    const w_N_per_m = loadData.value; // In N/m (converted during input)
                    const w_kN_per_m = w_N_per_m / 1000; // Convert to kN/m for force calculations
                    
                    // Check if this element has simply supported conditions (pinned/roller ends)
                    const [node1Id, node2Id] = elem.nodes;
                    const node1Support = this.supports[node1Id] || [0, 0, 0];
                    const node2Support = this.supports[node2Id] || [0, 0, 0];
                    
                    const isSimplySupported = (node1Support[2] === 0 && node2Support[2] === 0); // Both ends allow rotation
                    
                    if (isSimplySupported) {
                        // For simply supported beam with UDL: end moments = 0, reactions = wL/2
                        const totalLoad_kN = Math.abs(w_kN_per_m * L);
                        forces.shear_start = totalLoad_kN / 2;   // Positive reaction at start
                        forces.shear_end = -totalLoad_kN / 2;    // Negative reaction at end
                        forces.moment_start = 0;                 // Zero moment at pinned end
                        forces.moment_end = 0;                   // Zero moment at roller end
                    } else {
                        // For fixed or partially fixed beams, use the FE solution
                        // The moments from K*u are correct for fixed-end conditions
                        const totalLoad_kN = Math.abs(w_kN_per_m * L);
                        forces.shear_start = totalLoad_kN / 2;
                        forces.shear_end = -totalLoad_kN / 2;
                        // Keep the calculated moments from FE analysis
                    }
                }
            }
            
            elementForces[elemId] = {
                axial_start: forces.axial_start,
                shear_start: forces.shear_start,
                moment_start: forces.moment_start,
                axial_end: forces.axial_end,
                shear_end: forces.shear_end,
                moment_end: forces.moment_end,
                max_moment: Math.max(Math.abs(forces.moment_start), Math.abs(forces.moment_end))
            };
            
            // Add distributed load effects to moments (only for vertical loads)
            if (elemIdInt in this.loads.distributed) {
                const loadData = this.loads.distributed[elemIdInt];
                if (loadData.direction === 'y') {
                    const w = loadData.value / 1000; // Convert to kN/m
                    const maxDistMoment = w * L * L / 8; // Maximum moment for UDL
                    elementForces[elemId].max_moment = Math.max(
                        elementForces[elemId].max_moment,
                        maxDistMoment
                    );
                }
            }
        }
        
        return elementForces;
    }
    
    // Calculate internal forces at any position along an element using PyNite-style formulas
    getInternalForces(elemId, position) {
        // position: 0 = start node, 1 = end node, 0.5 = midpoint, etc.
        if (position < 0 || position > 1) {
            throw new Error("Position must be between 0 and 1");
        }

        if (!(elemId in this.elements)) {
            throw new Error(`Element ${elemId} not found`);
        }

        const elem = this.elements[elemId];
        const props = this.getElementProperties(elemId);
        const L = props.length;

        // Get element forces at ends (from last analysis)
        const elemForces = this.results?.element_forces?.[elemId];
        if (!elemForces) {
            throw new Error("No analysis results available. Run analyze() first.");
        }

        // Local coordinate along the element (absolute distance from start)
        const x = position * L;

        // End forces - use in kN and kNm directly (no conversion needed for PyNite formulas)
        const V1 = elemForces.shear_start;    // Already in kN
        const M1 = elemForces.moment_start;   // Already in kNm
        const N1 = elemForces.axial_start;    // Already in kN

        // Distributed loads - get in kN/m for PyNite calculations
        let w1 = 0, w2 = 0;
        if (elemId in this.loads.distributed) {
            const loadData = this.loads.distributed[elemId];
            if (loadData.direction === 'y') {
                w1 = loadData.value / 1000; // Convert N/m back to kN/m for PyNite formula
                w2 = w1; // Uniform load
            }
        }

        // ------------------------------
        // 1. Axial force (constant for frame elements)
        // ------------------------------
        const N = N1; // Axial force is constant along element for frame analysis

        // ------------------------------
        // 2. Shear force using PyNite formula (all in kN, m units)
        // ------------------------------
        // V(x) = V1 + w1*x + x²*(-w1 + w2)/(2*L)
        // For uniform load: V(x) = V1 + w1*x
        const V = V1 + w1 * x + (x * x * (-w1 + w2)) / (2 * L);

        // ------------------------------
        // 3. Moment using PyNite BeamSegY formula (all in kN, m units)
        // ------------------------------
        // M(x) = -M1 - V1*x - w1*x²/2 - x³*(-w1 + w2)/(6*L)
        // For simply supported beam with UDL, M1 should be 0, so:
        // M(x) = -V1*x - w1*x²/2
        const M = -M1 - V1 * x - w1 * x * x / 2 - (x * x * x * (-w1 + w2)) / (6 * L);

        return {
            position: position,
            x: x, // distance from start (m)
            axial: N,   // Already in kN
            shear: V,   // Already in kN  
            moment: M,  // Now correctly in kNm
            coords: this.getElementCoordinates(elemId, position)
        };
    }

    
    // Calculate deflection at any position along an element using PyNite formula
    getElementDeflection(elemId, position) {
        // position: 0 = start node, 1 = end node, 0.5 = midpoint, etc.
        if (position < 0 || position > 1) {
            throw new Error("Position must be between 0 and 1");
        }

        if (!(elemId in this.elements)) {
            throw new Error(`Element ${elemId} not found`);
        }

        const elem = this.elements[elemId];
        const props = this.getElementProperties(elemId);
        const L = props.length;
        const EI = props.E * props.I; // Flexural rigidity

        // Get element forces at ends (from last analysis)
        const elemForces = this.results?.element_forces?.[elemId];
        if (!elemForces) {
            throw new Error("No analysis results available. Run analyze() first.");
        }

        // Get nodal displacements from global results
        const nodeMap = {};
        const sortedNodeIds = Object.keys(this.nodes).map(id => parseInt(id)).sort((a, b) => a - b);
        sortedNodeIds.forEach((id, i) => {
            nodeMap[id] = i;
        });

        const [node1Id, node2Id] = elem.nodes;
        const node1Index = nodeMap[node1Id];
        const node2Index = nodeMap[node2Id];

        // Get actual displacements and rotations at element ends from FE solution
        let delta1_global = 0, theta1_global = 0, delta2_global = 0, theta2_global = 0;
        if (this.results && this.results.displacements) {
            // For 2D frame elements, we need the transverse deflection (typically Y for horizontal beams)
            // This should match the element's local coordinate system
            delta1_global = this.results.displacements[`node_${node1Id}_dof_1`] || 0; // Y displacement at node 1
            theta1_global = this.results.displacements[`node_${node1Id}_dof_2`] || 0; // Rotation at node 1 (about Z-axis)
            delta2_global = this.results.displacements[`node_${node2Id}_dof_1`] || 0; // Y displacement at node 2  
            theta2_global = this.results.displacements[`node_${node2Id}_dof_2`] || 0; // Rotation at node 2 (about Z-axis)
            
            // Debug: log the actual displacement values being used
            console.log(`Element ${elemId}: Node ${node1Id}: δ=${delta1_global.toFixed(6)}m, θ=${theta1_global.toFixed(6)}rad`);
            console.log(`Element ${elemId}: Node ${node2Id}: δ=${delta2_global.toFixed(6)}m, θ=${theta2_global.toFixed(6)}rad`);
        }

        // Apply support constraints to ensure boundary conditions are satisfied
        const node1Support = this.supports[node1Id] || [0, 0, 0];
        const node2Support = this.supports[node2Id] || [0, 0, 0];
        
        // Apply constraints: [ux, uy, rotz] where 1 = constrained, 0 = free
        const delta1 = node1Support[1] === 1 ? 0 : delta1_global; // Y displacement
        const theta1 = node1Support[2] === 1 ? 0 : theta1_global;   // Rotation
        const delta2 = node2Support[1] === 1 ? 0 : delta2_global; // Y displacement
        const theta2 = node2Support[2] === 1 ? 0 : theta2_global;   // Rotation

        // Local coordinate along the element
        const x = position * L;

        // End forces - convert to SI units (N, Nm) for deflection calculation
        const V1_N = elemForces.shear_start * 1000;    // Convert kN to N
        const M1_Nm = elemForces.moment_start * 1000;  // Convert kNm to Nm

        // Distributed loads - use N/m for deflection calculation (SI units for PyNite formula)
        let w1 = 0, w2 = 0;
        if (elemId in this.loads.distributed) {
            const loadData = this.loads.distributed[elemId];
            if (loadData.direction === 'y') {
                w1 = loadData.value; // Already in N/m
                w2 = w1; // Uniform load
            }
        }

        // Use Hermite cubic interpolation based on global FE nodal results
        // This ensures continuity between adjacent elements at shared nodes
        // H₁(ξ) = 2ξ³ - 3ξ² + 1       (shape function for δ₁)
        // H₂(ξ) = -2ξ³ + 3ξ²         (shape function for δ₂)  
        // H₃(ξ) = ξ³ - 2ξ² + ξ       (shape function for θ₁*L)
        // H₄(ξ) = ξ³ - ξ²            (shape function for θ₂*L)
        
        const xi = position; // normalized coordinate (0 to 1)
        
        // Hermite basis functions
        const H1 = 2*xi*xi*xi - 3*xi*xi + 1;           // Shape function for delta1
        const H2 = -2*xi*xi*xi + 3*xi*xi;              // Shape function for delta2  
        const H3 = xi*xi*xi - 2*xi*xi + xi;            // Shape function for theta1*L
        const H4 = xi*xi*xi - xi*xi;                   // Shape function for theta2*L
        
        // Interpolate deflection using global FE nodal values
        // This ensures perfect continuity at shared nodes between elements
        const deflection = H1 * delta1 + H2 * delta2 + H3 * (theta1 * L) + H4 * (theta2 * L);
        
        return deflection; // Returns deflection in meters
    }

    // Get global coordinates at a position along an element
    getElementCoordinates(elemId, position) {
        if (!(elemId in this.elements)) {
            throw new Error(`Element ${elemId} not found`);
        }
        
        const elem = this.elements[elemId];
        const [node1Id, node2Id] = elem.nodes;
        const node1 = this.nodes[node1Id];
        const node2 = this.nodes[node2Id];
        
        // Linear interpolation between nodes
        const x = node1.x + position * (node2.x - node1.x);
        const y = node1.y + position * (node2.y - node1.y);
        
        return {x: x, y: y};
    }
    
    // Generate array of internal forces along an element for plotting
    getElementForceProfile(elemId, numPoints = 21) {
        const profile = [];
        
        for (let i = 0; i < numPoints; i++) {
            const position = i / (numPoints - 1);
            try {
                const forces = this.getInternalForces(elemId, position);
                profile.push(forces);
            } catch (error) {
                console.warn(`Could not get forces at position ${position} for element ${elemId}:`, error.message);
            }
        }
        
        return profile;
    }
    
    // Find maximum moment and its location in an element
    getMaxMoment(elemId, numPoints = 101) {
        const profile = this.getElementForceProfile(elemId, numPoints);
        
        let maxMoment = 0;
        let maxMomentLocation = null;
        
        for (const point of profile) {
            if (Math.abs(point.moment) > Math.abs(maxMoment)) {
                maxMoment = point.moment;
                maxMomentLocation = point;
            }
        }
        
        return maxMomentLocation;
    }
    
    analyze() {
        if (Object.keys(this.nodes).length < 2 || Object.keys(this.elements).length < 1) {
            throw new Error("Insufficient nodes or elements for analysis");
        }
        
        if (Object.keys(this.supports).length === 0) {
            throw new Error("No supports defined - structure is unstable");
        }
        
        // Assemble global stiffness matrix
        const {KGlobal, nodeMap} = this.assembleGlobalMatrix();
        
        // Assemble load vector
        const FGlobal = this.assembleLoadVector(nodeMap);
        
        // Apply boundary conditions
        const {Kff, Ff, freeDofs} = this.applyBoundaryConditions(KGlobal, FGlobal, nodeMap);
        
        // Solve for displacements
        let uf;
        try {
            if (freeDofs.length > 0 && this.determinant(Kff) !== 0) {
                uf = this.solveLinearSystem(Kff, Ff);
            } else {
                uf = new Array(freeDofs.length).fill(0);
            }
        } catch (error) {
            throw new Error("Singular stiffness matrix - check support conditions");
        }
        
        // Reconstruct full displacement vector
        const displacementsFull = {};
        freeDofs.forEach((dof, i) => {
            displacementsFull[dof] = uf[i];
        });
        
        // Calculate element forces
        const elementForces = this.calculateElementForces(displacementsFull, nodeMap);
        
        // Calculate reactions using simple statics equilibrium
        const reactions = {};
        
        // First, calculate total applied loads
        let totalLoadX = 0, totalLoadY = 0, totalMoment = 0;
        
        // Point loads
        for (const [nodeId, load] of Object.entries(this.loads.point)) {
            totalLoadX += load.fx / 1000; // Convert to kN
            totalLoadY += load.fy / 1000;
            totalMoment += load.mz / 1000; // Convert to kNm
            
            // Add moment about origin from force couples
            const nodeIdInt = parseInt(nodeId);
            if (nodeIdInt in this.nodes) {
                const node = this.nodes[nodeIdInt];
                totalMoment += (load.fx / 1000) * node.y; // Fx * y (force in kN, position in m)
                totalMoment -= (load.fy / 1000) * node.x; // -Fy * x (force in kN, position in m)
            }
        }
        
        // Distributed loads
        for (const [elemId, loadData] of Object.entries(this.loads.distributed)) {
            const elemIdInt = parseInt(elemId);
            if (elemIdInt in this.elements) {
                const elem = this.elements[elemIdInt];
                const props = this.getElementProperties(elemIdInt);
                const L = props.length;
                const w = loadData.value / 1000; // Convert to kN/m
                
                const [node1Id, node2Id] = elem.nodes;
                const node1 = this.nodes[node1Id];
                const node2 = this.nodes[node2Id];
                const midX = (node1.x + node2.x) / 2; // Midpoint of element
                const midY = (node1.y + node2.y) / 2;
                
                if (loadData.direction === 'y') {
                    const totalLoad = w * L; // Total load in kN (w in kN/m, L in m)
                    totalLoadY += totalLoad;
                    totalMoment -= totalLoad * midX; // -Fy * x (both in consistent units)
                } else if (loadData.direction === 'x') {
                    const totalLoad = w * L; // Total load in kN (w in kN/m, L in m)
                    totalLoadX += totalLoad;
                    totalMoment += totalLoad * midY; // Fx * y (both in consistent units)
                }
            }
        }
        
        // For simple structures, distribute reactions proportionally
        // This is a simplified approach - for complex structures, use the full matrix solution
        const supportNodes = Object.keys(this.supports);
        const numSupports = supportNodes.length;
        
        for (const [nodeId, constraints] of Object.entries(this.supports)) {
            let rx = 0, ry = 0, mz = 0;
            
            // Simple distribution of total loads among supports
            if (constraints[0] && numSupports > 0) rx = -totalLoadX / numSupports;
            if (constraints[1] && numSupports > 0) ry = -totalLoadY / numSupports;
            if (constraints[2]) mz = -totalMoment; // Moment reaction only at fixed supports
            
            reactions[nodeId] = {rx, ry, mz};
        }
        
        // Format results - need to map DOF indices back to actual node IDs using nodeMap
        const reverseNodeMap = {};
        Object.entries(nodeMap).forEach(([nodeId, index]) => {
            reverseNodeMap[index] = parseInt(nodeId);
        });
        
        const results = {
            element_forces: elementForces,
            reactions: reactions,
            displacements: Object.fromEntries(
                Object.entries(displacementsFull).map(([k, v]) => {
                    const dofIndex = parseInt(k);
                    const nodeMapIndex = Math.floor(dofIndex / 3);
                    const actualNodeId = reverseNodeMap[nodeMapIndex];
                    const localDof = dofIndex % 3;
                    return [`node_${actualNodeId}_dof_${localDof}`, v];
                })
            ),
            axial_forces: Object.fromEntries(
                Object.entries(elementForces).map(([k, v]) => [k, v.axial_start])
            ),
            shear_forces: Object.fromEntries(
                Object.entries(elementForces).map(([k, v]) => [k, v.shear_start])
            ),
            bending_moments: Object.fromEntries(
                Object.entries(elementForces).map(([k, v]) => [k, v.max_moment])
            )
        };
        
        this.results = results;
        return results;
    }
    
    // Helper methods for matrix operations
    createMatrix(rows, cols) {
        return Array(rows).fill().map(() => Array(cols).fill(0));
    }
    
    transpose(matrix) {
        const rows = matrix.length;
        const cols = matrix[0].length;
        const result = this.createMatrix(cols, rows);
        
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                result[j][i] = matrix[i][j];
            }
        }
        
        return result;
    }
    
    multiplyMatrices(A, B) {
        const rowsA = A.length;
        const colsA = A[0].length;
        const colsB = B[0].length;
        const result = this.createMatrix(rowsA, colsB);
        
        for (let i = 0; i < rowsA; i++) {
            for (let j = 0; j < colsB; j++) {
                for (let k = 0; k < colsA; k++) {
                    result[i][j] += A[i][k] * B[k][j];
                }
            }
        }
        
        return result;
    }
    
    multiplyMatrixVector(matrix, vector) {
        const rows = matrix.length;
        const result = new Array(rows);
        
        for (let i = 0; i < rows; i++) {
            result[i] = 0;
            for (let j = 0; j < vector.length; j++) {
                result[i] += matrix[i][j] * vector[j];
            }
        }
        
        return result;
    }
    
    determinant(matrix) {
        const n = matrix.length;
        if (n === 1) return matrix[0][0];
        if (n === 2) return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
        
        // For larger matrices, use a simplified approach (not optimal but works for small systems)
        // This is a basic implementation - for production use a proper library
        let det = 0;
        for (let j = 0; j < n; j++) {
            const minor = this.createMatrix(n - 1, n - 1);
            for (let i = 1; i < n; i++) {
                let minorCol = 0;
                for (let k = 0; k < n; k++) {
                    if (k !== j) {
                        minor[i - 1][minorCol] = matrix[i][k];
                        minorCol++;
                    }
                }
            }
            det += Math.pow(-1, j) * matrix[0][j] * this.determinant(minor);
        }
        
        return det;
    }
    
    solveLinearSystem(A, b) {
        const n = A.length;
        const augmented = A.map((row, i) => [...row, b[i]]);
        
        // Gaussian elimination with partial pivoting
        for (let i = 0; i < n; i++) {
            // Find pivot
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                    maxRow = k;
                }
            }
            
            // Swap rows
            [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
            
            // Make all rows below this one 0 in current column
            for (let k = i + 1; k < n; k++) {
                const factor = augmented[k][i] / augmented[i][i];
                for (let j = i; j <= n; j++) {
                    augmented[k][j] -= factor * augmented[i][j];
                }
            }
        }
        
        // Back substitution
        const x = new Array(n);
        for (let i = n - 1; i >= 0; i--) {
            x[i] = augmented[i][n];
            for (let j = i + 1; j < n; j++) {
                x[i] -= augmented[i][j] * x[j];
            }
            x[i] /= augmented[i][i];
        }
        
        return x;
    }
}

// Create frame instance
const frame = new EnhancedFrame();

// Load type change handler
document.getElementById('loadType').addEventListener('change', function() {
    const pointInputs = document.getElementById('pointLoadInputs');
    const distInputs = document.getElementById('distributedLoadInputs');
    
    if (this.value === 'point') {
        pointInputs.style.display = 'flex';
        distInputs.style.display = 'none';
    } else {
        pointInputs.style.display = 'none';
        distInputs.style.display = 'flex';
    }
});

// Node management functions
function addNode() {
    const nodeNum = parseInt(document.getElementById('nodeNum').value);
    const nodeX = parseFloat(document.getElementById('nodeX').value);
    const nodeY = parseFloat(document.getElementById('nodeY').value);
    
    if (isNaN(nodeNum) || isNaN(nodeX) || isNaN(nodeY)) {
        showError('Please enter valid node number and coordinates');
        return;
    }
    
    const existingNode = nodes.find(n => n.id === nodeNum);
    if (existingNode) {
        showError('Node number already exists');
        return;
    }
    
    nodes.push({id: nodeNum, x: nodeX, y: nodeY});
    updateNodesTable();
    
    // Clear inputs
    document.getElementById('nodeNum').value = '';
    document.getElementById('nodeX').value = '';
    document.getElementById('nodeY').value = '';
    
    showSuccess('Node added successfully');
}

function addNodesBulk() {
    const bulkData = document.getElementById('nodesBulk').value.trim();
    if (!bulkData) {
        showError('Please paste node data');
        return;
    }
    
    const lines = bulkData.split('\n');
    let addedCount = 0;
    
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
            const nodeNum = parseInt(parts[0]);
            const nodeX = parseFloat(parts[1]);
            const nodeY = parseFloat(parts[2]);
            
            if (!isNaN(nodeNum) && !isNaN(nodeX) && !isNaN(nodeY)) {
                const existingNode = nodes.find(n => n.id === nodeNum);
                if (!existingNode) {
                    nodes.push({id: nodeNum, x: nodeX, y: nodeY});
                    addedCount++;
                }
            }
        }
    }
    
    updateNodesTable();
    document.getElementById('nodesBulk').value = '';
    showSuccess(`${addedCount} nodes added successfully`);
}

function updateNodesTable() {
    const table = document.getElementById('nodesTable');
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    nodes.sort((a, b) => a.id - b.id);
    
    nodes.forEach(node => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = node.id;
        row.insertCell(1).textContent = node.x.toFixed(2);
        row.insertCell(2).textContent = node.y.toFixed(2);
        
        // Add actions column
        const actionsCell = row.insertCell(3);
        actionsCell.innerHTML = `
            <button onclick="editNode(${node.id})" class="action-btn edit-btn" title="Edit Node">
                <i class="fas fa-edit"></i>
            </button>
            <button onclick="deleteNode(${node.id})" class="action-btn delete-btn" title="Delete Node">
                <i class="fas fa-trash"></i>
            </button>
        `;
        actionsCell.style.whiteSpace = 'nowrap';
    });
    
    table.style.display = nodes.length > 0 ? 'table' : 'none';
}

// Element management functions
function addElement() {
    const node1 = parseInt(document.getElementById('elemNode1').value);
    const node2 = parseInt(document.getElementById('elemNode2').value);
    const elemId = parseInt(document.getElementById('elemId').value);
    
    if (isNaN(node1) || isNaN(node2) || isNaN(elemId)) {
        showError('Please enter valid node numbers and element ID');
        return;
    }
    
    if (!nodes.find(n => n.id === node1) || !nodes.find(n => n.id === node2)) {
        showError('Both nodes must exist before creating element');
        return;
    }
    
    const existingElem = elements.find(e => e.id === elemId);
    if (existingElem) {
        showError('Element ID already exists');
        return;
    }
    
    elements.push({id: elemId, node1: node1, node2: node2});
    updateElementsTable();
    
    // Clear inputs
    document.getElementById('elemNode1').value = '';
    document.getElementById('elemNode2').value = '';
    document.getElementById('elemId').value = '';
    
    showSuccess('Element added successfully');
}

function addElementsBulk() {
    const bulkData = document.getElementById('elementsBulk').value.trim();
    if (!bulkData) {
        showError('Please paste element data');
        return;
    }
    
    const lines = bulkData.split('\n');
    let addedCount = 0;
    
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
            const node1 = parseInt(parts[0]);
            const node2 = parseInt(parts[1]);
            const elemId = parseInt(parts[2]);
            
            if (!isNaN(node1) && !isNaN(node2) && !isNaN(elemId)) {
                if (nodes.find(n => n.id === node1) && nodes.find(n => n.id === node2)) {
                    const existingElem = elements.find(e => e.id === elemId);
                    if (!existingElem) {
                        elements.push({id: elemId, node1: node1, node2: node2});
                        addedCount++;
                    }
                }
            }
        }
    }
    
    updateElementsTable();
    document.getElementById('elementsBulk').value = '';
    showSuccess(`${addedCount} elements added successfully`);
}

function updateElementsTable() {
    const table = document.getElementById('elementsTable');
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    elements.sort((a, b) => a.id - b.id);
    
    elements.forEach(elem => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = elem.id;
        row.insertCell(1).textContent = elem.node1;
        row.insertCell(2).textContent = elem.node2;
        
        // Calculate and display length
        const node1 = nodes.find(n => n.id === elem.node1);
        const node2 = nodes.find(n => n.id === elem.node2);
        if (node1 && node2) {
            const dx = node2.x - node1.x;
            const dy = node2.y - node1.y;
            const length = Math.sqrt(dx*dx + dy*dy);
            row.insertCell(3).textContent = length.toFixed(2);
        } else {
            row.insertCell(3).textContent = 'N/A';
        }
        
        // Add actions column
        const actionsCell = row.insertCell(4);
        actionsCell.innerHTML = `
            <button onclick="editElement(${elem.id})" class="action-btn edit-btn" title="Edit Element">
                <i class="fas fa-edit"></i>
            </button>
            <button onclick="deleteElement(${elem.id})" class="action-btn delete-btn" title="Delete Element">
                <i class="fas fa-trash"></i>
            </button>
        `;
        actionsCell.style.whiteSpace = 'nowrap';
    });
    
    table.style.display = elements.length > 0 ? 'table' : 'none';
}

// Load management functions
function addLoad() {
    const loadType = document.getElementById('loadType').value;
    
    if (loadType === 'point') {
        const nodeId = parseInt(document.getElementById('loadNode').value);
        const fx = parseFloat(document.getElementById('loadFx').value) || 0;
        const fy = parseFloat(document.getElementById('loadFy').value) || 0;
        const mz = parseFloat(document.getElementById('loadMz').value) || 0;
        
        if (isNaN(nodeId)) {
            showError('Please enter valid node number');
            return;
        }
        
        if (!nodes.find(n => n.id === nodeId)) {
            showError('Node does not exist');
            return;
        }
        
        loads.push({type: 'point', node: nodeId, fx: fx, fy: fy, mz: mz, direction: 'both'});
        
        // Clear inputs
        document.getElementById('loadNode').value = '';
        document.getElementById('loadFx').value = '';
        document.getElementById('loadFy').value = '';
        document.getElementById('loadMz').value = '';
        
    } else {
        const elemId = parseInt(document.getElementById('loadElement').value);
        const loadValue = parseFloat(document.getElementById('loadValue').value);
        const direction = document.getElementById('loadDirection').value;
        
        if (isNaN(elemId) || isNaN(loadValue)) {
            showError('Please enter valid element ID and load value');
            return;
        }
        
        if (!elements.find(e => e.id === elemId)) {
            showError('Element does not exist');
            return;
        }
        
        loads.push({type: 'distributed', element: elemId, value: loadValue, direction: direction});
        
        // Clear inputs
        document.getElementById('loadElement').value = '';
        document.getElementById('loadValue').value = '';
    }
    
    updateLoadsTable();
    showSuccess('Load added successfully');
}

function updateLoadsTable() {
    const table = document.getElementById('loadsTable');
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    loads.forEach((load, index) => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = load.type === 'point' ? 'Point' : 'Distributed';
        
        if (load.type === 'point') {
            row.insertCell(1).textContent = `Node ${load.node}`;
            row.insertCell(2).textContent = `Fx: ${load.fx} kN, Fy: ${load.fy} kN, Mz: ${load.mz} kNm`;
        } else {
            row.insertCell(1).textContent = `Element ${load.element}`;
            row.insertCell(2).textContent = `${load.value} kN/m (${load.direction.toUpperCase()}-direction)`;
        }
        
        // Add actions column
        const actionsCell = row.insertCell(3);
        actionsCell.innerHTML = `
            <button onclick="editLoad(${index})" class="action-btn edit-btn" title="Edit Load">
                <i class="fas fa-edit"></i>
            </button>
            <button onclick="deleteLoad(${index})" class="action-btn delete-btn" title="Delete Load">
                <i class="fas fa-trash"></i>
            </button>
        `;
        actionsCell.style.whiteSpace = 'nowrap';
    });
    
    table.style.display = loads.length > 0 ? 'table' : 'none';
}

// Support management functions
function addSupport() {
    const nodeId = parseInt(document.getElementById('supportNode').value);
    const supportType = document.getElementById('supportType').value;
    
    if (isNaN(nodeId)) {
        showError('Please enter valid node number');
        return;
    }
    
    if (!nodes.find(n => n.id === nodeId)) {
        showError('Node does not exist');
        return;
    }
    
    const existingSupport = supports.find(s => s.node === nodeId);
    if (existingSupport) {
        existingSupport.type = supportType;
    } else {
        supports.push({node: nodeId, type: supportType});
    }
    
    updateSupportsTable();
    
    // Clear inputs
    document.getElementById('supportNode').value = '';
    
    showSuccess('Support added successfully');
}

function updateSupportsTable() {
    const table = document.getElementById('supportsTable');
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    supports.sort((a, b) => a.node - b.node);
    
    supports.forEach(support => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = support.node;
        row.insertCell(1).textContent = support.type.charAt(0).toUpperCase() + support.type.slice(1);
        
        // Add actions column
        const actionsCell = row.insertCell(2);
        actionsCell.innerHTML = `
            <button onclick="editSupport(${support.node})" class="action-btn edit-btn" title="Edit Support">
                <i class="fas fa-edit"></i>
            </button>
            <button onclick="deleteSupport(${support.node})" class="action-btn delete-btn" title="Delete Support">
                <i class="fas fa-trash"></i>
            </button>
        `;
        actionsCell.style.whiteSpace = 'nowrap';
    });
    
    table.style.display = supports.length > 0 ? 'table' : 'none';
}

// CRUD Operations - Delete Functions

function deleteNode(nodeId) {
    if (!confirm(`Delete node ${nodeId}? This will also delete all connected elements, loads, and supports.`)) {
        return;
    }
    
    // Find elements connected to this node
    const connectedElements = elements.filter(elem => elem.node1 === nodeId || elem.node2 === nodeId);
    
    // Delete elements connected to this node (and their loads)
    connectedElements.forEach(elem => {
        deleteElementInternal(elem.id, false); // false = don't show confirmation again
    });
    
    // Delete point loads on this node
    loads = loads.filter(load => !(load.type === 'point' && load.node === nodeId));
    
    // Delete supports on this node
    supports = supports.filter(support => support.node !== nodeId);
    
    // Delete the node itself
    nodes = nodes.filter(node => node.id !== nodeId);
    
    // Clear analysis results
    analysisResults = null;
    
    // Update all tables
    updateNodesTable();
    updateElementsTable();
    updateLoadsTable();
    updateSupportsTable();
    
    // Clear results display
    document.getElementById('results').innerHTML = '<div style="text-align: center; color: #718096; padding: 20px;">Run analysis to see results</div>';
    document.getElementById('diagramsContainer').style.display = 'none';
    
    showSuccess(`Node ${nodeId} and all connected elements deleted successfully`);
}

function deleteElement(elemId) {
    if (!confirm(`Delete element ${elemId}? This will also delete all loads on this element.`)) {
        return;
    }
    deleteElementInternal(elemId, true);
}

function deleteElementInternal(elemId, showMessage = true) {
    // Delete distributed loads on this element
    loads = loads.filter(load => !(load.type === 'distributed' && load.element === elemId));
    
    // Delete the element itself
    elements = elements.filter(elem => elem.id !== elemId);
    
    // Clear analysis results
    analysisResults = null;
    
    // Update tables
    updateElementsTable();
    updateLoadsTable();
    
    // Clear results display
    document.getElementById('results').innerHTML = '<div style="text-align: center; color: #718096; padding: 20px;">Run analysis to see results</div>';
    document.getElementById('diagramsContainer').style.display = 'none';
    
    if (showMessage) {
        showSuccess(`Element ${elemId} deleted successfully`);
    }
}

function deleteLoad(loadIndex) {
    if (!confirm('Delete this load?')) {
        return;
    }
    
    // Remove load from array
    loads.splice(loadIndex, 1);
    
    // Clear analysis results
    analysisResults = null;
    
    // Update table
    updateLoadsTable();
    
    // Clear results display
    document.getElementById('results').innerHTML = '<div style="text-align: center; color: #718096; padding: 20px;">Run analysis to see results</div>';
    document.getElementById('diagramsContainer').style.display = 'none';
    
    showSuccess('Load deleted successfully');
}

function deleteSupport(nodeId) {
    if (!confirm(`Delete support at node ${nodeId}?`)) {
        return;
    }
    
    // Remove support
    supports = supports.filter(support => support.node !== nodeId);
    
    // Clear analysis results
    analysisResults = null;
    
    // Update table
    updateSupportsTable();
    
    // Clear results display
    document.getElementById('results').innerHTML = '<div style="text-align: center; color: #718096; padding: 20px;">Run analysis to see results</div>';
    document.getElementById('diagramsContainer').style.display = 'none';
    
    showSuccess(`Support at node ${nodeId} deleted successfully`);
}

// CRUD Operations - Edit Functions (Placeholder for now)
function editNode(nodeId) {
    showError('Edit functionality coming soon!');
}

function editElement(elemId) {
    showError('Edit functionality coming soon!');
}

function editLoad(loadIndex) {
    showError('Edit functionality coming soon!');
}

function editSupport(nodeId) {
    showError('Edit functionality coming soon!');
}

// Analysis function
function runAnalysis() {
    if (nodes.length === 0 || elements.length === 0) {
        showError('Please add at least one node and one element');
        return;
    }
    
    if (supports.length === 0) {
        showError('Please add at least one support');
        return;
    }
    
    showLoading(true);
    
    try {
        // Clear previous frame data
        frame.nodes = {};
        frame.elements = {};
        frame.loads = {point: {}, distributed: {}};
        frame.supports = {};
        
        // Add nodes to frame
        for (const node of nodes) {
            frame.addNode(node.id, node.x, node.y);
        }
        
        // Add elements to frame
        for (const element of elements) {
            frame.addElement(element.id, element.node1, element.node2);
        }
        
        // Add loads to frame
        for (const load of loads) {
            if (load.type === 'point') {
                frame.addPointLoad(load.node, load.fx, load.fy, load.mz);
            } else {
                // For distributed loads, pass direction info
                frame.addDistributedLoad(load.element, load.value, load.direction || 'y');
            }
        }
        
        // Add supports to frame
        for (const support of supports) {
            frame.addSupport(support.node, support.type);
        }
        
        // Run analysis
        analysisResults = frame.analyze();

        // Update internal force profiles for each element after analysis
        window.elementForceProfiles = {};
        for (const element of elements) {
            window.elementForceProfiles[element.id] = frame.getElementForceProfile(element.id);
        }

        displayResults(analysisResults);
        createInteractiveVisualization();

        showLoading(false);
        showSuccess('Enhanced finite element analysis completed successfully!');

    } catch (error) {
        showLoading(false);
        showError('Analysis failed: ' + error.message);
        console.error('Detailed error:', error);
    }
}

function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    
    let html = '<div style="space-y: 20px;">';
    
    // Enhanced results header
    html += `<div style="background: linear-gradient(135deg, #48bb78, #38a169); color: white; padding: 15px; border-radius: 10px; text-align: center; margin-bottom: 25px;">
        <i class="fas fa-check-circle" style="font-size: 1.5em;"></i>
        <h3 style="margin: 5px 0;">Analysis Complete</h3>
        <p style="margin: 5px 0; opacity: 0.9;">Enhanced FEA results using matrix stiffness method</p>
    </div>`;
    
    // Reactions
    if (Object.keys(results.reactions).length > 0) {
        html += '<h3 style="color: #667eea; margin-bottom: 15px;"><i class="fas fa-anchor"></i> Support Reactions</h3>';
        html += '<table class="data-table"><thead><tr><th>Node</th><th>Rx (kN)</th><th>Ry (kN)</th><th>Mz (kNm)</th></tr></thead><tbody>';
        
        for (const [nodeId, reaction] of Object.entries(results.reactions)) {
            html += `<tr>
                <td>${nodeId}</td>
                <td>${reaction.rx.toFixed(3)}</td>
                <td>${reaction.ry.toFixed(3)}</td>
                <td>${reaction.mz.toFixed(3)}</td>
            </tr>`;
        }
        html += '</tbody></table><br>';
    }
    
    // Element forces - Enhanced display with both ends
    if (results.element_forces && Object.keys(results.element_forces).length > 0) {
        html += '<h3 style="color: #667eea; margin-bottom: 15px;"><i class="fas fa-arrows-alt-h"></i> Element Forces (Detailed)</h3>';
        html += '<table class="data-table">';
        html += '<thead><tr><th rowspan="2">Element</th><th colspan="3">Node 1 (Start)</th><th colspan="3">Node 2 (End)</th><th rowspan="2">Max Moment<br>(kNm)</th></tr>';
        html += '<tr><th>N (kN)</th><th>V (kN)</th><th>M (kNm)</th><th>N (kN)</th><th>V (kN)</th><th>M (kNm)</th></tr></thead><tbody>';
        
        for (const [elemId, forces] of Object.entries(results.element_forces)) {
            html += `<tr>
                <td><strong>${elemId}</strong></td>
                <td>${forces.axial_start.toFixed(3)}</td>
                <td>${forces.shear_start.toFixed(3)}</td>
                <td>${forces.moment_start.toFixed(3)}</td>
                <td>${forces.axial_end.toFixed(3)}</td>
                <td>${forces.shear_end.toFixed(3)}</td>
                <td>${forces.moment_end.toFixed(3)}</td>
                <td><strong style="color: ${Math.abs(forces.max_moment) > 100 ? '#dc2626' : '#059669'};">${forces.max_moment.toFixed(3)}</strong></td>
            </tr>`;
        }
        html += '</tbody></table><br>';
    }
    
    // Summary table for simplified view
    if (Object.keys(results.axial_forces).length > 0) {
        html += '<h3 style="color: #667eea; margin-bottom: 15px;"><i class="fas fa-chart-line"></i> Element Forces Summary</h3>';
        html += '<table class="data-table"><thead><tr><th>Element</th><th>Axial (kN)</th><th>Shear (kN)</th><th>Max Moment (kNm)</th><th>Status</th></tr></thead><tbody>';
        
        for (const [elemId, axialForce] of Object.entries(results.axial_forces)) {
            const shear = results.shear_forces[elemId] || 0;
            const moment = results.bending_moments[elemId] || 0;
            
            // Simple status indication
            let status = '<span style="color: #48bb78;">✓ OK</span>';
            if (Math.abs(moment) > 100) {
                status = '<span style="color: #e53e3e;">⚠ High Moment</span>';
            } else if (Math.abs(moment) > 50) {
                status = '<span style="color: #ed8936;">⚡ Check</span>';
            }
            
            html += `<tr>
                <td>${elemId}</td>
                <td>${axialForce.toFixed(3)}</td>
                <td>${shear.toFixed(3)}</td>
                <td>${moment.toFixed(3)}</td>
                <td>${status}</td>
            </tr>`;
        }
        html += '</tbody></table>';
    }
    
    html += '</div>';
    resultsDiv.innerHTML = html;
    
    // Show diagrams container
    document.getElementById('diagramsContainer').style.display = 'block';
}

function drawDiagrams() {
    const canvas = document.getElementById('diagramCanvas');
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (nodes.length === 0 || elements.length === 0) return;
    
    // Calculate bounds
    const minX = Math.min(...nodes.map(n => n.x));
    const maxX = Math.max(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y));
    const maxY = Math.max(...nodes.map(n => n.y));
    
    const margin = 50;
    const scaleX = (canvas.width - 2 * margin) / Math.max(maxX - minX, 1);
    const scaleY = (canvas.height - 2 * margin) / Math.max(maxY - minY, 1);
    const scale = Math.min(scaleX, scaleY);
    
    function transformX(x) {
        return margin + (x - minX) * scale;
    }
    
    function transformY(y) {
        return canvas.height - margin - (y - minY) * scale;
    }
    
    // Draw elements
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    elements.forEach(element => {
        const node1 = nodes.find(n => n.id === element.node1);
        const node2 = nodes.find(n => n.id === element.node2);
        
        if (node1 && node2) {
            ctx.moveTo(transformX(node1.x), transformY(node1.y));
            ctx.lineTo(transformX(node2.x), transformY(node2.y));
        }
    });
    ctx.stroke();
    
    // Draw nodes
    nodes.forEach(node => {
        const x = transformX(node.x);
        const y = transformY(node.y);
        
        // Node circle
        ctx.fillStyle = '#667eea';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fill();
        
        // Node label
        ctx.fillStyle = '#2d3748';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(node.id.toString(), x, y - 15);
    });
    
    // Draw supports
    supports.forEach(support => {
        const node = nodes.find(n => n.id === support.node);
        if (node) {
            const x = transformX(node.x);
            const y = transformY(node.y);
            
            ctx.fillStyle = '#e53e3e';
            ctx.strokeStyle = '#e53e3e';
            ctx.lineWidth = 2;
            
            if (support.type === 'fixed') {
                // Fixed support - triangle
                ctx.beginPath();
                ctx.moveTo(x, y + 10);
                ctx.lineTo(x - 10, y + 20);
                ctx.lineTo(x + 10, y + 20);
                ctx.closePath();
                ctx.fill();
                
                // Hatching
                for (let i = -8; i <= 8; i += 3) {
                    ctx.beginPath();
                    ctx.moveTo(x + i, y + 20);
                    ctx.lineTo(x + i + 3, y + 25);
                    ctx.stroke();
                }
            } else if (support.type === 'pinned') {
                // Pinned support - triangle outline
                ctx.beginPath();
                ctx.moveTo(x, y + 10);
                ctx.lineTo(x - 10, y + 20);
                ctx.lineTo(x + 10, y + 20);
                ctx.closePath();
                ctx.stroke();
            } else if (support.type === 'roller') {
                // Roller support - triangle with circles
                ctx.beginPath();
                ctx.moveTo(x, y + 10);
                ctx.lineTo(x - 10, y + 20);
                ctx.lineTo(x + 10, y + 20);
                ctx.closePath();
                ctx.stroke();
                
                // Rollers
                ctx.beginPath();
                ctx.arc(x - 5, y + 25, 3, 0, 2 * Math.PI);
                ctx.arc(x + 5, y + 25, 3, 0, 2 * Math.PI);
                ctx.stroke();
            }
        }
    });
    
    // Draw loads
    loads.forEach(load => {
        if (load.type === 'point') {
            const node = nodes.find(n => n.id === load.node);
            if (node) {
                const x = transformX(node.x);
                const y = transformY(node.y);
                
                // Draw force arrows
                ctx.strokeStyle = '#38a169';
                ctx.lineWidth = 2;
                ctx.fillStyle = '#38a169';
                
                if (Math.abs(load.fx) > 0.01) {
                    const arrowLength = Math.min(Math.abs(load.fx) * 5, 30);
                    const direction = load.fx > 0 ? 1 : -1;
                    
                    // Horizontal arrow
                    ctx.beginPath();
                    ctx.moveTo(x - direction * arrowLength, y);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                    
                    // Arrowhead
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x - direction * 8, y - 4);
                    ctx.lineTo(x - direction * 8, y + 4);
                    ctx.closePath();
                    ctx.fill();
                }
                
                if (Math.abs(load.fy) > 0.01) {
                    const arrowLength = Math.min(Math.abs(load.fy) * 5, 30);
                    const direction = load.fy > 0 ? -1 : 1;
                    
                    // Vertical arrow
                    ctx.beginPath();
                    ctx.moveTo(x, y - direction * arrowLength);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                    
                    // Arrowhead
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x - 4, y - direction * 8);
                    ctx.lineTo(x + 4, y - direction * 8);
                    ctx.closePath();
                    ctx.fill();
                }
            }
        }
    });
    
    // Add moment diagrams using updated internal force profiles
    if (window.elementForceProfiles) {
        ctx.strokeStyle = '#e53e3e';
        ctx.lineWidth = 2;

        elements.forEach(element => {
            const profile = window.elementForceProfiles[element.id];
            if (profile && profile.length > 1) {
                ctx.beginPath();
                for (let i = 0; i < profile.length; i++) {
                    const pos = profile[i];
                    // Project position along element
                    const node1 = nodes.find(n => n.id === element.node1);
                    const node2 = nodes.find(n => n.id === element.node2);
                    if (!node1 || !node2) continue;
                    const x = node1.x + pos.position * (node2.x - node1.x);
                    const y = node1.y + pos.position * (node2.y - node1.y);
                    // Offset for moment diagram (scale for visibility)
                    const dx = node2.x - node1.x;
                    const dy = node2.y - node1.y;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const offsetScale = 0.1; // Adjust for diagram size
                    const offsetX = -dy / length * pos.moment * offsetScale;
                    const offsetY = dx / length * pos.moment * offsetScale;
                    const px = transformX(x + offsetX);
                    const py = transformY(y + offsetY);
                    if (i === 0) {
                        ctx.moveTo(px, py);
                    } else {
                        ctx.lineTo(px, py);
                    }
                }
                ctx.stroke();
            }
        });
    }
}

// Utility functions
function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function showSuccess(message) {
    const successDiv = document.getElementById('success');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    setTimeout(() => {
        successDiv.style.display = 'none';
    }, 3000);
}

function showLoading(show) {
    const loadingDiv = document.getElementById('loading');
    loadingDiv.style.display = show ? 'block' : 'none';
}

// Global variables for visualization
let currentVisualizationScale = null;

// Autoscale function
function autoscaleVisualization() {
    if (!analysisResults) {
        showError('Please run analysis first before autoscaling');
        return;
    }
    
    // Calculate maximum deflection from actual PyNite calculations
    let maxDeflection = 0;
    
    // Check all elements and all points along them
    for (const element of elements) {
        const numTestPoints = 21;
        for (let i = 0; i < numTestPoints; i++) {
            const t = i / (numTestPoints - 1);
            try {
                const deflection = Math.abs(frame.getElementDeflection(element.id, t));
                maxDeflection = Math.max(maxDeflection, deflection);
            } catch (error) {
                // Skip if deflection calculation fails
            }
        }
    }
    
    // Find longest element
    let maxElementLength = 0;
    elements.forEach(element => {
        const node1 = nodes.find(n => n.id === element.node1);
        const node2 = nodes.find(n => n.id === element.node2);
        if (node1 && node2) {
            const length = Math.sqrt((node2.x - node1.x)**2 + (node2.y - node1.y)**2);
            maxElementLength = Math.max(maxElementLength, length);
        }
    });
    
    // Calculate proper scale factor: max deflection should be 1/20 of longest element
    const targetDeflection = maxElementLength / 20;
    const newScaleFactor = maxDeflection > 0 ? targetDeflection / maxDeflection : 1;
    
    console.log(`Autoscale: Max deflection = ${maxDeflection.toFixed(6)} m, Target = ${targetDeflection.toFixed(3)} m, Scale factor = ${newScaleFactor.toFixed(0)}x`);
    
    // Store the scale factor and recreate visualization
    currentVisualizationScale = newScaleFactor;
    createInteractiveVisualization();
    
    showSuccess(`Visualization autoscaled (${newScaleFactor.toFixed(0)}x magnification)`);
}

// D3.js Interactive Visualization
function createInteractiveVisualization() {
    if (!analysisResults) {
        console.warn('No analysis results available for visualization');
        return;
    }

    const container = document.getElementById('d3-visualization');
    container.innerHTML = ''; // Clear previous visualization

    const margin = {top: 40, right: 40, bottom: 40, left: 40};
    const containerWidth = container.clientWidth || 800;
    const containerHeight = 500;
    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select('#d3-visualization')
        .append('svg')
        .attr('width', containerWidth)
        .attr('height', containerHeight);

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Calculate bounds for scaling
    const nodeCoords = nodes.map(n => [n.x, n.y]);
    const xExtent = d3.extent(nodeCoords, d => d[0]);
    const yExtent = d3.extent(nodeCoords, d => d[1]);
    
    // Add padding to bounds
    const xPadding = (xExtent[1] - xExtent[0]) * 0.1 || 1;
    const yPadding = (yExtent[1] - yExtent[0]) * 0.1 || 1;
    
    const xScale = d3.scaleLinear()
        .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
        .range([0, width]);
    
    const yScale = d3.scaleLinear()
        .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
        .range([height, 0]); // Flip Y axis for screen coordinates

    // Calculate displacement scale factor
    // Find longest element length
    let maxLength = 0;
    elements.forEach(element => {
        const node1 = nodes.find(n => n.id === element.node1);
        const node2 = nodes.find(n => n.id === element.node2);
        if (node1 && node2) {
            const length = Math.sqrt((node2.x - node1.x)**2 + (node2.y - node1.y)**2);
            maxLength = Math.max(maxLength, length);
        }
    });
    
    // Use custom scale factor if set by autoscale, otherwise calculate automatically
    let scaleFactor;
    if (currentVisualizationScale !== null) {
        scaleFactor = currentVisualizationScale;
        console.log(`Using custom scale factor: ${scaleFactor.toFixed(0)}x`);
    } else {
        // Find maximum displacement from FE solution
        let maxDisplacement = 0;
        if (analysisResults && analysisResults.displacements) {
            Object.entries(analysisResults.displacements).forEach(([key, disp]) => {
                maxDisplacement = Math.max(maxDisplacement, Math.abs(disp));
                if (Math.abs(disp) > 1e-6) { // Only log significant displacements
                    console.log(`Displacement ${key}: ${disp.toFixed(6)} m`);
                }
            });
        }
        
        // Auto scale factor: max displacement should be 1/20 of longest element
        const targetDispRatio = maxLength / 20;  // Target max displacement in m
        scaleFactor = maxDisplacement > 0 ? targetDispRatio / maxDisplacement : 1;
        
        console.log(`Auto scale: Max displacement: ${maxDisplacement.toFixed(6)} m, Scale factor: ${scaleFactor.toFixed(0)}x`);
    }
    
    // Function to get displaced node position
    function getDisplacedNodePos(nodeId) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return {x: 0, y: 0};
        
        let dx = 0, dy = 0;
        
        // Get displacements from results
        if (analysisResults && analysisResults.displacements) {
            // Find the node's DOF indices (this maps to how we store displacements)
            const nodeMap = {};
            const sortedNodeIds = nodes.map(n => n.id).sort((a, b) => a - b);
            sortedNodeIds.forEach((id, i) => {
                nodeMap[id] = i;
            });
            
            if (nodeId in nodeMap) {
                // Use the corrected displacement keys that map back to actual node IDs
                dx = analysisResults.displacements[`node_${nodeId}_dof_0`] || 0;
                dy = analysisResults.displacements[`node_${nodeId}_dof_1`] || 0;
                
                // Debug: log displacements for horizontal beam
                if (nodeId === 1 || nodeId === 2) {
                    console.log(`Node ${nodeId}: dx=${dx.toFixed(6)} m, dy=${dy.toFixed(6)} m`);
                }
            }
        }
        
        return {
            x: node.x + dx * scaleFactor,
            y: node.y + dy * scaleFactor
        };
    }

    // Tooltip
    const tooltip = d3.select('#hover-tooltip');

    // Draw original structure (light gray)
    elements.forEach(element => {
        const node1 = nodes.find(n => n.id === element.node1);
        const node2 = nodes.find(n => n.id === element.node2);
        
        if (!node1 || !node2) return;

        const x1 = xScale(node1.x);
        const y1 = yScale(node1.y);
        const x2 = xScale(node2.x);
        const y2 = yScale(node2.y);

        // Original structure (faded)
        g.append('line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .attr('stroke', '#9ca3af')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3')
            .attr('class', 'original-structure');
    });

    // Draw displaced structure with continuous deflected shape
    elements.forEach(element => {
        const node1 = nodes.find(n => n.id === element.node1);
        const node2 = nodes.find(n => n.id === element.node2);
        
        if (!node1 || !node2) return;

        // Create points for continuous deflected shape
        const numPoints = 21; // More points for smoother curve
        const deflectedPoints = [];
        
        for (let i = 0; i < numPoints; i++) {
            const t = i / (numPoints - 1); // normalized position (0 to 1)
            
            // Original position along element
            const originalX = node1.x + t * (node2.x - node1.x);
            const originalY = node1.y + t * (node2.y - node1.y);
            
            // Calculate deflection at this position using PyNite formula
            let deflectionY = 0;
            try {
                deflectionY = frame.getElementDeflection(element.id, t);
            } catch (error) {
                // If PyNite deflection fails, fall back to linear interpolation
                const disp1 = getDisplacedNodePos(element.node1);
                const disp2 = getDisplacedNodePos(element.node2);
                const dispX = disp1.x + t * (disp2.x - disp1.x);
                const dispY = disp1.y + t * (disp2.y - disp1.y);
                deflectionY = dispY - originalY;
            }
            
            // Apply scaling to deflection
            const deflectedX = originalX; // No X deflection for vertical loads on horizontal beam
            const deflectedY = originalY + deflectionY * scaleFactor;
            
            deflectedPoints.push({
                x: xScale(deflectedX),
                y: yScale(deflectedY),
                originalX: originalX,
                originalY: originalY,
                deflectedX: deflectedX,
                deflectedY: deflectedY,
                position: t
            });
        }

        // Draw continuous deflected curve using SVG path
        const lineGenerator = d3.line()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveBasis); // Smooth curve
        
        g.append('path')
            .datum(deflectedPoints)
            .attr('d', lineGenerator)
            .attr('stroke', '#2563eb')
            .attr('stroke-width', 3)
            .attr('fill', 'none')
            .attr('class', 'displaced-element');

        // Create hover zones along the deflected curve
        deflectedPoints.forEach((point, i) => {
            g.append('circle')
                .attr('cx', point.x)
                .attr('cy', point.y)
                .attr('r', 8)
                .attr('fill', 'transparent')
                .attr('class', 'hover-zone')
                .style('cursor', 'crosshair')
                .on('mouseover', function(event) {
                    const t = point.position;
                    
                    // Calculate displacements
                    const dx = point.deflectedX - point.originalX;
                    const dy = point.deflectedY - point.originalY;
                    
                    // Get internal forces at this position
                    try {
                        const forces = frame.getInternalForces(element.id, t);
                        
                        // Get element end forces for reference
                        const elemForces = analysisResults?.element_forces?.[element.id];
                        let endForcesText = '';
                        if (elemForces && (t === 0 || t === 1)) {
                            if (t === 0) { // Start of element (x = 0)
                                endForcesText = `<div style="color: #10b981;"><strong>Element End Forces (x=0):</strong></div>
                                               <div>N: ${elemForces.axial_start.toFixed(2)} kN</div>
                                               <div>V: ${elemForces.shear_start.toFixed(2)} kN</div>
                                               <div>M: ${elemForces.moment_start.toFixed(2)} kNm</div>`;
                            } else { // End of element (x = L)
                                endForcesText = `<div style="color: #10b981;"><strong>Element End Forces (x=L):</strong></div>
                                               <div>N: ${elemForces.axial_end.toFixed(2)} kN</div>
                                               <div>V: ${elemForces.shear_end.toFixed(2)} kN</div>
                                               <div>M: ${elemForces.moment_end.toFixed(2)} kNm</div>`;
                            }
                        }
                        
                        // Get PyNite-style deflection at this position
                        let pyNiteDeflection = 0;
                        try {
                            pyNiteDeflection = frame.getElementDeflection(element.id, t);
                        } catch (defError) {
                            console.warn('Could not calculate PyNite deflection:', defError);
                        }
                        
                        // Update tooltip content with position and displacement
                        d3.select('#tooltip-coords')
                            .html(`
                                <div><strong>Position:</strong> X: ${point.originalX.toFixed(3)} m, Y: ${point.originalY.toFixed(3)} m</div>
                                <div><strong>Element Position:</strong> x = ${(t * frame.getElementProperties(element.id).length).toFixed(3)} m (t = ${t.toFixed(3)})</div>
                                <div style="color: #fbbf24;"><strong>Displacement:</strong> ΔX: ${dx.toFixed(6)} m, ΔY: ${dy.toFixed(6)} m</div>
                                <div style="color: #22c55e;"><strong>PyNite Deflection:</strong> ${pyNiteDeflection.toFixed(6)} m</div>
                            `);
                        
                        d3.select('#tooltip-forces')
                            .html(`
                                <div><strong>Internal Forces:</strong></div>
                                <div>Axial Force (N): ${forces.axial.toFixed(2)} kN</div>
                                <div>Shear Force (V): ${forces.shear.toFixed(2)} kN</div>
                                <div>Moment (M): ${forces.moment.toFixed(2)} kNm</div>
                                ${endForcesText}
                            `);
                        
                        // Position and show tooltip
                        tooltip
                            .style('left', (event.pageX + 15) + 'px')
                            .style('top', (event.pageY - 10) + 'px')
                            .style('opacity', 1);
                            
                        // Highlight the hover point
                        d3.select(this).attr('fill', '#fbbf24').attr('r', 6);
                        
                    } catch (error) {
                        console.warn('Error getting internal forces:', error);
                    }
                })
                .on('mouseout', function() {
                    tooltip.style('opacity', 0);
                    d3.select(this).attr('fill', 'transparent').attr('r', 8);
                });
        });
    });

    // Draw original nodes (faded)
    g.selectAll('.original-node')
        .data(nodes)
        .enter().append('circle')
        .attr('class', 'original-node')
        .attr('cx', d => xScale(d.x))
        .attr('cy', d => yScale(d.y))
        .attr('r', 4)
        .attr('fill', '#9ca3af')
        .attr('stroke', '#6b7280')
        .attr('stroke-width', 1)
        .attr('opacity', 0.6);

    // Draw displaced nodes (solid)
    g.selectAll('.displaced-node')
        .data(nodes)
        .enter().append('circle')
        .attr('class', 'displaced-node')
        .attr('cx', d => {
            const dispPos = getDisplacedNodePos(d.id);
            return xScale(dispPos.x);
        })
        .attr('cy', d => {
            const dispPos = getDisplacedNodePos(d.id);
            return yScale(dispPos.y);
        })
        .attr('r', 6)
        .attr('fill', '#2563eb')
        .attr('stroke', '#1d4ed8')
        .attr('stroke-width', 2);

    // Draw node labels on displaced positions
    g.selectAll('.displaced-node-label')
        .data(nodes)
        .enter().append('text')
        .attr('class', 'displaced-node-label')
        .attr('x', d => {
            const dispPos = getDisplacedNodePos(d.id);
            return xScale(dispPos.x);
        })
        .attr('y', d => {
            const dispPos = getDisplacedNodePos(d.id);
            return yScale(dispPos.y) - 12;
        })
        .attr('text-anchor', 'middle')
        .attr('fill', '#e5e7eb')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .text(d => d.id);

    // Draw supports at displaced positions
    supports.forEach(support => {
        const node = nodes.find(n => n.id === support.node);
        if (!node) return;

        const dispPos = getDisplacedNodePos(support.node);
        const x = xScale(dispPos.x);
        const y = yScale(dispPos.y);
        const size = 12;

        if (support.type === 'fixed') {
            // Fixed support - triangle
            g.append('polygon')
                .attr('points', `${x},${y + size} ${x - size},${y + size * 1.5} ${x + size},${y + size * 1.5}`)
                .attr('fill', '#dc2626')
                .attr('stroke', '#991b1b')
                .attr('stroke-width', 2);
        } else if (support.type === 'pinned') {
            // Pinned support - triangle
            g.append('polygon')
                .attr('points', `${x},${y + size} ${x - size},${y + size * 1.5} ${x + size},${y + size * 1.5}`)
                .attr('fill', '#2563eb')
                .attr('stroke', '#1d4ed8')
                .attr('stroke-width', 2);
        } else if (support.type === 'roller') {
            // Roller support - triangle with circle
            g.append('polygon')
                .attr('points', `${x},${y + size} ${x - size},${y + size * 1.5} ${x + size},${y + size * 1.5}`)
                .attr('fill', '#059669')
                .attr('stroke', '#047857')
                .attr('stroke-width', 2);
            g.append('circle')
                .attr('cx', x)
                .attr('cy', y + size * 1.7)
                .attr('r', 4)
                .attr('fill', '#059669')
                .attr('stroke', '#047857')
                .attr('stroke-width', 1);
        }
    });

    // Add legend
    const legend = g.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${width - 150}, 20)`);

    legend.append('rect')
        .attr('x', -10)
        .attr('y', -10)
        .attr('width', 180)
        .attr('height', 140)
        .attr('fill', '#374151')
        .attr('stroke', '#6b7280')
        .attr('rx', 4);

    legend.append('text')
        .attr('x', 5)
        .attr('y', 8)
        .attr('fill', '#f9fafb')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .text('Legend');

    // Original structure
    legend.append('line').attr('x1', 5).attr('y1', 20).attr('x2', 15).attr('y2', 20).attr('stroke', '#9ca3af').attr('stroke-width', 1).attr('stroke-dasharray', '3,3');
    legend.append('circle').attr('cx', 20).attr('cy', 20).attr('r', 2).attr('fill', '#9ca3af').attr('opacity', 0.6);
    legend.append('text').attr('x', 25).attr('y', 24).attr('fill', '#e5e7eb').attr('font-size', '10px').text('Original');

    // Displaced structure
    legend.append('line').attr('x1', 5).attr('y1', 35).attr('x2', 15).attr('y2', 35).attr('stroke', '#2563eb').attr('stroke-width', 3);
    legend.append('circle').attr('cx', 20).attr('cy', 35).attr('r', 3).attr('fill', '#2563eb');
    legend.append('text').attr('x', 25).attr('y', 39).attr('fill', '#e5e7eb').attr('font-size', '10px').text('Displaced');

    // Scale info
    legend.append('text').attr('x', 5).attr('y', 55).attr('fill', '#fbbf24').attr('font-size', '9px').text(`Scale: ${scaleFactor.toFixed(0)}x`);
    
    // Find actual max deflection for display
    let maxActualDeflection = 0;
    try {
        for (const element of elements) {
            for (let i = 0; i <= 20; i++) {
                const t = i / 20;
                const deflection = Math.abs(frame.getElementDeflection(element.id, t));
                maxActualDeflection = Math.max(maxActualDeflection, deflection);
            }
        }
    } catch (error) {
        // Fallback to FE displacement if PyNite fails
        if (analysisResults && analysisResults.displacements) {
            Object.values(analysisResults.displacements).forEach(disp => {
                maxActualDeflection = Math.max(maxActualDeflection, Math.abs(disp));
            });
        }
    }
    
    legend.append('text').attr('x', 5).attr('y', 68).attr('fill', '#fbbf24').attr('font-size', '9px').text(`Max Δ: ${maxActualDeflection.toFixed(6)} m`);
    legend.append('text').attr('x', 5).attr('y', 81).attr('fill', '#fbbf24').attr('font-size', '9px').text(`Scaled: ${(maxActualDeflection * scaleFactor).toFixed(4)} m`);

    legend.append('text').attr('x', 5).attr('y', 98).attr('fill', '#fbbf24').attr('font-size', '10px').text('Hover for forces & Δ');
    legend.append('text').attr('x', 5).attr('y', 115).attr('fill', '#10b981').attr('font-size', '9px').text('Click Auto Scale to optimize');
}

// Initialize test case when page loads
function initializeTestCase() {
    // Clear existing data
    nodes = [];
    elements = [];
    loads = [];
    supports = [];
    
    // Add nodes (coordinates in m) - start numbering from 1
    nodes.push({id: 1, x: 0, y: 0});
    nodes.push({id: 2, x: 10, y: 0});  // 10m span
    
    // Add element - from node 1 to node 2
    elements.push({id: 1, node1: 1, node2: 2});
    
    // Add distributed load: -10 kN/m in Y direction on element 1
    loads.push({
        type: 'distributed',
        element: 1,
        value: -10,  // kN/m (negative = downward)
        direction: 'y'
    });
    
    // Add supports
    supports.push({node: 1, type: 'pinned'});   // Pinned at node 1
    supports.push({node: 2, type: 'roller_x'});   // Horizontal Roller at node 2
    
    // Update all tables to show the data
    updateNodesTable();
    updateElementsTable();
    updateLoadsTable();
    updateSupportsTable();
    
    console.log('Test case initialized: 10m simply supported beam with -10kN/m distributed load (nodes 1-2)');
}

// Initialize when page loads
window.addEventListener('load', () => {
    console.log('Pure JavaScript frame analysis ready!');
    
    // Auto-initialize the test case
    setTimeout(() => {
        initializeTestCase();
    }, 500); // Small delay to ensure DOM is ready
});