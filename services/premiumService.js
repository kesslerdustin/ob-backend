/**
 * Premium Service - Manages premium feature limits and constants
 * This centralizes all premium-related configuration in the backend
 */

// Credit constants
const CREDIT_LIMITS = {
    INITIAL_CREDITS: 100,
    FREE_WEEKLY_CREDITS: 50, 
    PREMIUM_DAILY_CREDITS: 100,
    ADVENTURE_CREDIT_THRESHOLD: 20
};

// Custom location limits
const LOCATION_LIMITS = {
    FREE_DAILY_CUSTOM_LOCATIONS: 3,
    PREMIUM_DAILY_CUSTOM_LOCATIONS: 10
};

// Other premium feature limits can be added here
const FEATURE_LIMITS = {
    // Example: FREE_SAVED_LOCATIONS: 10,
    // Example: PREMIUM_SAVED_LOCATIONS: 100,
};

/**
 * Get all premium limits and constants
 * @returns {Object} All premium configuration
 */
const getAllLimits = () => {
    return {
        ...CREDIT_LIMITS,
        ...LOCATION_LIMITS,
        ...FEATURE_LIMITS
    };
};

/**
 * Get credit-related limits
 * @returns {Object} Credit limits
 */
const getCreditLimits = () => {
    return { ...CREDIT_LIMITS };
};

/**
 * Get location-related limits
 * @returns {Object} Location limits
 */
const getLocationLimits = () => {
    return { ...LOCATION_LIMITS };
};

/**
 * Get user-specific premium limits, potentially customized based on user data
 * @param {string} userId - The user ID to get limits for
 * @returns {Promise<Object>} User-specific premium limits
 */
const getUserLimits = async (userId) => {
    try {
        // In the future, you could look up user-specific limits in the database
        // For now, return standard limits
        return getAllLimits();
    } catch (error) {
        console.error('Error getting user limits:', error);
        // Return default limits if there was an error
        return getAllLimits();
    }
};

module.exports = {
    getAllLimits,
    getCreditLimits,
    getLocationLimits,
    getUserLimits,
    CREDIT_LIMITS,
    LOCATION_LIMITS,
    FEATURE_LIMITS
}; 