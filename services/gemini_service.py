from google import genai
import json
import sys
import os
from PIL import Image
import requests
from io import BytesIO
from dotenv import load_dotenv
from google.genai.types import Tool, GenerateContentConfig, GoogleSearch
from datetime import datetime
import re

load_dotenv()

# Configure the Gemini API
client = genai.Client(api_key=os.getenv('GOOGLE_API_KEY'))
MODEL_ID = "gemini-2.0-flash-exp"

def generate_content(prompt):
    """Standard text generation"""
    try:
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=prompt
        )
        return json.dumps({"success": True, "text": response.text})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def extract_json_from_text(text):
    """Extract JSON from text by finding the first valid JSON object"""
    try:
        # Find the first '{' and last '}'
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        
        if start_idx != -1 and end_idx != -1:
            # Extract potential JSON string
            json_str = text[start_idx:end_idx + 1]
            
            # Ensure proper encoding of special characters
            json_str = json_str.encode('utf-8').decode('utf-8')
            
            # Updated regex to preserve basic punctuation
            cleaned = re.sub(r'(?<![\{\[,:\s])"(?![,:\}\]\s]).*?(?<![\{\[,:\s])"(?![,:\}\]\s])', '', json_str)
            # Allow periods, commas, exclamation marks, and question marks in text
            cleaned = re.sub(r'[^\{\}\[\]",:0-9a-zA-Z\s_\-äöüßÄÖÜ\.!?]', '', cleaned)
            cleaned = re.sub(r'\s+', ' ', cleaned)
            
            # Try to parse the cleaned string
            return json.loads(cleaned)
    except Exception as e:
        print(f"JSON extraction failed: {e}", file=sys.stderr)
        print(f"Original text: {text}", file=sys.stderr)
        return None

def json_dumps_utf8(obj):
    """Helper function to ensure proper UTF-8 encoding in JSON responses"""
    return json.dumps(obj, ensure_ascii=False)

