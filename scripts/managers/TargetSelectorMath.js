/**
 * Target Selector Math Utilities
 * Handles all distance calculations and range validation for target selection
 */
export class TargetSelectorMath {
    /**
     * Calculate distance between two tokens using edge-to-edge measurement
     * @param {Token} sourceToken - The source token
     * @param {Token} targetToken - The target token
     * @returns {number} - Distance in scene units
     */
    static calculateTokenDistance(sourceToken, targetToken) {
        const gridDistance = canvas.grid.distance || 5;
        const gridSize = canvas.grid.size;
        
        // Get token bounds in grid squares
        const sourceBounds = this.getTokenGridBounds(sourceToken);
        const targetBounds = this.getTokenGridBounds(targetToken);
        
        let minDistance = Infinity;
        let closestSourceSquare = null;
        let closestTargetSquare = null;
        
        // Check all squares of source token against all squares of target token
        for (let sx = sourceBounds.left; sx <= sourceBounds.right; sx++) {
            for (let sy = sourceBounds.top; sy <= sourceBounds.bottom; sy++) {
                for (let tx = targetBounds.left; tx <= targetBounds.right; tx++) {
                    for (let ty = targetBounds.top; ty <= targetBounds.bottom; ty++) {
                        // Distance between these two grid squares (D&D 5e rules)
                        const dx = Math.abs(sx - tx);
                        const dy = Math.abs(sy - ty);
                        const squareDistance = Math.max(dx, dy);
                        
                        if (squareDistance < minDistance) {
                            minDistance = squareDistance;
                            closestSourceSquare = `${sx},${sy}`;
                            closestTargetSquare = `${tx},${ty}`;
                        }
                    }
                }
            }
        }
        
        // Convert grid squares to scene units
        const distanceInSceneUnits = minDistance * gridDistance;
        
        
        
        return distanceInSceneUnits;
    }

    /**
     * Get token bounds in grid coordinates
     * @param {Token} token - The token to get bounds for
     * @returns {Object} - Bounds object with left, right, top, bottom
     */
    static getTokenGridBounds(token) {
        const gridSize = canvas.grid.size;
        
        // Convert token position to grid coordinates
        const leftGrid = Math.floor(token.x / gridSize);
        const topGrid = Math.floor(token.y / gridSize);
        
        // Calculate token size in grid squares
        const widthInSquares = Math.max(1, Math.round(token.w / gridSize));
        const heightInSquares = Math.max(1, Math.round(token.h / gridSize));
        
        return {
            left: leftGrid,
            right: leftGrid + widthInSquares - 1,
            top: topGrid,
            bottom: topGrid + heightInSquares - 1
        };
    }

    /**
     * Check if a target token is within range of the source token
     * @param {Token} sourceToken - The source token
     * @param {Token} targetToken - The target token
     * @param {number} range - Range in scene units
     * @returns {boolean} - True if target is within range
     */
    static isWithinRange(sourceToken, targetToken, range) {
        if (!range || range <= 0) return true; // No range limit
        
        const distance = this.calculateTokenDistance(sourceToken, targetToken);
        return distance <= range;
    }

    /**
     * Get all tokens within range of the source token
     * @param {Token} sourceToken - The source token
     * @param {number} range - Range in scene units
     * @returns {Token[]} - Array of tokens within range
     */
    static getTokensInRange(sourceToken, range) {
        if (!range || range <= 0) {
            return canvas.tokens.placeables.filter(t => t !== sourceToken);
        }

        return canvas.tokens.placeables.filter(token => {
            if (token === sourceToken) return false;
            return this.isWithinRange(sourceToken, token, range);
        });
    }

    /**
     * Calculate the center point between multiple tokens
     * @param {Token[]} tokens - Array of tokens
     * @returns {Object} - Object with x, y coordinates
     */
    static calculateCenterPoint(tokens) {
        if (!tokens || tokens.length === 0) return { x: 0, y: 0 };

        const totalX = tokens.reduce((sum, token) => sum + token.center.x, 0);
        const totalY = tokens.reduce((sum, token) => sum + token.center.y, 0);

        return {
            x: totalX / tokens.length,
            y: totalY / tokens.length
        };
    }

    /**
     * Check if a point is within a certain distance of a token
     * @param {Token} token - The token to check against
     * @param {Object} point - Point with x, y coordinates
     * @param {number} distance - Distance in pixels
     * @returns {boolean} - True if point is within distance
     */
    static isPointNearToken(token, point, distance = 50) {
        const tokenCenter = token.center;
        const dx = Math.abs(tokenCenter.x - point.x);
        const dy = Math.abs(tokenCenter.y - point.y);
        const actualDistance = Math.sqrt(dx * dx + dy * dy);
        
        return actualDistance <= distance;
    }

    /**
     * Convert range units to scene units
     * @param {number} value - The range value
     * @param {string} fromUnit - Source unit (ft, m, etc.)
     * @param {string} toUnit - Target unit
     * @returns {number} - Converted value
     */
    static convertRangeUnits(value, fromUnit, toUnit) {
        if (fromUnit === toUnit) return value;
        
        // Conversion factors to feet (base unit)
        const toFeet = {
            'ft': 1,
            'feet': 1,
            'm': 3.28084,
            'meter': 3.28084,
            'meters': 3.28084,
            'mi': 5280,
            'mile': 5280,
            'miles': 5280,
            'km': 3280.84,
            'kilometer': 3280.84,
            'kilometers': 3280.84
        };
        
        // Convert to feet first, then to target unit
        const inFeet = value * (toFeet[fromUnit] || 1);
        const result = inFeet / (toFeet[toUnit] || 1);
        
        return Math.round(result * 100) / 100; // Round to 2 decimal places
    }
}