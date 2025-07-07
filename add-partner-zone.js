/**
 * Script to add partner zones to Firestore
 * Usage: node add-partner-zone.js [zoneDataFile] [imagesDir]
 * 
 * This script adds partner zone data to Firestore and uploads images to Firebase Storage.
 * Updated to support the new JSON structure with comprehensive translations.
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const geohash = require('ngeohash'); // Add ngeohash for geographic optimization

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
    databaseURL: 'https://outdoor-bible.firebaseio.com'
  });
}

const storage = admin.storage();
const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET || 'outdoor-bible.appspot.com');

// Import partner zone constants
const {
  SUPPORTED_UNITS,
  SUPPORTED_ICONS,
  NEWS_PRIORITIES,
  NEWS_CATEGORIES,
  POI_TYPES,
  POI_AMENITIES,
  TOUR_DIFFICULTIES,
  WAYPOINT_TYPES,
  QUIZ_QUESTION_TYPES,
  ValidationHelpers
} = require('./utils/partnerZoneConstants');

/**
 * Validates a stat object with nested translations
 * @param {Object} stat The stat object to validate
 * @param {Array<string>} supportedLanguages List of supported languages to validate
 * @returns {string|null} Error message if invalid, null if valid
 */
function validateStat(stat, supportedLanguages = ['en']) {
  if (!stat.id) return 'Stat missing ID';
  if (!stat.icon) return `Stat ${stat.id} missing icon`;
  if (!SUPPORTED_ICONS.includes(stat.icon)) return `Stat ${stat.id} has unsupported icon: ${stat.icon}`;
  if (!stat.value) return `Stat ${stat.id} missing value`;
  if (!stat.unit) return `Stat ${stat.id} missing unit`;
  if (!SUPPORTED_UNITS.includes(stat.unit)) return `Stat ${stat.id} has unsupported unit: ${stat.unit}`;
  if (stat.secondaryUnit && !SUPPORTED_UNITS.includes(stat.secondaryUnit)) {
    return `Stat ${stat.id} has unsupported secondary unit: ${stat.secondaryUnit}`;
  }
  
  // Validate nested translations for all supported languages
  if (!stat.translations) return `Stat ${stat.id} missing translations object`;
  for (const lang of supportedLanguages) {
    if (!stat.translations[lang]) return `Stat ${stat.id} missing ${lang} translation`;
    if (!stat.translations[lang].label) return `Stat ${stat.id} missing ${lang} label`;
    if (!stat.translations[lang].description) return `Stat ${stat.id} missing ${lang} description`;
  }
  
  return null;
}

/**
 * Validates translation completeness across all supported languages for new structure
 * @param {Object} zoneData The zone data to validate
 * @returns {Array<string>} Array of error messages
 */