def analyze_image(prompt, image_path, options=None):
    """Vision-based analysis with raw text output"""
    try:
        options = json.loads(options) if options else {}
        language = options.get('language', 'en')
        analysis_type = options.get('type', 'photo_analysis')
        context = options.get('context', '')

        # Different prompts based on analysis type
        if analysis_type == 'chat_analysis':
            structured_prompt = f"""
            You are a helpful outdoor guide. Analyze this image and respond in the language of this classifier:{language} (eg: en - english, de - german, fr - french, etc).
            
            Context from the conversation:
            {context}
            
            Provide a natural, conversational response about what you see in the image.
            Focus on relevant outdoor, nature, or location-related details.
            Keep the response friendly and informative, as if chatting with a hiking companion.
            """
        else:
            # Original photo analysis prompt
            structured_prompt = f"""
            Analyze this image and respond ONLY in {language} language with a valid JSON object.
            
            CRITICAL REQUIREMENTS:
            1. Use ONLY the {language} language for ALL text fields
            2. Return EXACTLY this JSON structure:
            {{
                "response_mime_type": "application/json",
                "data": {{
                    "category": "POI|Flora|Fauna|Fungi|Custom",
                    "name": "{language} name/title",
                    "description": "detailed {language} description"
                }}
            }}

            special conditions: IF the category you chose is either flora fauna or fungi, then you MUST return the following JSON structure:
            {{
                "response_mime_type": "application/json",
                "data": {{
                    "category": "Flora|Fauna|Fungi",
                    "subcategory": "taxonkey NUMBER (closest matching order)",
                    "name": "{language} name/title (preferably the common name with latin name in paranthesis)",
                    "description": "detailed {language} description"
                }}
            }}

            with taxonkey being the CLOSEST MATCH of the proper ORDER according this list (use the number): Taxonomy:
Flora (Plants):
Fagales: Fagaceae (e.g., beech, oak) taxonKey: 1354
Pinales: Pinaceae (e.g., pine, spruce) taxonKey: 640
Sapindales: Sapindaceae (e.g., maple, horse chestnut) taxonKey: 933
Myrtales: Myrtaceae (e.g., eucalyptus, myrtle) taxonKey: 690
Malpighiales: Salicaceae (e.g., willow, poplar) taxonKey: 1414
Araucariales: Araucariaceae (e.g., monkey puzzle tree) taxonKey: 3924
Laurales: Lauraceae (e.g., laurel, avocado) taxonKey: 407
Asterales: Asteraceae (e.g., daisies, sunflowers) taxonKey: 414
Liliales: Liliaceae (e.g., lilies, tulips) taxonKey: 1172
Rosales: Rosaceae (e.g., roses, apples) taxonKey: 691
Poales: Poaceae (e.g., grasses, sedges) taxonKey: 1369
Caryophyllales: Cactaceae (e.g., cacti, succulents) taxonKey: 422
Fabales: Fabaceae (e.g., legume trees) taxonKey: 1370
Ericales: Ericaceae (e.g., ericas) taxonKey: 1353
Polypodiales: Polypodiaceae (e.g., true ferns) taxonKey: 392
Bryopsida: Bryophyta (e.g., mosses) taxonKey: 327
Marchantiopsida: Marchantiaceae (e.g., liverworts) taxonKey: 125
Aquatic and Marine Plants:
Alismatales: Alismataceae (e.g., water plants) taxonKey: 551
Ulvophyceae: Ulvaceae (e.g., green algae) taxonKey: 195
Phaeophyceae: Phaeophyta (e.g., brown algae) taxonKey: 7073593
Charophyceae: Characeae (e.g., stoneworts) taxonKey: 328
Palms and Cycads:
Arecales: Arecaceae (e.g., palms) taxonKey: 552
Cycadophyta: Cycadaceae (e.g., cycads) taxonKey: 834
Fauna (Animals):
Mammals:
Artiodactyla: Bovidae (e.g., deer, antelope) taxonKey: 731
Carnivora: Felidae (e.g., lions, tigers) taxonKey: 732
Lagomorpha: Leporidae (e.g., rabbits, hares) taxonKey: 785
Rodentia: Muridae (e.g., rats, mice) taxonKey: 1459
Chiroptera: Vespertilionidae (e.g., bats) taxonKey: 734
Talpidae: Talpidae (e.g., moles, shrews) taxonKey: 9469
Cetacea: Delphinidae (e.g., dolphins, whales) taxonKey: 733
Didelphimorphia: Didelphidae (e.g., opossums) taxonKey: 1452
Primates: Hominidae (e.g., chimpanzees, humans) taxonKey: 798
Monotremata: Ornithorhynchidae (e.g., platypus) taxonKey: 791
Perissodactyla: Equidae (e.g., horses, rhinos) taxonKey: 795
Birds:
Passeriformes: Passeridae (e.g., sparrows) taxonKey: 729
Accipitriformes: Accipitridae (e.g., hawks, eagles) taxonKey: 7191147
Anseriformes: Anatidae (e.g., ducks, geese) taxonKey: 1108
Galliformes: Phasianidae (e.g., chickens, pheasants) taxonKey: 723
Falconiformes: Falconidae (e.g., falcons) taxonKey: 5240
Procellariiformes: Procellariidae (e.g., petrels, albatrosses) taxonKey: 7192755
Strigiformes: Strigidae (e.g., owls) taxonKey: 1450
Coraciiformes: Alcedinidae (e.g., kingfishers) taxonKey: 1447
Charadriiformes: Laridae (e.g., gulls, terns) taxonKey: 7192402
Psittaciformes: Psittacidae (e.g., parrots) taxonKey: 1445
Ciconiiformes: Ciconiidae (e.g., storks) taxonKey: 839
Reptiles:
Squamata: Colubridae (e.g., snakes, lizards) taxonKey: 11592253
Testudines: Cheloniidae (e.g., turtles) taxonKey: 11418114
Crocodylia: Crocodylidae (e.g., crocodiles, alligators) taxonKey: 11493978
Rhynchocephalia: Sphenodontidae (e.g., tuatara) taxonKey: 703
Amphibians:
Anura: Ranidae (e.g., frogs, toads) taxonKey: 952
Caudata: Salamandridae (e.g., salamanders) taxonKey: 953
Fish:
Perciformes: Percidae (e.g., perches) taxonKey: 587
Cypriniformes: Cyprinidae (e.g., carps, minnows) taxonKey: 1153
Siluriformes: Siluridae (e.g., catfish) taxonKey: 708
Salmoniformes: Salmonidae (e.g., salmon, trout) taxonKey: 1313
Esociformes: Esocidae (e.g., pike) taxonKey: 548
Elasmobranchii: Carcharhinidae (e.g., sharks) taxonKey: 121
Anguilliformes: Anguillidae (e.g., eels) taxonKey: 495
Gadiformes: Gadidae (e.g., cod, haddock) taxonKey: 549
Invertebrates:
Araneae: Araneidae (e.g., spiders) taxonKey: 1496
Decapoda: Portunidae (e.g., crabs, crayfish) taxonKey: 637
Lepidoptera: Nymphalidae (e.g., butterflies, moths) taxonKey: 797
Hymenoptera: Apidae (e.g., bees, ants) taxonKey: 1457
Coleoptera: Carabidae (e.g., beetles) taxonKey: 1470
Oligochaeta: Lumbricidae (e.g., earthworms) taxonKey: 8166676
Scyphozoa: Cyaneidae (e.g., jellyfish) taxonKey: 352
Orthoptera: Acrididae (e.g., grasshoppers) taxonKey: 1458
Isoptera: Termitidae (e.g., termites) taxonKey: 999
Cephalopoda: Octopodidae (e.g., octopus, squid) taxonKey: 136
Cnidaria: Cnidaria (e.g., corals) taxonKey: 43
Bivalvia: Veneridae (e.g., clams, mussels) taxonKey: 137
Annelida: Polychaeta (e.g., segmented worms) taxonKey: 42
Echinodermata: Asteriidae (e.g., sea stars, urchins) taxonKey: 50
Fungi:
Mushrooms and Fungi:
Agaricales: Agaricaceae (e.g., gilled mushrooms) taxonKey: 1499
Polyporales: Polyporaceae (e.g., bracket fungi) taxonKey: 1145
Lecanorales: Parmeliaceae (e.g., lichens) taxonKey: 1048
Lichenized Fungi:
Peltigerales: Peltigeraceae (e.g., leafy lichens) taxonKey: 1055
Pathogenic Fungi:
Ustilaginales: Ustilaginaceae (e.g., smut fungi) taxonKey: 1121
Pucciniales: Pucciniaceae (e.g., rust fungi) taxonKey: 1126
Sac Fungi:
Pezizales: Morchellaceae (e.g., morels, truffles) taxonKey: 1057
Hypocreales: Hypocreaceae (e.g., molds) taxonKey: 1290
            """

        # Handle image loading
        if image_path.startswith(('http://', 'https://')):
            response = requests.get(image_path)
            image_data = BytesIO(response.content)
            img = Image.open(image_data).convert('RGB')
        else:
            img = Image.open(image_path).convert('RGB')
        
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=[structured_prompt, img]
        )

        return json.dumps({
            "success": True,
            "text": response.text
        })
    except Exception as e:
        print(f"Error in analyze_image: {str(e)}")
        return json.dumps({
            "success": False,
            "error": str(e)
        })

