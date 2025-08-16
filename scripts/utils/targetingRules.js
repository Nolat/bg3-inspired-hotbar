/**
 * Targeting Rules Engine for BG3 Inspired Hotbar
 * Determines which items require targeting and extracts their requirements
 */

/**
 * Check if an item requires targeting
 * @param {Item} item - The item to check
 * @returns {boolean} - True if the item needs targeting
 */
export function needsTargeting(item) {
    if (!item) return false;
    
    // Check if targeting is explicitly disabled
    if (item.system?.target?.type === "self" || item.system?.target?.type === "none") {
        return false;
    }
    
    // Check for AOE template spells that target points - these should use Foundry's template system
    if (isAOETemplateSpell(item)) {
        return false;
    }
    
    // Check for target configuration in item system
    if (item.system?.target?.type && item.system.target.type !== "self") {
        return true;
    }
    
    // Check activities for targeting requirements (Foundry v12+)
    if (item.system?.activities) {
        const activities = Array.from(item.system.activities.values());
        
        // If there's only one activity, check if it needs targeting
        if (activities.length === 1) {
            const activity = activities[0];
            
            // Check for range that needs targeting
            if (activity.range?.value && parseInt(activity.range.value) > 0 && activity.range.units !== "self") {
                return true;
            }
            
            // Check for target information
            if (activity.target) {
                const targetType = activity.target.type || activity.target.affects?.type;
                // Skip self and none targeting
                if (targetType === "self" || targetType === "none") {
                    return false;
                }
                // If there's target information (type or count), activate targeting
                if (targetType || activity.target.affects?.count !== undefined) {
                    return true;
                }
            }
        }
        
        // For multiple activities, don't activate target selector at item level
        // Let the activity selection dialog appear first
        return false;
    }
    
    // Check for attack rolls (weapons, attack spells)
    if (item.system?.actionType === "attack" || item.system?.actionType === "rsak" || item.system?.actionType === "msak") {
        return true;
    }
    
    // Check for saving throws (most spells that affect others)
    if (item.system?.actionType === "save" && item.system?.target?.type !== "self") {
        return true;
    }
    
    // Check for specific spell properties
    if (item.type === "spell") {
        const target = item.system?.target;
        if (target?.type && !["self", "none"].includes(target.type)) {
            return true;
        }
        
        // Check spell range - if it has a range other than self/touch, it likely needs targeting
        const range = item.system?.range;
        if (range?.value && range.value > 0 && range.units !== "self" && range.units !== "touch") {
            return true;
        }
    }
    
    return false;
}

/**
 * Check if an item is an AOE template spell that targets a point (should use Foundry's template system)
 * @param {Item} item - The item to check
 * @returns {boolean} - True if the item is an AOE template spell
 */
