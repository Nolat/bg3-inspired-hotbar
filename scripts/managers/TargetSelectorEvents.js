/**
 * Target Selector Event Handler
 * Manages all event handling for the target selector
 */
export class TargetSelectorEvents {
    constructor(targetSelector) {
        this.targetSelector = targetSelector;
        
        // Bind event handlers to preserve context
        this.onCanvasClick = this.onCanvasClick.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onTokenHover = this.onTokenHover.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);

        this.onDocumentClick = this.onDocumentClick.bind(this);
    }

    /**
     * Register all event listeners
     */
    registerEvents() {
        // Canvas events
        canvas.stage.on('click', this.onCanvasClick);
        
        // Document events
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('mousemove', this.onMouseMove);

        document.addEventListener('click', this.onDocumentClick, true);
        
        // Token hover events
        canvas.tokens.placeables.forEach(token => {
            token.on('mouseover', () => this.onTokenHover(token));
        });
    }

    /**
     * Unregister all event listeners
     */
    unregisterEvents() {
        // Canvas events
        canvas.stage.off('click', this.onCanvasClick);
        
        // Document events
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('mousemove', this.onMouseMove);

        document.removeEventListener('click', this.onDocumentClick, true);
        
        // Token hover events
        canvas.tokens.placeables.forEach(token => {
            token.off('mouseover');
        });
    }

    /**
     * Handle canvas click events
     * @param {Event} event - The click event
     */
    onCanvasClick(event) {
        // Always prevent default canvas behaviour when target selector is active
        event.stopPropagation();
        
        const token = this.getTokenFromEvent(event);
        if (!token) return;
        
        if (this.targetSelector.isValidTarget(token)) {
            this.targetSelector.toggleTarget(token);
        } else {
            ui.notifications.warn("Invalid target selected.");
        }
    }

    /**
     * Handle keyboard events
     * @param {Event} event - The keyboard event
     */
    onKeyDown(event) {
        if (event.key === 'Escape') {
            this.targetSelector.cancel();
        } else if (event.key === 'Enter') {
            this.targetSelector.confirmSelection();
        }
    }

    /**
     * Handle token hover events
     * @param {Token} token - The hovered token
     */
    onTokenHover(token) {
        if (!this.targetSelector.isActive) return;
        
        // Just validate the target on hover, don't move the range indicator
        // The range indicator should stay on the source token
        const isValid = this.targetSelector.isValidTarget(token);
        
        // Could add visual feedback here for valid/invalid targets if desired
        // For now, just let the existing range circle from the source token show the range
    }

    /**
     * Handle mouse move events
     * @param {Event} event - The mouse move event
     */
    onMouseMove(event) {
        if (!this.targetSelector.isActive) return;
        

        
        // Update mouse target display position
        if (this.targetSelector.ui && this.targetSelector.ui.mouseUpdateFrame) {
            cancelAnimationFrame(this.targetSelector.ui.mouseUpdateFrame);
        }
        
        if (this.targetSelector.ui) {
            this.targetSelector.ui.mouseUpdateFrame = requestAnimationFrame(() => {
                this.targetSelector.ui.updateMouseTargetDisplay(event.clientX, event.clientY);
            });
        }
    }

    /**
     * Handle document click events to prevent token selection
     * @param {Event} event - The click event
     */
    onDocumentClick(event) {
        if (!this.targetSelector.isActive) return;
        
        // Check if the click is on the canvas area
        const canvasElement = document.getElementById('board');
        if (canvasElement && canvasElement.contains(event.target)) {
            // Prevent any token selection when target selector is active
            event.stopPropagation();
        }
    }

    /**
     * Get token from canvas event
     * @param {Event} event - The canvas event
     * @returns {Token|null} - The token at the event position
     */
    getTokenFromEvent(event) {
        const position = event.data.getLocalPosition(canvas.tokens);
        const token = canvas.tokens.placeables.find(t => {
            const bounds = t.bounds;
            return position.x >= bounds.x && position.x <= bounds.x + bounds.width &&
                   position.y >= bounds.y && position.y <= bounds.y + bounds.height;
        });
        return token || null;
    }
}