def search_and_generate(prompt):
    """Generation with Google Search grounding"""
    try:
        
        
        google_search_tool = Tool(
            google_search=GoogleSearch()
        )
        
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=prompt,
            config=GenerateContentConfig(
                tools=[google_search_tool],
                response_modalities=["TEXT"],
            )
        )
        
        # Extract main response text
        text = ""
        for part in response.candidates[0].content.parts:
            text += part.text

        # Get search metadata
        search_data = response.candidates[0].grounding_metadata.search_entry_point.rendered_content
        
        result = {
            "text": text,
            "search_data": search_data
        }
        return json.dumps({"success": True, "data": result})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def flash_chat(prompt, image_path=None, options=None):
    """Flash chat generation using Gemini 2.0 with optional image support"""
    try:
        options = json.loads(options) if options else {}
        language = options.get('language', 'en')
        context = options.get('context', '')
        
        # Make language instruction more explicit and move it to the end
        localized_prompt = f"""
        You are a helpful outdoor guide and survival expert. You have detailed information about the user's location, time, season, weather, surroundings, and possibly a satellite view of their position. Be precise, logical and helpful, and incorporate this contextual information naturally into your responses when relevant. Only do so, if it makes sense. Be aware of past messages and context and dont repeat yourself except if its really necessary!.

        Context about the current location and conditions:
        {context}
        
        User message: {prompt}

        CRITICAL: Respond in {language} language WITHOUT including the language code. Never start your response with language codes like 'de:', 'en:', etc. Also do not give any introduction, reply only with the answer. When referring times or units of measurement, use the language of the user (miles in english, km in german, etc).
        """

        # Prepare content list
        contents = [localized_prompt]

        # Add image if provided
        if image_path:
            try:
                if image_path.startswith(('http://', 'https://')):
                    response = requests.get(image_path)
                    image_data = BytesIO(response.content)
                    img = Image.open(image_data).convert('RGB')
                else:
                    img = Image.open(image_path).convert('RGB')
                contents.append(img)
            except Exception as e:
                print(f"Error loading image: {str(e)}", file=sys.stderr)

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=contents
        )
        
        return json.dumps({
            "success": True,
            "text": response.text
        })
    except Exception as e:
        print(f"Flash chat error: {str(e)}")
        return json.dumps({
            "success": False,
            "error": str(e)
        })

def analyze_biome(prompt, options=None):
    """Specialized biome analysis using Gemini 2.0"""
    try:
        options = json.loads(options) if options else {}
        language = options.get('language', 'en')
        coordinates = options.get('coordinates', {})
        
        structured_prompt = f"""
        You are a biome classification expert. For this location:
        {prompt}
        
        Return ONLY:
        1. The primary biome name (e.g., Temperate broadleaf and mixed forests, Tropical rainforest, etc.)
        2. Followed by 2-3 major geographic features in parentheses, separated by commas
        
        Example format:
        Temperate broadleaf and mixed forests (rolling hills, river valleys, coastal cliffs)
        
        CRITICAL REQUIREMENTS:
        - You MUST respond in {language} language (if {language}='de', use German)
        - Translate BOTH the biome name AND features to {language}
        - Use ONLY the format shown above
        - No additional text or explanations
        - Keep feature descriptions very brief (1-2 words each)
        
        Remember: The ENTIRE response must be in {language} language!
        """

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=structured_prompt
        )
        
        return json.dumps({
            "success": True,
            "text": response.text.strip()
        })
    except Exception as e:
        print(f"Biome analysis error: {str(e)}")
        return json.dumps({
            "success": False,
            "error": str(e)
        })

def analyze_weather(prompt, options=None):
    """Weather analysis using Gemini 2.0"""
    try:
        # Parse options if provided
        options = json.loads(options) if isinstance(options, str) else options or {}
        language = options.get('language', 'en')
        print(f"Gemini Service: Starting weather analysis with language: {language}", file=sys.stderr)
        
        structured_prompt = f"""
        You will receive some information about a location, current weather and a forecast. 
        Give your expertise on whether or not dangerous weather or circumstances will appear. 
        What to look out for / prepare for when a person is outside (hiking, traveling, etc). 
        Make it 2-4 sentences.

        Weather Information:
        {prompt}

        CRITICAL REQUIREMENTS:
        - Respond in {language} language ONLY! DO NOT give any introduction, reply only with the answer.
        - Keep response between 2-4 sentences
        - Focus on safety and preparation
        - Be direct and practical
        """

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=structured_prompt
        )
        
        return json.dumps({
            "success": True,
            "text": response.text.strip()
        })
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result))
        return error_result["error"]

