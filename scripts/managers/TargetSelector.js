import { TargetSelectorUI } from './TargetSelectorUI.js';
import { TargetSelectorMath } from './TargetSelectorMath.js';
import { TargetSelectorEvents } from './TargetSelectorEvents.js';

/**
 * BG3 Target Selector - Refactored version with separated concerns
 * Provides interactive target selection for spells and abilities
 */
export class TargetSelector {
    constructor({ token, requirements = {} }) {
        this.token = token;
        this.requirements = requirements;
        this.selectedTargets = [];
        this.isActive = false;

        // Component managers
        this.ui = new TargetSelectorUI();
        this.events = new TargetSelectorEvents(this);

        // Token controls state
        this.originalTokenTool = null;

        // Promise resolution
        this.resolvePromise = null;
        this.rejectPromise = null;
    }

    /**
     * Start the target selection process
     * @returns {Promise<Token[]>} Promise that resolves with selected targets
     */
    async select() {
        if (this.isActive) {
            console.warn("BG3 Target Selector | Target selector is already active");
            return [];
        }

        // Check if we should skip the selector for single-target activities with valid existing targets
        if (this.shouldSkipSelector()) {
            const existingTargets = Array.from(game.user.targets);
            return existingTargets;
        }

        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
            this.activate();
        });
    }

    /**
     * Check if we should skip the target selector
     * @returns {boolean} True if selector should be skipped
     */
    shouldSkipSelector() {
        // Check if the setting is enabled
        if (!game.settings.get('bg3-inspired-hotbar', 'skipSelectorWithValidTarget')) {
            return false;
        }

        // Only skip for single-target activities
        const maxTargets = this.requirements.maxTargets || 1;
        if (maxTargets !== 1) {
            return false;
        }

        // Check if we have exactly one target selected
        const currentTargets = Array.from(game.user.targets);
        if (currentTargets.length !== 1) {
            return false;
        }

        // Check if the current target is valid for this activity
        const target = currentTargets[0];
        if (!this.isValidTarget(target)) {
            return false;
        }

        return true;
    }

    /**
     * Activate the target selector
     */
    activate() {
        this.isActive = true;
        this.selectedTargets = [];

        // Set global active target selector for debugging
        window.activeTargetSelector = this;

        

        // Setup UI
        this.ui.createTargetCountDisplay(this.requirements, 0);
        this.ui.setTargetingCursor();
        this.ui.createMouseTargetDisplay(0, 0, this.requirements, 0);

        // Show range indicator if there's a range requirement
        if (this.requirements.range && this.token) {
            this.ui.showRangeIndicator(this.token, this.requirements.range);
        }

        // Auto-target self if enabled and valid
        if (game.settings.get('bg3-inspired-hotbar', 'autoTargetSelf') &&
            this.requirements.type !== 'other' &&
            this.isValidTarget(this.token)) {
            this.toggleTarget(this.token);
        }

        // Switch to target tool to prevent token selection
        this.switchToTargetTool();

        // Register event listeners
        this.events.registerEvents();

        // Get the confirm keybind for the notification
        const confirmKeybind = this.ui._getConfirmKeybindDisplay();
        
        // Notify user
        ui.notifications.info(`Select targets. Press ESC to cancel or ${confirmKeybind} when done.`);
    }

    /**
     * Deactivate the target selector
     */
    deactivate() {
        if (!this.isActive) return;

        this.isActive = false;

        // Clear global active target selector
        if (window.activeTargetSelector === this) {
            window.activeTargetSelector = null;
        }

        // Cleanup UI
        this.ui.cleanup();

        // Restore original token tool
        this.restoreTokenTool();

        // Unregister event listeners
        this.events.unregisterEvents();

        
    }

    /**
     * Toggle target selection for a token
     * @param {Token} token - The token to toggle
     */
    toggleTarget(token) {
        const index = this.selectedTargets.indexOf(token);

        if (index > -1) {
            // Remove target
            this.selectedTargets.splice(index, 1);
            token.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true });
            
        } else {
            // Add target (if under max limit)
            const maxTargets = this.requirements.maxTargets || 1;
            if (this.selectedTargets.length < maxTargets) {
                this.selectedTargets.push(token);
                token.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
                
            } else {
                ui.notifications.warn(`Maximum ${maxTargets} targets allowed.`);
                return;
            }
        }

        // Update UI
        this.ui.updateTargetCountDisplay(this.selectedTargets.length, this.requirements.maxTargets || 1);
        this.ui.updateMouseTargetCount(this.selectedTargets.length, this.requirements.maxTargets || 1);
    }

    /**
     * Adjust the maximum target count
     * @param {number} delta - Change in max targets (+1 or -1)
     */
    adjustMaxTargets(delta) {
        const newMax = Math.max(1, (this.requirements.maxTargets || 1) + delta);
        this.requirements.maxTargets = newMax;

        

        // Store current mouse position before recreating displays
        let currentMouseX = 0, currentMouseY = 0;
        if (this.ui.mouseTargetDisplay) {
            const element = this.ui.mouseTargetDisplay[0];
            if (element) {
                currentMouseX = parseInt(element.style.left) - 20; // Remove offset
                currentMouseY = parseInt(element.style.top) + 20; // Remove offset
            }
        }

        // Recreate displays with new max
        this.ui.createTargetCountDisplay(this.requirements, this.selectedTargets.length);
        this.ui.createMouseTargetDisplay(currentMouseX, currentMouseY, this.requirements, this.selectedTargets.length);

        // Restore mouse position if we had one
        if (currentMouseX > 0 || currentMouseY > 0) {
            this.ui.updateMouseTargetDisplay(currentMouseX, currentMouseY);
        }

        // Remove excess targets if new max is lower
        while (this.selectedTargets.length > newMax) {
            const removedTarget = this.selectedTargets.pop();
            removedTarget.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true });
        }
    }

    /**
     * Confirm the current selection
     */
    confirmSelection() {
        const minTargets = this.requirements.minTargets || 1;

        if (this.selectedTargets.length < minTargets) {
            ui.notifications.warn(`Please select at least ${minTargets} target(s).`);
            return;
        }

        

        // Keep the Foundry targets set for the activity execution
        // They will be cleared by the calling code after the activity is used

        this.deactivate();

        if (this.resolvePromise) {
            this.resolvePromise([...this.selectedTargets]);
            this.resolvePromise = null;
            this.rejectPromise = null;
        }
    }

    /**
     * Cancel target selection
     */
    cancel() {
        // Clear all targets when cancelling
        this.selectedTargets.forEach(target => {
            target.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true });
        });

        this.deactivate();

        if (this.resolvePromise) {
            this.resolvePromise([]);
            this.resolvePromise = null;
            this.rejectPromise = null;
        }
    }

    /**
     * Check if a token is a valid target
     * @param {Token} token - The token to validate
     * @returns {boolean} - True if valid target
     */
    isValidTarget(token) {
        if (!token) return false;

        // Check if token is within range
        if (this.requirements.range && !this.isWithinRange(token)) {
            return false;
        }

        // Check if token meets target type requirements
        if (this.requirements.type && !this.meetsTargetType(token)) {
            return false;
        }

        // Check if we can target this token (visibility, etc.)
        if (!token.isVisible || token.document.hidden) {
            return false;
        }

        return true;
    }

    /**
     * Check if token is within range
     * @param {Token} token - The token to check
     * @returns {boolean} - True if within range
     */
    isWithinRange(token) {
        // Check if range checking is disabled
        if (!game.settings.get('bg3-inspired-hotbar', 'enableRangeChecking')) {
            return true; // Allow all targets when range checking is disabled
        }

        if (!this.requirements.range || !this.token) return true;

        return TargetSelectorMath.isWithinRange(this.token, token, this.requirements.range);
    }

    /**
     * Check if token meets target type requirements
     * @param {Token} token - The token to check
     * @returns {boolean} - True if meets requirements
     */
    meetsTargetType(token) {
        if (!this.requirements.type) return true;

        const targetType = this.requirements.type.toLowerCase();
        const actor = token.actor;

        switch (targetType) {
            case 'creature':
                return actor && ['character', 'npc'].includes(actor.type);
            case 'ally':
                return actor && actor.hasPlayerOwner;
            case 'enemy':
                return actor && !actor.hasPlayerOwner && actor.type === 'npc';
            case 'self':
                return token === this.token;
            case 'other':
                return token !== this.token;
            default:
                return true;
        }
    }

    /**
     * Switch to target tool to prevent normal token selection
     */
    switchToTargetTool() {
        if (ui.controls?.activeControl !== 'token') return;

        this.originalTokenTool = ui.controls.activeTool;

        // Switch to target tool if available, otherwise stay on current tool
        if (ui.controls.tools.find(t => t.name === 'target')) {
            ui.controls.activeTool = 'target';
            ui.controls.render();
        }
    }

    /**
     * Restore the original token tool
     */
    restoreTokenTool() {
        if (this.originalTokenTool && ui.controls?.activeControl === 'token') {
            ui.controls.activeTool = this.originalTokenTool;
            ui.controls.render();
            this.originalTokenTool = null;
        }
    }
}