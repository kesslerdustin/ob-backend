/**
 * Helper script to add coach messages to Firestore
 * Usage: node add-coach-messages.js [date]
 * 
 * This script demonstrates how to add coach messages to the Firestore collection.
 * You can also use the admin API endpoint: POST /api/admin/coach-messages
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

// Example coach messages with all language translations
const exampleMessages = [
  {
    id: 'earth_day_2026',
    type: 'seasonal',
    priority: 8,
    enabled: true,
    trigger: {
      type: 'date_based',
      condition: { 
        month: 4, 
        day: 22, 
        recurring: true 
      }
    },
    languages: {
      en: {
        title: 'Today is Earth Day!',
        content: 'Today we celebrate our planet and the incredible biodiversity that surrounds us. As outdoor enthusiasts, we have a special responsibility to protect and preserve the natural world we love to explore.'
      },
      de: {
        title: 'Heute ist Tag der Erde!',
        content: 'Heute feiern wir unseren Planeten und die unglaubliche Biodiversität, die uns umgibt. Als Outdoor-Enthusiasten haben wir eine besondere Verantwortung, die natürliche Welt zu schützen und zu bewahren.'
      },
      es: {
        title: '¡Hoy es el Día de la Tierra!',
        content: 'Hoy celebramos nuestro planeta y la increíble biodiversidad que nos rodea. Como entusiastas del aire libre, tenemos una responsabilidad especial de proteger y preservar el mundo natural que amamos explorar.'
      },
      fr: {
        title: 'Aujourd\'hui c\'est le Jour de la Terre!',
        content: 'Aujourd\'hui, nous célébrons notre planète et l\'incroyable biodiversité qui nous entoure. En tant qu\'amateurs de plein air, nous avons une responsabilité particulière de protéger et préserver le monde naturel que nous aimons explorer.'
      },
      it: {
        title: 'Oggi è la Giornata della Terra!',
        content: 'Oggi celebriamo il nostro pianeta e l\'incredibile biodiversità che ci circonda. Come appassionati di attività all\'aperto, abbiamo una responsabilità speciale nel proteggere e preservare il mondo naturale che amiamo esplorare.'
      },
      pt: {
        title: 'Hoje é o Dia da Terra!',
        content: 'Hoje celebramos o nosso planeta e a incrível biodiversidade que nos rodeia. Como entusiastas do ar livre, temos uma responsabilidade especial de proteger e preservar o mundo natural que adoramos explorar.'
      },
      ja: {
        title: '今日はアースデイです！',
        content: '今日は私たちの惑星と、私たちを取り囲む素晴らしい生物多様性を祝います。アウトドア愛好家として、私たちが愛し探索する自然世界を保護し保全する特別な責任があります。'
      }
    },
    metadata: {
      category: 'environmental',
      tags: ['earth_day', 'sustainability'],
      targetAudience: 'all_users'
    }
  },
  {
    id: 'milestone_100_starts',
    type: 'milestone',
    priority: 9,
    enabled: true,
    trigger: {
      type: 'milestone',
      condition: { appStarts: 100 }
    },
    languages: {
      en: {
        title: 'Wilderness Expert!',
        content: 'Incredible! You\'ve opened the app 100 times! You\'re truly dedicated to outdoor exploration.'
      },
      de: {
        title: 'Wildnis-Experte!',
        content: 'Unglaublich! Du hast die App 100 Mal geöffnet! Du bist wirklich der Outdoor-Erkundung gewidmet.'
      },
      es: {
        title: '¡Experto en Naturaleza!',
        content: '¡Increíble! ¡Has abierto la aplicación 100 veces! Realmente estás dedicado a la exploración al aire libre.'
      },
      fr: {
        title: 'Expert de la Nature!',
        content: 'Incroyable! Vous avez ouvert l\'application 100 fois! Vous êtes vraiment dévoué à l\'exploration en plein air.'
      },
      it: {
        title: 'Esperto della Natura!',
        content: 'Incredibile! Hai aperto l\'app 100 volte! Sei davvero dedicato all\'esplorazione all\'aperto.'
      },
      pt: {
        title: 'Especialista da Natureza!',
        content: 'Incrível! Você abriu o aplicativo 100 vezes! Você é realmente dedicado à exploração ao ar livre.'
      },
      ja: {
        title: '野生動物の専門家！',
        content: '信じられません！アプリを100回開きました！本当にアウトドア探索に専念していますね。'
      }
    },
    metadata: {
      category: 'milestone',
      tags: ['achievement', 'engagement'],
      targetAudience: 'active_users'
    }
  },
  // LOCATION-BASED MESSAGES - Server-managed examples
  {
    id: 'grand_canyon_safety',
    type: 'tips',
    priority: 9,
    enabled: true,
    trigger: {
      type: 'location_based',
      condition: {
        type: 'within_radius',
        targetLocation: {
          latitude: 36.1069,
          longitude: -112.1129
        },
        radius: 25 // 25km radius around Grand Canyon
      }
    },
    languages: {
      en: {
        title: 'Grand Canyon Safety',
        content: 'You\'re near the Grand Canyon! Stay back from edges, carry plenty of water (especially going down), and remember: going down is optional, coming up is mandatory. Weather changes rapidly here.'
      },
      de: {
        title: 'Grand Canyon Sicherheit',
        content: 'Sie sind in der Nähe des Grand Canyon! Halten Sie Abstand zu den Kanten, führen Sie viel Wasser mit (besonders beim Abstieg), und denken Sie daran: Der Abstieg ist optional, der Aufstieg ist obligatorisch.'
      },
      es: {
        title: 'Seguridad del Gran Cañón',
        content: '¡Estás cerca del Gran Cañón! Mantente alejado de los bordes, lleva mucha agua (especialmente al bajar), y recuerda: bajar es opcional, subir es obligatorio.'
      },
      fr: {
        title: 'Sécurité du Grand Canyon',
        content: 'Vous êtes près du Grand Canyon! Restez loin des bords, portez beaucoup d\'eau (surtout en descendant), et rappelez-vous: descendre est optionnel, remonter est obligatoire.'
      },
      it: {
        title: 'Sicurezza del Grand Canyon',
        content: 'Sei vicino al Grand Canyon! Stai lontano dai bordi, porta molta acqua (specialmente scendendo), e ricorda: scendere è opzionale, risalire è obbligatorio.'
      },
      pt: {
        title: 'Segurança do Grand Canyon',
        content: 'Você está perto do Grand Canyon! Mantenha-se longe das bordas, leve muita água (especialmente descendo), e lembre-se: descer é opcional, subir é obrigatório.'
      },
      ja: {
        title: 'グランドキャニオンの安全',
        content: 'グランドキャニオンの近くにいます！崖から離れ、十分な水を持参し（特に下りるとき）、覚えておいてください：下りは任意、上りは必須です。'
      }
    },
    metadata: {
      category: 'location_safety',
      tags: ['grand_canyon', 'hiking_safety', 'national_park'],
      targetAudience: 'hikers'
    }
  },
  
  {
    id: 'alps_avalanche_warning',
    type: 'tips',
    priority: 10,
    enabled: true,
    trigger: {
      type: 'location_based',
      condition: {
        type: 'country',
        countries: ['Switzerland', 'Austria', 'France', 'Italy', 'Schweiz', 'Österreich', 'Frankreich', 'Italien', 'Suisse', 'Autriche', 'Svizzera', 'Austria', 'Francia', 'Italia', 'Suíça', 'Áustria', 'França', 'スイス', 'オーストリア', 'フランス', 'イタリア']
      }
    },
    languages: {
      en: {
        title: 'Alpine Avalanche Safety',
        content: 'You\'re in avalanche-prone alpine terrain! Check current avalanche bulletins, carry proper safety equipment (beacon, probe, shovel), and never travel alone in backcountry.'
      },
      de: {
        title: 'Alpine Lawinensicherheit',
        content: 'Sie befinden sich in lawinengefährdetem alpinen Gelände! Prüfen Sie aktuelle Lawinenbulletins, tragen Sie entsprechende Sicherheitsausrüstung (Pieps, Sonde, Schaufel) mit, und reisen Sie niemals allein im Gelände.'
      },
      fr: {
        title: 'Sécurité Avalanche Alpine',
        content: 'Vous êtes en terrain alpin sujet aux avalanches! Vérifiez les bulletins d\'avalanche actuels, portez un équipement de sécurité approprié (balise, sonde, pelle), et ne voyagez jamais seul en arrière-pays.'
      },
      it: {
        title: 'Sicurezza Valanghe Alpine',
        content: 'Ti trovi in territorio alpino soggetto a valanghe! Controlla i bollettini valanghe attuali, porta attrezzature di sicurezza appropriate (ARTVA, sonda, pala), e non viaggiare mai da solo in backcountry.'
      },
      es: {
        title: 'Seguridad de Avalanchas Alpinas',
        content: '¡Estás en terreno alpino propenso a avalanchas! Verifica los boletines de avalanchas actuales, lleva equipo de seguridad adecuado (baliza, sonda, pala), y nunca viajes solo en el campo.'
      },
      pt: {
        title: 'Segurança de Avalanche Alpina',
        content: 'Você está em terreno alpino propenso a avalanches! Verifique os boletins de avalanche atuais, leve equipamento de segurança adequado (beacon, sonda, pá), e nunca viaje sozinho no campo.'
      },
      ja: {
        title: 'アルパイン雪崩安全',
        content: '雪崩の危険があるアルパイン地形にいます！現在の雪崩情報を確認し、適切な安全装備（ビーコン、プローブ、ショベル）を携帯し、バックカントリーでは決して一人で行動しないでください。'
      }
    },
    metadata: {
      category: 'safety_critical',
      tags: ['avalanche', 'alpine', 'winter_sports'],
      targetAudience: 'alpine_users'
    }
  },
  
  {
    id: 'australian_outback_warning',
    type: 'tips',
    priority: 9,
    enabled: true,
    trigger: {
      type: 'location_based',
      condition: {
        type: 'bounding_box',
        bounds: {
          north: -10.0,    // Northern Australia
          south: -44.0,    // Southern Australia
          east: 154.0,     // Eastern Australia  
          west: 113.0      // Western Australia
        }
      }
    },
    languages: {
      en: {
        title: 'Australian Outback Safety',
        content: 'You\'re in the Australian outback! Inform someone of your travel plans, carry extra water (4L per person per day), have emergency communication, and be aware of dangerous wildlife.'
      },
      de: {
        title: 'Australisches Outback Sicherheit',
        content: 'Sie sind im australischen Outback! Informieren Sie jemanden über Ihre Reisepläne, nehmen Sie extra Wasser mit (4L pro Person pro Tag), haben Sie Notfallkommunikation und seien Sie sich der gefährlichen Tierwelt bewusst.'
      },
      es: {
        title: 'Seguridad del Outback Australiano',
        content: '¡Estás en el outback australiano! Informa a alguien de tus planes de viaje, lleva agua extra (4L por persona por día), ten comunicación de emergencia y ten cuidado con la fauna peligrosa.'
      },
      fr: {
        title: 'Sécurité de l\'Outback Australien',
        content: 'Vous êtes dans l\'outback australien! Informez quelqu\'un de vos plans de voyage, portez de l\'eau supplémentaire (4L par personne par jour), ayez une communication d\'urgence et méfiez-vous de la faune dangereuse.'
      },
      it: {
        title: 'Sicurezza dell\'Outback Australiano',
        content: 'Sei nell\'outback australiano! Informa qualcuno dei tuoi piani di viaggio, porta acqua extra (4L per persona al giorno), abbi comunicazione di emergenza e fai attenzione alla fauna pericolosa.'
      },
      pt: {
        title: 'Segurança do Outback Australiano',
        content: 'Você está no outback australiano! Informe alguém sobre seus planos de viagem, leve água extra (4L por pessoa por dia), tenha comunicação de emergência e cuidado com a fauna perigosa.'
      },
      ja: {
        title: 'オーストラリアアウトバックの安全',
        content: 'オーストラリアのアウトバックにいます！旅行計画を誰かに知らせ、余分な水を持参し（1日1人4L）、緊急通信手段を持ち、危険な野生動物に注意してください。'
      }
    },
    metadata: {
      category: 'extreme_environment',
      tags: ['australia', 'outback', 'desert', 'remote'],
      targetAudience: 'outback_travelers'
    }
  },
  
  {
    id: 'alps_mountain_safety',
    type: 'tips',
    priority: 8,
    enabled: true,
    trigger: {
      type: 'location_based',
      condition: {
        type: 'within_radius',
        targetLocation: {
          latitude: 46.5197,
          longitude: 9.8544  // Central Alps
        },
        radius: 200 // 200km radius covering most of the Alps
      }
    },
    languages: {
      en: {
        title: 'Alpine Safety Tips',
        content: 'You\'re in the Alps! Check weather conditions before heading out, inform others of your route, carry avalanche safety gear in winter, and be prepared for rapid weather changes at altitude.'
      },
      de: {
        title: 'Alpine Sicherheitstipps',
        content: 'Sie sind in den Alpen! Prüfen Sie die Wetterbedingungen vor dem Aufbruch, informieren Sie andere über Ihre Route, führen Sie im Winter Lawinensicherheitsausrüstung mit, und seien Sie auf schnelle Wetteränderungen in der Höhe vorbereitet.'
      },
      fr: {
        title: 'Conseils de Sécurité Alpine',
        content: 'Vous êtes dans les Alpes! Vérifiez les conditions météo avant de partir, informez les autres de votre itinéraire, portez un équipement de sécurité avalanche en hiver, et préparez-vous aux changements météo rapides en altitude.'
      },
      it: {
        title: 'Consigli di Sicurezza Alpina',
        content: 'Sei nelle Alpi! Controlla le condizioni meteorologiche prima di partire, informa altri del tuo percorso, porta attrezzatura di sicurezza valanghe in inverno, e preparati per cambi meteorologici rapidi in quota.'
      },
      es: {
        title: 'Consejos de Seguridad Alpina',
        content: '¡Estás en los Alpes! Verifica las condiciones meteorológicas antes de salir, informa a otros de tu ruta, lleva equipo de seguridad para avalanchas en invierno, y prepárate para cambios meteorológicos rápidos en altitud.'
      },
      pt: {
        title: 'Dicas de Segurança Alpina',
        content: 'Você está nos Alpes! Verifique as condições meteorológicas antes de sair, informe outros sobre sua rota, leve equipamento de segurança para avalanche no inverno, e prepare-se para mudanças meteorológicas rápidas na altitude.'
      },
      ja: {
        title: 'アルパイン安全のヒント',
        content: 'アルプスにいます！出発前に気象条件を確認し、ルートを他の人に知らせ、冬には雪崩安全装備を携帯し、高地での急激な天候変化に備えてください。'
      }
    }
  },
  
  {
    id: 'germany_forest_tips',
    type: 'tips',
    priority: 6,
    enabled: true,
    trigger: {
      type: 'location_based',
      condition: {
        type: 'country',
        countries: ['Germany', 'Deutschland', 'Allemagne', 'Germania', 'Alemania', 'Alemanha', 'ドイツ']
      }
    },
    languages: {
      en: {
        title: 'German Forest Guidelines',
        content: 'Welcome to Germany\'s beautiful forests! Follow marked trails, respect private property, observe quiet hours (Ruhezeiten), and check for seasonal trail closures. Camping is only allowed in designated areas.'
      },
      de: {
        title: 'Deutsche Waldrichtlinien',
        content: 'Willkommen in Deutschlands wunderschönen Wäldern! Folgen Sie markierten Wegen, respektieren Sie Privatbesitz, beachten Sie Ruhezeiten, und prüfen Sie saisonale Wegsperrungen. Camping ist nur in ausgewiesenen Bereichen erlaubt.'
      },
      fr: {
        title: 'Directives des Forêts Allemandes',
        content: 'Bienvenue dans les belles forêts d\'Allemagne! Suivez les sentiers balisés, respectez la propriété privée, observez les heures de repos (Ruhezeiten), et vérifiez les fermetures saisonnières. Le camping n\'est autorisé que dans les zones désignées.'
      },
      it: {
        title: 'Linee Guida delle Foreste Tedesche',
        content: 'Benvenuto nelle bellissime foreste della Germania! Segui i sentieri segnalati, rispetta la proprietà privata, osserva le ore di silenzio (Ruhezeiten), e controlla le chiusure stagionali. Il campeggio è consentito solo nelle aree designate.'
      },
      es: {
        title: 'Directrices de Bosques Alemanes',
        content: '¡Bienvenido a los hermosos bosques de Alemania! Sigue senderos marcados, respeta la propiedad privada, observa las horas de silencio (Ruhezeiten), y verifica cierres estacionales. Acampar solo está permitido en áreas designadas.'
      },
      pt: {
        title: 'Diretrizes das Florestas Alemãs',
        content: 'Bem-vindo às belas florestas da Alemanha! Siga trilhas marcadas, respeite propriedade privada, observe horas de silêncio (Ruhezeiten), e verifique fechamentos sazonais. Acampar só é permitido em áreas designadas.'
      },
      ja: {
        title: 'ドイツの森林ガイドライン',
        content: 'ドイツの美しい森林へようこそ！標識されたトレイルに従い、私有地を尊重し、静寂時間（Ruhezeiten）を守り、季節的なトレイル閉鎖をチェックしてください。キャンプは指定エリアでのみ許可されています。'
      }
    }
  },
  
  {
    id: 'california_fire_warning',
    type: 'tips',
    priority: 9,
    enabled: true,
    trigger: {
      type: 'location_based',
      condition: {
        type: 'region',
        regions: ['California', 'CA', 'Kalifornien', 'Californie', 'カリフォルニア']
      }
    },
    languages: {
      en: {
        title: 'California Fire Season Alert',
        content: 'You\'re in California during fire season! Check current fire restrictions, have an evacuation plan ready, avoid activities that could spark fires, and stay informed about local fire conditions.'
      },
      es: {
        title: 'Alerta de Temporada de Incendios de California',
        content: '¡Estás en California durante la temporada de incendios! Verifica las restricciones actuales de incendios, ten un plan de evacuación listo, evita actividades que puedan provocar incendios, y mantente informado sobre las condiciones locales de incendios.'
      },
      de: {
        title: 'Kalifornien Feuersaison Warnung',
        content: 'Sie sind während der Feuersaison in Kalifornien! Prüfen Sie aktuelle Feuerbeschränkungen, haben Sie einen Evakuierungsplan bereit, vermeiden Sie Aktivitäten die Feuer auslösen könnten, und bleiben Sie über lokale Feuerbedingungen informiert.'
      },
      fr: {
        title: 'Alerte Saison des Feux en Californie',
        content: 'Vous êtes en Californie pendant la saison des feux! Vérifiez les restrictions actuelles, ayez un plan d\'évacuation prêt, évitez les activités qui pourraient déclencher des feux, et restez informé des conditions locales.'
      },
      it: {
        title: 'Allerta Stagione Incendi California',
        content: 'Sei in California durante la stagione degli incendi! Controlla le restrizioni attuali, abbi un piano di evacuazione pronto, evita attività che potrebbero scatenare incendi, e rimani informato sulle condizioni locali.'
      },
      pt: {
        title: 'Alerta da Temporada de Incêndios da Califórnia',
        content: 'Você está na Califórnia durante a temporada de incêndios! Verifique as restrições atuais, tenha um plano de evacuação pronto, evite atividades que possam causar incêndios, e mantenha-se informado sobre as condições locais.'
      },
      ja: {
        title: 'カリフォルニア火災シーズン警報',
        content: '火災シーズン中のカリフォルニアにいます！現在の火災制限を確認し、避難計画を準備し、火災を引き起こす可能性のある活動を避け、地域の火災状況について情報を入手してください。'
      }
    }
  },
  
  {
    id: 'yellowstone_wildlife',
    type: 'tips',
    priority: 8,
    enabled: true,
    trigger: {
      type: 'location_based',
      condition: {
        type: 'within_radius',
        targetLocation: {
          latitude: 44.4280,
          longitude: -110.5885
        },
        radius: 50 // 50km radius around Yellowstone
      }
    },
    languages: {
      en: {
        title: 'Yellowstone Wildlife Safety',
        content: 'You\'re near Yellowstone! Keep at least 25 yards from bison and elk, 100 yards from bears and wolves. Carry bear spray, store food properly, and never approach or feed wildlife. Stay on boardwalks near thermal features.'
      },
      de: {
        title: 'Yellowstone Wildtier-Sicherheit',
        content: 'Sie sind in der Nähe von Yellowstone! Halten Sie mindestens 25 Yards Abstand zu Bisons und Elchen, 100 Yards zu Bären und Wölfen. Tragen Sie Bärenspray, lagern Sie Essen ordnungsgemäß, und nähern Sie sich niemals Wildtieren oder füttern Sie sie.'
      },
      es: {
        title: 'Seguridad de Vida Silvestre de Yellowstone',
        content: '¡Estás cerca de Yellowstone! Mantén al menos 25 yardas de bisontes y alces, 100 yardas de osos y lobos. Lleva spray para osos, almacena comida adecuadamente, y nunca te acerques o alimentes a la vida silvestre.'
      },
      fr: {
        title: 'Sécurité de la Faune de Yellowstone',
        content: 'Vous êtes près de Yellowstone! Gardez au moins 25 yards des bisons et élans, 100 yards des ours et loups. Portez du spray anti-ours, stockez la nourriture correctement, et n\'approchez jamais ou ne nourrissez jamais la faune.'
      },
      it: {
        title: 'Sicurezza della Fauna di Yellowstone',
        content: 'Sei vicino a Yellowstone! Mantieni almeno 25 yard da bisonti e alci, 100 yard da orsi e lupi. Porta spray anti-orso, conserva il cibo correttamente, e non avvicinarti mai o nutrire la fauna selvatica.'
      },
      pt: {
        title: 'Segurança da Vida Selvagem de Yellowstone',
        content: 'Você está perto de Yellowstone! Mantenha pelo menos 25 jardas de bisões e alces, 100 jardas de ursos e lobos. Leve spray de urso, armazene comida adequadamente, e nunca se aproxime ou alimente a vida selvagem.'
      },
      ja: {
        title: 'イエローストーン野生動物安全',
        content: 'イエローストーンの近くにいます！バイソンとエルクから少なくとも25ヤード、クマとオオカミから100ヤード離れてください。クマスプレーを携帯し、食べ物を適切に保管し、野生動物に近づいたり餌を与えたりしないでください。'
      }
    }
  },
  
  {
    id: 'scandinavian_right_to_roam',
    type: 'tips',
    priority: 7,
    enabled: true,
    trigger: {
      type: 'location_based',
      condition: {
        type: 'country',
        countries: ['Norway', 'Sweden', 'Finland', 'Norwegen', 'Schweden', 'Finnland', 'Norvège', 'Suède', 'Finlande', 'Norvegia', 'Svezia', 'Finlandia', 'Noruega', 'Suecia', 'Finlandia', 'Noruega', 'Suécia', 'Finlândia', 'ノルウェー', 'スウェーデン', 'フィンランド']
      }
    },
    languages: {
      en: {
        title: 'Right to Roam Guidelines',
        content: 'You\'re in Scandinavia! Enjoy the "Right to Roam" (Allemansrätten) responsibly: camp away from houses, don\'t disturb wildlife, take only photos, leave no trace, and respect private property signs.'
      },
      de: {
        title: 'Jedermannsrecht Richtlinien',
        content: 'Sie sind in Skandinavien! Genießen Sie das "Jedermannsrecht" (Allemansrätten) verantwortungsvoll: Zelten Sie weg von Häusern, stören Sie keine Wildtiere, machen Sie nur Fotos, hinterlassen Sie keine Spuren.'
      },
      fr: {
        title: 'Directives du Droit de Libre Accès',
        content: 'Vous êtes en Scandinavie! Profitez du "Droit de libre accès" (Allemansrätten) de manière responsable: campez loin des maisons, ne dérangez pas la faune, ne prenez que des photos, ne laissez aucune trace.'
      },
      it: {
        title: 'Linee Guida del Diritto di Libero Accesso',
        content: 'Sei in Scandinavia! Goditi il "Diritto di libero accesso" (Allemansrätten) responsabilmente: accampa lontano dalle case, non disturbare la fauna, scatta solo foto, non lasciare tracce.'
      },
      es: {
        title: 'Directrices del Derecho de Acceso',
        content: '¡Estás en Escandinavia! Disfruta del "Derecho de acceso" (Allemansrätten) responsablemente: acampa lejos de casas, no molestes a la vida silvestre, toma solo fotos, no dejes rastro.'
      },
      pt: {
        title: 'Diretrizes do Direito de Acesso',
        content: 'Você está na Escandinávia! Aproveite o "Direito de acesso" (Allemansrätten) responsavelmente: acampe longe de casas, não perturbe a vida selvagem, tire apenas fotos, não deixe rastros.'
      },
      ja: {
        title: '自由通行権ガイドライン',
        content: 'スカンジナビアにいます！「自由通行権」（Allemansrätten）を責任を持って楽しんでください：家から離れてキャンプし、野生動物を邪魔せず、写真のみ撮影し、痕跡を残さないでください。'
      }
    }
  }
];

async function addCoachMessages(targetDate) {
  try {
    console.log('🔧 Adding coach messages to Firestore...');
    console.log(`📅 Target date: ${targetDate}`);
    
    const db = admin.firestore();
    const messageRef = db.collection('coachMessages').doc(targetDate);
    
    // Add metadata to each message
    const processedMessages = exampleMessages.map(message => ({
      ...message,
      metadata: {
        views: 0,
        clicks: 0,
        createdBy: 'script',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
        ...message.metadata
      }
    }));
    
    await messageRef.set({
      date: targetDate,
      active: true,
      messages: processedMessages,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Successfully added ${exampleMessages.length} coach messages for ${targetDate}`);
    console.log('📋 Messages added:');
    exampleMessages.forEach(msg => {
      console.log(`  - ${msg.id} (${msg.type}, priority: ${msg.priority})`);
    });
    
    console.log('\n🎯 You can now test the coach messages in your app!');
    
  } catch (error) {
    console.error('❌ Error adding coach messages:', error);
  }
  
  process.exit(0);
}

// Get target date from command line arguments or use today
const targetDate = process.argv[2] || new Date().toISOString().split('T')[0];

// Validate date format
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  console.error('❌ Invalid date format. Use YYYY-MM-DD');
  console.log('Usage: node add-coach-messages.js [YYYY-MM-DD]');
  process.exit(1);
}

addCoachMessages(targetDate); 