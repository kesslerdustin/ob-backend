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

// Supported units for stats
const SUPPORTED_UNITS = [
  'km', 'm', 'miles', 'ft', 'million', 'billion', 'million_years', 'celsius', 'fahrenheit'
];

// Common Material Icons used in the app
const SUPPORTED_ICONS = [
  // Material Icons (md)
  'history', 'height', 'straighten', 'expand', 'groups', 'terrain',
  'landscape', 'eco', 'water', 'account_balance', 'thermostat',
  'history_edu', 'mountain', 'park', 'hiking', 'photo_camera',
  'explore', 'map', 'info', 'warning', 'local_activity',
  
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
    
    // Validate stats - these are now in the main English stats array with nested translations
    if (lang === 'en' && translation.stats) {
      if (!Array.isArray(translation.stats)) {
        errors.push(`Language ${lang} stats must be an array`);
      } else {
        for (const stat of translation.stats) {
          const statError = validateStat(stat, supportedLanguages);
          if (statError) {
            errors.push(`Stats validation error: ${statError}`);
          }
        }
      }
    }
    
    // Validate interesting facts
    if (translation.interestingFacts) {
      if (!Array.isArray(translation.interestingFacts)) {
        errors.push(`Language ${lang} interestingFacts must be an array`);
      } else {
        for (const fact of translation.interestingFacts) {
          if (!fact.id) errors.push(`Language ${lang} fact missing ID`);
          if (!fact.text) errors.push(`Language ${lang} fact ${fact.id} missing text`);
          if (!fact.icon) errors.push(`Language ${lang} fact ${fact.id} missing icon`);
          if (fact.icon && !SUPPORTED_ICONS.includes(fact.icon)) {
            errors.push(`Language ${lang} fact ${fact.id} has unsupported icon: ${fact.icon}`);
          }
        }
      }
    }
    
    // Validate historical info
    if (translation.historicalInfo) {
      if (!translation.historicalInfo.text) {
        errors.push(`Language ${lang} historicalInfo missing text`);
      }
      if (!translation.historicalInfo.icon) {
        errors.push(`Language ${lang} historicalInfo missing icon`);
      }
      if (translation.historicalInfo.icon && !SUPPORTED_ICONS.includes(translation.historicalInfo.icon)) {
        errors.push(`Language ${lang} historicalInfo has unsupported icon: ${translation.historicalInfo.icon}`);
      }
    }
    
    // Validate news if present
    if (translation.news) {
      if (!Array.isArray(translation.news)) {
        errors.push(`Language ${lang} news must be an array`);
      } else {
        for (const newsItem of translation.news) {
          if (!newsItem.id) errors.push(`Language ${lang} news item missing ID`);
          if (!newsItem.title) errors.push(`Language ${lang} news item ${newsItem.id} missing title`);
          if (!newsItem.summary) errors.push(`Language ${lang} news item ${newsItem.id} missing summary`);
          if (!newsItem.content) errors.push(`Language ${lang} news item ${newsItem.id} missing content`);
        }
      }
    }
  }
  
  return errors;
}

/**
 * Validates POI translations
 * @param {Array} pois Array of POI objects to validate
 * @param {Array<string>} supportedLanguages List of supported languages
 * @returns {Array<string>} Array of error messages
 */
function validatePOITranslations(pois, supportedLanguages) {
  const errors = [];
  
  if (!pois || !Array.isArray(pois)) return errors;
  
  for (const poi of pois) {
    if (!poi.id) {
      errors.push('POI missing ID');
      continue;
    }
    
    if (!poi.translations) {
      errors.push(`POI ${poi.id} missing translations object`);
      continue;
    }
    
    for (const lang of supportedLanguages) {
      if (!poi.translations[lang]) {
        errors.push(`POI ${poi.id} missing ${lang} translation`);
        continue;
      }
      
      if (!poi.translations[lang].title) {
        errors.push(`POI ${poi.id} missing ${lang} title`);
      }
      if (!poi.translations[lang].description) {
        errors.push(`POI ${poi.id} missing ${lang} description`);
      }
    }
  }
  
  return errors;
}

/**
 * Validates tour translations
 * @param {Array} tours Array of tour objects to validate
 * @param {Array<string>} supportedLanguages List of supported languages
 * @returns {Array<string>} Array of error messages
 */
