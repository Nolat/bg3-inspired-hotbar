/**
 * Target Selector UI Manager
 * Handles all UI elements and display logic for the target selector
 */
export class TargetSelectorUI {
    constructor() {
        this.targetCountDisplay = null;
        this.mouseTargetDisplay = null;
        this.rangeIndicators = [];
        this.mouseUpdateFrame = null;
        this.originalCursor = null;
    }

    /**
     * Create and show the target count display
     * @param {Object} requirements - Targeting requirements
     * @param {number} selectedCount - Current number of selected targets
     */
    createTargetCountDisplay(requirements, selectedCount) {
        // Remove existing display
        this.removeTargetCountDisplay();

        const maxTargets = requirements.maxTargets || 1;
        const minTargets = requirements.minTargets || 1;

        // Create display element with only instructions
        this.targetCountDisplay = $(`
            <div id="bg3-target-count" style="
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                font-size: 16px;
                font-weight: bold;
                z-index: 10000;
                pointer-events: none;
                border: 2px solid #8B4513;
            ">
                <div style="text-align: center;">
                    ${minTargets > 1 ? `<div style="font-size: 14px; margin-bottom: 5px;">Minimum: ${minTargets} targets required</div>` : ''}
                    <div style="font-size: 12px;">
                        <span style="color: #90EE90;">Left Click:</span> Select/Deselect
                        <span style="margin-left: 10px; color: #87CEEB;">${this._getConfirmKeybindDisplay()}:</span> Confirm
                        <span style="margin-left: 10px; color: #FFA500;">Escape:</span> Cancel
                    </div>
                    ${maxTargets > 1 ? `
                        <div style="font-size: 12px; margin-top: 5px;">
                            ${this._getKeybindDisplay()}
                        </div>
                    ` : ''}
                </div>
            </div>
        `);

        $('body').append(this.targetCountDisplay);
    }

    /**
     * Update the target count display (now just maintains the static instructions)
     * @param {number} selectedCount - Current number of selected targets (unused)
     * @param {number} maxTargets - Maximum targets allowed (unused)
     */
    updateTargetCountDisplay(selectedCount, maxTargets) {
        // Instructions are static now, no need to update
    }

    /**
     * Remove the target count display
     */
    removeTargetCountDisplay() {
        if (this.targetCountDisplay) {
            this.targetCountDisplay.remove();
            this.targetCountDisplay = null;
        }
    }

    /**
     * Create and show the mouse target display
     * @param {number} x - Mouse X position
     * @param {number} y - Mouse Y position
     * @param {Object} requirements - Targeting requirements
     * @param {number} currentCount - Current number of selected targets
     */
    createMouseTargetDisplay(x, y, requirements, currentCount = 0) {
        // Remove existing display
        this.removeMouseTargetDisplay();

        const maxTargets = requirements.maxTargets || 1;

        this.mouseTargetDisplay = $(`
            <div id="bg3-mouse-target" style="
                position: fixed;
                left: ${x + 20}px;
                top: ${y - 20}px;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 8px 12px;
                border-radius: 3px;
                font-size: 14px;
                z-index: 10001;
                pointer-events: none;
                border: 1px solid #8B4513;
                white-space: nowrap;
            ">
                ${currentCount}/${maxTargets} Targets Selected
            </div>
        `);

        $('body').append(this.mouseTargetDisplay);
    }

    /**
     * Update mouse target display position
     * @param {number} x - Mouse X position
     * @param {number} y - Mouse Y position
     */
    updateMouseTargetDisplay(x, y) {
        if (this.mouseTargetDisplay) {
            this.mouseTargetDisplay.css({
                left: `${x + 20}px`,
                top: `${y - 20}px`
            });
        }
    }

    /**
     * Update mouse target display with current count
     * @param {number} currentCount - Current number of selected targets
     * @param {number} maxTargets - Maximum targets allowed
     */
    updateMouseTargetCount(currentCount, maxTargets) {
        if (this.mouseTargetDisplay) {
            this.mouseTargetDisplay.text(`${currentCount}/${maxTargets} Targets Selected`);
        }
    }

