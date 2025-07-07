/**
 * Partner Zone Constants and Supported Types
 * 
 * This file contains all supported constants for partner zones including
 * units, icons, categories, priorities, and other standardized values.
 * Used for validation and consistency across the partner zone system.
 */

// Supported units for stats
const SUPPORTED_UNITS = [
  // Distance units
  'km', 'm', 'miles', 'ft',
  
  // Quantity units
  'million', 'billion', 'summits',
  
  // Time units
  'million_years', 'year',
  
  // Temperature units
  'celsius', 'fahrenheit'
];

// Supported Material Icons and Ionicons used in the app
const SUPPORTED_ICONS = [
  // Material Icons (md)
  'history', 'height', 'straighten', 'expand', 'groups', 'terrain',
  'landscape', 'eco', 'water', 'account_balance', 'thermostat',
  'history_edu', 'mountain', 'park', 'hiking', 'photo_camera',
  'explore', 'map', 'info', 'warning', 'local_activity', 'flag',
  'ac_unit', 'translate', 'diversity_3', 'recycling',
  
  // Ionicons
  'leaf-outline', 'leaf', 'paw-outline', 'paw', 'compass-outline',
  'analytics-outline', 'walk-outline', 'eye-outline', 'flame-outline',
  'map-outline', 'shield-outline', 'trophy-outline', 'star-outline',
  'medal-outline', 'school-outline', 'school', 'location-outline',
  'location', 'checkmark-circle-outline', 'layers-outline',
  'calendar-outline', 'calendar', 'time-outline', 'time',
  'apps-outline', 'navigate-outline', 'library-outline',
  'share-outline', 'share', 'people', 'earth-outline',
  'earth', 'globe-outline', 'globe', 'flower-outline',
  'flower', 'search-outline', 'chatbubble-outline',
  'chatbubbles-outline', 'chatbubbles', 'tree-outline',
  'flag-outline', 'airplane-outline', 'cloud-offline-outline',
  'download-outline', 'information-circle-outline',
  'document-text-outline', 'resize', 'settings',
  
  // MaterialCommunityIcons
  'flash', 'compass', 'search', 'book', 'map',
  'camera', 'chatbubble', 'analytics', 'navigate',
  'information-circle', 'document-text'
];

// News priority levels (urgency tags)
const NEWS_PRIORITIES = [
  'high',
  'medium',
  'low'
];

// News categories
const NEWS_CATEGORIES = [
  'closure',
  'announcement', 
  'event',
  'weather',
  'maintenance',
  'wildlife',
  'safety',
  'update'
];

// POI (Point of Interest) types/categories
const POI_TYPES = [
  'lodge',
  'viewpoint',
  'museum',
  'visitor_center',
  'restaurant',
  'hotel',
  'campground',
  'trailhead',
  'parking',
  'restroom',
  'gift_shop',
  'picnic_area',
  'beach',
  'waterfall',
  'cave',
  'historic_site',
  'lighthouse',
  'bridge',
  'overlook',
  'camp',
  'village',
  'monastery'
];

// Available amenities for POIs
const POI_AMENITIES = [
  'restaurant',
  'gift_shop', 
  'restrooms',
  'parking',
  'benches',
  'museum',
  'water_fountain',
  'wifi',
  'accessibility',
  'pet_friendly',
  'picnic_tables',
  'visitor_center',
  'guided_tours',
  'educational_programs',
  'food_service',
  'lodging',
  'camping',
  'showers',
  'laundry',
  'fuel',
  'atm',
  'first_aid',
  'tent_lodging',
  'medical_clinic',
  'communication',
  'lodge',
  'gear_shop',
  'bakery',
  'prayer_hall',
  'guesthouse'
];

// Tour difficulty levels
const TOUR_DIFFICULTIES = [
  'Easy',
  'Easy to moderate',
  'Moderate',
  'Moderate to difficult',
  'Difficult',
  'Very difficult',
  'Expert only'
];

// Common tour durations (can be extended as needed)
const TOUR_DURATIONS = [
  '30 minutes',
  '1 hour',
  '1-2 hours',
  '2-3 hours', 
  '3-4 hours',
  '4-6 hours',
  '6-8 hours',
  'Full day',
  'Multi-day'
];

// Common tour distances (can be extended as needed)
const TOUR_DISTANCES = [
  '0.5 miles',
  '1 mile',
  '1.5 miles',
  '2 miles',
  '3.2 miles',
  '5 miles',
  '7.5 miles',
  '10 miles',
  '15 miles',
  '20+ miles'
];