function validateTranslationCompleteness(zoneData) {
  const errors = [];
  const supportedLanguages = Object.keys(zoneData.translations);
  
  // Required sections for each language
  const requiredSections = ['name', 'region', 'description'];
  
  for (const lang of supportedLanguages) {
    const translation = zoneData.translations[lang];
    
    // Check required sections
    for (const section of requiredSections) {
      if (!translation[section]) {
        errors.push(`Language ${lang} missing required section: ${section}`);
      }
    }
    
    // Validate stats - these are objects with keys, not arrays
    if (translation.stats) {
      if (typeof translation.stats !== 'object' || Array.isArray(translation.stats)) {
        errors.push(`Language ${lang} stats must be an object`);
      } else {
        // Validate each stat in the object
        for (const [statId, statTranslation] of Object.entries(translation.stats)) {
          if (!statTranslation.label) {
            errors.push(`Language ${lang} stat ${statId} missing label`);
          }
          if (!statTranslation.description) {
            errors.push(`Language ${lang} stat ${statId} missing description`);
          }
        }
      }
    }
    
    // Validate interesting facts - these are objects with keys, not arrays
    if (translation.interestingFacts) {
      if (typeof translation.interestingFacts !== 'object' || Array.isArray(translation.interestingFacts)) {
        errors.push(`Language ${lang} interestingFacts must be an object`);
      } else {
        for (const [factId, factTranslation] of Object.entries(translation.interestingFacts)) {
          if (!factTranslation.text) {
            errors.push(`Language ${lang} fact ${factId} missing text`);
          }
        }
      }
    }
    
    // Validate historical info - icon is in root object, not translation
    if (translation.historicalInfo) {
      if (!translation.historicalInfo.text) {
        errors.push(`Language ${lang} historicalInfo missing text`);
      }
      // Check icon in root historicalInfo object instead of translation
      if (zoneData.historicalInfo && zoneData.historicalInfo.icon && !SUPPORTED_ICONS.includes(zoneData.historicalInfo.icon)) {
        errors.push(`Root historicalInfo has unsupported icon: ${zoneData.historicalInfo.icon}`);
      }
    }
    
    // Validate news if present in translations - these are objects with keys, not arrays
    if (translation.news) {
      if (typeof translation.news !== 'object' || Array.isArray(translation.news)) {
        errors.push(`Language ${lang} news must be an object`);
      } else {
        for (const [newsId, newsTranslation] of Object.entries(translation.news)) {
          if (!newsTranslation.title) {
            errors.push(`Language ${lang} news item ${newsId} missing title`);
          }
          if (!newsTranslation.summary) {
            errors.push(`Language ${lang} news item ${newsId} missing summary`);
          }
          if (!newsTranslation.content) {
            errors.push(`Language ${lang} news item ${newsId} missing content`);
          }
        }
      }
    }
  }
  
  // Validate root-level stats structure if present
  if (zoneData.stats) {
    if (typeof zoneData.stats !== 'object' || Array.isArray(zoneData.stats)) {
      errors.push('Root stats must be an object');
    } else {
      for (const [statId, stat] of Object.entries(zoneData.stats)) {
        if (!stat.icon) errors.push(`Root stat ${statId} missing icon`);
        if (!stat.value) errors.push(`Root stat ${statId} missing value`);
        if (!stat.unit) errors.push(`Root stat ${statId} missing unit`);
        if (stat.icon && !SUPPORTED_ICONS.includes(stat.icon)) {
          errors.push(`Root stat ${statId} has unsupported icon: ${stat.icon}`);
        }
        if (stat.unit && !SUPPORTED_UNITS.includes(stat.unit)) {
          errors.push(`Root stat ${statId} has unsupported unit: ${stat.unit}`);
        }
      }
    }
  }
  
  // Validate root-level interestingFacts structure if present
  if (zoneData.interestingFacts) {
    if (typeof zoneData.interestingFacts !== 'object' || Array.isArray(zoneData.interestingFacts)) {
      errors.push('Root interestingFacts must be an object');
    } else {
      for (const [factId, fact] of Object.entries(zoneData.interestingFacts)) {
        if (!fact.icon) errors.push(`Root fact ${factId} missing icon`);
        if (fact.icon && !SUPPORTED_ICONS.includes(fact.icon)) {
          errors.push(`Root fact ${factId} has unsupported icon: ${fact.icon}`);
        }
      }
    }
  }
  
  // Validate root-level news structure if present
  if (zoneData.news) {
    if (typeof zoneData.news !== 'object' || Array.isArray(zoneData.news)) {
      errors.push('Root news must be an object');
    } else {
      for (const [newsId, newsItem] of Object.entries(zoneData.news)) {
        if (newsItem.icon && !SUPPORTED_ICONS.includes(newsItem.icon)) {
          errors.push(`Root news item ${newsId} has unsupported icon: ${newsItem.icon}`);
        }
        if (newsItem.priority && !NEWS_PRIORITIES.includes(newsItem.priority)) {
          errors.push(`Root news item ${newsId} has unsupported priority: ${newsItem.priority}`);
        }
        if (newsItem.category && !NEWS_CATEGORIES.includes(newsItem.category)) {
          errors.push(`Root news item ${newsId} has unsupported category: ${newsItem.category}`);
        }
      }
    }
  }
  
  return errors;
}

/**
 * Validates POI translations
 * @param {Object} pois Object of POI objects to validate
 * @param {Array<string>} supportedLanguages List of supported languages
 * @returns {Array<string>} Array of error messages
 */
function validatePOITranslations(pois, supportedLanguages) {
  const errors = [];
  
  if (!pois || typeof pois !== 'object' || Array.isArray(pois)) return errors;
  
  for (const [poiId, poi] of Object.entries(pois)) {
    // Check if poi has translations in zone translations instead
    // POI translations are stored in the main zone translations under pois section
    // This function just validates the structure exists
    if (!poi.type) {
      errors.push(`POI ${poiId} missing type`);
    } else if (!POI_TYPES.includes(poi.type)) {
      errors.push(`POI ${poiId} has unsupported type: ${poi.type}`);
    }
    
    if (!poi.coords) {
      errors.push(`POI ${poiId} missing coords`);
    }
    
    // Validate amenities if present
    if (poi.amenities && Array.isArray(poi.amenities)) {
      for (const amenity of poi.amenities) {
        if (!POI_AMENITIES.includes(amenity)) {
          errors.push(`POI ${poiId} has unsupported amenity: ${amenity}`);
        }
      }
    }
  }
  
  return errors;
}