    /**
     * Remove the mouse target display
     */
    removeMouseTargetDisplay() {
        if (this.mouseTargetDisplay) {
            this.mouseTargetDisplay.remove();
            this.mouseTargetDisplay = null;
        }
    }

    /**
     * Set custom cursor for targeting mode
     */
    setTargetingCursor() {
        this.originalCursor = document.body.style.cursor;
        document.body.style.cursor = 'crosshair';
    }

    /**
     * Restore original cursor
     */
    restoreOriginalCursor() {
        if (this.originalCursor !== null) {
            document.body.style.cursor = this.originalCursor;
            this.originalCursor = null;
        }
    }

    /**
     * Show range indicator around the source token
     * @param {Token} sourceToken - The source token to show range from
     * @param {number} range - Range in scene units
     */
    showRangeIndicator(sourceToken, range) {
        if (!sourceToken || !range) return;

        // Check if range indicators are enabled
        if (!game.settings.get('bg3-inspired-hotbar', 'showRangeIndicators')) return;

        // Remove existing range indicators first
        this.removeAllRangeIndicators();

        // Get settings
        const colorHex = game.settings.get('bg3-inspired-hotbar', 'rangeIndicatorColor') || '#00ff00';
        const color = parseInt(colorHex.replace('#', ''), 16); // Convert hex to integer properly
        const lineWidth = game.settings.get('bg3-inspired-hotbar', 'rangeIndicatorLineWidth') || 2;
        const shape = game.settings.get('bg3-inspired-hotbar', 'rangeIndicatorShape') || 'circle';
        const animation = game.settings.get('bg3-inspired-hotbar', 'rangeIndicatorAnimation') || 'static';

        // Create range indicator around source token
        const rangeGraphic = new PIXI.Graphics();
        rangeGraphic.lineStyle(lineWidth, color, 0.8);
        // No fill - just outline

        // Calculate range in pixels, accounting for token size
        const baseRangeInPixels = range * canvas.grid.size / canvas.grid.distance;
        
        // Get token size (width and height are in grid units)
        const tokenWidth = sourceToken.document.width || 1;
        const tokenHeight = sourceToken.document.height || 1;
        
        // Use the larger dimension, but never smaller than 1x1 (Medium creature minimum)
        const tokenSizeMultiplier = Math.max(1, Math.max(tokenWidth, tokenHeight));
        
        // Add half the token size to the range (since range is measured from edge, not center)
        const tokenSizeOffset = (tokenSizeMultiplier * canvas.grid.size) / 2;
        const rangeInPixels = baseRangeInPixels + tokenSizeOffset;

        // Draw shape based on setting (outline only, no fill)
        if (shape === 'square') {
            rangeGraphic.drawRect(-rangeInPixels, -rangeInPixels, rangeInPixels * 2, rangeInPixels * 2);
        } else {
            rangeGraphic.drawCircle(0, 0, rangeInPixels);
        }

        // Position at source token center
        rangeGraphic.x = sourceToken.center.x;
        rangeGraphic.y = sourceToken.center.y;

        // Add to canvas FIRST
        canvas.interface.addChild(rangeGraphic);
        this.rangeIndicators.push(rangeGraphic);

        // Add animation AFTER adding to canvas
        if (animation === 'pulse') {
            this._addPulseAnimation(rangeGraphic);
        }
    }

    /**
     * Add pulse animation to a range indicator
     * @param {PIXI.Graphics} graphic - The graphic to animate
     */
    _addPulseAnimation(graphic) {
        const originalScale = 1.0;
        const minScale = 0.97;  // Very subtle scaling
        const maxScale = 1.02;  // Very subtle scaling
        let currentScale = originalScale;
        let direction = 1;

        const animate = () => {
            if (!graphic.parent) {
                return; // Stop if removed from canvas
            }

            currentScale += direction * 0.0005;

            if (currentScale <= minScale) {
                direction = 1;
            } else if (currentScale >= maxScale) {
                direction = -1;
            }

            graphic.scale.set(currentScale);

            requestAnimationFrame(animate);
        };

        animate();
    }