function validateTourTranslations(tours, supportedLanguages) {
  const errors = [];
  
  if (!tours || !Array.isArray(tours)) return errors;
  
  for (const tour of tours) {
    if (!tour.id) {
      errors.push('Tour missing ID');
      continue;
    }
    
    if (!tour.translations) {
      errors.push(`Tour ${tour.id} missing translations object`);
      continue;
    }
    
    for (const lang of supportedLanguages) {
      if (!tour.translations[lang]) {
        errors.push(`Tour ${tour.id} missing ${lang} translation`);
        continue;
      }
      
      if (!tour.translations[lang].name) {
        errors.push(`Tour ${tour.id} missing ${lang} name`);
      }
      if (!tour.translations[lang].description) {
        errors.push(`Tour ${tour.id} missing ${lang} description`);
      }
      if (!tour.translations[lang].waypoints) {
        errors.push(`Tour ${tour.id} missing ${lang} waypoints`);
      }
    }
  }
  
  return errors;
}

/**
 * Validates quiz translations
 * @param {Object} quiz Quiz object to validate
 * @param {Array<string>} supportedLanguages List of supported languages
 * @returns {Array<string>} Array of error messages
 */
function validateQuizTranslations(quiz, supportedLanguages) {
  const errors = [];
  
  if (!quiz) return errors;
  
  if (!quiz.translations) {
    errors.push('Quiz missing translations object');
    return errors;
  }
  
  for (const lang of supportedLanguages) {
    if (!quiz.translations[lang]) {
      errors.push(`Quiz missing ${lang} translation`);
      continue;
    }
    
    if (!quiz.translations[lang].title) {
      errors.push(`Quiz missing ${lang} title`);
    }
    if (!quiz.translations[lang].description) {
      errors.push(`Quiz missing ${lang} description`);
    }
    if (!quiz.translations[lang].questions) {
      errors.push(`Quiz missing ${lang} questions`);
    }
  }
  
  return errors;
}

/**
 * Validates tickets translations
 * @param {Object} tickets Tickets object to validate
 * @param {Array<string>} supportedLanguages List of supported languages
 * @returns {Array<string>} Array of error messages
 */