def analyze_info(prompt, options=None):
    """Information analysis using Gemini 2.0 with enhanced prompt structure"""
    try:
        # Add debug logging for incoming options
        print(f"Python analyze_info received options: {options}", file=sys.stderr)
        
        options = json.loads(options) if isinstance(options, str) else options or {}
        print(f"Python analyze_info parsed options: {options}", file=sys.stderr)
        
        language = options.get('language', 'en')
        description = options.get('description', '')
        location = options.get('location', '')
        date = options.get('date', '')
        
        print(f"Python analyze_info extracted values: language={language}, description={description}, location={location}, date={date}", file=sys.stderr)
        
        structured_prompt = f"""
        Analyze this query and provide detailed information following these rules. You are an expert in the field of nature and survival:
        
        Search Term: {prompt}
        Language: {language} (eg: de = german response, en = english response)
        Description: {description}
        Location: {location}
        Date: {date}

        CRITICAL REQUIREMENTS:
        1. Return EXACTLY this JSON structure:
        {{
          "general": {{
            "title": "General Description",
            "content": "A brief description in HTML format"
          }},
          "stats": {{
            "title": "Stats",
            "content": "<ul><li>Relevant statistics...</li></ul>"
          }},
          "quickFacts": {{
            "title": "Quick Facts",
            "content": "<ul><li>Key fact 1</li><li>Key fact 2</li>...</ul>"
          }},
          "history": {{
            "title": "History",
            "content": "Historical information with local relevance"
          }},
          "howToSpot": {{
            "title": "How to Spot",
            "content": "Location and identification tips"
          }},
          "ratings": {{
            "title": "Ratings",
            "content": {{
              "categoryName": {{
                "title": "Category Title",
                "score": 0-10,
                "explanation": "Detailed explanation with seasonal context"
              }},
              // Add more rating categories as needed
            }}
          }}
        }}

        2. Use HTML formatting with <b> tags for key terms
        3. Include historical information when possible
        4. Add seasonal relevance to ratings
        5. Reference survival techniques in <b> tags
        6. quickfacts should be different from stats and more like interesting facts or trivia

        Adapt content based on query type:
        - For Species: Include population, lifespan, extinction rating, family/order, closely related species, etc.
        - For Locations: Include area, population, founding year, attractions, etc.
        - For Survival Techniques: Include step-by-step instructions, use cases, etc.
        - For General Terms: Focus on description and quick facts

        Rating categories by type:
        - Fauna: danger, food source, chance of sighting (realistically), etc.
        - Flora: danger, food source, fire material, shelter material, etc.
        - Fungi: danger, food source, fire material, medicine, etc.
        - Locations: accessibility, attractions, natural beauty, etc.
        - Survival Techniques: difficulty, effectiveness, time investment, etc.

        All content must be in {language} language (eg: de = german response, en = english response). When referring times or units of measurement, use the language of the user (miles in english, km in german, etc).
        All ratings must be on a 0-10 scale with detailed explanations.
        Include seasonal relevance where applicable.
        """

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=structured_prompt
        )
        
        # Find the first '{' and last '}' to extract JSON content
        text = response.text
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        
        if start_idx != -1 and end_idx != -1:
            json_content = text[start_idx:end_idx + 1]
            return json.dumps({
                "success": True,
                "text": json_content
            })
        else:
            raise Exception("No JSON content found in response")
            
    except Exception as e:
        print(f"Info analysis error: {str(e)}")
        return json.dumps({
            "success": False,
            "error": str(e)
        })

def generate_scenarios(location_info, options=None):
    """Generate location-specific scenarios using Gemini 2.0"""
    try:
        options = json.loads(options) if isinstance(options, str) else options or {}
        language = options.get('language', 'en')
        
        structured_prompt = f"""
        Based on this location information:
        {location_info}

        Generate 4 realistic survival scenarios that could occur in this specific environment.
        Each scenario should be uniquely suited to the location's characteristics, weather, and terrain.

        Return EXACTLY this JSON structure:
        {{
            "scenarios": [
                {{
                    "id": "scenario1",
                    "title": "Brief title",
                    "description": "One-line description",
                    "icon": "Select one: tree-outline, triangle-outline, water-outline, sunny-outline, flash-outline, compass-outline"
                }},
                // 3 more scenarios following the same structure
            ]
        }}

        REQUIREMENTS:
        1. Each scenario must be realistic for the location
        2. Include environmental challenges specific to the area
        3. Consider seasonal weather patterns
        4. Incorporate local terrain features
        5. Response must be in {language} language
        6. Icons should match the scenario theme
        """

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=structured_prompt
        )
        
        # Extract JSON from response
        json_content = extract_json_from_text(response.text)
        
        if not json_content:
            raise Exception("Failed to generate valid scenario data")

        return json.dumps({
            "success": True,
            "text": json_content
        })
        
    except Exception as e:
        print(f"Scenario generation error: {str(e)}")
        return json.dumps({
            "success": False,
            "error": str(e)
        })