/**
 * Validates tour translations
 * @param {Object} tours Object of tour objects to validate
 * @param {Array<string>} supportedLanguages List of supported languages
 * @returns {Array<string>} Array of error messages
 */
function validateTourTranslations(tours, supportedLanguages) {
  const errors = [];
  
  if (!tours || typeof tours !== 'object' || Array.isArray(tours)) return errors;
  
  for (const [tourId, tour] of Object.entries(tours)) {
    // Check basic tour structure
    if (!tour.duration) {
      errors.push(`Tour ${tourId} missing duration`);
    }
    if (!tour.difficulty) {
      errors.push(`Tour ${tourId} missing difficulty`);
    } else if (!TOUR_DIFFICULTIES.includes(tour.difficulty)) {
      errors.push(`Tour ${tourId} has unsupported difficulty: ${tour.difficulty}`);
    }
    
    if (!tour.waypoints) {
      errors.push(`Tour ${tourId} missing waypoints`);
    } else if (typeof tour.waypoints !== 'object') {
      errors.push(`Tour ${tourId} waypoints must be an object`);
    } else {
      // Validate waypoint types if present
      for (const [waypointId, waypoint] of Object.entries(tour.waypoints)) {
        if (waypoint.type && !WAYPOINT_TYPES.includes(waypoint.type)) {
          errors.push(`Tour ${tourId} waypoint ${waypointId} has unsupported type: ${waypoint.type}`);
        }
      }
    }
  }
  
  return errors;
}

/**
 * Validates quiz translations in the main translations object
 * @param {Object} quiz Quiz object to validate (contains settings, questions, etc.)
 * @param {Object} translations Main translations object from zone data
 * @param {Array<string>} supportedLanguages List of supported languages
 * @returns {Array<string>} Array of error messages
 */
function validateQuizTranslations(quiz, translations, supportedLanguages) {
  const errors = [];
  
  if (!quiz) return errors;
  
  // Check that quiz has required structure (questions, settings, etc.)
  if (!quiz.questions || typeof quiz.questions !== 'object') {
    errors.push('Quiz missing questions object');
  } else {
    // Validate question types if present
    for (const [questionId, question] of Object.entries(quiz.questions)) {
      if (question.type && !QUIZ_QUESTION_TYPES.includes(question.type)) {
        errors.push(`Quiz question ${questionId} has unsupported type: ${question.type}`);
      }
    }
  }
  
  // Validate quiz translations in the main translations object
  for (const lang of supportedLanguages) {
    if (!translations[lang] || !translations[lang].quiz) {
      errors.push(`Quiz missing ${lang} translation in main translations object`);
      continue;
    }
    
    const quizTranslation = translations[lang].quiz;
    
    if (!quizTranslation.title) {
      errors.push(`Quiz missing ${lang} title`);
    }
    if (!quizTranslation.description) {
      errors.push(`Quiz missing ${lang} description`);
    }
  }
  
  return errors;
}

/**
 * Validates tickets translations in the main translations object
 * @param {Object} tickets Tickets object to validate (contains offers, validUntil, etc.)
 * @param {Object} translations Main translations object from zone data
 * @param {Array<string>} supportedLanguages List of supported languages
 * @returns {Array<string>} Array of error messages
 */
function validateTicketsTranslations(tickets, translations, supportedLanguages) {
  const errors = [];
  
  if (!tickets) return errors;
  
  // Check that tickets has required structure
  if (!tickets.validUntil) {
    errors.push('Tickets missing validUntil field');
  }
  
  // Validate tickets translations in the main translations object
  for (const lang of supportedLanguages) {
    if (!translations[lang] || !translations[lang].tickets) {
      errors.push(`Tickets missing ${lang} translation in main translations object`);
      continue;
    }
    
    const ticketsTranslation = translations[lang].tickets;
    
    if (!ticketsTranslation.infoText) {
      errors.push(`Tickets missing ${lang} infoText`);
    }
    if (!ticketsTranslation.offers) {
      errors.push(`Tickets missing ${lang} offers`);
    }
  }
  
  return errors;
}