// Waypoint types for tours
const WAYPOINT_TYPES = [
  'start',
  'end',
  'viewpoint',
  'museum',
  'historic',
  'trail',
  'rest_area',
  'parking',
  'visitor_center',
  'lodge',
  'restaurant',
  'restroom',
  'water',
  'emergency',
  'photo_spot',
  'interpretation'
];

// Quiz question types
const QUIZ_QUESTION_TYPES = [
  'multiple_choice',
  'true_false',
  'image_based',
  'image_sequence',
  'drag_drop',
  'fill_blank'
];

// Geographic regions for efficient querying
const GEOGRAPHIC_REGIONS = [
  'north-america-west',
  'north-america-east', 
  'europe-west',
  'europe-east',
  'asia-west',
  'asia-east',
  'africa',
  'oceania',
  'south-america',
  'unknown'
];

// Image priority levels for loading optimization
const IMAGE_PRIORITIES = [
  'high',
  'medium',
  'low'
];

// Supported languages for translations
const SUPPORTED_LANGUAGES = [
  'en', // English
  'it', // Italian
  'de', // German
  'es', // Spanish
  'pt', // Portuguese
  'ja', // Japanese
  'fr'  // French
];

// Validation helper functions
const ValidationHelpers = {
  /**
   * Check if a unit is supported
   * @param {string} unit 
   * @returns {boolean}
   */
  isValidUnit: (unit) => SUPPORTED_UNITS.includes(unit),
  
  /**
   * Check if an icon is supported
   * @param {string} icon 
   * @returns {boolean}
   */
  isValidIcon: (icon) => SUPPORTED_ICONS.includes(icon),
  
  /**
   * Check if a news priority is valid
   * @param {string} priority 
   * @returns {boolean}
   */
  isValidNewsPriority: (priority) => NEWS_PRIORITIES.includes(priority),
  
  /**
   * Check if a news category is valid
   * @param {string} category 
   * @returns {boolean}
   */
  isValidNewsCategory: (category) => NEWS_CATEGORIES.includes(category),
  
  /**
   * Check if a POI type is valid
   * @param {string} type 
   * @returns {boolean}
   */
  isValidPOIType: (type) => POI_TYPES.includes(type),
  
  /**
   * Check if a POI amenity is valid
   * @param {string} amenity 
   * @returns {boolean}
   */
  isValidPOIAmenity: (amenity) => POI_AMENITIES.includes(amenity),
  
  /**
   * Check if a tour difficulty is valid
   * @param {string} difficulty 
   * @returns {boolean}
   */
  isValidTourDifficulty: (difficulty) => TOUR_DIFFICULTIES.includes(difficulty),
  
  /**
   * Check if a waypoint type is valid
   * @param {string} type 
   * @returns {boolean}
   */
  isValidWaypointType: (type) => WAYPOINT_TYPES.includes(type),
  
  /**
   * Check if a quiz question type is valid
   * @param {string} type 
   * @returns {boolean}
   */
  isValidQuizQuestionType: (type) => QUIZ_QUESTION_TYPES.includes(type),
  
  /**
   * Check if a geographic region is valid
   * @param {string} region 
   * @returns {boolean}
   */
  isValidGeographicRegion: (region) => GEOGRAPHIC_REGIONS.includes(region),
  
  /**
   * Check if an image priority is valid
   * @param {string} priority 
   * @returns {boolean}
   */
  isValidImagePriority: (priority) => IMAGE_PRIORITIES.includes(priority),
  
  /**
   * Check if a language code is supported
   * @param {string} lang 
   * @returns {boolean}
   */
  isValidLanguage: (lang) => SUPPORTED_LANGUAGES.includes(lang),
  
  /**
   * Get all validation errors for a partner zone object
   * @param {Object} zoneData 
   * @returns {Array<string>} Array of error messages
   */
  validatePartnerZone: (zoneData) => {
    const errors = [];
    
    // Add comprehensive validation logic here
    // This can be expanded based on specific requirements
    
    return errors;
  }
};

module.exports = {
  // Constants
  SUPPORTED_UNITS,
  SUPPORTED_ICONS,
  NEWS_PRIORITIES,
  NEWS_CATEGORIES,
  POI_TYPES,
  POI_AMENITIES,
  TOUR_DIFFICULTIES,
  TOUR_DURATIONS,
  TOUR_DISTANCES,
  WAYPOINT_TYPES,
  QUIZ_QUESTION_TYPES,
  GEOGRAPHIC_REGIONS,
  IMAGE_PRIORITIES,
  SUPPORTED_LANGUAGES,
  
  // Validation helpers
  ValidationHelpers
}; 