def game_setup(settings_data, options=None):
    """Generate game setup using Gemini 2.0"""
    try:
        settings_dict = json.loads(settings_data) if isinstance(settings_data, str) else settings_data
        settings_data = settings_dict.get('settings', {})
        language = settings_dict.get('language', 'en')
        
        print(f"Game setup generating content in language: {language}", file=sys.stderr)
        
        # Get difficulty and scenario details
        difficulty = settings_data.get('difficulty', {}).get('id', 'normal')
        scenario_type = settings_data.get('scenario', {}).get('type', 'predefined')
        scenario_desc = (settings_data.get('scenario', {}).get('description') if scenario_type == 'custom' 
                        else settings_data.get('scenario', {}).get('details', {}).get('description', ''))

        # Define difficulty requirements first
        difficulty_requirements = {
            'easy': """
                - health/hunger/thirst/stamina: Start at 100
                - injuries: Empty array
                - backpack: 5-7 useful items
                - options: Provide 3-4 clear, helpful options
                - introduction: Friendly, informative tone
            """,
            'normal': """
                - health/hunger/thirst/stamina: Start at 90-100
                - injuries: Empty array
                - backpack: 3-4 basic items
                - options: Provide 2-3 realistic options
                - introduction: Neutral, realistic tone
            """,
            'hard': """
                - health/hunger/thirst/stamina: Start at 70-90
                - injuries: Include 1 minor injury
                - backpack: 1-2 basic items
                - options: NO options array (player must type their own actions)
                - introduction: Challenging, tense tone
            """
        }
        
        # Get the requirements for the current difficulty, defaulting to normal
        current_difficulty_reqs = difficulty_requirements.get(difficulty, difficulty_requirements['normal'])
        
        formatted_settings = f"""
        Generate a survival scenario based on these settings and requirements:
        
        GAME SETTINGS:
        Date and Time: {settings_data.get('datetime', '')}
        Location: {settings_data.get('location', {}).get('name', 'Unknown')}
        Coordinates: Lat {settings_data.get('location', {}).get('coordinates', {}).get('latitude', 0)}, 
                    Long {settings_data.get('location', {}).get('coordinates', {}).get('longitude', 0)}
        Elevation: {settings_data.get('location', {}).get('elevation', 0)}m
        Weather: {settings_data.get('weather', '')}
        Difficulty: {difficulty}
        Scenario: {scenario_desc}
        
        Return EXACTLY this JSON structure:
        {{
            "title": "Scenario Title",
            "introduction": "Introduction to the scenario, description of the situation and surroundings (5-7 sentences)",
            "health": <health>,
            "hunger": <hunger>,
            "thirst": <thirst>,
            "stamina": <stamina>,
            "injuries": [<injuries>],
            "goals": {{
                "main": "Clear main objective for the adventure",
                "subgoals": [
                    "Specific task 1",
                    "Specific task 2",
                    "Specific task 3"
                ],
                "completedSubgoals": []
            }},
            "totalDistance": 0,
            "options": [
                {{
                    "text": "Description of first choice (15-30 words)",
                    "nextScene": "uniqueSceneId1"
                }},
                {{
                    "text": "Description of second choice (15-30 words)",
                    "nextScene": "uniqueSceneId2"
                }},
                {{
                    "text": "Description of third choice (15-30 words)",
                    "nextScene": "uniqueSceneId3"
                }}
            ],
            "backpack": ["item1", "item2", "item3"]
        }}
        
        DIFFICULTY REQUIREMENTS:
        For difficulty = '{difficulty}':
        {current_difficulty_reqs}

        CRITICAL REQUIREMENTS:
        1. Response must be in {language} language
        2. Adapt narrative tone to difficulty level
        3. Ensure backpack items are relevant to scenario and location
        4. Goals should reflect scenario type and difficulty
        5. All text fields must use proper grammar and punctuation
        6. Weather and location should significantly influence the scenario
        7. ALWAYS include exactly 3 options for 'easy' and 'normal' difficulty
        8. Each option must have both 'text' and 'nextScene' properties
        9. nextScene IDs should be unique, lowercase, no spaces (e.g., 'highGround', 'findWater', 'buildShelter')
        10. Option text should be clear and actionable, describing the choice in detail
        """

        print(f"game_setup formatted prompt: {formatted_settings}", file=sys.stderr)
        
        # Generate response using the formatted settings
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=formatted_settings
        )
        
        print(f"game_setup raw response: {response.text}", file=sys.stderr)
        
        # Extract JSON from response
        json_content = extract_json_from_text(response.text)
        print(f"game_setup extracted JSON: {json_content}", file=sys.stderr)
        
        if not json_content:
            raise Exception("Failed to generate valid game setup data")

        return json.dumps({
            "success": True,
            "text": json_content
        })
        
    except Exception as e:
        print(f"Game setup generation error: {str(e)}", file=sys.stderr)
        print(f"Full error details: {e.__class__.__name__}: {str(e)}", file=sys.stderr)
        return json.dumps({
            "success": False,
            "error": str(e)
        })

import json
import sys
from datetime import datetime