    /**
     * Remove a specific range indicator
     * @param {PIXI.Graphics} indicator - The indicator to remove
     */
    removeRangeIndicator(indicator) {
        const index = this.rangeIndicators.indexOf(indicator);
        if (index > -1) {
            this.rangeIndicators.splice(index, 1);
            if (indicator.parent) {
                indicator.parent.removeChild(indicator);
            }
        }
    }

    /**
     * Remove all range indicators
     */
    removeAllRangeIndicators() {
        this.rangeIndicators.forEach(indicator => {
            if (indicator.parent) {
                indicator.parent.removeChild(indicator);
            }
        });
        this.rangeIndicators = [];
    }

    /**
     * Get the display string for target adjustment keybinds
     * @returns {string} - Formatted keybind display
     */
    _getKeybindDisplay() {
        try {
            const decreaseBinding = game.keybindings.get('bg3-inspired-hotbar', 'decreaseTargets');
            const increaseBinding = game.keybindings.get('bg3-inspired-hotbar', 'increaseTargets');

            // Get the first key for each binding
            const decreaseKey = decreaseBinding?.[0]?.key || 'BracketLeft';
            const increaseKey = increaseBinding?.[0]?.key || 'BracketRight';

            // Convert key codes to display names
            const decreaseDisplay = this._keyCodeToDisplay(decreaseKey);
            const increaseDisplay = this._keyCodeToDisplay(increaseKey);

            return `<span style="color: #87CEEB;">${decreaseDisplay}:</span> Decrease Max Targets <span style="color: #87CEEB;">${increaseDisplay}:</span> Increase Max Targets`;
        } catch (error) {
            // Fallback to default if there's any error
            return '<span style="color: #87CEEB;">[:</span> Decrease Max Targets <span style="color: #87CEEB;">]:</span> Increase Max Targets';
        }
    }

    /**
     * Get the display string for the confirm keybind
     * @returns {string} - Formatted confirm keybind display
     */
    _getConfirmKeybindDisplay() {
        try {
            const confirmBinding = game.keybindings.get('bg3-inspired-hotbar', 'confirmTargets');
            
            // Get the first key for the binding
            const confirmKey = confirmBinding?.[0]?.key || 'Enter';
            
            // Convert key code to display name
            const confirmDisplay = this._keyCodeToDisplay(confirmKey);
            
            return confirmDisplay;
        } catch (error) {
            // Fallback to default if there's any error
            return 'Enter';
        }
    }

    /**
     * Convert key code to display name
     * @param {string} keyCode - The key code
     * @returns {string} - Display name
     */
    _keyCodeToDisplay(keyCode) {
        const keyMap = {
            'BracketLeft': '[',
            'BracketRight': ']',
            'Minus': '-',
            'Equal': '=',
            'Comma': ',',
            'Period': '.',
            'Slash': '/',
            'Backslash': '\\',
            'Quote': "'",
            'Semicolon': ';',
            'Space': 'Space',
            'Enter': 'Enter',
            'Tab': 'Tab',
            'Escape': 'Esc'
        };

        // Handle special cases
        if (keyCode.startsWith('Key')) {
            return keyCode.replace('Key', '');
        }
        if (keyCode.startsWith('Digit')) {
            return keyCode.replace('Digit', '');
        }
        if (keyCode.startsWith('Numpad')) {
            return 'Num' + keyCode.replace('Numpad', '');
        }

        return keyMap[keyCode] || keyCode;
    }

    /**
     * Clean up all UI elements
     */
    cleanup() {
        this.removeTargetCountDisplay();
        this.removeMouseTargetDisplay();
        this.removeAllRangeIndicators();
        this.restoreOriginalCursor();

        // Cancel any pending animation frame
        if (this.mouseUpdateFrame) {
            cancelAnimationFrame(this.mouseUpdateFrame);
            this.mouseUpdateFrame = null;
        }
    }
}