/**
 * Validates icons in objects
 * @param {Object} obj The object containing potential icons
 * @returns {string|null} Error message if invalid, null if valid
 */
function validateIcons(obj) {
  if (!obj || typeof obj !== 'object') return null;

  if (obj.icon && !SUPPORTED_ICONS.includes(obj.icon)) {
    return `Unsupported icon: ${obj.icon}`;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item.icon && !SUPPORTED_ICONS.includes(item.icon)) {
        return `Unsupported icon in item: ${item.icon}`;
      }
    }
  }

  return null;
}

/**
 * Uploads an image to Firebase Storage and tracks it for cleanup
 * @param {string} localPath Path to local image file
 * @param {string} storagePath Path in Firebase Storage
 * @param {Set} uploadedFiles Set to track uploaded files for cleanup
 * @returns {Promise<string>} Public URL of the uploaded image
 */
async function uploadImage(localPath, storagePath, uploadedFiles = new Set()) {
  try {
    const contentType = mime.lookup(localPath) || 'image/jpeg';
    
    await bucket.upload(localPath, {
      destination: storagePath,
      metadata: {
        contentType: contentType,
        cacheControl: 'public, max-age=31536000' // Cache for 1 year
      }
    });
    
    // Make the file publicly accessible
    await bucket.file(storagePath).makePublic();
    
    // Track file for cleanup
    uploadedFiles.add(localPath);
    
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    console.log(`📸 Uploaded image: ${storagePath}`);
    return publicUrl;
    
  } catch (error) {
    console.error(`❌ Failed to upload image ${localPath}:`, error);
    throw error;
  }
}

/**
 * Cleans up uploaded files from local storage
 * @param {Set} uploadedFiles Set of file paths to clean up
 */
async function cleanupUploadedFiles(uploadedFiles) {
  if (uploadedFiles.size === 0) return;
  
  console.log(`🧹 Cleaning up ${uploadedFiles.size} uploaded files...`);
  
  for (const filePath of uploadedFiles) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Removed: ${filePath}`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not remove file ${filePath}:`, error.message);
    }
  }
  
  console.log('✅ Cleanup completed');
}

/**
 * Recursively processes image references in an object and uploads images
 * @param {Object} obj Object containing image references
 * @param {string} imagesDir Base directory containing images
 * @param {Set} uploadedFiles Set to track uploaded files for cleanup
 */
async function processImages(obj, imagesDir, uploadedFiles = new Set()) {
  if (!obj || typeof obj !== 'object') return;
  
  if (obj.storageRef && typeof obj.storageRef === 'string') {
    const localPath = path.join(imagesDir, obj.storageRef);
    if (fs.existsSync(localPath)) {
      obj.publicUrl = await uploadImage(localPath, obj.storageRef, uploadedFiles);
    } else {
      console.warn(`⚠️ Image not found: ${localPath}`);
    }
  }
  
  if (obj.gallery && obj.gallery.storagePrefix && obj.gallery.images) {
    // Handle both array format (legacy) and object format (new structure)
    const images = Array.isArray(obj.gallery.images) 
      ? obj.gallery.images 
      : Object.values(obj.gallery.images);
    
    for (const image of images) {
      const storagePath = obj.gallery.storagePrefix + image.filename;
      const localPath = path.join(imagesDir, storagePath);
      if (fs.existsSync(localPath)) {
        image.publicUrl = await uploadImage(localPath, storagePath, uploadedFiles);
      } else {
        console.warn(`⚠️ Gallery image not found: ${localPath}`);
      }
    }
  }
  
  // Recursively process nested objects and arrays
  for (const key in obj) {
    if (Array.isArray(obj[key])) {
      for (const item of obj[key]) {
        await processImages(item, imagesDir, uploadedFiles);
      }
    } else if (typeof obj[key] === 'object') {
      await processImages(obj[key], imagesDir, uploadedFiles);
    }
  }
}

/**
 * Generates geohashes for efficient geographic querying
 * @param {number} latitude 
 * @param {number} longitude 
 * @param {number} radiusKm Search radius in kilometers (default 50km)
 * @returns {Array<string>} Array of geohashes at different precisions
 */
