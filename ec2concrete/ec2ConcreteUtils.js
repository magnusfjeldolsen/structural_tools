/**
 * EC2 Concrete Material Parameters Utility
 * Based on Eurocode 2 Table 3.1
 */

class EC2ConcreteUtils {
    
    static getConcreteParameters(fck) {
        if (fck < 12 || fck > 90) {
            throw new Error('fck must be between 12 and 90 MPa');
        }

        const params = {
            fck: fck,
            fck_cube: this.calculateFckCube(fck),
            fcm: this.calculateFcm(fck),
            fctm: this.calculateFctm(fck),
            fctk_005: this.calculateFctk005(fck),
            fctk_095: this.calculateFctk095(fck),
            Ecm: this.calculateEcm(fck),
            εc1: this.calculateEpsilonC1(fck),
            εcu1: this.calculateEpsilonCu1(fck),
            εc2: this.calculateEpsilonC2(fck),
            εcu2: this.calculateEpsilonCu2(fck),
            n: this.calculateN(fck),
            εc3: this.calculateEpsilonC3(fck),
            εcu3: this.calculateEpsilonCu3(fck)
        };

        // Add calculation formulas for reference
        params.calculations = this.getCalculationFormulas(fck);
        
        return params;
    }

    static calculateFckCube(fck) {
        const fckCubeMapping = {
            12: 15,
            16: 20,
            20: 25,
            25: 30,
            30: 37,
            35: 45,
            40: 50,
            45: 55,
            50: 60,
            55: 67,
            60: 75,
            70: 85,
            80: 95,
            90: 105
        };
        
        if (fckCubeMapping[fck]) {
            return fckCubeMapping[fck];
        } else {
            throw new Error(`No fck,cube mapping found for fck = ${fck} MPa`);
        }
    }

    static calculateFcm(fck) {
        return fck + 8;
    }

    static calculateFctm(fck) {
        if (fck <= 50) {
            return 0.30 * Math.pow(fck, 2/3);
        } else {
            return 2.12 * Math.log(1 + (fck + 8) / 10);
        }
    }

    static calculateFctk005(fck) {
        const fctm = this.calculateFctm(fck);
        return 0.7 * fctm;
    }

    static calculateFctk095(fck) {
        const fctm = this.calculateFctm(fck);
        return 1.3 * fctm;
    }

    static calculateEcm(fck) {
        return 22 * Math.pow((fck + 8) / 10, 0.3);
    }

    static calculateEpsilonC1(fck) {
        const fcm = this.calculateFcm(fck);
        return Math.min(2.8, 0.7 * Math.pow(fcm, 0.31));
    }

    static calculateEpsilonCu1(fck) {
        if (fck <= 50) {
            return 3.5;
        } else {
            const value = 2.8 + 27 * Math.pow((98 - fck) / 100, 4);
            return Math.min(value, 3.5);
        }
    }

    static calculateEpsilonC2(fck) {
        if (fck <= 50) {
            return 2.0;
        } else {
            return 2.0 + 0.085 * Math.pow(fck - 50, 0.53);
        }
    }

    static calculateEpsilonCu2(fck) {
        if (fck <= 50) {
            return 3.5;
        } else {
            return 2.6 + 35 * Math.pow((90 - fck) / 100, 4);
        }
    }

    static calculateN(fck) {
        if (fck <= 50) {
            return 2.0;
        } else {
            return 1.4 + 23.4 * Math.pow((90 - fck) / 100, 4);
        }
    }

    static calculateEpsilonC3(fck) {
        if (fck <= 50) {
            return 1.75;
        } else {
            return 1.75 + 0.55 * (fck - 50) / 40;
        }
    }

    static calculateEpsilonCu3(fck) {
        if (fck <= 50) {
            return 3.5;
        } else {
            return 2.6 + 35 * Math.pow((90 - fck) / 100, 4);
        }
    }

    static getCalculationFormulas(fck) {
        return {
            fck_cube: 'Table lookup value (MPa)',
            fcm: 'fck + 8 (MPa)',
            fctm: fck <= 50 ? 
                '0.30 × fck^(2/3) (MPa)' : 
                '2.12 × ln(1 + (fck + 8)/10) (MPa)',
            fctk_005: '0.7 × fctm (MPa)',
            fctk_095: '1.3 × fctm (MPa)',
            Ecm: '22 × ((fck + 8)/10)^0.3 (GPa)',
            εc1: 'max(2.8, 0.7 × fcm^0.31) (‰)',
            εcu1: fck <= 50 ? 
                '3.5 (‰)' : 
                'min(2.8 + 27×((98-fck)/100)^4, 3.5) (‰)',
            εc2: fck <= 50 ? 
                '2.0 (‰)' : 
                '2.0 + 0.085×(fck-50)^0.53 (‰)',
            εcu2: fck <= 50 ? 
                '3.5 (‰)' : 
                '2.6 + 35×((90-fck)/100)^4 (‰)',
            n: fck <= 50 ? 
                '2.0' : 
                '1.4 + 23.4×((90-fck)/100)^4',
            εc3: fck <= 50 ? 
                '1.75 (‰)' : 
                '1.75 + 0.55×(fck-50)/40 (‰)',
            εcu3: fck <= 50 ? 
                '3.5 (‰)' : 
                '2.6 + 35×((90-fck)/100)^4 (‰)'
        };
    }

    static getConcreteGrade(fck) {
        return `C${fck}/C${fck + 8}`;
    }

    static getAllStandardGrades() {
        return [12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90];
    }

    static getParametersByGrade(grade) {
        // Extract fck from grade string like "C35/C43" or just "35"
        let fck;
        if (typeof grade === 'string' && grade.includes('/')) {
            fck = parseInt(grade.split('/')[0].replace('C', ''));
        } else if (typeof grade === 'string' && grade.startsWith('C')) {
            fck = parseInt(grade.replace('C', ''));
        } else {
            fck = parseInt(grade);
        }
        
        return this.getConcreteParameters(fck);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EC2ConcreteUtils;
}

// Global access for browser
if (typeof window !== 'undefined') {
    window.EC2ConcreteUtils = EC2ConcreteUtils;
}