# Assume client and extract_json_from_text are imported or defined elsewhere

def game_master(context, options=None):
    """Process game turns using Gemini 2.0 with improved prompt for clarity, variety, and realistic, context-sensitive consequences."""
    try:
        # Deserialize inputs if provided as JSON strings.
        context = json.loads(context) if isinstance(context, str) else context
        options = json.loads(options) if isinstance(options, str) else options or {}
        language = options.get('language', 'en')

        # Sanitize the player's action: Replace double quotes to avoid formatting issues.
        if 'currentTurn' in context and 'action' in context['currentTurn']:
            context['currentTurn']['action'] = context['currentTurn']['action'].replace('"', "'")
        
        # Retrieve the latest and current turn data.
        all_turns = context.get('turns', [])
        latest_turn = all_turns[-1] if all_turns else {}
        current_turn = context.get('currentTurn', {})
        difficulty = context.get('difficulty', 'normal')
        total_distance = latest_turn.get('totalDistance', 0)  # Accumulated distance

        # Determine the datetime using the last turn's datetime or fallback.
        current_datetime = latest_turn.get('datetime') or context.get('currentDateTime')
        try:
            parsed_datetime = datetime.fromisoformat(current_datetime.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            parsed_datetime = datetime.utcnow()

        # Build a concise version of the full context (including complete turn history) 
        full_turn_history = "\n".join(
            f"Turn {turn.get('turnNumber', i+1)}:\n"
            f"  Time: {turn.get('datetime', 'Unknown')}\n"
            f"  Player Action: {turn.get('action', 'None')}\n"
            f"  Location: {turn.get('location', 'Unknown')}\n"
            f"  Weather: {turn.get('weather', 'Unknown')}\n"
            f"  Inventory: {', '.join(turn.get('backpackInventory', []))}\n"
            f"  AI Narration: {turn.get('aiNarration', '')}\n"
            f"  Chosen Option: {turn.get('chosenOption', 'None')}\n"
            for i, turn in enumerate(all_turns)
        )

        # Build a modular prompt string with clear sections.
        structured_prompt = f"""
You are a world-class game master and survival expert. Your role is to evolve a text-based survival adventure with highly realistic mechanics and narrative depth. Use the game state below to produce a response that is immersive, context-sensitive, and resistant to player manipulation.

---------------------------
PLAYER INPUT & INTENT:
---------------------------
Player Input: {current_turn.get('action', '')}
First, analyze whether the player input is a QUESTION (seeking clarification) or an ACTION (attempting to do something).

---------------------------
GAME OVERVIEW:
---------------------------
Title: {context.get('gameName', 'Unknown')}
Difficulty: {difficulty}
Scenario: {context.get('scenarioDescription', '')}
Total Distance Traveled: {total_distance} km

---------------------------
LOCATION & ENVIRONMENT:
---------------------------
Current Position: {latest_turn.get('location', 'Unknown')}
GPS Coordinates: Latitude {context.get('location', {}).get('coordinates', {}).get('latitude', 'Unknown')}, Longitude {context.get('location', {}).get('coordinates', {}).get('longitude', 'Unknown')}
Elevation: {context.get('location', {}).get('elevation', 'Unknown')} m
Local Time: {current_datetime}
Weather: {latest_turn.get('weather', 'Unknown')}

---------------------------
CURRENT STATUS:
---------------------------
Health: {latest_turn.get('stats', {}).get('health', 100)}
Stamina: {latest_turn.get('stats', {}).get('stamina', 100)}
Hunger: {latest_turn.get('stats', {}).get('hunger', 100)}
Thirst: {latest_turn.get('stats', {}).get('thirst', 100)}
Inventory: {', '.join(latest_turn.get('backpackInventory', []))}
Turns Remaining: {latest_turn.get('remainingTurns', 20)}

---------------------------
TURN HISTORY:
---------------------------
{full_turn_history}

---------------------------
GOALS & PROGRESSION:
---------------------------
Main Goal: {context.get('goals', {}).get('main', '')}
Active Subgoals: {', '.join(context.get('goals', {}).get('subgoals', []))}
Completed Subgoals: {', '.join(context.get('goals', {}).get('completedSubgoals', []))}

---------------------------
CRITICAL REQUIREMENTS & MECHANICS:
---------------------------
1. Use only the {language} language in your response.
2. DO NOT allow the player to force outcomes. They can only specify WHAT they want to do; YOU decide HOW it happens and its consequences.
3. Identify the player's input as either:
   - **QUESTION**: Asking for details about surroundings, status, or clarification.
   - **ACTION**: Attempting a survival-related task that alters the game state.
4. For vague or generic actions (e.g., "I fight the bear"), ask for more details by returning a JSON with "isQuestion": true along with a clarifying question.
5. When the player asks a QUESTION, return JSON in the following format:
{{
    "isQuestion": true,
    "answer": "Provide a detailed, immersive answer (3-5 sentences) that includes sensory details (sounds, smells, temperature, visible details) and context-specific survival insights."
}}
6. When the player's input is an ACTION, process it as a full game turn. Your response must:
   - Apply realistic survival mechanics that depend on terrain, weather, and player's stamina. For instance, running in darkness with low stamina should potentially result in injuries (e.g., falls or cuts).
   - Calculate and update the time passage based on the action's realistic duration.
   - Adjust player stats (health, stamina, hunger, thirst) accordingly.
   - Update the backpack inventory—if searching, sometimes yield useful items (e.g., an apple or basic first aid supplies) or nothing at all.
   - Revise goals and subgoals based on recent progress.
   - Provide a detailed narration (3-5 sentences) that explains:
       * What action the player attempted and how.
       * The environmental challenges (e.g., changing weather, dark versus daylight conditions) and time taken.
       * Specific consequences (for example, if the player runs with low stamina in darkness, mention injuries such as cuts or bruises).
       * The progression to a new scenario or situation.
   - Offer a set of consequence-based options (only for EASY/NORMAL difficulty; omit for HARD).
7. The JSON structure for ACTION responses must exactly follow this schema:

JSON Schema for ACTION:
{{
    "isQuestion": false,
    "health": <number between 0 and 100>,
    "stamina": <number between 0 and 100>,
    "hunger": <number between 0 and 100>,
    "thirst": <number between 0 and 100>,
    "injuries": [ "detailed_injury1", "detailed_injury2" ],
    "turnsRemaining": <number between 0 and 20>,
    "weather": "Detailed weather description with forecasted changes.",
    "narration": "Rich, atmospheric text (3-5 sentences) that combines the description of the action and its consequences, indicating both successes and setbacks.",
    "location": {{
         "name": "Detailed description of the new location",
         "coordinates": {{
              "latitude": <decimal_number>,
              "longitude": <decimal_number>
         }},
         "elevation": <number>
    }},
    "datetime": "New ISO formatted datetime reflecting realistic action duration",
    "totalDistance": <updated total km traveled>,
    "goals": {{
         "main": "Updated main objective text",
         "subgoals": [ "Subgoal 1", "Subgoal 2", "Subgoal 3" ],
         "completedSubgoals": [ "Completed subgoal 1" ]
    }},
    "hasGameEnded": <true/false>,
    "gameEndReason": <string or null>,
    "options": [  // Only include options for NORMAL/EASY difficulties.
         {{
              "id": "option1",
              "text": "Description of a potential next action with context-specific survival details",
              "consequences": {{
                   "health": <number representing health change (negative value)>,
                   "description": "Realistic outcome explanation based on the chosen survival decision"
              }}
         }},
         // 2-3 more options as applicable.
    ],
    "backpack": [ "Updated inventory reflecting items used, consumed, or newly added" ]
}}

8. Apply realistic survival mechanics:
   - Calculate energy, time, and resource consumption based on terrain, weather, and player stamina.
   - Track tool degradation and consumable usage permanently.
   - Adjust hunger and thirst rates based on the intensity of activity:
         * Light Activity: minor changes over several hours.
         * Moderate to Heavy Activity: greater resource loss.
   - Evolve environmental conditions naturally (adjusting weather, day/night cycles, ambient light, etc.).

9. Enforce difficulty-specific rules:
   - HARD: Do not return an 'options' array. Use stricter resource depletion, no starting utilities/tools, and harsher penalties.
   - EASY/NORMAL: Provide a carefully considered options array to help guide subsequent actions.

10. Allow the game to end realistically (if health, stamina, hunger, or thirst reach 0, if severe injuries occur, or if resources are fully depleted) and provide a clear explanation.

11. Dynamic Consequences and Randomized Outcomes:
   - If the player repeatedly performs risky actions (e.g., running in low-stamina dark conditions), include severe or cumulative consequences such as injuries.
   - When searching storage or similar locations, randomly decide if the player finds something useful (like an apple or medical supplies) or nothing at all, with corresponding impacts on stamina or hunger.
   - Instruct the narration to vary based on context (day versus night, good weather versus harsh conditions).

---------------------------
RESPOND ACCORDINGLY:
---------------------------
Based on whether the player's input is a QUESTION or an ACTION, provide the response in the corresponding JSON structure described above.
"""

        # Generate content using the AI model with our fully constructed prompt.
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=structured_prompt
        )
        
        # Extract JSON content from the AI response text.
        json_content = extract_json_from_text(response.text)
        if not json_content:
            raise Exception("Failed to generate valid game state")

        # For HARD difficulty, remove the 'options' array from the JSON response.
        if difficulty == 'hard' and 'options' in json_content:
            del json_content['options']

        # Process and standardize the datetime in the JSON response.
        if 'datetime' in json_content:
            try:
                test_date = datetime.fromisoformat(json_content['datetime'].replace('Z', '+00:00'))
                json_content['datetime'] = test_date.isoformat().replace('+00:00', 'Z')
            except (ValueError, AttributeError):
                json_content['datetime'] = parsed_datetime.isoformat().replace('+00:00', 'Z')

        return json.dumps({
            "success": True,
            "text": json_content
        })

    except Exception as e:
        print(f"Game master error: {str(e)}", file=sys.stderr)
        print(f"Full error details: {e.__class__.__name__}: {str(e)}", file=sys.stderr)
        print(f"Context received: {context}", file=sys.stderr)
        return json.dumps({
            "success": False,
            "error": str(e)
        })


