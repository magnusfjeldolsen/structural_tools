let dataset = [];
let headers = [];

document.getElementById('previewBtn').addEventListener('click', handlePreview);
document.getElementById('runClustering').addEventListener('click', runClustering);

// ---------- CSV Preview ----------
function handlePreview() {
    const file = document.getElementById('fileInput').files[0];
    if (!file) {
        alert("Please upload a CSV file first.");
        return;
    }

    const delimiterChoice = document.getElementById('delimiterSelect').value;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        delimiter: delimiterChoice || "", // auto-detect if empty
        complete: function(results) {
            // Clean dataset and remove empty rows
            dataset = results.data
                .map(row => {
                    Object.keys(row).forEach(key => {
                        if (typeof row[key] === "string") {
                            row[key] = row[key].trim();
                        }
                    });
                    return row;
                })
                .filter(row => Object.values(row).some(v => v !== null && v !== ""));

            headers = results.meta.fields.map(h => h.trim());

            populateColumnSelect(headers);
            renderPreview(headers, dataset);
        }
    });
}


function renderPreview(columns, data) {
    const container = document.getElementById('preview');
    container.innerHTML = `<p class="text-secondary mb-4">Preview (first 10 rows of ${data.length} total rows)</p>`;
    
    const table = document.createElement('table');
    table.className = 'clustering-table';

    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    columns.forEach(col => { 
        const th = document.createElement('th'); 
        th.textContent = col; 
        trHead.appendChild(th); 
    });
    thead.appendChild(trHead); 
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.slice(0, 10).forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(col => { 
            const td = document.createElement('td'); 
            // Handle ClusterID = 0 display issue in preview too
            td.textContent = (row[col] !== undefined && row[col] !== null) ? row[col] : ''; 
            tr.appendChild(td); 
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody); 
    container.appendChild(table);
    
    // Show the preview section and clustering section
    document.getElementById('previewSection').style.display = 'block';
    document.getElementById('clusteringSection').style.display = 'block';
}

function populateColumnSelect(columns) {
    const select = document.getElementById('columnSelect');
    select.innerHTML = "";
    columns.forEach(col => { const option = document.createElement('option'); option.value = col; option.textContent = col; select.appendChild(option); });
}

// ---------- 1D K-Means ----------
function kMeans1D(data, k, maxIter = 100) {
    if (data.length < k) throw "Cluster count cannot exceed data points";
    let centroids = data.slice(0, k).map(v => v[0]);
    let clusters = new Array(data.length).fill(0);
    for (let iter = 0; iter < maxIter; iter++) {
        // assign points
        for (let i = 0; i < data.length; i++) {
            let minDist = Infinity, c = 0;
            for (let j = 0; j < k; j++) {
                let dist = Math.abs(data[i][0] - centroids[j]);
                if (dist < minDist) { minDist = dist; c = j; }
            }
            clusters[i] = c;
        }
        // update centroids
        for (let j = 0; j < k; j++) {
            let points = data.filter((_, idx) => clusters[idx] === j).map(p => p[0]);
            if (points.length > 0) centroids[j] = points.reduce((a,b)=>a+b,0)/points.length;
        }
    }
    return { clusters, centroids };
}

// ---------- Run Clustering ----------
function runClustering() {
    if (dataset.length === 0) { alert("Please preview the CSV first."); return; }

    const selectedColumn = document.getElementById('columnSelect').value;
    const clusterCount = parseInt(document.getElementById('clusterCount').value);
    if (!selectedColumn || isNaN(clusterCount) || clusterCount < 1) { alert("Please select a column and valid cluster count."); return; }

    const cleanData = [], validIndices = [];
    dataset.forEach((row, i) => {
        let val = row[selectedColumn];
        if (typeof val === "string") val = val.trim().replace(",", ".");
        const num = parseFloat(val);
        if (!isNaN(num)) { cleanData.push([num]); validIndices.push(i); }
    });

    if (cleanData.length === 0) { alert(`No numeric values found in "${selectedColumn}".`); return; }
    if (clusterCount > cleanData.length) { alert(`Cluster count (${clusterCount}) cannot be larger than number of valid rows (${cleanData.length}).`); return; }

    const result = kMeans1D(cleanData, clusterCount);

    validIndices.forEach((rowIndex,j)=> { dataset[rowIndex].ClusterID = result.clusters[j]; });
    dataset.forEach(row=>{ if (row.ClusterID===undefined) row.ClusterID="N/A"; });

    const csv = Papa.unparse(dataset, { columns: [...headers, "ClusterID"] });
    document.getElementById('csvPreview').value = csv;

    // Show download section first
    document.getElementById('downloadSection').style.display = 'block';
    
    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.onclick = function() {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "clustered_data.csv";
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    };
    
    // Then show the detailed results table
    renderTable(dataset, [...headers, "ClusterID"]);
}

// ---------- Render Table ----------
function renderTable(data, columns) {
    const container = document.getElementById('output');
    container.innerHTML = `<p class="text-secondary mb-4">Clustered data (${data.length} rows)</p>`;
    
    const table = document.createElement('table');
    table.className = 'clustering-table';
    
    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    columns.forEach(col => { 
        const th = document.createElement('th'); 
        th.textContent = col; 
        trHead.appendChild(th); 
    });
    thead.appendChild(trHead); 
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(col => { 
            const td = document.createElement('td'); 
            // Handle ClusterID = 0 display issue
            td.textContent = (row[col] !== undefined && row[col] !== null) ? row[col] : ''; 
            // Highlight cluster ID column
            if (col === 'ClusterID') {
                td.style.fontWeight = '600';
                td.style.color = '#3b82f6'; // blue color for cluster IDs
            }
            tr.appendChild(td); 
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody); 
    container.appendChild(table);
    
    // Show the results section
    document.getElementById('resultsSection').style.display = 'block';
}