function generateGeohashes(latitude, longitude, radiusKm = 50) {
  const geohashes = [];
  
  // Generate multiple precision levels for efficient querying
  // Precision 4: ~20km x 20km boxes
  // Precision 5: ~4.9km x 4.9km boxes  
  // Precision 6: ~1.2km x 0.6km boxes
  // Precision 7: ~152.9m x 152.4m boxes
  for (let precision = 4; precision <= 7; precision++) {
    const centerHash = geohash.encode(latitude, longitude, precision);
    geohashes.push(centerHash);
    
    // Add neighboring geohashes for edge cases
    const neighbors = geohash.neighbors(centerHash);
    geohashes.push(...Object.values(neighbors));
  }
  
  // Remove duplicates and return
  return [...new Set(geohashes)];
}

/**
 * Determines geographic region based on coordinates
 * @param {number} latitude 
 * @param {number} longitude 
 * @returns {string} Geographic region identifier
 */
function getGeographicRegion(latitude, longitude) {
  // Define region boundaries
  const regions = {
    'north-america-west': { latMin: 25, latMax: 72, lngMin: -180, lngMax: -95 },
    'north-america-east': { latMin: 25, latMax: 72, lngMin: -95, lngMax: -50 },
    'europe-west': { latMin: 35, latMax: 72, lngMin: -15, lngMax: 15 },
    'europe-east': { latMin: 35, latMax: 72, lngMin: 15, lngMax: 50 },
    'asia-west': { latMin: 10, latMax: 72, lngMin: 50, lngMax: 90 },
    'asia-east': { latMin: 10, latMax: 72, lngMin: 90, lngMax: 180 },
    'africa': { latMin: -35, latMax: 40, lngMin: -20, lngMax: 55 },
    'oceania': { latMin: -50, latMax: 0, lngMin: 110, lngMax: 180 },
    'south-america': { latMin: -60, latMax: 15, lngMin: -85, lngMax: -30 }
  };
  
  for (const [regionName, bounds] of Object.entries(regions)) {
    if (latitude >= bounds.latMin && latitude <= bounds.latMax &&
        longitude >= bounds.lngMin && longitude <= bounds.lngMax) {
      return regionName;
    }
  }
  
  return 'unknown';
}