function isAOETemplateSpell(item) {
    // Check primary target configuration for AOE template
    if (item.system?.target?.template) {
        const templateType = item.system.target.template.type;
        // These template types target points, not creatures
        if (["cone", "cube", "cylinder", "line", "radius", "sphere"].includes(templateType)) {
            return true;
        }
    }
    
    // Check activities for AOE template (Foundry v12+)
    if (item.system?.activities) {
        for (const activity of item.system.activities.values()) {
            if (activity.target?.template) {
                const templateType = activity.target.template.type;
                // These template types target points, not creatures
                if (["cone", "cube", "cylinder", "line", "radius", "sphere"].includes(templateType)) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

/**
 * Extract targeting requirements from an item
 * @param {Item} item - The item to analyze
 * @returns {Object} - Targeting requirements object
 */
export function getTargetRequirements(item) {
    if (!item) return {};
    
    const requirements = {
        minTargets: 1,
        maxTargets: 1,
        range: null,
        type: null,
        template: null
    };
    
    // Primary target configuration
    let targetConfig = item.system?.target;
    
    // Check activities for more specific targeting (Foundry v12+)
    if (item.system?.activities) {
        for (const activity of item.system.activities.values()) {
            if (activity.target) {
                targetConfig = activity.target;
                break; // Use first valid activity target
            }
        }
    }
    
    if (targetConfig) {
        // Target type (check both locations)
        requirements.type = targetConfig.type || targetConfig.affects?.type;
        
        // Target count - check both old and new formats
        let targetCount = null;
        if (targetConfig.value) {
            targetCount = parseInt(targetConfig.value) || null;
        } else if (targetConfig.affects?.count) {
            targetCount = parseInt(targetConfig.affects.count) || null;
        }
        
        // Set target count if specified
        if (targetCount && targetCount > 0) {
            requirements.maxTargets = targetCount;
            requirements.minTargets = Math.min(targetCount, 1);
        }
        
        // Template information
        if (targetConfig.template) {
            requirements.template = {
                type: targetConfig.template.type,
                size: targetConfig.template.size,
                units: targetConfig.template.units
            };
        }
    }
    
    // Issue 2 fix: Always ensure minimum 1 target unless it's a template spell
    if (!requirements.template) {
        requirements.minTargets = Math.max(requirements.minTargets, 1);
        requirements.maxTargets = Math.max(requirements.maxTargets, 1);
    }
    
    // Range calculation
    requirements.range = calculateRange(item);
    
    // Special handling for different item types
    let enhancedRequirements = requirements;
    switch (item.type) {
        case "spell":
            enhancedRequirements = enhanceSpellTargeting(item, requirements);
            break;
    }
    
    return enhancedRequirements;
}

/**
 * Calculate the effective range of an item
 * @param {Item} item - The item to analyze
 * @returns {number|null} - Range in scene units, or null if unlimited/special
 */
function calculateRange(item) {
    let range = item.system?.range;
    
    // Check activities for range (Foundry v12+)
    if (item.system?.activities) {
        for (const activity of item.system.activities.values()) {
            if (activity.range?.value) {
                range = activity.range;
                break;
            }
        }
    }
    
    if (!range) return null;
    
    // Check for special ranges that don't need calculation
    switch (range.units) {
        case "self":
        case "touch":
            return canvas.scene.grid.distance || 5; // Touch range = 1 grid square distance
        case "sight":
        case "unlimited":
        case "special":
            return null; // No range limit
    }
    
    const rangeValue = range.value || 0;
    if (rangeValue <= 0) return null;
    
    // Get scene units
    const gridUnits = canvas.scene.grid.units || "ft";
    
    // Convert the item's range to the scene's units if needed
    let rangeInSceneUnits = rangeValue;
    if (range.units !== gridUnits) {
        rangeInSceneUnits = convertRangeUnits(rangeValue, range.units, gridUnits);
    }
    

    
    return rangeInSceneUnits;
}

/**
 * Convert range between different units
 * @param {number} value - The range value
 * @param {string} fromUnit - Source unit
 * @param {string} toUnit - Target unit
 * @returns {number} - Converted value
 */
function convertRangeUnits(value, fromUnit, toUnit) {
    if (fromUnit === toUnit) return value;
    
    // Convert to feet first (as base unit)
    let feet = value;
    switch (fromUnit) {
        case "ft":
            break; // Already in feet
        case "mi":
            feet *= 5280;
            break;
        case "km":
            feet *= 3280.84;
            break;
        case "m":
            feet *= 3.28084;
            break;
        default:
            // Unknown unit, assume feet
            break;
    }
    
    // Convert from feet to target unit
    switch (toUnit) {
        case "ft":
            return feet;
        case "mi":
            return feet / 5280;
        case "km":
            return feet / 3280.84;
        case "m":
            return feet / 3.28084;
        default:
            return feet; // Default to feet
    }
}

/**
 * Enhance targeting requirements for spells
 * @param {Item} spell - The spell item
 * @param {Object} requirements - Base requirements
 * @returns {Object} - Enhanced requirements
 */
function enhanceSpellTargeting(spell, requirements) {
    const enhanced = { ...requirements };
    
    // Check for area of effect spells
    if (spell.system?.target?.template) {
        enhanced.template = {
            type: spell.system.target.template.type,
            size: spell.system.target.template.size,
            units: spell.system.target.template.units || "ft"
        };
        
        // Area spells typically target a point, not creatures directly
        if (["cone", "cube", "cylinder", "line", "radius", "sphere"].includes(enhanced.template.type)) {
            enhanced.type = "point";
            enhanced.minTargets = 1;
            enhanced.maxTargets = 1;
        }
    }
    
    // Handle multi-target spells
    if (spell.system?.target?.value > 1) {
        enhanced.maxTargets = spell.system.target.value;
        enhanced.minTargets = Math.min(enhanced.maxTargets, enhanced.minTargets);
    }
    
    // Special spell targeting rules
    const spellName = spell.name.toLowerCase();
    if (spellName.includes("magic missile")) {
        enhanced.maxTargets = 3; // Can target up to 3 creatures
        enhanced.minTargets = 1;
    }
    
    return enhanced;
}

/**
 * Validate if selected targets meet the item's requirements
 * @param {Item} item - The item being used
 * @param {Token[]} targets - Selected targets
 * @returns {Object} - Validation result with success boolean and error message
 */
export function validateTargets(item, targets) {
    const requirements = getTargetRequirements(item);
    
    // Check target count (only enforce minimum, let players decide maximum)
    if (targets.length < requirements.minTargets) {
        return {
            success: false,
            error: `Must select at least ${requirements.minTargets} target(s)`
        };
    }
    
    // No maximum target validation - let players decide based on spell level/scaling
    
    // Check range for each target
    if (requirements.range) {
        const sourceToken = ui.BG3HOTBAR.manager.token;
        if (sourceToken) {
            for (const target of targets) {
                const distance = calculateGridBasedDistance(sourceToken, target);
                
                if (distance > requirements.range) {
                    return {
                        success: false,
                        error: `Target ${target.name} is out of range (${Math.round(distance)}ft > ${requirements.range}ft)`
                    };
                }
            }
        }
    }
    
    // Check target type requirements
    if (requirements.type && requirements.type !== "point") {
        for (const target of targets) {
            if (!isValidTargetType(target, requirements.type, ui.BG3HOTBAR.manager.token)) {
                return {
                    success: false,
                    error: `${target.name} is not a valid target for this ${item.type}`
                };
            }
        }
    }
    
    return { success: true };
}

/**
 * Check if a target meets the type requirements
 * @param {Token} target - Target token
 * @param {string} requiredType - Required target type
 * @param {Token} sourceToken - Source token
 * @returns {boolean} - True if target is valid
 */
function isValidTargetType(target, requiredType, sourceToken) {
    if (!target?.actor) return false;
    
    switch (requiredType.toLowerCase()) {
        case "self":
            return target === sourceToken;
        case "ally":
            return target.actor && sourceToken?.actor && 
                   target.actor.system.details?.alignment === sourceToken.actor.system.details?.alignment;
        case "enemy":
            return target.actor && sourceToken?.actor && 
                   target.actor.system.details?.alignment !== sourceToken.actor.system.details?.alignment;
        case "creature":
            return target.actor && (target.actor.type === "character" || target.actor.type === "npc");
        case "object":
            return !target.actor; // Tokens without actors are typically objects
        default:
            return true; // Unknown type, allow all
    }
}

/**
 * Check if a specific activity requires targeting
 * @param {Activity} activity - The activity to check
 * @returns {boolean} - True if the activity needs targeting
 */
export function needsActivityTargeting(activity) {
    if (!activity) return false;
    
    // Skip if target selector is disabled
    if (!game.settings.get('bg3-inspired-hotbar', 'enableTargetSelector')) {
        return false;
    }
    
    // Skip if activity uses a template (AoE, emanation, etc.)
    if (hasTemplate(activity)) {
        return false;
    }
    
    // Check for range that needs targeting
    if (activity.range?.value && parseInt(activity.range.value) > 0 && activity.range.units !== "self") {
        return true;
    }
    
    // Check for target information
    if (activity.target) {
        const targetType = activity.target.type || activity.target.affects?.type;
        // Skip self and none targeting
        if (targetType === "self" || targetType === "none") {
            return false;
        }
        // If there's target information (type or count), activate targeting
        if (targetType || activity.target.affects?.count !== undefined) {
            return true;
        }
    }
    
    return false;
}

/**
 * Check if an activity has a template (AoE, emanation, etc.)
 * @param {Activity} activity - The activity to check
 * @returns {boolean} - True if the activity uses a template
 */
function hasTemplate(activity) {
    if (!activity?.target?.template) return false;
    
    const template = activity.target.template;
    
    // Check if template has a type (cone, sphere, cube, etc.)
    if (template.type && template.type !== '') {
        return true;
    }
    
    // Check if template has size/dimensions
    if (template.size && (template.size !== '' && template.size !== null && template.size !== 0)) {
        return true;
    }
    
    // Check for width/height (for rectangles/lines)
    if ((template.width && template.width !== '' && template.width !== null && template.width !== 0) ||
        (template.height && template.height !== '' && template.height !== null && template.height !== 0)) {
        return true;
    }
    
    return false;
}

/**
 * Extract targeting requirements from a specific activity
 * @param {Activity} activity - The activity to analyze
 * @returns {Object} - Targeting requirements object
 */
export function getActivityTargetRequirements(activity, baseItem = null) {
    if (!activity) return {};
    
    const requirements = {
        minTargets: 1,
        maxTargets: 1,
        range: null,
        type: null,
        template: null
    };
    
    // Get target configuration from activity
    const targetConfig = activity.target;
    
    if (targetConfig) {
        // Target type
        requirements.type = targetConfig.type || targetConfig.affects?.type;
        
        // Target count
        let targetCount = null;
        if (targetConfig.affects?.count) {
            targetCount = parseInt(targetConfig.affects.count) || null;
        }
        
        // Set target count if specified
        if (targetCount && targetCount > 0) {
            requirements.maxTargets = targetCount;
            requirements.minTargets = Math.min(targetCount, 1);
        }
        
        // Template information
        if (targetConfig.template) {
            requirements.template = {
                type: targetConfig.template.type,
                size: targetConfig.template.size,
                units: targetConfig.template.units
            };
        }
    }
    
    // Range calculation - try activity range first, then fall back to item range
    let rangeValue = null;
    let rangeUnits = null;
    
    
    
    // Try activity range first - check both 'value' and 'reach' properties
    if (activity.range?.value || activity.range?.reach) {
        // Handle both string and number values, prefer 'value' over 'reach'
        const activityRangeValue = activity.range.value || activity.range.reach;
        const parsedValue = typeof activityRangeValue === 'string' ? 
            parseInt(activityRangeValue) : activityRangeValue;
        
        if (parsedValue && parsedValue > 0) {
            rangeValue = parsedValue;
            rangeUnits = activity.range.units;
            
        }
    }
    
    // Fall back to item range if activity range is null/empty - check both 'value' and 'reach'
    const fallbackRange = baseItem?.system?.range || activity.item?.system?.range;
    if (!rangeValue && fallbackRange && (fallbackRange.value || fallbackRange.reach)) {
        // Handle both string and number values, prefer 'value' over 'reach'
        const itemRangeValue = fallbackRange.value || fallbackRange.reach;
        const parsedValue = typeof itemRangeValue === 'string' ? 
            parseInt(itemRangeValue) : itemRangeValue;
            
        if (parsedValue && parsedValue > 0) {
            rangeValue = parsedValue;
            rangeUnits = fallbackRange.units;
            
        }
    }
    
    // Set range if we found a valid value
    if (rangeValue && rangeValue > 0 && rangeUnits !== "self") {
        // Convert to scene units if needed
        const gridUnits = canvas.scene.grid.units || "ft";
        let rangeInSceneUnits = rangeValue;
        if (rangeUnits !== gridUnits) {
            rangeInSceneUnits = convertRangeUnits(rangeValue, rangeUnits, gridUnits);
        }
        requirements.range = rangeInSceneUnits;
    }
    
    return requirements;
}

/**
 * Calculate distance between two tokens accounting for their size
 * Grid-based solution: measure from closest edges in whole grid squares
 * @param {Token} sourceToken - The source token (attacker)
 * @param {Token} targetToken - The target token
 * @returns {number} - Distance in scene units
 */
function calculateGridBasedDistance(sourceToken, targetToken) {
    const gridDistance = canvas.grid.distance || 5;
    const gridSize = canvas.grid.size;
    
    // Get token positions and sizes in grid units (convert from pixels to grid squares)
    const sourceX = Math.floor(sourceToken.document.x / gridSize);
    const sourceY = Math.floor(sourceToken.document.y / gridSize);
    const sourceWidth = sourceToken.document.width; // Width in grid squares
    const sourceHeight = sourceToken.document.height; // Height in grid squares
    
    const targetX = Math.floor(targetToken.document.x / gridSize);
    const targetY = Math.floor(targetToken.document.y / gridSize);
    const targetWidth = targetToken.document.width; // Width in grid squares
    const targetHeight = targetToken.document.height; // Height in grid squares
    
    // Calculate the grid bounds of each token
    const sourceBounds = {
        left: sourceX,
        right: sourceX + sourceWidth - 1,
        top: sourceY,  
        bottom: sourceY + sourceHeight - 1
    };
    
    const targetBounds = {
        left: targetX,
        right: targetX + targetWidth - 1,
        top: targetY,
        bottom: targetY + targetHeight - 1
    };
    
    // Calculate minimum distance between any squares of the two tokens
    let minDistance = Infinity;
    
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
                    }
                }
            }
        }
    }
    
    // If tokens overlap, distance is 0
    const gridSquareDistance = minDistance === Infinity ? 0 : minDistance;
    const distance = gridSquareDistance * gridDistance;
    
    return distance;
} 