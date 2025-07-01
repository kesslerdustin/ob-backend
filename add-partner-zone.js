/**
 * Script to add partner zones to Firestore
 * Usage: node add-partner-zone.js [zoneDataFile] [imagesDir]
 * 
 * This script adds partner zone data to Firestore and uploads images to Firebase Storage.
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

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
 * Validates a stat object
 * @param {Object} stat The stat object to validate
 * @returns {string|null} Error message if invalid, null if valid
 */
function validateStat(stat) {
  if (!stat.id) return 'Stat missing ID';
  if (!stat.icon) return `Stat ${stat.id} missing icon`;
  if (!SUPPORTED_ICONS.includes(stat.icon)) return `Stat ${stat.id} has unsupported icon: ${stat.icon}`;
  if (!stat.value) return `Stat ${stat.id} missing value`;
  if (!stat.unit) return `Stat ${stat.id} missing unit`;
  if (!SUPPORTED_UNITS.includes(stat.unit)) return `Stat ${stat.id} has unsupported unit: ${stat.unit}`;
  if (stat.secondaryUnit && !SUPPORTED_UNITS.includes(stat.secondaryUnit)) {
    return `Stat ${stat.id} has unsupported secondary unit: ${stat.secondaryUnit}`;
  }
  if (!stat.translations?.en?.label) return `Stat ${stat.id} missing English label`;
  return null;
}

/**
 * Validates icons in facts and historical info
 * @param {Object} obj The object containing facts or historical info
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

async function addPartnerZone(zoneData, imagesDir) {
  const uploadedFiles = new Set();
  
  try {
    console.log('🔧 Adding partner zone to Firestore...');
    console.log(`📍 Zone: ${zoneData.translations.en.name}`);
    
    // Validate stats if provided
    if (zoneData.translations.en.stats) {
      console.log('📊 Validating stats...');
      for (const stat of zoneData.translations.en.stats) {
        const error = validateStat(stat);
        if (error) throw new Error(`Invalid stat: ${error}`);
      }
      console.log(`✅ Validated ${zoneData.translations.en.stats.length} stats`);
    }

    // Validate icons in facts and historical info
    if (zoneData.translations.en.interestingFacts) {
      const error = validateIcons(zoneData.translations.en.interestingFacts);
      if (error) throw new Error(`Invalid fact icon: ${error}`);
    }
    if (zoneData.translations.en.historicalInfo) {
      const error = validateIcons(zoneData.translations.en.historicalInfo);
      if (error) throw new Error(`Invalid historical info icon: ${error}`);
    }
    
    // Validate news icons if provided
    if (zoneData.translations.en.news) {
      for (const newsItem of zoneData.translations.en.news) {
        if (newsItem.icon) {
          const error = validateIcons(newsItem);
          if (error) throw new Error(`Invalid news icon: ${error}`);
        }
      }
    }
    
    // Process and upload all images first
    if (imagesDir) {
      console.log('📸 Processing images...');
      await processImages(zoneData, imagesDir, uploadedFiles);
    }
    
    const db = admin.firestore();
    
    // Convert center coordinates to GeoPoint
    if (zoneData.center) {
      zoneData.center = new admin.firestore.GeoPoint(
        zoneData.center.lat,
        zoneData.center.lng
      );
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
    
    // Process tour waypoint coordinates
    if (zoneData.tour && zoneData.tour.waypoints) {
      zoneData.tour.waypoints = zoneData.tour.waypoints.map(waypoint => ({
        ...waypoint,
        coords: new admin.firestore.GeoPoint(
          waypoint.coords.lat,
          waypoint.coords.lng
        )
      }));
      console.log(`📍 Converted ${zoneData.tour.waypoints.length} tour waypoint coordinates to GeoPoints`);
    }
    
    // Store everything in the main document
    await zoneRef.set(zoneData);
    console.log('✅ Created complete zone document with all data');
    
    // Clean up uploaded files after successful Firestore write
    await cleanupUploadedFiles(uploadedFiles);
    
    console.log('\n🎯 Partner zone added successfully!');
    console.log('📋 Zone details:');
    console.log(`  - ID: ${zoneData.id}`);
    console.log(`  - Name (EN): ${zoneData.translations.en.name}`);
    console.log(`  - Region (EN): ${zoneData.translations.en.region}`);
    console.log(`  - Available translations: ${Object.keys(zoneData.translations).join(', ')}`);
    console.log(`  - Center: ${zoneData.center.latitude}, ${zoneData.center.longitude}`);
    console.log(`  - Features:`);
    console.log(`    • Stats: ${zoneData.translations.en.stats?.length || 0}`);
    console.log(`    • Facts: ${zoneData.translations.en.interestingFacts?.length || 0}`);
    console.log(`    • POIs: ${zoneData.pois?.length || 0}`);
    console.log(`    • Tour: ${zoneData.tour ? '✓' : '✗'}`);
    console.log(`    • Quiz: ${zoneData.quiz ? '✓' : '✗'}`);
    console.log(`    • Tickets: ${zoneData.tickets ? '✓' : '✗'}`);
    
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
  console.log('  node add-partner-zone.js ./data/grand-canyon.json ./images');
  process.exit(1);
}

// Process the zone file
processZoneFile(path.resolve(zoneFile), imagesDir ? path.resolve(imagesDir) : null); 