function validateTicketsTranslations(tickets, supportedLanguages) {
  const errors = [];
  
  if (!tickets) return errors;
  
  if (!tickets.translations) {
    errors.push('Tickets missing translations object');
    return errors;
  }
  
  for (const lang of supportedLanguages) {
    if (!tickets.translations[lang]) {
      errors.push(`Tickets missing ${lang} translation`);
      continue;
    }
    
    if (!tickets.translations[lang].infoText) {
      errors.push(`Tickets missing ${lang} infoText`);
    }
    if (!tickets.translations[lang].offers) {
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
    for (const image of obj.gallery.images) {
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
      console.log(`✅ Validated ${zoneData.pois.length} POIs`);
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
      console.log(`✅ Validated ${zoneData.tours.length} tours`);
    }
    
    // Validate quiz if provided
    if (zoneData.quiz) {
      console.log('🧠 Validating quiz translations...');
      const supportedLanguages = Object.keys(zoneData.translations);
      const quizErrors = validateQuizTranslations(zoneData.quiz, supportedLanguages);
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
      const ticketErrors = validateTicketsTranslations(zoneData.tickets, supportedLanguages);
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
      
      // Support new translation format
      if (zoneData.heroImage.translations) {
        // New translation format - validate that English translation exists
        if (!zoneData.heroImage.translations.en) {
          throw new Error('Hero image missing English translation');
        }
        if (!zoneData.heroImage.translations.en.caption) {
          throw new Error('Hero image missing English caption in translations');
        }
        if (!zoneData.heroImage.translations.en.alt) {
          throw new Error('Hero image missing English alt text in translations');
        }
        
        // Validate all provided language translations have required fields
        const supportedLanguages = Object.keys(zoneData.translations);
        for (const lang of supportedLanguages) {
          if (zoneData.heroImage.translations[lang]) {
            if (!zoneData.heroImage.translations[lang].caption) {
              throw new Error(`Hero image missing ${lang} caption in translations`);
            }
            if (!zoneData.heroImage.translations[lang].alt) {
              throw new Error(`Hero image missing ${lang} alt text in translations`);
            }
          }
        }
      }
      
      console.log('✅ Hero image validation passed');
    }
    
    // Validate news icons and structure
    if (zoneData.news) {
      console.log('📰 Validating news items...');
      if (!Array.isArray(zoneData.news)) {
        throw new Error('News must be an array');
      }
      for (const newsItem of zoneData.news) {
        if (newsItem.icon && !SUPPORTED_ICONS.includes(newsItem.icon)) {
          throw new Error(`News item ${newsItem.id} has unsupported icon: ${newsItem.icon}`);
        }
        
        // Validate news translations
        if (newsItem.translations) {
          const supportedLanguages = Object.keys(zoneData.translations);
          for (const lang of supportedLanguages) {
            if (newsItem.translations[lang]) {
              if (!newsItem.translations[lang].title) {
                throw new Error(`News item ${newsItem.id} missing ${lang} title`);
              }
              if (!newsItem.translations[lang].summary) {
                throw new Error(`News item ${newsItem.id} missing ${lang} summary`);
              }
              if (!newsItem.translations[lang].content) {
                throw new Error(`News item ${newsItem.id} missing ${lang} content`);
              }
            }
          }
        }
      }
      console.log(`✅ Validated ${zoneData.news.length} news items`);
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
      const originalLat = zoneData.center.lat;
      const originalLng = zoneData.center.lng;
      
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
      zoneData.areaPolygon = zoneData.areaPolygon.map(point => 
        new admin.firestore.GeoPoint(point.lat, point.lng)
      );
      console.log(`📍 Converted ${zoneData.areaPolygon.length} polygon points to GeoPoints`);
    }
    
    // Add timestamps if not provided
    const now = admin.firestore.Timestamp.now();
    if (!zoneData.createdAt) zoneData.createdAt = now;
    if (!zoneData.updatedAt) zoneData.updatedAt = now;
    
    // Create main zone document
    const zoneRef = db.collection('partnerZones').doc(zoneData.id);
    
    // Process POIs coordinates
    if (zoneData.pois && zoneData.pois.length > 0) {
      zoneData.pois = zoneData.pois.map(poi => {
        if (poi.coords) {
          poi.coords = new admin.firestore.GeoPoint(
            poi.coords.lat,
            poi.coords.lng
          );
        }
        return poi;
      });
      console.log(`📍 Converted ${zoneData.pois.length} POI coordinates to GeoPoints`);
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
    
    if (zoneData.tours && Array.isArray(zoneData.tours)) {
      // New multiple tours format
      let totalWaypoints = 0;
      zoneData.tours = zoneData.tours.map(tour => {
        if (tour.waypoints && Array.isArray(tour.waypoints)) {
          tour.waypoints = tour.waypoints.map(waypoint => ({
            ...waypoint,
            coords: new admin.firestore.GeoPoint(
              waypoint.coords.lat,
              waypoint.coords.lng
            )
          }));
          totalWaypoints += tour.waypoints.length;
        }
        return tour;
      });
      console.log(`📍 Converted ${totalWaypoints} waypoint coordinates across ${zoneData.tours.length} tours to GeoPoints`);
    }
    
    // Store everything in the main document
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
    console.log(`  - Features:`);
    console.log(`    • Hero Image: ${zoneData.heroImage ? '✓' : '✗'}`);
    console.log(`    • Stats: ${zoneData.translations.en.stats?.length || 0}`);
    console.log(`    • Facts: ${zoneData.translations.en.interestingFacts?.length || 0}`);
    console.log(`    • Historical Info: ${zoneData.translations.en.historicalInfo ? '✓' : '✗'}`);
    console.log(`    • News: ${zoneData.news?.length || 0}`);
    console.log(`    • POIs: ${zoneData.pois?.length || 0}`);
    console.log(`    • Tours: ${zoneData.tours ? zoneData.tours.length : (zoneData.tour ? '1 (legacy)' : '0')}`);
    console.log(`    • Quiz: ${zoneData.quiz ? '✓' : '✗'}`);
    console.log(`    • Tickets: ${zoneData.tickets ? '✓' : '✗'}`);
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