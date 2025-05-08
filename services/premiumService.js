/**
 * Premium Service - Manages premium feature limits and constants
 * This centralizes all premium-related configuration in the backend
 */

// Centralized constants for all premium features
const CONSTANTS = {
  // Credit-related constants
  INITIAL_CREDITS: 100,              // Credits given when user first signs up
  FREE_WEEKLY_CREDITS: 50,           // Keep for backward compatibility
  FREE_DAILY_CREDITS: 10,            // Daily credits for free users (was previously 50 weekly)
  PREMIUM_DAILY_CREDITS: 100,        // Daily credits minimum for premium users
  ADVENTURE_CREDIT_THRESHOLD: 20,    // Credit threshold for adventure game
  
  // Location-related constants
  FREE_DAILY_CUSTOM_LOCATIONS: 3,    // Daily custom location limit for free users
  PREMIUM_DAILY_CUSTOM_LOCATIONS: 10, // Daily custom location limit for premium users
  
  // Other feature limits can be added here
  // FREE_SAVED_LOCATIONS: 10,
  // PREMIUM_SAVED_LOCATIONS: 100,
};

// Group constants by category for easier access
const CREDIT_LIMITS = {
  INITIAL_CREDITS: CONSTANTS.INITIAL_CREDITS,
  FREE_WEEKLY_CREDITS: CONSTANTS.FREE_WEEKLY_CREDITS,
  FREE_DAILY_CREDITS: CONSTANTS.FREE_DAILY_CREDITS,
  PREMIUM_DAILY_CREDITS: CONSTANTS.PREMIUM_DAILY_CREDITS,
  ADVENTURE_CREDIT_THRESHOLD: CONSTANTS.ADVENTURE_CREDIT_THRESHOLD
};

const LOCATION_LIMITS = {
  FREE_DAILY_CUSTOM_LOCATIONS: CONSTANTS.FREE_DAILY_CUSTOM_LOCATIONS,
  PREMIUM_DAILY_CUSTOM_LOCATIONS: CONSTANTS.PREMIUM_DAILY_CUSTOM_LOCATIONS
};

const FEATURE_LIMITS = {
  // Example: FREE_SAVED_LOCATIONS: CONSTANTS.FREE_SAVED_LOCATIONS,
  // Example: PREMIUM_SAVED_LOCATIONS: CONSTANTS.PREMIUM_SAVED_LOCATIONS,
};

/**
 * Get all premium limits and constants
 * @returns {Object} All premium configuration
 */
const getAllLimits = () => {
  return {
    ...CREDIT_LIMITS,
    ...LOCATION_LIMITS,
    ...FEATURE_LIMITS,
    constants: CONSTANTS
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

/**
 * Get all premium constants
 * @returns {Object} All premium constants
 */
const getPremiumConstants = () => {
  return CONSTANTS;
};

module.exports = {
  getAllLimits,
  getCreditLimits,
  getLocationLimits,
  getUserLimits,
  getPremiumConstants,
  CONSTANTS,
  CREDIT_LIMITS,
  LOCATION_LIMITS,
  FEATURE_LIMITS
}; 