async function addPartnerZone(zoneData, imagesDir) {
  const uploadedFiles = new Set();
  
  try {
    console.log('🔧 Adding partner zone to Firestore...');
    console.log(`📍 Zone: ${zoneData.translations.en.name}`);
    
    // Validate translation completeness
    console.log('🌍 Validating translation completeness...');
    const translationErrors = validateTranslationCompleteness(zoneData);
    if (translationErrors.length > 0) {
      console.error('❌ Translation validation errors:');
      translationErrors.forEach(error => console.error(`  - ${error}`));
      throw new Error(`Translation validation failed: ${translationErrors.length} errors found`);
    }
    console.log(`✅ Validated translations for ${Object.keys(zoneData.translations).length} languages`);

    // Validate POIs if provided
    if (zoneData.pois) {
      console.log('📍 Validating POI translations...');
      const supportedLanguages = Object.keys(zoneData.translations);
      const poiErrors = validatePOITranslations(zoneData.pois, supportedLanguages);
      if (poiErrors.length > 0) {
        console.error('❌ POI validation errors:');
        poiErrors.forEach(error => console.error(`  - ${error}`));
        throw new Error(`POI validation failed: ${poiErrors.length} errors found`);
      }
      console.log(`✅ Validated ${Object.keys(zoneData.pois).length} POIs`);
    }
    
    // Validate tours if provided
    if (zoneData.tours) {
      console.log('🚶 Validating tour translations...');
    const supportedLanguages = Object.keys(zoneData.translations);
      const tourErrors = validateTourTranslations(zoneData.tours, supportedLanguages);
      if (tourErrors.length > 0) {
        console.error('❌ Tour validation errors:');
        tourErrors.forEach(error => console.error(`  - ${error}`));
        throw new Error(`Tour validation failed: ${tourErrors.length} errors found`);
      }
      console.log(`✅ Validated ${Object.keys(zoneData.tours).length} tours`);
    }
    
    // Validate quiz if provided
    if (zoneData.quiz) {
      console.log('🧠 Validating quiz translations...');
      const supportedLanguages = Object.keys(zoneData.translations);
      const quizErrors = validateQuizTranslations(zoneData.quiz, zoneData.translations, supportedLanguages);
      if (quizErrors.length > 0) {
        console.error('❌ Quiz validation errors:');
        quizErrors.forEach(error => console.error(`  - ${error}`));
        throw new Error(`Quiz validation failed: ${quizErrors.length} errors found`);
      }
      console.log(`✅ Validated quiz`);
    }
    
    // Validate tickets if provided
    if (zoneData.tickets) {
      console.log('🎫 Validating ticket translations...');
      const supportedLanguages = Object.keys(zoneData.translations);
      const ticketErrors = validateTicketsTranslations(zoneData.tickets, zoneData.translations, supportedLanguages);
      if (ticketErrors.length > 0) {
        console.error('❌ Ticket validation errors:');
        ticketErrors.forEach(error => console.error(`  - ${error}`));
        throw new Error(`Ticket validation failed: ${ticketErrors.length} errors found`);
      }
      console.log(`✅ Validated tickets`);
    }
    
    // Validate hero image if provided
    if (zoneData.heroImage) {
      console.log('🖼️ Validating hero image...');
      if (!zoneData.heroImage.storageRef) {
        throw new Error('Hero image missing storageRef');
      }
      
      // Hero image translations are now in the main translations object under heroImage key
      // or the image can have a simple caption property for basic support
      const supportedLanguages = Object.keys(zoneData.translations);
      let hasTranslations = false;
      
      for (const lang of supportedLanguages) {
        if (zoneData.translations[lang] && zoneData.translations[lang].heroImage) {
          hasTranslations = true;
          const heroTranslation = zoneData.translations[lang].heroImage;
          if (!heroTranslation.caption) {
            throw new Error(`Hero image missing ${lang} caption in main translations`);
          }
        }
      }
      
      // If no translations found in main object, check for basic caption in hero image itself
      if (!hasTranslations && !zoneData.heroImage.caption) {
        console.warn('⚠️ Hero image has no caption in translations or root object');
      }
      
      console.log('✅ Hero image validation passed');
    }
    
    // Validate news icons, priorities, and categories
    if (zoneData.news) {
      console.log('📰 Validating news items...');
      if (typeof zoneData.news !== 'object' || Array.isArray(zoneData.news)) {
        throw new Error('News must be an object with news IDs as keys');
      }
      for (const [newsId, newsItem] of Object.entries(zoneData.news)) {
        if (newsItem.icon && !SUPPORTED_ICONS.includes(newsItem.icon)) {
          throw new Error(`News item ${newsId} has unsupported icon: ${newsItem.icon}`);
        }
        if (newsItem.priority && !NEWS_PRIORITIES.includes(newsItem.priority)) {
          throw new Error(`News item ${newsId} has unsupported priority: ${newsItem.priority}`);
        }
        if (newsItem.category && !NEWS_CATEGORIES.includes(newsItem.category)) {
          throw new Error(`News item ${newsId} has unsupported category: ${newsItem.category}`);
        }
      }
      console.log(`✅ Validated ${Object.keys(zoneData.news).length} news items`);
    }
    
    // Process and upload all images first
    if (imagesDir) {
      console.log('📸 Processing images...');
      
      // Log hero image processing
      if (zoneData.heroImage) {
        console.log('🖼️ Processing hero image...');
      }
      
      await processImages(zoneData, imagesDir, uploadedFiles);
    }
    
    const db = admin.firestore();
    
    // Convert center coordinates to GeoPoint and generate geohashes
    if (zoneData.center) {
      // Handle both array format [lat, lng] and object format {lat, lng}
      const originalLat = Array.isArray(zoneData.center) ? zoneData.center[0] : zoneData.center.lat;
      const originalLng = Array.isArray(zoneData.center) ? zoneData.center[1] : zoneData.center.lng;
      
      // Generate geohashes for efficient querying
      const geohashes = generateGeohashes(originalLat, originalLng, zoneData.searchRadius || 50);
      console.log(`🔗 Generated ${geohashes.length} geohashes for efficient querying`);
      
      // Determine geographic region
      const region = getGeographicRegion(originalLat, originalLng);
      console.log(`🌍 Detected geographic region: ${region}`);
      
      // Add geohashes and region to zone data
      zoneData.geohashes = geohashes;
      zoneData.region = region;
      
      // Convert to GeoPoint
      zoneData.center = new admin.firestore.GeoPoint(originalLat, originalLng);
      console.log(`📍 Converted coordinates to GeoPoint: ${zoneData.center.latitude}, ${zoneData.center.longitude}`);
    }
    
    // Convert polygon coordinates to GeoPoints if provided
    if (zoneData.areaPolygon) {
      zoneData.areaPolygon = zoneData.areaPolygon.map(point => {
        // Handle both array format [lat, lng] and object format {lat, lng}
        const lat = Array.isArray(point) ? point[0] : point.lat;
        const lng = Array.isArray(point) ? point[1] : point.lng;
        return new admin.firestore.GeoPoint(lat, lng);
      });
      console.log(`📍 Converted ${zoneData.areaPolygon.length} polygon points to GeoPoints`);
    }
    
    // Add timestamps if not provided
    const now = admin.firestore.Timestamp.now();
    if (!zoneData.createdAt) zoneData.createdAt = now;
    if (!zoneData.updatedAt) zoneData.updatedAt = now;
    
    // Initialize likes array if not provided
    if (!zoneData.likes) zoneData.likes = [];
    
    // Add convenience boolean flags for features
    console.log('🏷️ Setting feature flags...');
    const hasLegacyTour = !!(zoneData.tour && (zoneData.tour.waypoints || zoneData.tour.description));
    const hasMultipleTours = !!(zoneData.tours && typeof zoneData.tours === 'object' && Object.keys(zoneData.tours).length > 0);
    
    zoneData.hasTour = hasLegacyTour;
    zoneData.hasTours = hasMultipleTours;
    zoneData.hasQuiz = !!(zoneData.quiz && (zoneData.quiz.questions || zoneData.quiz.settings));
    zoneData.hasTickets = !!(zoneData.tickets && (zoneData.tickets.offers || zoneData.tickets.validUntil));
    
    console.log('✅ Feature flags set:', {
      hasTour: zoneData.hasTour,
      hasTours: zoneData.hasTours,
      hasQuiz: zoneData.hasQuiz,
      hasTickets: zoneData.hasTickets
    });
    
    // Process POIs coordinates
    if (zoneData.pois && typeof zoneData.pois === 'object') {
      for (const [poiId, poi] of Object.entries(zoneData.pois)) {
        if (poi.coords) {
          // Handle both array format [lat, lng] and object format {lat, lng}
          const lat = Array.isArray(poi.coords) ? poi.coords[0] : poi.coords.lat;
          const lng = Array.isArray(poi.coords) ? poi.coords[1] : poi.coords.lng;
          poi.coords = new admin.firestore.GeoPoint(lat, lng);
        }
      }
      const poiCount = Object.keys(zoneData.pois).length;
      console.log(`📍 Converted ${poiCount} POI coordinates to GeoPoints`);
    }
    
    // Process tour waypoint coordinates (supports both single tour and multiple tours)
    if (zoneData.tour && zoneData.tour.waypoints) {
      // Legacy single tour format
      zoneData.tour.waypoints = zoneData.tour.waypoints.map(waypoint => ({
        ...waypoint,
        coords: new admin.firestore.GeoPoint(
          waypoint.coords.lat,
          waypoint.coords.lng
        )
      }));
      console.log(`📍 Converted ${zoneData.tour.waypoints.length} tour waypoint coordinates to GeoPoints (legacy single tour)`);
    }
    
    if (zoneData.tours && typeof zoneData.tours === 'object') {
      // Handle tours as object with tour IDs as keys
      let totalWaypoints = 0;
      for (const [tourId, tour] of Object.entries(zoneData.tours)) {
        if (tour.waypoints && typeof tour.waypoints === 'object') {
          for (const [waypointId, waypoint] of Object.entries(tour.waypoints)) {
            if (waypoint.coords) {
              // Handle both array format [lat, lng] and object format {lat, lng}
              const lat = Array.isArray(waypoint.coords) ? waypoint.coords[0] : waypoint.coords.lat;
              const lng = Array.isArray(waypoint.coords) ? waypoint.coords[1] : waypoint.coords.lng;
              waypoint.coords = new admin.firestore.GeoPoint(lat, lng);
              totalWaypoints++;
            }
          }
        }
      }
      const tourCount = Object.keys(zoneData.tours).length;
      console.log(`📍 Converted ${totalWaypoints} waypoint coordinates across ${tourCount} tours to GeoPoints`);
    }
    
    // Store everything in the main document
    const zoneRef = db.collection('partnerZones').doc(zoneData.id);
    await zoneRef.set(zoneData);
    console.log('✅ Created complete zone document with all data');
    
    // Clean up uploaded files after successful Firestore write
    await cleanupUploadedFiles(uploadedFiles);
    
    console.log('\n🎯 Partner zone added successfully!');
    console.log('📋 Zone details:');
    console.log(`  - ID: ${zoneData.id}`);
    console.log(`  - Author: ${zoneData.author}`);
    console.log(`  - Official: ${zoneData.official}`);
    console.log(`  - User ID: ${zoneData.userid || 'Not specified'}`);
    console.log(`  - Name (EN): ${zoneData.translations.en.name}`);
    console.log(`  - Region (EN): ${zoneData.translations.en.region}`);
    console.log(`  - Available translations: ${Object.keys(zoneData.translations).join(', ')}`);
    console.log(`  - Center: ${zoneData.center.latitude}, ${zoneData.center.longitude}`);
    console.log(`  - Likes: ${zoneData.likes.length} users`);
    console.log(`  - Features:`);
    console.log(`    • Hero Image: ${zoneData.heroImage ? '✓' : '✗'}`);
    console.log(`    • Stats: ${zoneData.translations.en.stats ? Object.keys(zoneData.translations.en.stats).length : 0}`);
    console.log(`    • Facts: ${zoneData.translations.en.interestingFacts ? Object.keys(zoneData.translations.en.interestingFacts).length : 0}`);
    console.log(`    • Historical Info: ${zoneData.translations.en.historicalInfo ? '✓' : '✗'}`);
    console.log(`    • News: ${zoneData.news ? Object.keys(zoneData.news).length : 0}`);
    console.log(`    • POIs: ${zoneData.pois ? Object.keys(zoneData.pois).length : 0}`);
    console.log(`    • Tours: ${zoneData.tours ? Object.keys(zoneData.tours).length : (zoneData.tour ? '1 (legacy)' : '0')} (hasTour: ${zoneData.hasTour}, hasTours: ${zoneData.hasTours})`);
    console.log(`    • Quiz: ${zoneData.quiz ? '✓' : '✗'} (hasQuiz: ${zoneData.hasQuiz})`);
    console.log(`    • Tickets: ${zoneData.tickets ? '✓' : '✗'} (hasTickets: ${zoneData.hasTickets})`);
    console.log(`    • Contact: ${zoneData.contact ? '✓' : '✗'}`);
    
  } catch (error) {
    console.error('❌ Error adding partner zone:', error);
    
    // Clean up uploaded files even on error
    await cleanupUploadedFiles(uploadedFiles);
    
    throw error;
  }
}

