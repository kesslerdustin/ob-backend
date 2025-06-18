/**
 * Helper script to fix the corrupted test message in Firestore
 * This will recreate the test message with the correct structure
 */

require('dotenv').config();
const admin = require('firebase-admin');

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

const testMessage = {
  id: 'test_message_2025_06_18',
  type: 'feature_announcement',
  priority: 9,
  timestamp: '2025-06-18T10:00:00.000Z',
  enabled: true,
  trigger: {
    type: 'server_push',
    condition: {
      active: true
    }
  },
  analytics: {
    views: 0,
    clicks: 0,
    created: '2025-06-18T10:00:00.000Z'
  },
  languages: {
    en: {
      title: '🚀 Test Message - New Features Available!',
      content: 'This is a comprehensive test message to verify all language translations are working correctly. We\'ve added exciting new features including **enhanced AI analysis**, improved weather forecasting, and better offline map support. Try taking a photo of wildlife or plants to see the enhanced identification system in action! Visit our website at https://outdoorbible.com for more details or contact us at support@outdoorbible.com. Your feedback helps us improve the app for all outdoor enthusiasts.'
    },
    de: {
      title: '🚀 Testnachricht - Neue Funktionen verfügbar!',
      content: 'Dies ist eine umfassende Testnachricht, um zu überprüfen, ob alle Sprachübersetzungen korrekt funktionieren. Wir haben aufregende neue Funktionen hinzugefügt, darunter **verbesserte KI-Analyse**, verbesserte Wettervorhersage und bessere Offline-Kartenunterstützung. Versuchen Sie, ein Foto von Wildtieren oder Pflanzen zu machen, um das verbesserte Identifikationssystem in Aktion zu sehen! Besuchen Sie unsere Website unter https://outdoorbible.com für weitere Details oder kontaktieren Sie uns unter support@outdoorbible.com. Ihr Feedback hilft uns, die App für alle Outdoor-Enthusiasten zu verbessern.'
    },
    es: {
      title: '🚀 Mensaje de Prueba - ¡Nuevas Funciones Disponibles!',
      content: 'Este es un mensaje de prueba integral para verificar que todas las traducciones de idiomas funcionen correctamente. Hemos agregado nuevas funciones emocionantes que incluyen **análisis de IA mejorado**, pronóstico del tiempo mejorado y mejor soporte de mapas sin conexión. ¡Intenta tomar una foto de vida silvestre o plantas para ver el sistema de identificación mejorado en acción! Visita nuestro sitio web en https://outdoorbible.com para más detalles o contáctanos en support@outdoorbible.com.'
    },
    fr: {
      title: '🚀 Message de Test - Nouvelles Fonctionnalités Disponibles !',
      content: 'Ceci est un message de test complet pour vérifier que toutes les traductions linguistiques fonctionnent correctement. Nous avons ajouté de nouvelles fonctionnalités passionnantes, notamment une **analyse IA améliorée**, des prévisions météorologiques améliorées et un meilleur support de cartes hors ligne. Essayez de prendre une photo de la faune ou des plantes pour voir le système d\'identification amélioré en action ! Visitez notre site web à https://outdoorbible.com pour plus de détails.'
    },
    it: {
      title: '🚀 Messaggio di Test - Nuove Funzionalità Disponibili!',
      content: 'Questo è un messaggio di test completo per verificare che tutte le traduzioni linguistiche funzionino correttamente. Abbiamo aggiunto nuove funzionalità entusiasmanti tra cui **analisi AI migliorata**, previsioni meteorologiche migliorate e migliore supporto per mappe offline. Prova a scattare una foto di fauna selvatica o piante per vedere il sistema di identificazione migliorato in azione! Visita il nostro sito web su https://outdoorbible.com.'
    },
    pt: {
      title: '🚀 Mensagem de Teste - Novas Funcionalidades Disponíveis!',
      content: 'Esta é uma mensagem de teste abrangente para verificar se todas as traduções de idiomas estão funcionando corretamente. Adicionamos novos recursos empolgantes, incluindo **análise de IA aprimorada**, previsão do tempo melhorada e melhor suporte para mapas offline. Tente tirar uma foto de vida selvagem ou plantas para ver o sistema de identificação aprimorado em ação! Visite nosso site em https://outdoorbible.com.'
    },
    ja: {
      title: '🚀 テストメッセージ - 新機能が利用可能です！',
      content: 'これは、すべての言語翻訳が正しく機能していることを確認するための包括的なテストメッセージです。**強化されたAI分析**、改善された天気予報、より良いオフラインマップサポートなど、エキサイティングな新機能を追加しました。野生動物や植物の写真を撮って、強化された識別システムの動作を確認してください！詳細については https://outdoorbible.com のウェブサイトをご覧ください。'
    }
  },
  metadata: {
    views: 0,
    clicks: 0,
    createdBy: 'admin',
    createdAt: new Date().toISOString()
  }
};

async function fixTestMessage() {
  try {
    console.log('🔧 Fixing corrupted test message in Firestore...');
    
    const db = admin.firestore();
    const messageRef = db.collection('coachMessages').doc('2025-06-18');
    
    // Create the correct document structure
    await messageRef.set({
      date: '2025-06-18',
      active: true,
      messages: [testMessage], // This is the key - it must be an ARRAY
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Successfully fixed the test message!');
    console.log('📋 Message structure:');
    console.log('  - Document: coachMessages/2025-06-18');
    console.log('  - messages: Array with 1 message');
    console.log('  - Message ID:', testMessage.id);
    console.log('  - Languages: en, de, es, fr, it, pt, ja');
    console.log('  - Enabled:', testMessage.enabled);
    console.log('  - Trigger type:', testMessage.trigger.type);
    
    console.log('\n🎯 Your test message should now work in the app!');
    
  } catch (error) {
    console.error('❌ Error fixing test message:', error);
  }
  
  process.exit(0);
}

fixTestMessage(); 