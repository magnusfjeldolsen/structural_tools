
            const fs = require('fs');
            const path = require('path');

            // Load the API module
            eval(fs.readFileSync('c:\Python\structural_tools\structural_tools\concrete_slab_design\concrete_slab_api.js', 'utf8'));

            // Get inputs from command line
            const inputs = JSON.parse(process.argv[2]);

            // Calculate using the API
            const result = calculateConcreteSlab(inputs);

            // Output result as JSON
            console.log(JSON.stringify(result, null, 2));
            