async function processZoneFile(filePath, imagesDir) {
  try {
    console.log(`📂 Reading zone data from: ${filePath}`);
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const zoneData = JSON.parse(fileContent);
    
    // Validate required fields
    const requiredFields = ['id', 'translations', 'center'];
    for (const field of requiredFields) {
      if (!zoneData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate new required fields
    if (!zoneData.author || typeof zoneData.author !== 'string' || zoneData.author.trim() === '') {
      throw new Error('Missing or invalid required field: author (must be a non-empty string)');
    }
    
    if (typeof zoneData.official !== 'boolean') {
      throw new Error('Missing or invalid required field: official (must be a boolean)');
    }
    
    // userid is optional, but if provided must be a string
    if (zoneData.userid !== undefined && (typeof zoneData.userid !== 'string' || zoneData.userid.trim() === '')) {
      throw new Error('Invalid userid field: if provided, must be a non-empty string');
    }
    
    // likes is optional, but if provided must be an array
    if (zoneData.likes !== undefined && !Array.isArray(zoneData.likes)) {
      throw new Error('Invalid likes field: if provided, must be an array');
    }
    
    // Validate translations
    if (!zoneData.translations.en) {
      throw new Error('Missing required English (en) translation');
    }
    
    const requiredTranslationFields = ['name', 'region', 'description'];
    for (const field of requiredTranslationFields) {
      if (!zoneData.translations.en[field]) {
        throw new Error(`Missing required translation field in English: ${field}`);
      }
    }
    
    await addPartnerZone(zoneData, imagesDir);
    
  } catch (error) {
    console.error('❌ Error processing zone file:', error);
    process.exit(1);
  }
}

// Get command line arguments
const [zoneFile, imagesDir] = process.argv.slice(2);

if (!zoneFile) {
  console.error('❌ Usage: node add-partner-zone.js [zoneDataFile] [imagesDir]');
  console.log('');
  console.log('📝 Example:');
  console.log('  node add-partner-zone.js ./data/grand-canyon-new.json ./images');
  process.exit(1);
}

// Process the zone file
processZoneFile(path.resolve(zoneFile), imagesDir ? path.resolve(imagesDir) : null); 