def game_summary(context, options=None):
    """Generate game summary using Gemini 2.0"""
    try:
        # Make sure context is properly parsed as JSON if it's a string
        if isinstance(context, str):
            try:
                context = json.loads(context)
            except json.JSONDecodeError as e:
                print(f"JSON decode error: {e}", file=sys.stderr)
                print(f"Received context: {context}", file=sys.stderr)
                raise Exception("Invalid JSON format in context")

        options = json.loads(options) if isinstance(options, str) else options or {}
        language = options.get('language', 'en')
        
        structured_prompt = f"""
        You are a game master summarizing an adventure. Create a JSON summary of this game with the following structure:
        
        GAME DETAILS:
        Title: {context.get('gameName', 'Unknown Adventure')}
        Difficulty: {context.get('difficulty', 'normal')}
        Scenario: {context.get('scenarioDescription', '')}
        Location: {context.get('location', {}).get('name', 'Unknown')}
        Weather: {context.get('weather', 'Unknown')}

        COMPLETE TURN HISTORY:
        {'\n'.join(f"""Turn {turn.get('turnNumber', i+1)}:
            Time: {turn.get('datetime', 'Unknown')}
            Player Action: {turn.get('action', 'None')}
            Location: {turn.get('location', 'Unknown')}
            Weather: {turn.get('weather', 'Unknown')}
            Stats:
              - Health: {turn.get('stats', {}).get('health', 100)}
              - Stamina: {turn.get('stats', {}).get('stamina', 100)}
              - Hunger: {turn.get('stats', {}).get('hunger', 100)}
              - Thirst: {turn.get('stats', {}).get('thirst', 100)}
            Inventory: {', '.join(turn.get('backpackInventory', []))}
            AI Narration: {turn.get('aiNarration', '')}
            Chosen Option: {turn.get('chosenOption', 'None')}
            """ for i, turn in enumerate(context.get('turns', [])))}

        GOALS:
        Main Goal: {context.get('goals', {}).get('main', '')}
        Active Subgoals: {', '.join(context.get('goals', {}).get('subgoals', []))}
        Completed Subgoals: {', '.join(context.get('goals', {}).get('completedSubgoals', []))}

        FINAL STATUS:
        Total Distance: {context.get('totalDistance', 0)}km
        Turns Played: {len(context.get('turns', []))}
        End Reason: {context.get('gameEndReason', 'Unknown')}

        Return EXACTLY this JSON structure:
        {{
          "title": "Adventure Title",
          "summary": "Main summary text (up to 3 paragraphs, shorter if short adventure, more detailed if long adventure. analytical but with charme but also honest. try to reference the story chronologically)",
          "stats": {{
            "finalHealth": {context.get('stats', {}).get('health', 0)},
            "finalStamina": {context.get('stats', {}).get('stamina', 0)},
            "finalHunger": {context.get('stats', {}).get('hunger', 0)},
            "finalThirst": {context.get('stats', {}).get('thirst', 0)},
            "totalDistance": {context.get('totalDistance', 0)},
            "turnsPlayed": {len(context.get('turns', []))}
          }},
          "positives": ["List of things the player did well"],
          "negatives": ["List of things that led to failure"],
          "endReason": "{context.get('gameEndReason', 'Unknown')}"
        }}

        Write the response in {language} language.
        Focus on key decisions and their impact on the story.
        Keep a serious tone appropriate for survival scenarios.
        Include specific details about weather and location challenges.
        Return ONLY the JSON structure, no additional text.
        """

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=structured_prompt
        )
        
        # Extract JSON from the response
        json_content = extract_json_from_text(response.text)
        if not json_content:
            raise Exception("Failed to generate valid JSON summary")

        return json.dumps({
            "success": True,
            "summary": json_content
        })
        
    except Exception as e:
        print(f"Game summary error: {str(e)}", file=sys.stderr)
        print(f"Full error details: {e.__class__.__name__}: {str(e)}", file=sys.stderr)
        print(f"Context received: {context}", file=sys.stderr)
        return json.dumps({
            "success": False,
            "error": str(e)
        })


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "text"
    prompt = sys.argv[2] if len(sys.argv) > 2 else "Hello, Gemini!"
    image_url = sys.argv[3] if len(sys.argv) > 3 else None
    options = sys.argv[4] if len(sys.argv) > 4 else None
    
    # Update the response selection
    response = None
    if mode == "vision":
        response = analyze_image(prompt, image_url, options)
    elif mode == "search":
        response = search_and_generate(prompt)
    elif mode == "flash":
        response = flash_chat(prompt, image_url, options)
    elif mode == "biome":
        response = analyze_biome(prompt, options)
    elif mode == "weather":
        response = analyze_weather(prompt, options)
    elif mode == "info":
        response = analyze_info(prompt, options)
    elif mode == "scenarios":
        response = generate_scenarios(prompt, options)
    elif mode == "game_setup":
        response = game_setup(prompt, options)
    elif mode == "game_master":
        response = game_master(prompt, options)
    elif mode == "game_summary":
        response = game_summary(prompt, options)
    else:
        response = generate_content(prompt)
    
    # Print the JSON response first
    print(response)
    
    # Then print debug info to stderr instead of stdout
    print(f"Python script received args: mode={mode}, prompt={prompt}, image={image_url}, options={options}", file=sys.stderr) 